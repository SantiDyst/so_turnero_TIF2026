import { INestApplication } from '@nestjs/common';
import {
  AtencionEstado,
  DisponibilidadProfesional,
  Especialidad,
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
    const professional = await prisma.client.profesional.create({ data: { nombre: 'Dr. E2E', especialidad: Especialidad.CLINICA_MEDICA } });
    const alternate = await prisma.client.profesional.create({ data: { nombre: 'Dr. Alternate', especialidad: Especialidad.CLINICA_MEDICA } });

    const started = await request(app.getHttpServer())
      .post(`/journeys/${first.journey.id}/attentions`)
      .send({ specialty: Especialidad.CLINICA_MEDICA, professionalId: professional.id })
      .expect(201);
    expect(started.body.state).toBe('En atención');
    expect(started.body.startedAt).toBeTruthy();
    await request(app.getHttpServer())
      .post(`/journeys/${first.journey.id}/attentions`)
      .send({ specialty: Especialidad.CLINICA_MEDICA, professionalId: alternate.id })
      .expect(409);
    await request(app.getHttpServer())
      .post(`/journeys/${second.journey.id}/attentions`)
      .send({ specialty: Especialidad.CLINICA_MEDICA, professionalId: professional.id })
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
        prisma.client.profesional.create({
        data: { nombre, especialidad: Especialidad.CLINICA_MEDICA },
      }),
      ),
    );
    const start = (professionalId: string) =>
      request(app.getHttpServer())
        .post(`/journeys/${registered.journey.id}/attentions`)
        .send({ specialty: Especialidad.CLINICA_MEDICA, professionalId });
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
      data: { nombre: 'Dr. Persist Finalized', especialidad: Especialidad.CLINICA_MEDICA },
    });
    const started = await request(app.getHttpServer())
      .post(`/journeys/${registered.journey.id}/attentions`)
      .send({ specialty: Especialidad.CLINICA_MEDICA, professionalId: professional.id })
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
          specialty: Especialidad.CLINICA_MEDICA,
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
      data: { nombre: 'Dr. Pending', especialidad: Especialidad.CLINICA_MEDICA },
    });
    const started = await request(app.getHttpServer())
      .post(`/journeys/${registered.journey.id}/attentions`)
      .send({ specialty: Especialidad.CLINICA_MEDICA, professionalId: professional.id })
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

  it('reads three ordered reports, a null certificate, and every existing key', async () => {
    const registered = await registerApplicant('E2E Reports');
    const specialties = [
      Especialidad.BIOQUIMICA,
      Especialidad.CLINICA_MEDICA,
      Especialidad.PSICOLOGIA,
    ] as const;
    const attentionIds: Partial<Record<Especialidad, string>> = {};

    for (const specialty of specialties) {
      const professional = await prisma.client.profesional.create({
        data: { nombre: `Dr. E2E Reports ${specialty}`, especialidad: specialty },
      });
      const started = await request(app.getHttpServer())
        .post(`/journeys/${registered.journey.id}/attentions`)
        .send({ specialty, professionalId: professional.id })
        .expect(201);
      attentionIds[specialty] = started.body.attentionId;

      await request(app.getHttpServer())
        .patch(`/attentions/${started.body.attentionId}/finalize`)
        .send({
          state: specialty === Especialidad.CLINICA_MEDICA ? 'Pendiente' : 'Finalizada',
        })
        .expect(200);
    }

    await request(app.getHttpServer())
      .put(`/attentions/${attentionIds[Especialidad.BIOQUIMICA]}/report`)
      .send({ observations: 'Lab values within range', state: 'Completo' })
      .expect(200);
    await request(app.getHttpServer())
      .put(`/attentions/${attentionIds[Especialidad.CLINICA_MEDICA]}/report`)
      .send({ observations: 'Draft clinical note', state: 'Pendiente' })
      .expect(200);

    const response = await request(app.getHttpServer())
      .get('/journeys')
      .query({ applicantId: registered.applicant.id })
      .expect(200);
    const body = response.body as {
      reports: {
        reportId: string | null;
        evaluationId: string | null;
        specialty: string;
        reportState: string;
        attentionNumber: string;
        originArea: string;
        observations: string | null;
        specialtyResult: string | null;
        finalAptitude: string | null;
        responsible: { area: string; professional: { id: string } | null };
        updatedAt: string | null;
      }[];
      certificate: unknown;
      attentions: { state: string }[];
      journey: { state: string; derivedState: string | null };
    };

    expect(body.reports).toHaveLength(3);
    expect(body.reports.map((report) => report.specialty)).toEqual([
      Especialidad.BIOQUIMICA,
      Especialidad.CLINICA_MEDICA,
      Especialidad.PSICOLOGIA,
    ]);
    expect(body.reports.map((report) => report.reportState)).toEqual([
      'Completo',
      'Pendiente',
      'Pendiente',
    ]);
    expect(body.reports.map((report) => report.reportId)).toEqual([
      expect.any(String),
      expect.any(String),
      null,
    ]);

    const [biochemistry, clinical, psychology] = body.reports;
    expect(biochemistry).toEqual(
      expect.objectContaining({
        evaluationId: expect.any(String),
        attentionNumber: registered.journey.attentionNumber,
        originArea: 'Admisión',
        observations: 'Lab values within range',
        specialtyResult: null,
        finalAptitude: null,
        updatedAt: expect.any(String),
      }),
    );
    expect(biochemistry?.responsible).toEqual({
      area: Especialidad.BIOQUIMICA,
      professional: { id: expect.any(String), nombre: expect.any(String) },
    });
    expect(clinical).toEqual(
      expect.objectContaining({
        reportState: 'Pendiente',
        observations: 'Draft clinical note',
      }),
    );
    expect(psychology).toEqual(
      expect.objectContaining({
        reportId: null,
        observations: null,
        updatedAt: null,
      }),
    );

    expect(body.certificate).toBeNull();
    expect(body.journey).toEqual(
      expect.objectContaining({
        state: 'En proceso',
        derivedState: 'Esperando llamado',
      }),
    );
    expect(body.attentions.map((attention) => attention.state)).toEqual([
      'Finalizada',
      'Pendiente',
      'Finalizada',
    ]);
    expect(clinical).not.toHaveProperty('state');

    expect(Object.keys(body).sort()).toEqual(
      [
        'applicant',
        'aptitude',
        'attentions',
        'certificate',
        'derivations',
        'evaluations',
        'journey',
        'pendings',
        'recitations',
        'reports',
        'reservations',
      ].sort(),
    );
  });
});
