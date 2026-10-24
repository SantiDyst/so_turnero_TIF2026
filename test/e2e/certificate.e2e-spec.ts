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

describe('final certificate HTTP API', () => {
  const prisma = new PrismaService();
  const authAs = professionalSessions(prisma);
  let app: INestApplication;
  let admin: SessionHeaders;

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

  async function registerAndClose(name: string) {
    const registered = await request(app.getHttpServer())
      .post('/applicants')
      .set(admin)
      .send({ nombre: name, apellido: 'Certificate', dni: `${name}-certificate-dni` })
      .expect(201);
    const journeyId = registered.body.journey.id as string;

    const read = await request(app.getHttpServer())
      .get('/journeys')
      .set(admin)
      .query({ applicantId: registered.body.applicant.id })
      .expect(200);
    const evaluations = read.body.evaluations as { id: string; specialty: string }[];
    let clinicalProfessionalId = '';

    for (const specialty of [
      Especialidad.BIOQUIMICA,
      Especialidad.CLINICA_MEDICA,
      Especialidad.PSICOLOGIA,
    ]) {
      const evaluation = evaluations.find((item) => item.specialty === specialty)!;
      const professional = await prisma.client.profesional.create({
        data: { nombre: `Certificate ${specialty}`, especialidad: specialty },
      });

      if (specialty === Especialidad.CLINICA_MEDICA) {
        clinicalProfessionalId = professional.id;
      }

      const started = await request(app.getHttpServer())
        .post(`/journeys/${journeyId}/attentions`)
        .set(await authAs(professional.id))
        .send({ specialty })
        .expect(201);

      await request(app.getHttpServer())
        .patch(`/attentions/${started.body.attentionId}/finalize`)
        .set(await authAs(professional.id))
        .send({ state: 'Finalizada' })
        .expect(200);

      if (specialty === Especialidad.CLINICA_MEDICA) {
        await request(app.getHttpServer())
          .patch(`/evaluations/${evaluation.id}/result`)
          .set(await authAs(professional.id))
          .send({ resultado: 'APTO_CONDICIONAL' })
          .expect(200);
      }
      if (specialty === Especialidad.PSICOLOGIA) {
        await request(app.getHttpServer())
          .patch(`/evaluations/${evaluation.id}/result`)
          .set(await authAs(professional.id))
          .send({ resultado: 'APTO_PLENO' })
          .expect(200);
      }
      await request(app.getHttpServer())
        .patch(`/evaluations/${evaluation.id}/complete`)
        .set(await authAs(professional.id))
        .expect(200);
    }

    await request(app.getHttpServer())
      .post(`/journeys/${journeyId}/close`)
      .set(await authAs(clinicalProfessionalId))
      .expect(200);

    return {
      journeyId,
      attentionNumber: read.body.journey.attentionNumber as string,
      applicantId: registered.body.applicant.id as string,
      clinicalProfessionalId,
    };
  }

  it('issues an Apto condicional certificate, reads 404 then 200, and repeats identically', async () => {
    const { journeyId, attentionNumber, applicantId, clinicalProfessionalId } =
      await registerAndClose('E2E Certificate');
    const clinical = await authAs(clinicalProfessionalId);

    await request(app.getHttpServer())
      .get(`/journeys/${journeyId}/certificate`)
      .set(admin)
      .expect(404);

    const issued = await request(app.getHttpServer())
      .post(`/journeys/${journeyId}/certificate`)
      .set(clinical)
      .expect(201);
    expect(issued.body).toEqual(
      expect.objectContaining({
        identifier: `CERT-${attentionNumber}`,
        attentionNumber,
        applicant: expect.objectContaining({ id: applicantId }),
        finalAptitude: 'APTO_CONDICIONAL',
        issuedAt: expect.any(String),
        responsibleProfessional: expect.objectContaining({
          nombre: 'Certificate CLINICA_MEDICA',
        }),
      }),
    );

    const repeat = await request(app.getHttpServer())
      .post(`/journeys/${journeyId}/certificate`)
      .set(clinical)
      .expect(200);
    expect(repeat.body).toEqual(issued.body);

    const read = await request(app.getHttpServer())
      .get(`/journeys/${journeyId}/certificate`)
      .set(admin)
      .expect(200);
    expect(read.body).toEqual(issued.body);

    const journey = await request(app.getHttpServer())
      .get('/journeys')
      .set(admin)
      .query({ applicantId })
      .expect(200);
    expect(journey.body.certificate).toEqual(issued.body);

    const stored = await prisma.client.certificado.count({ where: { recorridoId: journeyId } });
    expect(stored).toBe(1);
  });

  it('exposes the certificate through its public token without a session', async () => {
    const { journeyId, attentionNumber, clinicalProfessionalId } =
      await registerAndClose('E2E Public Certificate');
    const clinical = await authAs(clinicalProfessionalId);

    const issued = await request(app.getHttpServer())
      .post(`/journeys/${journeyId}/certificate`)
      .set(clinical)
      .expect(201);
    const token = issued.body.shareToken as string;

    expect(token).toEqual(expect.any(String));
    expect(token.length).toBeGreaterThanOrEqual(43);

    const publicView = await request(app.getHttpServer())
      .get(`/certificates/public/${token}`)
      .expect(200);

    expect(publicView.body).toEqual({
      identifier: `CERT-${attentionNumber}`,
      attentionNumber,
      applicant: expect.objectContaining({ nombre: 'E2E Public Certificate' }),
      finalAptitude: 'APTO_CONDICIONAL',
      issuedAt: expect.any(String),
      responsibleProfessional: expect.objectContaining({
        nombre: 'Certificate CLINICA_MEDICA',
      }),
    });
    expect(publicView.body).not.toHaveProperty('shareToken');
    expect(publicView.body).not.toHaveProperty('id');

    await request(app.getHttpServer()).get('/certificates/public/not-a-real-token').expect(404);
  });

  it('rejects issuance for an open journey and unknown journeys with 404', async () => {
    const registered = await request(app.getHttpServer())
      .post('/applicants')
      .set(admin)
      .send({ nombre: 'E2E Open', apellido: 'Certificate', dni: 'E2E-open-certificate' })
      .expect(201);
    const clinical = await prisma.client.profesional.create({
      data: { nombre: 'Certificate Open Clinical', especialidad: Especialidad.CLINICA_MEDICA },
    });
    const clinicalSession = await authAs(clinical.id);

    await request(app.getHttpServer())
      .post(`/journeys/${registered.body.journey.id}/certificate`)
      .set(clinicalSession)
      .expect(409);
    await request(app.getHttpServer())
      .get(`/journeys/${registered.body.journey.id}/certificate`)
      .set(admin)
      .expect(404);

    const missing = '00000000-0000-4000-8000-000000000000';
    await request(app.getHttpServer())
      .post(`/journeys/${missing}/certificate`)
      .set(clinicalSession)
      .expect(404);
    await request(app.getHttpServer())
      .get(`/journeys/${missing}/certificate`)
      .set(admin)
      .expect(404);
  });
});
