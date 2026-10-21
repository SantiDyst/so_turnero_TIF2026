import { INestApplication } from '@nestjs/common';
import { Especialidad, EvaluacionEstado, Prisma, RecorridoEstado } from '@prisma/client';
import request from 'supertest';

import { createApp } from '../../src/app.factory';
import { PrismaService } from '../../src/prisma/prisma.service';
import { assertIsolatedSchema } from '../support/runtime';

interface Registered {
  applicant: { id: string };
  journey: { id: string; attentionNumber: string; state: string };
}

describe('circuit foundation HTTP API', () => {
  const prisma = new PrismaService();
  let app: INestApplication;

  beforeAll(async () => {
    await assertIsolatedSchema();
    app = await createApp();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await prisma.client.$disconnect();
  });

  async function registerApplicant(name: string): Promise<Registered> {
    const response = await request(app.getHttpServer())
      .post('/applicants')
      .send({ nombre: name, apellido: 'Circuit', dni: `${name}-dni` })
      .expect(201);
    return response.body as Registered;
  }

  async function createProfessional(name: string, especialidad: Especialidad) {
    return prisma.client.profesional.create({ data: { nombre: name, especialidad } });
  }

  function start(journeyId: string, especialidad: Especialidad, professionalId: string) {
    return request(app.getHttpServer())
      .post(`/journeys/${journeyId}/attentions`)
      .send({ specialty: especialidad, professionalId });
  }

  async function finalize(attentionId: string) {
    return request(app.getHttpServer())
      .patch(`/attentions/${attentionId}/finalize`)
      .send({ state: 'Finalizada' })
      .expect(200);
  }

  async function readJourney(applicantId: string) {
    const response = await request(app.getHttpServer())
      .get('/journeys')
      .query({ applicantId })
      .expect(200);
    return response.body as {
      journey: { state: string; derivedState: string | null };
      evaluations: { id: string; specialty: string; state: string }[];
      attentions: { id: string; specialty: string; evaluationId: string | null }[];
      pendings: unknown[];
      recitations: unknown[];
      reservations: unknown[];
      derivations: unknown[];
      aptitude: unknown;
    };
  }

  async function countActive(applicantId: string): Promise<bigint> {
    const rows = await prisma.client.$queryRaw<{ count: bigint }[]>(
      Prisma.sql`SELECT COUNT(*)::bigint AS "count" FROM "Atencion"
                 WHERE "postulanteId" = ${applicantId} AND "estado" = 'En atención'`,
    );
    return rows[0]?.count ?? 0n;
  }

  it('exposes the empty circuit and removes a started journey from the queue', async () => {
    const registered = await registerApplicant('E2E Circuit Empty');
    const journey = await readJourney(registered.applicant.id);

    expect(journey.journey.state).toBe('En espera');
    expect(journey.journey.derivedState).toBeNull();
    expect(journey.evaluations).toHaveLength(3);
    expect(journey.evaluations.map((evaluation) => evaluation.specialty).sort()).toEqual([
      Especialidad.BIOQUIMICA,
      Especialidad.CLINICA_MEDICA,
      Especialidad.PSICOLOGIA,
    ]);
    expect(journey.evaluations.every((evaluation) => evaluation.state === 'PENDIENTE')).toBe(
      true,
    );
    expect(journey.pendings).toEqual([]);
    expect(journey.recitations).toEqual([]);
    expect(journey.reservations).toEqual([]);
    expect(journey.derivations).toEqual([]);
    expect(journey.aptitude).toBeNull();

    const queued = await request(app.getHttpServer()).get('/queue').expect(200);
    expect(
      queued.body.some(
        (entry: { applicantId: string }) => entry.applicantId === registered.applicant.id,
      ),
    ).toBe(true);

    const professional = await createProfessional('Dr. Circuit Empty', Especialidad.CLINICA_MEDICA);
    const started = await start(
      registered.journey.id,
      Especialidad.CLINICA_MEDICA,
      professional.id,
    ).expect(201);
    const clinicalEvaluation = journey.evaluations.find(
      (evaluation) => evaluation.specialty === Especialidad.CLINICA_MEDICA,
    );
    expect(started.body.evaluationId).toBe(clinicalEvaluation?.id);

    const queueAfterStart = await request(app.getHttpServer()).get('/queue').expect(200);
    expect(
      queueAfterStart.body.some(
        (entry: { applicantId: string }) => entry.applicantId === registered.applicant.id,
      ),
    ).toBe(false);

    const afterStart = await readJourney(registered.applicant.id);
    expect(afterStart.journey.state).toBe('En proceso');
    expect(afterStart.journey.derivedState).toBeNull();
    expect(afterStart.attentions[0]?.evaluationId).toBe(clinicalEvaluation?.id);
  });

  it('starts specialties sequentially and rejects ineligible starts', async () => {
    const registered = await registerApplicant('E2E Circuit Sequential');
    const clinical = await createProfessional('Dr. Sequential Clinical', Especialidad.CLINICA_MEDICA);
    const biochemistry = await createProfessional(
      'Dr. Sequential Biochemistry',
      Especialidad.BIOQUIMICA,
    );
    const psychology = await createProfessional(
      'Dr. Sequential Psychology',
      Especialidad.PSICOLOGIA,
    );

    const first = await start(
      registered.journey.id,
      Especialidad.CLINICA_MEDICA,
      clinical.id,
    ).expect(201);
    await finalize(first.body.attentionId);
    let journey = await readJourney(registered.applicant.id);
    expect(journey.journey.state).toBe('En proceso');
    expect(journey.journey.derivedState).toBe('Esperando llamado');

    await request(app.getHttpServer())
      .post(`/journeys/${registered.journey.id}/attentions`)
      .send({ specialty: 'Clinical', professionalId: clinical.id })
      .expect(400);

    const second = await start(
      registered.journey.id,
      Especialidad.BIOQUIMICA,
      biochemistry.id,
    ).expect(201);
    journey = await readJourney(registered.applicant.id);
    expect(journey.journey.state).toBe('En proceso');
    expect(journey.journey.derivedState).toBeNull();

    await start(registered.journey.id, Especialidad.PSICOLOGIA, psychology.id).expect(409);
    await finalize(second.body.attentionId);

    const psychologyEvaluation = await prisma.client.evaluacion.findFirstOrThrow({
      where: {
        recorridoId: registered.journey.id,
        especialidad: Especialidad.PSICOLOGIA,
      },
    });
    await prisma.client.evaluacion.update({
      where: { id: psychologyEvaluation.id },
      data: { estado: EvaluacionEstado.COMPLETA },
    });
    await start(registered.journey.id, Especialidad.PSICOLOGIA, psychology.id).expect(409);

    const closed = await registerApplicant('E2E Circuit Closed');
    await prisma.client.recorrido.update({
      where: { id: closed.journey.id },
      data: { estado: RecorridoEstado.CIERRE_FINAL },
    });
    const closedProfessional = await createProfessional(
      'Dr. Closed',
      Especialidad.CLINICA_MEDICA,
    );
    await start(closed.journey.id, Especialidad.CLINICA_MEDICA, closedProfessional.id).expect(
      409,
    );
  });

  it('serializes concurrent same-specialty starts into one active attention', async () => {
    const registered = await registerApplicant('E2E Circuit Race Same');
    const [first, second] = await Promise.all([
      createProfessional('Dr. Race Same One', Especialidad.CLINICA_MEDICA),
      createProfessional('Dr. Race Same Two', Especialidad.CLINICA_MEDICA),
    ]);

    const responses = await Promise.all([
      start(registered.journey.id, Especialidad.CLINICA_MEDICA, first.id),
      start(registered.journey.id, Especialidad.CLINICA_MEDICA, second.id),
    ]);

    expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
    expect(await countActive(registered.applicant.id)).toBe(1n);
  });

  it('serializes concurrent cross-specialty starts into one active attention', async () => {
    const registered = await registerApplicant('E2E Circuit Race Cross');
    const [clinical, biochemistry] = await Promise.all([
      createProfessional('Dr. Race Cross Clinical', Especialidad.CLINICA_MEDICA),
      createProfessional('Dr. Race Cross Biochemistry', Especialidad.BIOQUIMICA),
    ]);

    const responses = await Promise.all([
      start(registered.journey.id, Especialidad.CLINICA_MEDICA, clinical.id),
      start(registered.journey.id, Especialidad.BIOQUIMICA, biochemistry.id),
    ]);

    expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
    expect(await countActive(registered.applicant.id)).toBe(1n);
  });

  it('derives Esperando llamado only while no attention is active and drops it on start', async () => {
    const registered = await registerApplicant('E2E Circuit Derived');
    const clinical = await createProfessional('Dr. Derived Clinical', Especialidad.CLINICA_MEDICA);
    const biochemistry = await createProfessional(
      'Dr. Derived Biochemistry',
      Especialidad.BIOQUIMICA,
    );

    const first = await start(
      registered.journey.id,
      Especialidad.CLINICA_MEDICA,
      clinical.id,
    ).expect(201);
    await finalize(first.body.attentionId);

    const waitingForCall = await readJourney(registered.applicant.id);
    expect(waitingForCall.journey.state).toBe('En proceso');
    expect(waitingForCall.journey.derivedState).toBe('Esperando llamado');

    const persisted = await prisma.client.recorrido.findUniqueOrThrow({
      where: { id: registered.journey.id },
    });
    expect(persisted.estado).toBe(RecorridoEstado.EN_PROCESO);

    await start(registered.journey.id, Especialidad.BIOQUIMICA, biochemistry.id).expect(201);
    const called = await readJourney(registered.applicant.id);
    expect(called.journey.derivedState).toBeNull();
  });
});
