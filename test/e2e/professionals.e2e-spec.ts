import { INestApplication } from '@nestjs/common';
import { DisponibilidadProfesional, Especialidad } from '@prisma/client';
import request from 'supertest';

import { createApp } from '../../src/app.factory';
import { PrismaService } from '../../src/prisma/prisma.service';
import { assertIsolatedSchema } from '../support/runtime';
import {
  adminSessionHeaders,
  professionalSessions,
  type SessionHeaders,
} from '../support/sessions';

describe('professional listing HTTP API', () => {
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

  it('returns 200 with professionals ordered by specialty and their availability', async () => {
    const bio = await prisma.client.profesional.create({
      data: {
        nombre: `A Bio ${stamp}`,
        especialidad: Especialidad.BIOQUIMICA,
        disponibilidad: DisponibilidadProfesional.DISPONIBLE,
      },
    });
    const clinical = await prisma.client.profesional.create({
      data: {
        nombre: `B Clinical ${stamp}`,
        especialidad: Especialidad.CLINICA_MEDICA,
        disponibilidad: DisponibilidadProfesional.OCUPADO,
      },
    });

    const response = await request(app.getHttpServer())
      .get('/professionals')
      .set(admin)
      .expect(200);

    expect(Array.isArray(response.body)).toBe(true);
    const listed = (response.body as { id: string }[]).filter((professional) =>
      [bio.id, clinical.id].includes(professional.id),
    );

    expect(listed).toEqual([
      {
        id: bio.id,
        name: bio.nombre,
        specialty: Especialidad.BIOQUIMICA,
        availability: 'Disponible',
        accountLinked: false,
      },
      {
        id: clinical.id,
        name: clinical.nombre,
        specialty: Especialidad.CLINICA_MEDICA,
        availability: 'Ocupado',
        accountLinked: false,
      },
    ]);
  });

  it('reports a professional as Ocupado once an attention starts', async () => {
    const professional = await prisma.client.profesional.create({
      data: {
        nombre: `C Psychology ${stamp}`,
        especialidad: Especialidad.PSICOLOGIA,
        disponibilidad: DisponibilidadProfesional.DISPONIBLE,
      },
    });

    const registered = await request(app.getHttpServer())
      .post('/applicants')
      .set(admin)
      .send({ nombre: 'Professional', apellido: 'Listing', dni: `listing-${stamp}` })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/journeys/${registered.body.journey.id}/attentions`)
      .set(await authAs(professional.id))
      .send({ specialty: Especialidad.PSICOLOGIA })
      .expect(201);

    const response = await request(app.getHttpServer())
      .get('/professionals')
      .set(admin)
      .expect(200);
    const listed = (response.body as { id: string; availability: string }[]).find(
      (candidate) => candidate.id === professional.id,
    );

    expect(listed).toEqual(
      expect.objectContaining({ availability: 'Ocupado', specialty: Especialidad.PSICOLOGIA }),
    );
  });
});
