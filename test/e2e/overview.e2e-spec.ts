import { INestApplication } from '@nestjs/common';
import { Especialidad } from '@prisma/client';
import request from 'supertest';

import { createApp } from '../../src/app.factory';
import { PrismaService } from '../../src/prisma/prisma.service';
import { assertIsolatedSchema } from '../support/runtime';
import {
  adminSessionHeaders,
  professionalSessions,
  type SessionHeaders,
} from '../support/sessions';

interface OverviewEntry {
  applicant: { nombre: string; apellido: string };
  attentionNumber: string;
  state: string;
  activeSpecialty: string | null;
  evaluations: { total: number; complete: number };
}

describe('journey overview HTTP API', () => {
  const prisma = new PrismaService();
  const authAs = professionalSessions(prisma);
  let app: INestApplication;
  let admin: SessionHeaders;
  const stamp = Date.now().toString(36);

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

  it('lists registered journeys with their state and evaluation progress', async () => {
    const registered = await request(app.getHttpServer())
      .post('/applicants')
      .set(admin)
      .send({ nombre: 'Overview', apellido: 'Overview', dni: `overview-${stamp}` })
      .expect(201);

    const response = await request(app.getHttpServer())
      .get('/journeys/overview')
      .set(admin)
      .expect(200);
    const entries = response.body as OverviewEntry[];
    const entry = entries.find(
      (candidate) => candidate.attentionNumber === registered.body.journey.attentionNumber,
    );

    expect(Array.isArray(entries)).toBe(true);
    expect(entry).toEqual(
      expect.objectContaining({
        state: 'En espera',
        activeSpecialty: null,
        evaluations: { total: 3, complete: 0 },
      }),
    );
    expect(entry?.applicant.nombre).toBe('Overview');
  });

  it('shows the active specialty once an attention starts', async () => {
    const stampSecond = `${stamp}b`;
    const registered = await request(app.getHttpServer())
      .post('/applicants')
      .set(admin)
      .send({ nombre: 'Overview', apellido: 'Active', dni: `overview-${stampSecond}` })
      .expect(201);

    const professional = await prisma.client.profesional.create({
      data: { nombre: `Overview Psych ${stampSecond}`, especialidad: Especialidad.PSICOLOGIA },
    });

    await request(app.getHttpServer())
      .post(`/journeys/${registered.body.journey.id}/attentions`)
      .set(await authAs(professional.id))
      .send({ specialty: Especialidad.PSICOLOGIA })
      .expect(201);

    const response = await request(app.getHttpServer())
      .get('/journeys/overview')
      .set(admin)
      .expect(200);
    const entry = (response.body as OverviewEntry[]).find(
      (candidate) => candidate.attentionNumber === registered.body.journey.attentionNumber,
    );

    expect(entry).toEqual(
      expect.objectContaining({ state: 'En proceso', activeSpecialty: 'PSICOLOGIA' }),
    );
  });
});
