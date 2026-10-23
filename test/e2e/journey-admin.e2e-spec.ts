import { INestApplication } from '@nestjs/common';
import { Especialidad, RecorridoEstado } from '@prisma/client';
import request from 'supertest';

import { createApp } from '../../src/app.factory';
import { PrismaService } from '../../src/prisma/prisma.service';
import { assertIsolatedSchema } from '../support/runtime';

interface Registered {
  applicant: { id: string };
  journey: { id: string; attentionNumber: string; state: string };
}

interface OverviewEntry {
  attentionNumber: string;
  state: string;
  attentionCount: number;
  annulledReason: string | null;
}

describe('journey administration HTTP API', () => {
  const prisma = new PrismaService();
  let app: INestApplication;
  const stamp = Date.now().toString(36);
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

  async function register(name: string): Promise<Registered> {
    sequence += 1;
    const response = await request(app.getHttpServer())
      .post('/applicants')
      .send({ nombre: name, apellido: 'Admin', dni: `admin-${stamp}-${sequence}` })
      .expect(201);

    return response.body as Registered;
  }

  async function overviewEntry(attentionNumber: string): Promise<OverviewEntry | undefined> {
    const response = await request(app.getHttpServer()).get('/journeys/overview').expect(200);

    return (response.body as OverviewEntry[]).find(
      (candidate) => candidate.attentionNumber === attentionNumber,
    );
  }

  it('annuls a journey and keeps it visible with its reason', async () => {
    const created = await register('Annul');

    const annulled = await request(app.getHttpServer())
      .post(`/journeys/${created.journey.id}/annul`)
      .send({ motivo: 'El postulante desistió.' })
      .expect(200);

    expect(annulled.body).toEqual(
      expect.objectContaining({
        journeyId: created.journey.id,
        state: 'Anulada',
        reason: 'El postulante desistió.',
      }),
    );

    expect(await overviewEntry(created.journey.attentionNumber)).toEqual(
      expect.objectContaining({
        state: 'Anulada',
        attentionCount: 0,
        annulledReason: 'El postulante desistió.',
      }),
    );

    await request(app.getHttpServer())
      .get(`/journeys?attentionNumber=${created.journey.attentionNumber}`)
      .expect(200);
  });

  it('rejects annulment without a motivo', async () => {
    const created = await register('NoReason');

    await request(app.getHttpServer())
      .post(`/journeys/${created.journey.id}/annul`)
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
      .send({ specialty: Especialidad.PSICOLOGIA, professionalId: professional.id })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/journeys/${created.journey.id}/annul`)
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
      .send({ motivo: 'Intento sobre cerrado.' })
      .expect(409);
  });

  it('deletes a journey without attentions', async () => {
    const created = await register('Deletable');

    await request(app.getHttpServer()).delete(`/journeys/${created.journey.id}`).expect(200, {
      journeyId: created.journey.id,
      attentionNumber: created.journey.attentionNumber,
      deleted: true,
    });

    await request(app.getHttpServer())
      .get(`/journeys?attentionNumber=${created.journey.attentionNumber}`)
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
      .send({ specialty: Especialidad.BIOQUIMICA, professionalId: professional.id })
      .expect(201);

    await request(app.getHttpServer()).delete(`/journeys/${created.journey.id}`).expect(409);
  });
});
