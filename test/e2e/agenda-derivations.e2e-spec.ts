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

interface JourneyRead {
  journey: { id: string; state: string; derivedState: string | null };
  attentions: {
    id: string;
    state: string;
    specialty: string;
    recitationId: string | null;
  }[];
  evaluations: { id: string; specialty: string; state: string }[];
  pendings: { id: string; evaluationId: string; resolvedAt: string | null }[];
  recitations: { id: string; reservationId: string | null; pendingId: string }[];
  reservations: {
    id: string;
    state: string;
    previousReservationId: string | null;
    recitationId: string | null;
  }[];
  derivations: { id: string; originAttentionId: string; destinationSpecialty: string }[];
}

interface ScheduledCircuit {
  registered: Registered;
  professionalId: string;
  attentionId: string;
  pendingId: string;
  evaluationId: string;
  recitationId: string;
  reservationId: string;
}

describe('agenda and derivations HTTP API', () => {
  const prisma = new PrismaService();
  let app: INestApplication;
  let sequence = 0;

  beforeAll(async () => {
    await assertIsolatedSchema();
    app = await createApp();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await prisma.client.$disconnect();
  });

  function api() {
    return request(app.getHttpServer());
  }

  async function registerApplicant(): Promise<Registered> {
    sequence += 1;
    const response = await api()
      .post('/applicants')
      .send({
        nombre: `Agenda E2E ${sequence}`,
        apellido: 'Circuit',
        dni: `agenda-e2e-${sequence}-${Date.now()}`,
      })
      .expect(201);
    return response.body as Registered;
  }

  async function createProfessional(name: string, specialty = Especialidad.CLINICA_MEDICA) {
    return prisma.client.profesional.create({
      data: { nombre: name, especialidad: specialty },
    });
  }

  async function evaluationFor(journeyId: string, specialty = Especialidad.CLINICA_MEDICA) {
    return prisma.client.evaluacion.findUniqueOrThrow({
      where: {
        recorridoId_especialidad: { recorridoId: journeyId, especialidad: specialty },
      },
    });
  }

  async function readJourney(applicantId: string): Promise<JourneyRead> {
    const response = await api().get('/journeys').query({ applicantId }).expect(200);
    return response.body as JourneyRead;
  }

  async function scheduleCircuit(name: string): Promise<ScheduledCircuit> {
    const registered = await registerApplicant();
    const professional = await createProfessional(name);
    const evaluation = await evaluationFor(registered.journey.id);

    const started = await api()
      .post(`/journeys/${registered.journey.id}/attentions`)
      .send({
        specialty: Especialidad.CLINICA_MEDICA,
        professionalId: professional.id,
      })
      .expect(201);

    const pending = await api()
      .post(`/attentions/${started.body.attentionId}/pendings`)
      .send({ motivo: 'Agenda recitation' })
      .expect(201);

    await api()
      .patch(`/attentions/${started.body.attentionId}/finalize`)
      .send({ state: 'Finalizada' })
      .expect(200);

    const scheduled = await api()
      .post(`/journeys/${registered.journey.id}/recitations`)
      .send({
        pendingId: pending.body.id,
        professionalId: professional.id,
        inicio: '2027-01-15T09:00:00.000Z',
        fin: '2027-01-15T09:30:00.000Z',
      })
      .expect(201);

    return {
      registered,
      professionalId: professional.id,
      attentionId: started.body.attentionId,
      pendingId: pending.body.id,
      evaluationId: evaluation.id,
      recitationId: scheduled.body.id,
      reservationId: scheduled.body.reservationId,
    };
  }

  it('creates exactly one follow-up attention under concurrent duplicate fulfillment', async () => {
    const circuit = await scheduleCircuit('Dr. Fulfill');

    const [first, second] = await Promise.all([
      api().patch(`/reservations/${circuit.reservationId}/fulfill`).expect(200),
      api().patch(`/reservations/${circuit.reservationId}/fulfill`).expect(200),
    ]);

    expect(first.body.attention.id).toBe(second.body.attention.id);
    expect(first.body.attention.state).toBe('En espera');
    expect(first.body.attention.recitationId).toBe(circuit.recitationId);
    expect(first.body.attention.evaluationId).toBe(circuit.evaluationId);
    expect(first.body.attention.originAttentionId).toBe(circuit.attentionId);
    expect(first.body.attention.professionalId).toBe(circuit.professionalId);
    expect(first.body.reservationState).toBe('CUMPLIDA');

    const journey = await readJourney(circuit.registered.applicant.id);
    const followUps = journey.attentions.filter(
      (attention) => attention.recitationId === circuit.recitationId,
    );
    expect(followUps).toHaveLength(1);
    expect(followUps[0]?.id).toBe(first.body.attention.id);
    expect(followUps[0]?.state).toBe('En espera');
    expect(
      journey.reservations.find((reservation) => reservation.id === circuit.reservationId)?.state,
    ).toBe('CUMPLIDA');
  });

  it('preserves the circuit when a reservation is cancelled, rescheduled, or absent', async () => {
    const cancelled = await scheduleCircuit('Dr. Cancel');
    const beforeCancel = await readJourney(cancelled.registered.applicant.id);

    await api().patch(`/reservations/${cancelled.reservationId}/cancel`).expect(200);
    const afterCancel = await readJourney(cancelled.registered.applicant.id);
    expect(afterCancel.journey.state).toBe(beforeCancel.journey.state);
    expect(afterCancel.pendings.find((pending) => pending.id === cancelled.pendingId)).toEqual(
      expect.objectContaining({ resolvedAt: null }),
    );
    expect(
      afterCancel.evaluations.find((evaluation) => evaluation.id === cancelled.evaluationId)?.state,
    ).toBe('PENDIENTE');
    expect(
      afterCancel.reservations.find((reservation) => reservation.id === cancelled.reservationId)
        ?.state,
    ).toBe('CANCELADA');

    const rescheduled = await scheduleCircuit('Dr. Reschedule Circuit');
    const response = await api()
      .patch(`/reservations/${rescheduled.reservationId}/reschedule`)
      .send({ inicio: '2027-01-16T09:00:00.000Z', fin: '2027-01-16T09:30:00.000Z' })
      .expect(200);
    const newReservationId = response.body.id as string;
    expect(response.body.state).toBe('RESERVADA');
    expect(response.body.previousReservationId).toBe(rescheduled.reservationId);

    const afterReschedule = await readJourney(rescheduled.registered.applicant.id);
    expect(afterReschedule.journey.state).toBe('En proceso');
    expect(
      afterReschedule.pendings.find((pending) => pending.id === rescheduled.pendingId)?.resolvedAt,
    ).toBeNull();
    expect(
      afterReschedule.evaluations.find((evaluation) => evaluation.id === rescheduled.evaluationId)
        ?.state,
    ).toBe('PENDIENTE');
    expect(
      afterReschedule.reservations.find(
        (reservation) => reservation.id === rescheduled.reservationId,
      )?.state,
    ).toBe('REPROGRAMADA');
    expect(
      afterReschedule.reservations.find((reservation) => reservation.id === newReservationId)
        ?.state,
    ).toBe('RESERVADA');

    const absent = await scheduleCircuit('Dr. Absent');
    await api().patch(`/reservations/${absent.reservationId}/absent`).expect(200);
    const afterAbsent = await readJourney(absent.registered.applicant.id);
    expect(afterAbsent.journey.state).toBe('En proceso');
    expect(
      afterAbsent.pendings.find((pending) => pending.id === absent.pendingId)?.resolvedAt,
    ).toBeNull();
    expect(
      afterAbsent.evaluations.find((evaluation) => evaluation.id === absent.evaluationId)?.state,
    ).toBe('PENDIENTE');
    expect(
      afterAbsent.reservations.find((reservation) => reservation.id === absent.reservationId)
        ?.state,
    ).toBe('AUSENTE');
  });

  it('rejects an overlapping reservation for the same professional with 409', async () => {
    const first = await scheduleCircuit('Dr. Overlap');

    const registered = await registerApplicant();
    const started = await api()
      .post(`/journeys/${registered.journey.id}/attentions`)
      .send({
        specialty: Especialidad.CLINICA_MEDICA,
        professionalId: first.professionalId,
      })
      .expect(201);
    const pending = await api()
      .post(`/attentions/${started.body.attentionId}/pendings`)
      .send({ motivo: 'Overlap probe' })
      .expect(201);
    await api()
      .patch(`/attentions/${started.body.attentionId}/finalize`)
      .send({ state: 'Finalizada' })
      .expect(200);

    const rejected = await api()
      .post(`/journeys/${registered.journey.id}/recitations`)
      .send({
        pendingId: pending.body.id,
        professionalId: first.professionalId,
        inicio: '2027-01-15T09:15:00.000Z',
        fin: '2027-01-15T09:45:00.000Z',
      })
      .expect(409);
    expect(rejected.body.statusCode).toBe(409);

    const journey = await readJourney(first.registered.applicant.id);
    expect(journey.reservations).toHaveLength(1);
    expect(journey.reservations[0]?.state).toBe('RESERVADA');

    const activeReservations = await prisma.client.reserva.count({
      where: { profesionalId: first.professionalId, estado: 'RESERVADA' },
    });
    expect(activeReservations).toBe(1);
    const rejectedRecitations = await prisma.client.recitacion.count({
      where: { recorridoId: registered.journey.id },
    });
    expect(rejectedRecitations).toBe(0);
  });

  it('creates and rejects standalone reservations through POST /reservations', async () => {
    const first = await scheduleCircuit('Dr. Reservation API');
    await api().patch(`/reservations/${first.reservationId}/cancel`).expect(200);

    const created = await api()
      .post('/reservations')
      .send({
        recitacionId: first.recitationId,
        professionalId: first.professionalId,
        inicio: '2027-01-15T09:00:00.000Z',
        fin: '2027-01-15T09:30:00.000Z',
      })
      .expect(201);
    expect(created.body.state).toBe('RESERVADA');
    expect(created.body.previousReservationId).toBeNull();

    const second = await scheduleCircuit('Dr. Reservation API Other');
    await api().patch(`/reservations/${second.reservationId}/cancel`).expect(200);

    await api()
      .post('/reservations')
      .send({
        recitacionId: second.recitationId,
        professionalId: first.professionalId,
        inicio: '2027-01-15T09:15:00.000Z',
        fin: '2027-01-15T09:45:00.000Z',
      })
      .expect(409);

    const activeReservations = await prisma.client.reserva.count({
      where: { profesionalId: first.professionalId, estado: 'RESERVADA' },
    });
    expect(activeReservations).toBe(1);
  });

  it('records a derivation with traceability and rejects invalid destinations', async () => {
    const circuit = await scheduleCircuit('Dr. Derivation');
    const before = await readJourney(circuit.registered.applicant.id);

    const created = await api()
      .post(`/journeys/${circuit.registered.journey.id}/derivations`)
      .send({
        atencionOrigenId: circuit.attentionId,
        especialidadDestino: Especialidad.PSICOLOGIA,
        motivo: 'Requires psychological review',
      })
      .expect(201);

    expect(created.body).toEqual(
      expect.objectContaining({
        journeyId: circuit.registered.journey.id,
        journeyState: 'En proceso',
        originAttentionId: circuit.attentionId,
        destinationSpecialty: Especialidad.PSICOLOGIA,
        reason: 'Requires psychological review',
        createdAt: expect.any(String),
      }),
    );
    expect(created.body.state).toBeUndefined();

    await api()
      .post(`/journeys/${circuit.registered.journey.id}/derivations`)
      .send({
        atencionOrigenId: circuit.attentionId,
        especialidadDestino: Especialidad.CLINICA_MEDICA,
        motivo: 'Same specialty',
      })
      .expect(400);

    const other = await registerApplicant();
    await api()
      .post(`/journeys/${circuit.registered.journey.id}/derivations`)
      .send({
        atencionOrigenId: circuit.attentionId,
        especialidadDestino: Especialidad.PSICOLOGIA,
        motivo: ' ',
      })
      .expect(400);

    const otherProfessional = await createProfessional('Dr. Derivation Other');
    const otherAttention = await api()
      .post(`/journeys/${other.journey.id}/attentions`)
      .send({
        specialty: Especialidad.CLINICA_MEDICA,
        professionalId: otherProfessional.id,
      })
      .expect(201);

    await api()
      .post(`/journeys/${circuit.registered.journey.id}/derivations`)
      .send({
        atencionOrigenId: otherAttention.body.attentionId,
        especialidadDestino: Especialidad.PSICOLOGIA,
        motivo: 'Foreign origin',
      })
      .expect(400);

    await api()
      .post(`/journeys/${circuit.registered.journey.id}/derivations`)
      .send({
        atencionOrigenId: '00000000-0000-4000-8000-000000000000',
        especialidadDestino: Especialidad.PSICOLOGIA,
        motivo: 'Unknown origin',
      })
      .expect(400);

    await api()
      .post('/journeys/00000000-0000-4000-8000-000000000000/derivations')
      .send({
        atencionOrigenId: circuit.attentionId,
        especialidadDestino: Especialidad.PSICOLOGIA,
        motivo: 'Unknown journey',
      })
      .expect(404);

    const after = await readJourney(circuit.registered.applicant.id);
    expect(after.journey.state).toBe(before.journey.state);
    expect(after.derivations).toHaveLength(1);
    expect(after.derivations[0]).toEqual(
      expect.objectContaining({
        originAttentionId: circuit.attentionId,
        destinationSpecialty: Especialidad.PSICOLOGIA,
      }),
    );
  });

  it('adopts the pending follow-up when starting an attention after fulfillment', async () => {
    const circuit = await scheduleCircuit('Dr. Adopt');
    const fulfilled = await api()
      .patch(`/reservations/${circuit.reservationId}/fulfill`)
      .expect(200);
    const followUpId = fulfilled.body.attention.id as string;

    const before = await readJourney(circuit.registered.applicant.id);
    expect(before.attentions).toHaveLength(2);

    const started = await api()
      .post(`/journeys/${circuit.registered.journey.id}/attentions`)
      .send({
        specialty: Especialidad.CLINICA_MEDICA,
        professionalId: circuit.professionalId,
      })
      .expect(201);

    expect(started.body.attentionId).toBe(followUpId);

    const after = await readJourney(circuit.registered.applicant.id);
    expect(after.attentions).toHaveLength(2);
    const followUps = after.attentions.filter(
      (attention) => attention.recitationId === circuit.recitationId,
    );
    expect(followUps).toHaveLength(1);
    expect(followUps[0]).toEqual(expect.objectContaining({ id: followUpId, state: 'En atención' }));
  });
});
