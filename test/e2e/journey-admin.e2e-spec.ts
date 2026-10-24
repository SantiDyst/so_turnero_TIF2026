import { INestApplication } from '@nestjs/common';
import { Especialidad, RecorridoEstado } from '@prisma/client';
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
  applicant: { id: string };
  journey: { id: string; attentionNumber: string; state: string };
}

interface OverviewEntry {
  attentionNumber: string;
  state: string;
  attentionCount: number;
  annulledReason: string | null;
  annulledBy: { id: string; name: string } | null;
  empresa: string | null;
  puesto: string | null;
}

describe('journey administration HTTP API', () => {
  const prisma = new PrismaService();
  const authAs = professionalSessions(prisma);
  let app: INestApplication;
  let admin: SessionHeaders;
  const stamp = Date.now().toString(36);
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

  async function register(name: string): Promise<Registered> {
    sequence += 1;
    const response = await request(app.getHttpServer())
      .post('/applicants')
      .set(admin)
      .send({ nombre: name, apellido: 'Admin', dni: `admin-${stamp}-${sequence}` })
      .expect(201);

    return response.body as Registered;
  }

  async function overviewEntry(attentionNumber: string): Promise<OverviewEntry | undefined> {
    const response = await request(app.getHttpServer())
      .get('/journeys/overview')
      .set(admin)
      .expect(200);

    return (response.body as OverviewEntry[]).find(
      (candidate) => candidate.attentionNumber === attentionNumber,
    );
  }

  it('keeps the workplace on the journey and in the overview', async () => {
    const created = await request(app.getHttpServer())
      .post('/applicants')
      .set(admin)
      .send({
        nombre: 'Workplace',
        apellido: 'Admin',
        dni: `workplace-${stamp}`,
        empresa: '  Ente Público  ',
        puesto: 'Administrativo',
      })
      .expect(201);

    expect(created.body.journey).toEqual(
      expect.objectContaining({ empresa: 'Ente Público', puesto: 'Administrativo' }),
    );

    expect(await overviewEntry(created.body.journey.attentionNumber)).toEqual(
      expect.objectContaining({ empresa: 'Ente Público', puesto: 'Administrativo' }),
    );
  });

  it('annuls a journey and keeps it visible with its reason', async () => {
    const created = await register('Annul');

    const annulled = await request(app.getHttpServer())
      .post(`/journeys/${created.journey.id}/annul`)
      .set(admin)
      .send({ motivo: 'El postulante desistió.' })
      .expect(200);

    expect(annulled.body).toEqual(
      expect.objectContaining({
        journeyId: created.journey.id,
        state: 'Anulada',
        reason: 'El postulante desistió.',
        annulledBy: expect.objectContaining({ name: expect.any(String) }),
      }),
    );

    expect(await overviewEntry(created.journey.attentionNumber)).toEqual(
      expect.objectContaining({
        state: 'Anulada',
        attentionCount: 0,
        annulledReason: 'El postulante desistió.',
        annulledBy: expect.objectContaining({ name: expect.any(String) }),
      }),
    );

    await request(app.getHttpServer())
      .get(`/journeys?attentionNumber=${created.journey.attentionNumber}`)
      .set(admin)
      .expect(200);
  });

  it('rejects annulment without a motivo', async () => {
    const created = await register('NoReason');

    await request(app.getHttpServer())
      .post(`/journeys/${created.journey.id}/annul`)
      .set(admin)
      .send({})
      .expect(400);
  });

  it('rejects annulment while an attention is active', async () => {
    const created = await register('Active');
    const professional = await prisma.client.profesional.create({
      data: { nombre: `Admin Psychology ${stamp}`, especialidad: Especialidad.PSICOLOGIA },
    });

    await request(app.getHttpServer())
      .post(`/journeys/${created.journey.id}/attentions`)
      .set(await authAs(professional.id))
      .send({ specialty: Especialidad.PSICOLOGIA })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/journeys/${created.journey.id}/annul`)
      .set(admin)
      .send({ motivo: 'Intento con atención activa.' })
      .expect(409);
  });

  it('rejects annulment of a closed journey', async () => {
    const created = await register('Closed');

    await prisma.client.recorrido.update({
      where: { id: created.journey.id },
      data: { estado: RecorridoEstado.CIERRE_FINAL },
    });

    await request(app.getHttpServer())
      .post(`/journeys/${created.journey.id}/annul`)
      .set(admin)
      .send({ motivo: 'Intento sobre cerrado.' })
      .expect(409);
  });

  it('deletes a journey without attentions', async () => {
    const created = await register('Deletable');

    await request(app.getHttpServer())
      .delete(`/journeys/${created.journey.id}`)
      .set(admin)
      .expect(200, {
        journeyId: created.journey.id,
        attentionNumber: created.journey.attentionNumber,
        deleted: true,
      });

    await request(app.getHttpServer())
      .get(`/journeys?attentionNumber=${created.journey.attentionNumber}`)
      .set(admin)
      .expect(404);

    expect(await prisma.client.postulante.count({ where: { id: created.applicant.id } })).toBe(0);
  });

  it('rejects deletion when the journey has attentions', async () => {
    const created = await register('WithAttention');
    const professional = await prisma.client.profesional.create({
      data: { nombre: `Admin Bio ${stamp}`, especialidad: Especialidad.BIOQUIMICA },
    });

    await request(app.getHttpServer())
      .post(`/journeys/${created.journey.id}/attentions`)
      .set(await authAs(professional.id))
      .send({ specialty: Especialidad.BIOQUIMICA })
      .expect(201);

    await request(app.getHttpServer())
      .delete(`/journeys/${created.journey.id}`)
      .set(admin)
      .expect(409);
  });
});
