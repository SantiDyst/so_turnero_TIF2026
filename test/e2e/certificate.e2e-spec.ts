import { INestApplication } from '@nestjs/common';
import { Especialidad } from '@prisma/client';
import request from 'supertest';

import { createApp } from '../../src/app.factory';
import { PrismaService } from '../../src/prisma/prisma.service';
import { assertIsolatedSchema } from '../support/runtime';

describe('final certificate HTTP API', () => {
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

  async function registerAndClose(name: string) {
    const registered = await request(app.getHttpServer())
      .post('/applicants')
      .send({ nombre: name, apellido: 'Certificate', dni: `${name}-certificate-dni` })
      .expect(201);
    const journeyId = registered.body.journey.id as string;

    const read = await request(app.getHttpServer())
      .get('/journeys')
      .query({ applicantId: registered.body.applicant.id })
      .expect(200);
    const evaluations = read.body.evaluations as { id: string; specialty: string }[];

    for (const specialty of [
      Especialidad.BIOQUIMICA,
      Especialidad.CLINICA_MEDICA,
      Especialidad.PSICOLOGIA,
    ]) {
      const evaluation = evaluations.find((item) => item.specialty === specialty)!;
      if (specialty === Especialidad.CLINICA_MEDICA) {
        await request(app.getHttpServer())
          .patch(`/evaluations/${evaluation.id}/result`)
          .send({ resultado: 'APTO_CONDICIONAL' })
          .expect(200);
      }
      if (specialty === Especialidad.PSICOLOGIA) {
        await request(app.getHttpServer())
          .patch(`/evaluations/${evaluation.id}/result`)
          .send({ resultado: 'APTO_PLENO' })
          .expect(200);
      }
      await request(app.getHttpServer())
        .patch(`/evaluations/${evaluation.id}/complete`)
        .expect(200);
    }

    await request(app.getHttpServer()).post(`/journeys/${journeyId}/close`).expect(200);

    return {
      journeyId,
      attentionNumber: read.body.journey.attentionNumber as string,
      applicantId: registered.body.applicant.id as string,
    };
  }

  it('issues an Apto condicional certificate, reads 404 then 200, and repeats identically', async () => {
    const { journeyId, attentionNumber, applicantId } = await registerAndClose('E2E Certificate');

    await request(app.getHttpServer()).get(`/journeys/${journeyId}/certificate`).expect(404);

    const issued = await request(app.getHttpServer())
      .post(`/journeys/${journeyId}/certificate`)
      .send({})
      .expect(201);
    expect(issued.body).toEqual(
      expect.objectContaining({
        identifier: `CERT-${attentionNumber}`,
        attentionNumber,
        applicant: expect.objectContaining({ id: applicantId }),
        finalAptitude: 'APTO_CONDICIONAL',
        issuedAt: expect.any(String),
        responsibleProfessional: null,
      }),
    );

    const repeat = await request(app.getHttpServer())
      .post(`/journeys/${journeyId}/certificate`)
      .send({})
      .expect(200);
    expect(repeat.body).toEqual(issued.body);

    const read = await request(app.getHttpServer())
      .get(`/journeys/${journeyId}/certificate`)
      .expect(200);
    expect(read.body).toEqual(issued.body);

    const journey = await request(app.getHttpServer())
      .get('/journeys')
      .query({ applicantId })
      .expect(200);
    expect(journey.body.certificate).toEqual(issued.body);

    const stored = await prisma.client.certificado.count({ where: { recorridoId: journeyId } });
    expect(stored).toBe(1);
  });

  it('rejects issuance for an open journey and unknown journeys with 404', async () => {
    const registered = await request(app.getHttpServer())
      .post('/applicants')
      .send({ nombre: 'E2E Open', apellido: 'Certificate', dni: 'E2E-open-certificate' })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/journeys/${registered.body.journey.id}/certificate`)
      .send({})
      .expect(409);
    await request(app.getHttpServer())
      .get(`/journeys/${registered.body.journey.id}/certificate`)
      .expect(404);

    const missing = '00000000-0000-4000-8000-000000000000';
    await request(app.getHttpServer())
      .post(`/journeys/${missing}/certificate`)
      .send({})
      .expect(404);
    await request(app.getHttpServer()).get(`/journeys/${missing}/certificate`).expect(404);
  });
});
