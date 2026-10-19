import { INestApplication } from '@nestjs/common';
import { Especialidad } from '@prisma/client';
import request from 'supertest';

import { createApp } from '../../src/app.factory';
import { PrismaService } from '../../src/prisma/prisma.service';
import { assertIsolatedSchema } from '../support/runtime';

interface Registered {
  applicant: { id: string };
  journey: { id: string; attentionNumber: string; state: string };
}

interface ReadJourney {
  journey: { id: string; state: string; derivedState: string | null };
  attentions: { id: string; state: string; specialty: string }[];
  evaluations: {
    id: string;
    specialty: string;
    state: string;
    result: string | null;
    completedAt: string | null;
  }[];
  pendings: {
    id: string;
    evaluationId: string;
    originAttentionId: string | null;
    reason: string;
    resolvedAt: string | null;
  }[];
  recitations: {
    id: string;
    evaluationId: string;
    pendingId: string;
    reservationId: string | null;
    scheduledAt: string;
  }[];
  reservations: {
    id: string;
    professionalId: string;
    recitationId: string | null;
    state: string;
  }[];
}

describe('pendings, evaluation gate, and recitations HTTP API', () => {
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
      .send({ nombre: name, apellido: 'Pending', dni: `${name}-dni` })
      .expect(201);
    return response.body as Registered;
  }

  async function createProfessional(name: string, specialty: Especialidad) {
    return prisma.client.profesional.create({
      data: { nombre: name, especialidad: specialty },
    });
  }

  async function startAttention(
    journeyId: string,
    specialty: Especialidad,
    professionalId: string,
  ): Promise<string> {
    const response = await request(app.getHttpServer())
      .post(`/journeys/${journeyId}/attentions`)
      .send({ specialty, professionalId })
      .expect(201);
    return response.body.attentionId as string;
  }

  async function finalizeAttention(attentionId: string): Promise<void> {
    await request(app.getHttpServer())
      .patch(`/attentions/${attentionId}/finalize`)
      .send({ state: 'Finalizada' })
      .expect(200);
  }

  function createPending(attentionId: string, motivo: string, fechaLimite?: string) {
    return request(app.getHttpServer())
      .post(`/attentions/${attentionId}/pendings`)
      .send(fechaLimite ? { motivo, fechaLimite } : { motivo });
  }

  function resolvePending(pendingId: string) {
    return request(app.getHttpServer()).patch(`/pendings/${pendingId}/resolve`);
  }

  function setResult(evaluationId: string, resultado: string) {
    return request(app.getHttpServer())
      .patch(`/evaluations/${evaluationId}/result`)
      .send({ resultado });
  }

  function completeEvaluation(evaluationId: string) {
    return request(app.getHttpServer()).patch(`/evaluations/${evaluationId}/complete`);
  }

  async function readJourney(applicantId: string): Promise<ReadJourney> {
    const response = await request(app.getHttpServer())
      .get('/journeys')
      .query({ applicantId })
      .expect(200);
    return response.body as ReadJourney;
  }

  async function evaluationFor(journeyId: string, specialty: Especialidad) {
    return prisma.client.evaluacion.findUniqueOrThrow({
      where: { recorridoId_especialidad: { recorridoId: journeyId, especialidad: specialty } },
    });
  }

  it('resolves one of two pendings and leaves the other open', async () => {
    const registered = await registerApplicant('E2E Pending Resolve');
    const evaluation = await evaluationFor(registered.journey.id, Especialidad.CLINICA_MEDICA);
    const professional = await createProfessional(
      'Dr. Pending Resolve',
      Especialidad.CLINICA_MEDICA,
    );
    const attentionId = await startAttention(
      registered.journey.id,
      Especialidad.CLINICA_MEDICA,
      professional.id,
    );

    const first = await createPending(attentionId, 'Retrieve lab results', '2026-11-10T10:00:00.000Z').expect(201);
    const second = await createPending(attentionId, 'Repeat measurement').expect(201);

    expect(first.body).toEqual(
      expect.objectContaining({
        evaluationId: evaluation.id,
        originAttentionId: attentionId,
        reason: 'Retrieve lab results',
        resolvedAt: null,
      }),
    );
    expect(first.body.limitDate).toBe('2026-11-10T10:00:00.000Z');
    expect(second.body.evaluationId).toBe(evaluation.id);
    expect(second.body.resolvedAt).toBeNull();

    const resolved = await resolvePending(first.body.id).expect(200);
    expect(resolved.body).toEqual(
      expect.objectContaining({
        id: first.body.id,
        evaluationId: evaluation.id,
        originAttentionId: attentionId,
      }),
    );
    expect(resolved.body.resolvedAt).toBeTruthy();

    await resolvePending(first.body.id).expect(409);
    await resolvePending('00000000-0000-4000-8000-000000000000').expect(404);

    const journey = await readJourney(registered.applicant.id);
    const pendings = journey.pendings.filter(
      (pending) => pending.evaluationId === evaluation.id,
    );
    expect(pendings).toHaveLength(2);
    expect(pendings.find((pending) => pending.id === first.body.id)?.resolvedAt).toBeTruthy();
    expect(pendings.find((pending) => pending.id === second.body.id)?.resolvedAt).toBeNull();
  });

  it('schedules a recitation without resolving the pending or changing circuit state', async () => {
    const registered = await registerApplicant('E2E Recitation');
    const evaluation = await evaluationFor(registered.journey.id, Especialidad.CLINICA_MEDICA);
    const clinical = await createProfessional('Dr. Recitation Clinical', Especialidad.CLINICA_MEDICA);
    const attentionId = await startAttention(
      registered.journey.id,
      Especialidad.CLINICA_MEDICA,
      clinical.id,
    );
    const pending = await createPending(attentionId, 'Repeat blood pressure').expect(201);

    const before = await readJourney(registered.applicant.id);
    const recitationProfessional = await createProfessional(
      'Dr. Recitation Specialist',
      Especialidad.CLINICA_MEDICA,
    );
    const inicio = '2026-11-20T09:00:00.000Z';
    const fin = '2026-11-20T09:30:00.000Z';

    const scheduled = await request(app.getHttpServer())
      .post(`/journeys/${registered.journey.id}/recitations`)
      .send({
        pendingId: pending.body.id,
        professionalId: recitationProfessional.id,
        inicio,
        fin,
      })
      .expect(201);

    expect(scheduled.body).toEqual(
      expect.objectContaining({
        journeyId: registered.journey.id,
        evaluationId: evaluation.id,
        pendingId: pending.body.id,
        specialty: Especialidad.CLINICA_MEDICA,
        scheduledAt: inicio,
        reservation: expect.objectContaining({
          professionalId: recitationProfessional.id,
          start: inicio,
          end: fin,
          state: 'RESERVADA',
        }),
      }),
    );

    const after = await readJourney(registered.applicant.id);
    expect(after.journey.state).toBe(before.journey.state);
    expect(
      after.evaluations.find((item) => item.id === evaluation.id),
    ).toEqual(
      expect.objectContaining({
        state: 'PENDIENTE',
        result: null,
        completedAt: null,
      }),
    );
    expect(
      after.pendings.find((item) => item.id === pending.body.id)?.resolvedAt,
    ).toBeNull();
    expect(after.recitations).toHaveLength(1);
    expect(after.recitations[0]).toEqual(
      expect.objectContaining({
        evaluationId: evaluation.id,
        pendingId: pending.body.id,
        reservationId: scheduled.body.reservationId,
        scheduledAt: inicio,
      }),
    );
    expect(after.reservations).toHaveLength(1);
    expect(after.reservations[0].state).toBe('RESERVADA');
    expect(after.reservations[0].professionalId).toBe(recitationProfessional.id);

    await request(app.getHttpServer())
      .post(`/journeys/${registered.journey.id}/recitations`)
      .send({
        pendingId: pending.body.id,
        professionalId: recitationProfessional.id,
        inicio,
        fin: inicio,
      })
      .expect(400);

    await request(app.getHttpServer())
      .post(`/journeys/${registered.journey.id}/recitations`)
      .send({
        pendingId: pending.body.id,
        professionalId: recitationProfessional.id,
        inicio: 'not-a-date',
        fin,
      })
      .expect(400);

    const biochemistry = await createProfessional(
      'Dr. Recitation Biochemistry',
      Especialidad.BIOQUIMICA,
    );
    await request(app.getHttpServer())
      .post(`/journeys/${registered.journey.id}/recitations`)
      .send({
        pendingId: pending.body.id,
        professionalId: biochemistry.id,
        inicio,
        fin,
      })
      .expect(400);

    const other = await registerApplicant('E2E Recitation Other');
    const otherClinical = await createProfessional(
      'Dr. Recitation Other',
      Especialidad.CLINICA_MEDICA,
    );
    const otherAttention = await startAttention(
      other.journey.id,
      Especialidad.CLINICA_MEDICA,
      otherClinical.id,
    );
    const otherPending = await createPending(otherAttention, 'Other journey pending').expect(201);

    await request(app.getHttpServer())
      .post(`/journeys/${registered.journey.id}/recitations`)
      .send({
        pendingId: otherPending.body.id,
        professionalId: recitationProfessional.id,
        inicio,
        fin,
      })
      .expect(400);

    await request(app.getHttpServer())
      .post(`/journeys/${registered.journey.id}/recitations`)
      .send({
        pendingId: '00000000-0000-4000-8000-000000000000',
        professionalId: recitationProfessional.id,
        inicio,
        fin,
      })
      .expect(404);

    await resolvePending(pending.body.id).expect(200);
    await request(app.getHttpServer())
      .post(`/journeys/${registered.journey.id}/recitations`)
      .send({
        pendingId: pending.body.id,
        professionalId: recitationProfessional.id,
        inicio,
        fin,
      })
      .expect(409);

    const unchanged = await readJourney(registered.applicant.id);
    expect(unchanged.recitations).toHaveLength(1);
    expect(unchanged.reservations).toHaveLength(1);
  });

  it('finalizing an attention with open pendings does not complete its evaluation', async () => {
    const registered = await registerApplicant('E2E Pending Finalize');
    const evaluation = await evaluationFor(registered.journey.id, Especialidad.CLINICA_MEDICA);
    const professional = await createProfessional(
      'Dr. Pending Finalize',
      Especialidad.CLINICA_MEDICA,
    );
    const attentionId = await startAttention(
      registered.journey.id,
      Especialidad.CLINICA_MEDICA,
      professional.id,
    );
    await createPending(attentionId, 'Awaiting external study').expect(201);
    await finalizeAttention(attentionId);

    const journey = await readJourney(registered.applicant.id);
    expect(journey.attentions.find((item) => item.id === attentionId)?.state).toBe(
      'Finalizada',
    );
    expect(journey.evaluations.find((item) => item.id === evaluation.id)).toEqual(
      expect.objectContaining({
        state: 'PENDIENTE',
        completedAt: null,
      }),
    );

    await completeEvaluation(evaluation.id).expect(409);
  });

  it.each([Especialidad.CLINICA_MEDICA, Especialidad.PSICOLOGIA])(
    'blocks %s completion until pendings are resolved and a result is stored',
    async (specialty) => {
      const registered = await registerApplicant(`E2E Gate ${specialty}`);
      const evaluation = await evaluationFor(registered.journey.id, specialty);
      const professional = await createProfessional(`Dr. Gate ${specialty}`, specialty);
      const attentionId = await startAttention(
        registered.journey.id,
        specialty,
        professional.id,
      );
      const pending = await createPending(attentionId, `Pending for ${specialty}`).expect(201);

      await completeEvaluation(evaluation.id).expect(409);

      await resolvePending(pending.body.id).expect(200);
      await completeEvaluation(evaluation.id).expect(409);

      await setResult(evaluation.id, 'PENDIENTE').expect(400);

      const withResult = await setResult(evaluation.id, 'APTO_CONDICIONAL').expect(200);
      expect(withResult.body).toEqual(
        expect.objectContaining({
          id: evaluation.id,
          state: 'PENDIENTE',
          result: 'APTO_CONDICIONAL',
          completedAt: null,
        }),
      );

      const completed = await completeEvaluation(evaluation.id).expect(200);
      expect(completed.body).toEqual(
        expect.objectContaining({
          id: evaluation.id,
          specialty,
          state: 'COMPLETA',
          result: 'APTO_CONDICIONAL',
        }),
      );
      expect(completed.body.completedAt).toBeTruthy();

      await completeEvaluation(evaluation.id).expect(409);

      const journey = await readJourney(registered.applicant.id);
      expect(journey.evaluations.find((item) => item.id === evaluation.id)).toEqual(
        expect.objectContaining({
          state: 'COMPLETA',
          result: 'APTO_CONDICIONAL',
          completedAt: expect.any(String),
        }),
      );
    },
  );

  it('completes a Bioquimica evaluation without a result', async () => {
    const registered = await registerApplicant('E2E Gate Biochemistry');
    const evaluation = await evaluationFor(registered.journey.id, Especialidad.BIOQUIMICA);
    const professional = await createProfessional(
      'Dr. Gate Biochemistry',
      Especialidad.BIOQUIMICA,
    );
    const attentionId = await startAttention(
      registered.journey.id,
      Especialidad.BIOQUIMICA,
      professional.id,
    );
    const pending = await createPending(attentionId, 'Pending biochemistry study').expect(201);

    await resolvePending(pending.body.id).expect(200);
    await setResult(evaluation.id, 'APTO_PLENO').expect(400);

    const completed = await completeEvaluation(evaluation.id).expect(200);
    expect(completed.body).toEqual(
      expect.objectContaining({
        id: evaluation.id,
        specialty: Especialidad.BIOQUIMICA,
        state: 'COMPLETA',
        result: null,
      }),
    );
    expect(completed.body.completedAt).toBeTruthy();
  });

  it('rejects a pending creation for a missing attention', async () => {
    await createPending(
      '00000000-0000-4000-8000-000000000000',
      'Missing attention',
    ).expect(404);
  });
});
