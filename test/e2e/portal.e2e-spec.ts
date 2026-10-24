import { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { createApp } from '../../src/app.factory';
import { PrismaService } from '../../src/prisma/prisma.service';
import { assertIsolatedSchema } from '../support/runtime';
import { adminSessionHeaders, professionalSessions } from '../support/sessions';

const PASSWORD = 'a-long-password';

describe('applicant self-service portal', () => {
  const prisma = new PrismaService();
  const authAs = professionalSessions(prisma);
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

  function server() {
    return request(app.getHttpServer());
  }

  function applicant(overrides: Record<string, unknown> = {}) {
    sequence += 1;

    return {
      nombre: `Portal ${sequence}`,
      apellido: 'Applicant',
      dni: `portal-${sequence}-${Date.now()}`,
      email: `portal-${sequence}-${Date.now()}@example.test`,
      password: PASSWORD,
      empresa: 'Ente Público',
      puesto: 'Administrativo',
      ...overrides,
    };
  }

  it('registers an applicant, opens a session and returns its own journey', async () => {
    const agent = request.agent(app.getHttpServer());
    const data = applicant();
    const registered = await agent.post('/register').send(data).expect(201);

    expect(registered.body.user).toEqual({
      id: expect.any(String),
      nombre: `${data.nombre} ${data.apellido}`,
      email: data.email,
      rol: 'USER',
    });
    expect(registered.body.journey).toEqual(
      expect.objectContaining({
        attentionNumber: expect.stringMatching(/^AT-/),
        state: 'En espera',
      }),
    );

    const setCookie = registered.headers['set-cookie'];
    const cookieHeader = Array.isArray(setCookie) ? setCookie.join(';') : String(setCookie);
    expect(cookieHeader).toContain('so_session=');
    expect(cookieHeader.toLowerCase()).toContain('httponly');

    const me = await agent.get('/me/journeys').expect(200);
    expect(me.body.journey).toEqual(
      expect.objectContaining({
        attentionNumber: registered.body.journey.attentionNumber,
        state: 'En espera',
        derivedState: null,
        empresa: 'Ente Público',
        puesto: 'Administrativo',
      }),
    );
    expect(me.body.applicant).toEqual(
      expect.objectContaining({
        nombre: data.nombre,
        apellido: data.apellido,
        dni: data.dni,
      }),
    );
    expect(me.body.evaluations).toHaveLength(3);
    expect(me.body.certificate).toBeNull();
  });

  it('keeps each applicant session scoped to its own journey', async () => {
    const firstAgent = request.agent(app.getHttpServer());
    const secondAgent = request.agent(app.getHttpServer());
    const first = await firstAgent.post('/register').send(applicant()).expect(201);
    const second = await secondAgent.post('/register').send(applicant()).expect(201);

    const firstJourney = await firstAgent.get('/me/journeys').expect(200);
    const secondJourney = await secondAgent.get('/me/journeys').expect(200);

    expect(firstJourney.body.journey.id).toBe(first.body.journey.id);
    expect(secondJourney.body.journey.id).toBe(second.body.journey.id);
    expect(firstJourney.body.journey.id).not.toBe(secondJourney.body.journey.id);
  });

  it('rejects duplicate DNI or email and weak credentials', async () => {
    const data = applicant();
    await server().post('/register').send(data).expect(201);

    const duplicatedDni = await server()
      .post('/register')
      .send(applicant({ dni: data.dni }))
      .expect(409);
    expect(duplicatedDni.body.message).toBe('An applicant with that DNI already exists.');

    await server()
      .post('/register')
      .send(applicant({ email: data.email }))
      .expect(409);

    await server()
      .post('/register')
      .send(applicant({ password: 'short' }))
      .expect(400);

    const missing = await server().post('/register').send({}).expect(400);
    expect(missing.body).toEqual({
      message: 'Validation failed.',
      missingFields: ['nombre', 'apellido', 'dni', 'email', 'password'],
    });
  });

  it('requires a session and the USER role for the portal', async () => {
    await server().get('/me/journeys').expect(401);

    const professional = await prisma.client.profesional.create({
      data: { nombre: 'Portal Professional', especialidad: 'CLINICA_MEDICA' },
    });
    await server()
      .get('/me/journeys')
      .set(await authAs(professional.id))
      .expect(403);

    const agent = request.agent(app.getHttpServer());
    await agent.post('/register').send(applicant()).expect(201);
    await agent.get('/me/journeys').expect(200);

    await agent.get('/journeys/overview').expect(403);
    await agent.post('/applicants').send({}).expect(403);
    await agent.get('/users').expect(403);
  });

  it('exposes the applicant certificate only through its own session', async () => {
    const agent = request.agent(app.getHttpServer());
    await agent.post('/register').send(applicant()).expect(201);

    const me = await agent.get('/me/journeys').expect(200);
    await agent.get(`/journeys/${me.body.journey.id}/certificate`).expect(403);

    const admin = await adminSessionHeaders(prisma);
    await server().get(`/journeys/${me.body.journey.id}/certificate`).set(admin).expect(404);
  });
});
