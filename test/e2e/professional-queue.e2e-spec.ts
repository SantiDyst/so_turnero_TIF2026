import { INestApplication } from '@nestjs/common';
import { Especialidad, EvaluacionEstado } from '@prisma/client';
import request from 'supertest';

import { createApp } from '../../src/app.factory';
import { PrismaService } from '../../src/prisma/prisma.service';
import { assertIsolatedSchema } from '../support/runtime';
import {
  adminSessionHeaders,
  professionalSessionHeaders,
  type SessionHeaders,
} from '../support/sessions';

describe('professional queue and closure recovery', () => {
  const prisma = new PrismaService();
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

    return prisma.client.profesional.create({
      data: { nombre: `Queue ${specialty} ${sequence}`, especialidad: specialty },
    });
  }

  async function register() {
    sequence += 1;
    const response = await server()
      .post('/applicants')
      .set(admin)
      .send({
        nombre: `Queue ${sequence}`,
        apellido: 'Applicant',
        dni: `queue-${sequence}-${Date.now()}`,
        empresa: 'Ente Público',
        puesto: 'Administrativo',
      })
      .expect(201);

    return response.body as { journey: { id: string; attentionNumber: string } };
  }

  async function attend(
    journeyId: string,
    specialty: Especialidad,
    session: SessionHeaders,
    options: { result?: string; finalizeFirst?: boolean } = {},
  ) {
    const started = await server()
      .post(`/journeys/${journeyId}/attentions`)
      .set(session)
      .send({ specialty })
      .expect(201);

    await server()
      .put(`/attentions/${started.body.attentionId}/report`)
      .set(session)
      .send({ observations: 'Sin hallazgos relevantes.', state: 'Completo' })
      .expect(200);

    if (options.result) {
      await server()
        .patch(`/evaluations/${started.body.evaluationId}/result`)
        .set(session)
        .send({ resultado: options.result })
        .expect(200);
    }

    const finalize = () =>
      server()
        .patch(`/attentions/${started.body.attentionId}/finalize`)
        .set(session)
        .send({ state: 'Finalizada' })
        .expect(200);

    const complete = () =>
      server().patch(`/evaluations/${started.body.evaluationId}/complete`).set(session).expect(200);

    if (options.finalizeFirst) {
      await finalize();
      await complete();
    } else {
      await complete();
      await finalize();
    }

    return started;
  }

  it('keeps an attended journey visible and allows completing and closing after finalizing', async () => {
    const clinical = await createProfessional(Especialidad.CLINICA_MEDICA);
    const biochemistry = await createProfessional(Especialidad.BIOQUIMICA);
    const psychology = await createProfessional(Especialidad.PSICOLOGIA);
    const clinicalHeaders = await professionalSessionHeaders(prisma, clinical.id);
    const biochemistryHeaders = await professionalSessionHeaders(prisma, biochemistry.id);
    const psychologyHeaders = await professionalSessionHeaders(prisma, psychology.id);
    const registered = await register();

    const pendingQueue = await server().get('/queue').set(clinicalHeaders).expect(200);
    const pendingEntry = (pendingQueue.body as { attentionNumber: string; status: string }[]).find(
      (entry) => entry.attentionNumber === registered.journey.attentionNumber,
    );
    expect(pendingEntry).toEqual(expect.objectContaining({ status: 'pendiente' }));

    await attend(registered.journey.id, Especialidad.BIOQUIMICA, biochemistryHeaders);
    await attend(registered.journey.id, Especialidad.PSICOLOGIA, psychologyHeaders, {
      result: 'APTO_PLENO',
    });
    await attend(registered.journey.id, Especialidad.CLINICA_MEDICA, clinicalHeaders, {
      result: 'APTO_PLENO',
      finalizeFirst: true,
    });

    await server()
      .get('/journeys')
      .set(clinicalHeaders)
      .query({ attentionNumber: registered.journey.attentionNumber })
      .expect(200);

    const queue = await server().get('/queue').set(clinicalHeaders).expect(200);
    const completed = (queue.body as { attentionNumber: string; status: string }[]).find(
      (entry) => entry.attentionNumber === registered.journey.attentionNumber,
    );
    expect(completed).toEqual(
      expect.objectContaining({
        status: 'completado',
        completedAt: expect.any(String),
        applicant: expect.objectContaining({ nombre: expect.any(String) }),
      }),
    );

    const other = await createProfessional(Especialidad.CLINICA_MEDICA);
    const otherHeaders = await professionalSessionHeaders(prisma, other.id);
    const otherQueue = await server().get('/queue').set(otherHeaders).expect(200);
    expect(
      (otherQueue.body as { attentionNumber: string }[]).some(
        (entry) => entry.attentionNumber === registered.journey.attentionNumber,
      ),
    ).toBe(false);

    const readiness = await server()
      .get(`/journeys/${registered.journey.id}/closure-readiness`)
      .set(clinicalHeaders)
      .expect(200);
    expect(readiness.body.canClose).toBe(true);

    await server()
      .post(`/journeys/${registered.journey.id}/close`)
      .set(clinicalHeaders)
      .expect(200);
  });

  it('does not offer completed entries when the evaluation is still pending', async () => {
    const professional = await createProfessional(Especialidad.BIOQUIMICA);
    const headers = await professionalSessionHeaders(prisma, professional.id);
    const registered = await register();

    const started = await server()
      .post(`/journeys/${registered.journey.id}/attentions`)
      .set(headers)
      .send({ specialty: Especialidad.BIOQUIMICA })
      .expect(201);

    await server()
      .patch(`/attentions/${started.body.attentionId}/finalize`)
      .set(headers)
      .send({ state: 'Finalizada' })
      .expect(200);

    const queue = await server().get('/queue').set(headers).expect(200);
    const entry = (queue.body as { attentionNumber: string; status: string }[]).find(
      (candidate) => candidate.attentionNumber === registered.journey.attentionNumber,
    );

    expect(entry).toEqual(expect.objectContaining({ status: 'pendiente' }));
  });

  it('finalizes the active attention when the evaluation is completed', async () => {
    const psychology = await createProfessional(Especialidad.PSICOLOGIA);
    const headers = await professionalSessionHeaders(prisma, psychology.id);
    const registered = await register();

    const started = await server()
      .post(`/journeys/${registered.journey.id}/attentions`)
      .set(headers)
      .send({ specialty: Especialidad.PSICOLOGIA })
      .expect(201);

    await server()
      .patch(`/evaluations/${started.body.evaluationId}/result`)
      .set(headers)
      .send({ resultado: 'APTO_PLENO' })
      .expect(200);

    await server()
      .patch(`/evaluations/${started.body.evaluationId}/complete`)
      .set(headers)
      .expect(200);

    const journey = await server()
      .get('/journeys')
      .set(headers)
      .query({ attentionNumber: registered.journey.attentionNumber })
      .expect(200);
    const attention = (
      journey.body.attentions as { id: string; state: string; endedAt: string }[]
    ).find((candidate) => candidate.id === started.body.attentionId);

    expect(attention).toEqual(expect.objectContaining({ state: 'Finalizada' }));
    expect(attention?.endedAt).toBeTruthy();

    const professionalRow = await prisma.client.profesional.findUniqueOrThrow({
      where: { id: psychology.id },
    });
    expect(professionalRow.disponibilidad).toBe('DISPONIBLE');

    await server()
      .patch(`/attentions/${started.body.attentionId}/finalize`)
      .set(headers)
      .send({ state: 'Finalizada' })
      .expect(200);

    const queue = await server().get('/queue').set(headers).expect(200);
    const entry = (queue.body as { attentionNumber: string; status: string }[]).find(
      (candidate) => candidate.attentionNumber === registered.journey.attentionNumber,
    );
    expect(entry).toEqual(expect.objectContaining({ status: 'completado' }));
  });

  it('keeps a completed evaluation with an active attention visible for recovery', async () => {
    const psychology = await createProfessional(Especialidad.PSICOLOGIA);
    const headers = await professionalSessionHeaders(prisma, psychology.id);
    const registered = await register();

    const started = await server()
      .post(`/journeys/${registered.journey.id}/attentions`)
      .set(headers)
      .send({ specialty: Especialidad.PSICOLOGIA })
      .expect(201);

    await prisma.client.evaluacion.update({
      where: { id: started.body.evaluationId },
      data: {
        estado: EvaluacionEstado.COMPLETA,
        resultado: 'APTO_PLENO',
        completadaAt: new Date(),
      },
    });

    const queue = await server().get('/queue').set(headers).expect(200);
    const entry = (queue.body as { attentionNumber: string; status: string }[]).find(
      (candidate) => candidate.attentionNumber === registered.journey.attentionNumber,
    );
    expect(entry).toEqual(expect.objectContaining({ status: 'en_atencion' }));

    await server()
      .patch(`/attentions/${started.body.attentionId}/finalize`)
      .set(headers)
      .send({ state: 'Finalizada' })
      .expect(200);

    const recovered = await server().get('/queue').set(headers).expect(200);
    const recoveredEntry = (recovered.body as { attentionNumber: string; status: string }[]).find(
      (candidate) => candidate.attentionNumber === registered.journey.attentionNumber,
    );
    expect(recoveredEntry).toEqual(expect.objectContaining({ status: 'completado' }));
  });
});
