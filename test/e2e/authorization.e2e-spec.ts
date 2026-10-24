import { INestApplication } from '@nestjs/common';
import { Especialidad, EvaluacionEstado } from '@prisma/client';
import request from 'supertest';

import { createApp } from '../../src/app.factory';
import { PrismaService } from '../../src/prisma/prisma.service';
import { assertIsolatedSchema } from '../support/runtime';
import {
  adminSessionHeaders,
  professionalSessions,
  type SessionHeaders,
} from '../support/sessions';

interface Registered {
  journeyId: string;
  attentionNumber: string;
  evaluations: Record<string, string>;
}

describe('professional authorization', () => {
  const prisma = new PrismaService();
  const authAs = professionalSessions(prisma);
  let app: INestApplication;
  let admin: SessionHeaders;
  let sequence = 0;

  beforeAll(async () => {
    await assertIsolatedSchema();
    app = await createApp();
    await app.init();
    admin = await adminSessionHeaders(prisma);
  });

  afterAll(async () => {
    await app.close();
    await prisma.client.$disconnect();
  });

  function server() {
    return request(app.getHttpServer());
  }

  async function createProfessional(specialty: Especialidad) {
    sequence += 1;
    const professional = await prisma.client.profesional.create({
      data: { nombre: `Auth ${specialty} ${sequence}`, especialidad: specialty },
    });
    await authAs(professional.id);

    return professional;
  }

  async function register(): Promise<Registered> {
    sequence += 1;
    const response = await server()
      .post('/applicants')
      .set(admin)
      .send({ nombre: `Auth ${sequence}`, apellido: 'Spec', dni: `auth-${sequence}-${Date.now()}` })
      .expect(201);

    const journeyId = response.body.journey.id as string;
    const journey = await prisma.client.recorrido.findUniqueOrThrow({
      where: { id: journeyId },
      select: { evaluaciones: { select: { id: true, especialidad: true } } },
    });

    const evaluations = Object.fromEntries(
      journey.evaluaciones.map((evaluation) => [evaluation.especialidad, evaluation.id]),
    );

    return {
      journeyId,
      attentionNumber: response.body.journey.attentionNumber as string,
      evaluations,
    };
  }

  it('requires a session for clinical commands', async () => {
    const registered = await register();

    await server()
      .post(`/journeys/${registered.journeyId}/attentions`)
      .send({ specialty: Especialidad.CLINICA_MEDICA })
      .expect(401);

    await server().get('/queue').expect(401);
  });

  it('rejects an admin session for clinical commands', async () => {
    const registered = await register();

    await server()
      .post(`/journeys/${registered.journeyId}/attentions`)
      .set(admin)
      .send({ specialty: Especialidad.CLINICA_MEDICA })
      .expect(403);
  });

  it('ignores professionalId from the body and uses the session', async () => {
    const registered = await register();
    const clinical = await createProfessional(Especialidad.CLINICA_MEDICA);
    const other = await createProfessional(Especialidad.CLINICA_MEDICA);

    const started = await server()
      .post(`/journeys/${registered.journeyId}/attentions`)
      .set(authAs.headers(clinical.id))
      .send({ specialty: Especialidad.CLINICA_MEDICA, professionalId: other.id })
      .expect(201);

    const attention = await prisma.client.atencion.findUniqueOrThrow({
      where: { id: started.body.attentionId },
      select: { profesionalId: true },
    });
    expect(attention.profesionalId).toBe(clinical.id);
  });

  it('blocks finalizing or reporting an attention owned by another professional', async () => {
    const registered = await register();
    const owner = await createProfessional(Especialidad.CLINICA_MEDICA);
    const intruder = await createProfessional(Especialidad.CLINICA_MEDICA);

    const started = await server()
      .post(`/journeys/${registered.journeyId}/attentions`)
      .set(authAs.headers(owner.id))
      .send({ specialty: Especialidad.CLINICA_MEDICA })
      .expect(201);

    await server()
      .patch(`/attentions/${started.body.attentionId}/finalize`)
      .set(authAs.headers(intruder.id))
      .send({ state: 'Finalizada' })
      .expect(403);

    await server()
      .put(`/attentions/${started.body.attentionId}/report`)
      .set(authAs.headers(intruder.id))
      .send({ observations: 'Should not be allowed', state: 'Pendiente' })
      .expect(403);

    await server()
      .post(`/attentions/${started.body.attentionId}/pendings`)
      .set(authAs.headers(intruder.id))
      .send({ motivo: 'Should not be allowed' })
      .expect(403);
  });

  it('blocks working on an evaluation of another specialty', async () => {
    const registered = await register();
    const psychologist = await createProfessional(Especialidad.PSICOLOGIA);
    const clinicalEvaluationId = registered.evaluations[Especialidad.CLINICA_MEDICA]!;

    await server()
      .patch(`/evaluations/${clinicalEvaluationId}/result`)
      .set(authAs.headers(psychologist.id))
      .send({ resultado: 'APTO_PLENO' })
      .expect(403);

    await server()
      .patch(`/evaluations/${clinicalEvaluationId}/complete`)
      .set(authAs.headers(psychologist.id))
      .expect(403);

    const stored = await prisma.client.evaluacion.findUniqueOrThrow({
      where: { id: clinicalEvaluationId },
      select: { estado: true, resultado: true },
    });
    expect(stored).toEqual({ estado: EvaluacionEstado.PENDIENTE, resultado: null });
  });

  it('restricts journey administration to admins', async () => {
    const registered = await register();
    const psychologist = await createProfessional(Especialidad.PSICOLOGIA);

    await server().get('/journeys/overview').expect(401);
    await server().get('/journeys/overview').set(admin).expect(200);
    await server().get('/journeys/overview').set(authAs.headers(psychologist.id)).expect(403);

    await server()
      .post(`/journeys/${registered.journeyId}/annul`)
      .set(authAs.headers(psychologist.id))
      .send({ motivo: 'Should not be allowed' })
      .expect(403);
    await server()
      .delete(`/journeys/${registered.journeyId}`)
      .set(authAs.headers(psychologist.id))
      .expect(403);
    await server().get('/professionals').set(authAs.headers(psychologist.id)).expect(403);
    await server().get('/professionals').set(admin).expect(200);
  });

  it('only lets clinical professionals close a journey and issue certificates', async () => {
    const registered = await register();
    const psychologist = await createProfessional(Especialidad.PSICOLOGIA);
    const clinical = await createProfessional(Especialidad.CLINICA_MEDICA);

    await server()
      .post(`/journeys/${registered.journeyId}/close`)
      .set(authAs.headers(psychologist.id))
      .expect(403);
    await server()
      .post(`/journeys/${registered.journeyId}/certificate`)
      .set(authAs.headers(psychologist.id))
      .expect(403);

    await server()
      .post(`/journeys/${registered.journeyId}/close`)
      .set(authAs.headers(clinical.id))
      .expect(409);
    await server()
      .post(`/journeys/${registered.journeyId}/certificate`)
      .set(authAs.headers(clinical.id))
      .expect(409);
  });

  it('scopes journey reads for professionals to their pending work', async () => {
    const completedForPsychology = await register();
    const pendingForPsychology = await register();

    await prisma.client.evaluacion.update({
      where: { id: completedForPsychology.evaluations[Especialidad.PSICOLOGIA]! },
      data: { estado: EvaluacionEstado.COMPLETA },
    });

    const psychologist = await createProfessional(Especialidad.PSICOLOGIA);

    await server()
      .get('/journeys')
      .set(authAs.headers(psychologist.id))
      .query({ attentionNumber: completedForPsychology.attentionNumber })
      .expect(403);
    await server()
      .get('/journeys')
      .set(authAs.headers(psychologist.id))
      .query({ attentionNumber: pendingForPsychology.attentionNumber })
      .expect(200);
    await server()
      .get('/journeys')
      .set(admin)
      .query({ attentionNumber: completedForPsychology.attentionNumber })
      .expect(200);
  });

  it('scopes the queue by specialty for professionals', async () => {
    const clinicalOnly = await register();
    const psychologyOnly = await register();

    await prisma.client.evaluacion.update({
      where: { id: clinicalOnly.evaluations[Especialidad.PSICOLOGIA]! },
      data: { estado: EvaluacionEstado.COMPLETA },
    });
    await prisma.client.evaluacion.update({
      where: { id: psychologyOnly.evaluations[Especialidad.CLINICA_MEDICA]! },
      data: { estado: EvaluacionEstado.COMPLETA },
    });

    const psychologist = await createProfessional(Especialidad.PSICOLOGIA);
    const clinical = await createProfessional(Especialidad.CLINICA_MEDICA);

    const psychologistQueue = await server()
      .get('/queue')
      .set(authAs.headers(psychologist.id))
      .expect(200);
    const psychologistNumbers = (psychologistQueue.body as { attentionNumber: string }[]).map(
      (entry) => entry.attentionNumber,
    );

    expect(psychologistNumbers).toContain(psychologyOnly.attentionNumber);
    expect(psychologistNumbers).not.toContain(clinicalOnly.attentionNumber);

    const clinicalQueue = await server().get('/queue').set(authAs.headers(clinical.id)).expect(200);
    const clinicalNumbers = (clinicalQueue.body as { attentionNumber: string }[]).map(
      (entry) => entry.attentionNumber,
    );

    expect(clinicalNumbers).toContain(clinicalOnly.attentionNumber);
    expect(clinicalNumbers).not.toContain(psychologyOnly.attentionNumber);

    const adminQueue = await server().get('/queue').set(admin).expect(200);
    const adminNumbers = (adminQueue.body as { attentionNumber: string }[]).map(
      (entry) => entry.attentionNumber,
    );

    expect(adminNumbers).toContain(clinicalOnly.attentionNumber);
    expect(adminNumbers).toContain(psychologyOnly.attentionNumber);
  });
});
