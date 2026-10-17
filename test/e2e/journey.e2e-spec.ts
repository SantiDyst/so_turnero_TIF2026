import { INestApplication } from '@nestjs/common';
import {
  AtencionEstado,
  DisponibilidadProfesional,
  Prisma,
  RecorridoEstado,
} from '@prisma/client';
import request from 'supertest';

import { createApp } from '../../src/app.factory';
import { PrismaService } from '../../src/prisma/prisma.service';
import { assertIsolatedSchema } from '../support/runtime';

describe('first functional journey HTTP API', () => {
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

  async function registerApplicant(name: string) {
    const response = await request(app.getHttpServer())
      .post('/applicants')
      .send({ nombre: name, apellido: 'Applicant', dni: `${name}-dni` })
      .expect(201);
    return response.body as {
      applicant: { id: string };
      journey: { id: string; attentionNumber: string; state: string };
    };
  }

  it('registers valid applicants and rejects every missing required field without persistence', async () => {
    const before = await prisma.client.postulante.count();
    const invalid = await request(app.getHttpServer()).post('/applicants').send({}).expect(400);
    expect(invalid.body.message).toBe('Validation failed.');
    expect(invalid.body.missingFields).toEqual(['nombre', 'apellido', 'dni']);
    expect(await prisma.client.postulante.count()).toBe(before);

    const registered = await registerApplicant('E2E Registration');
    expect(registered.journey.state).toBe('En espera');
    expect(registered.journey.attentionNumber).toMatch(/^AT-/);
  });

  it('lists only waiting journeys and resolves equivalent journey identifiers', async () => {
    const registered = await registerApplicant('E2E Lookup');
    const queue = await request(app.getHttpServer()).get('/queue').expect(200);
    expect(queue.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          applicantId: registered.applicant.id,
          attentionNumber: registered.journey.attentionNumber,
          journeyState: 'En espera',
        }),
      ]),
    );

    const byApplicant = await request(app.getHttpServer())
      .get('/journeys')
      .query({ applicantId: registered.applicant.id })
      .expect(200);
    const byNumber = await request(app.getHttpServer())
      .get('/journeys')
      .query({ attentionNumber: registered.journey.attentionNumber })
      .expect(200);
    expect(byApplicant.body).toEqual(byNumber.body);
    await request(app.getHttpServer()).get('/journeys').expect(400);
    await request(app.getHttpServer())
      .get('/journeys')
      .query({ applicantId: 'missing', attentionNumber: 'AT-0' })
      .expect(400);
    await request(app.getHttpServer())
      .get('/journeys')
      .query({ attentionNumber: 'AT-999999999' })
      .expect(404);
  });

  it('starts and finalizes attention while enforcing professional and transition conflicts', async () => {
    const first = await registerApplicant('E2E Start');
    const second = await registerApplicant('E2E Busy');
    const professional = await prisma.client.profesional.create({ data: { nombre: 'Dr. E2E' } });
    const alternate = await prisma.client.profesional.create({ data: { nombre: 'Dr. Alternate' } });

    const started = await request(app.getHttpServer())
      .post(`/journeys/${first.journey.id}/attentions`)
      .send({ specialty: 'Clinical', professionalId: professional.id })
      .expect(201);
    expect(started.body.state).toBe('En atención');
    expect(started.body.startedAt).toBeTruthy();
    await request(app.getHttpServer())
      .post(`/journeys/${first.journey.id}/attentions`)
      .send({ specialty: 'Clinical', professionalId: alternate.id })
      .expect(409);
    await request(app.getHttpServer())
      .post(`/journeys/${second.journey.id}/attentions`)
      .send({ specialty: 'Clinical', professionalId: professional.id })
      .expect(409);

    const queue = await request(app.getHttpServer()).get('/queue').expect(200);
    expect(
      queue.body.some((entry: { applicantId: string }) => entry.applicantId === first.applicant.id),
    ).toBe(false);
    const finalized = await request(app.getHttpServer())
      .patch(`/attentions/${started.body.attentionId}/finalize`)
      .send({ state: 'Finalizada' })
      .expect(200);
    expect(finalized.body).toEqual(
      expect.objectContaining({
        state: 'Finalizada',
        journeyState: 'En proceso',
        professionalAvailability: 'Disponible',
      }),
    );
    await request(app.getHttpServer())
      .patch(`/attentions/${started.body.attentionId}/finalize`)
      .send({ state: 'Finalizada' })
      .expect(409);
  });

  it('keeps committed data visible to a second application instance', async () => {
    const registered = await registerApplicant('E2E Restart');
    const restarted = await createApp();
    await restarted.init();
    try {
      const response = await request(restarted.getHttpServer())
        .get('/journeys')
        .query({ applicantId: registered.applicant.id })
        .expect(200);
      expect(response.body.journey).toEqual(
        expect.objectContaining({
          attentionNumber: registered.journey.attentionNumber,
          state: 'En espera',
        }),
      );
    } finally {
      await restarted.close();
    }
  });

  it('allows exactly one synchronized concurrent start and leaves one active row', async () => {
    const registered = await registerApplicant('E2E Race');
    const [firstProfessional, secondProfessional] = await Promise.all(
      ['Dr. Race One', 'Dr. Race Two'].map((nombre) =>
        prisma.client.profesional.create({ data: { nombre } }),
      ),
    );
    const start = (professionalId: string) =>
      request(app.getHttpServer())
        .post(`/journeys/${registered.journey.id}/attentions`)
        .send({ specialty: 'Clinical', professionalId });
    const responses = await Promise.all([
      start(firstProfessional.id),
      start(secondProfessional.id),
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
    const active = await prisma.client.$queryRaw<{ count: bigint }[]>(
      Prisma.sql`SELECT COUNT(*)::bigint AS "count" FROM "Atencion" WHERE "postulanteId" = ${registered.applicant.id} AND "estado" = 'En atención'`,
    );
    expect(active[0]?.count).toBe(1n);
  });

  it('reads a finalized attention through a second application instance', async () => {
    const registered = await registerApplicant('E2E Persist Finalized');
    const professional = await prisma.client.profesional.create({
      data: { nombre: 'Dr. Persist Finalized' },
    });
    const started = await request(app.getHttpServer())
      .post(`/journeys/${registered.journey.id}/attentions`)
      .send({ specialty: 'Clinical', professionalId: professional.id })
      .expect(201);

    const finalized = await request(app.getHttpServer())
      .patch(`/attentions/${started.body.attentionId}/finalize`)
      .send({ state: 'Finalizada' })
      .expect(200);
    expect(finalized.body).toEqual(
      expect.objectContaining({
        state: 'Finalizada',
        journeyState: 'En proceso',
        professionalAvailability: 'Disponible',
      }),
    );
    expect(finalized.body.endedAt).toBeTruthy();

    const restarted = await createApp();
    await restarted.init();
    try {
      const response = await request(restarted.getHttpServer())
        .get('/journeys')
        .query({ applicantId: registered.applicant.id })
        .expect(200);
      expect(response.body.journey).toEqual(
        expect.objectContaining({
          attentionNumber: registered.journey.attentionNumber,
          state: 'En proceso',
        }),
      );
      expect(response.body.attentions).toHaveLength(1);
      expect(response.body.attentions[0]).toEqual(
        expect.objectContaining({
          id: started.body.attentionId,
          state: 'Finalizada',
          specialty: 'Clinical',
          endedAt: expect.any(String),
          professional: expect.objectContaining({
            id: professional.id,
            name: 'Dr. Persist Finalized',
            availability: 'Disponible',
          }),
        }),
      );
    } finally {
      await restarted.close();
    }
  });

  it('finalizes an attention as Pendiente and persists the pending outcome', async () => {
    const registered = await registerApplicant('E2E Pending');
    const professional = await prisma.client.profesional.create({
      data: { nombre: 'Dr. Pending' },
    });
    const started = await request(app.getHttpServer())
      .post(`/journeys/${registered.journey.id}/attentions`)
      .send({ specialty: 'Occupational medicine', professionalId: professional.id })
      .expect(201);

    const finalized = await request(app.getHttpServer())
      .patch(`/attentions/${started.body.attentionId}/finalize`)
      .send({ state: 'Pendiente' })
      .expect(200);
    expect(finalized.body).toEqual(
      expect.objectContaining({
        id: started.body.attentionId,
        state: 'Pendiente',
        journeyState: 'En proceso',
        professionalAvailability: 'Disponible',
      }),
    );
    expect(finalized.body.endedAt).toBeTruthy();

    const persisted = await prisma.client.atencion.findUniqueOrThrow({
      where: { id: started.body.attentionId },
    });
    const journey = await prisma.client.recorrido.findUniqueOrThrow({
      where: { id: registered.journey.id },
    });
    const released = await prisma.client.profesional.findUniqueOrThrow({
      where: { id: professional.id },
    });
    expect(persisted.estado).toBe(AtencionEstado.PENDIENTE);
    expect(persisted.endedAt).not.toBeNull();
    expect(journey.estado).toBe(RecorridoEstado.EN_PROCESO);
    expect(released.disponibilidad).toBe(DisponibilidadProfesional.DISPONIBLE);
  });
});
