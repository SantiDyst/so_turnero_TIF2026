import { INestApplication } from '@nestjs/common';
import { AtencionEstado, Especialidad, RolUsuario } from '@prisma/client';
import request from 'supertest';

import { createApp } from '../../src/app.factory';
import { hashPassword } from '../../src/auth/password';
import { PrismaService } from '../../src/prisma/prisma.service';
import { assertIsolatedSchema } from '../support/runtime';
import {
  professionalSessionHeaders,
  sessionHeadersForUser,
  type SessionHeaders,
} from '../support/sessions';

const PASSWORD = 'a-long-password';

describe('user administration HTTP API', () => {
  const prisma = new PrismaService();
  let app: INestApplication;
  let admin: SessionHeaders;
  let adminUserId: string;
  const stamp = Date.now().toString(36);
  let sequence = 0;

  beforeAll(async () => {
    await assertIsolatedSchema();
    app = await createApp();
    await app.init();

    const usuario = await prisma.client.usuario.create({
      data: {
        nombre: 'Users Admin',
        email: `users-admin-${stamp}@example.test`,
        passwordHash: await hashPassword(PASSWORD),
        rol: RolUsuario.ADMIN,
      },
      select: { id: true },
    });
    adminUserId = usuario.id;
    admin = await sessionHeadersForUser(prisma, usuario.id);
  });

  afterAll(async () => {
    await app.close();
    await prisma.client.$disconnect();
  });

  function server() {
    return request(app.getHttpServer());
  }

  function nextEmail(prefix = 'user') {
    sequence += 1;
    return `${prefix}-${stamp}-${sequence}@example.test`;
  }

  function createUser(body: Record<string, unknown>, expectedStatus = 201) {
    return server()
      .post('/users')
      .set(admin)
      .send({
        nombre: 'New User',
        password: PASSWORD,
        ...body,
      })
      .expect(expectedStatus);
  }

  function login(email: string, password = PASSWORD) {
    return server().post('/auth/login').send({ email, password });
  }

  it('requires an admin session', async () => {
    await server().get('/users').expect(401);

    const professional = await prisma.client.profesional.create({
      data: { nombre: `Users Non Admin ${stamp}`, especialidad: Especialidad.BIOQUIMICA },
    });
    const professionalHeaders = await professionalSessionHeaders(prisma, professional.id);

    await server().get('/users').set(professionalHeaders).expect(403);
    await server()
      .post('/users')
      .set(professionalHeaders)
      .send({ nombre: 'X', email: nextEmail(), password: PASSWORD, rol: 'ADMIN' })
      .expect(403);
  });

  it('creates an admin account that can log in', async () => {
    const email = nextEmail('admin');
    const created = await createUser({ email, rol: RolUsuario.ADMIN });

    expect(created.body).toEqual(
      expect.objectContaining({
        nombre: 'New User',
        email,
        rol: RolUsuario.ADMIN,
        activo: true,
        profesionalId: null,
        specialty: null,
      }),
    );
    expect(created.body.passwordHash).toBeUndefined();

    const session = await login(email).expect(200);
    expect(session.body.user.rol).toBe(RolUsuario.ADMIN);
  });

  it('creates a professional user with its professional record', async () => {
    const email = nextEmail('professional');
    const created = await createUser({
      nombre: 'Dra. Nueva',
      email,
      rol: RolUsuario.PROFESIONAL,
      specialty: Especialidad.PSICOLOGIA,
    }).expect(201);

    expect(created.body).toEqual(
      expect.objectContaining({
        rol: RolUsuario.PROFESIONAL,
        specialty: Especialidad.PSICOLOGIA,
        profesionalId: expect.any(String),
      }),
    );

    const professional = await prisma.client.profesional.findUniqueOrThrow({
      where: { id: created.body.profesionalId },
    });
    expect(professional.nombre).toBe('Dra. Nueva');
    expect(professional.usuarioId).toBe(created.body.id);

    const session = await login(email).expect(200);
    expect(session.body.user).toEqual(
      expect.objectContaining({
        profesionalId: created.body.profesionalId,
        specialty: Especialidad.PSICOLOGIA,
      }),
    );
  });

  it('links an existing professional without an account', async () => {
    const professional = await prisma.client.profesional.create({
      data: { nombre: `Unlinked ${stamp}`, especialidad: Especialidad.BIOQUIMICA },
    });
    const created = await createUser({
      email: nextEmail('linked'),
      rol: RolUsuario.PROFESIONAL,
      professionalId: professional.id,
    });

    const linked = await prisma.client.profesional.findUniqueOrThrow({
      where: { id: professional.id },
    });
    expect(linked.usuarioId).toBe(created.body.id);
    expect(created.body.specialty).toBe(Especialidad.BIOQUIMICA);

    await createUser(
      {
        email: nextEmail('linked-again'),
        rol: RolUsuario.PROFESIONAL,
        professionalId: professional.id,
      },
      409,
    );
  });

  it('rejects a duplicate email and unsupported roles', async () => {
    const email = nextEmail('duplicate');
    await createUser({ email, rol: RolUsuario.ADMIN });

    await createUser({ email, rol: RolUsuario.ADMIN }, 409);
    await createUser({ email: nextEmail(), rol: RolUsuario.USER }, 400);
    await createUser({ email: nextEmail(), rol: RolUsuario.PROFESIONAL }, 400);
  });

  it('deactivates an account, revokes its sessions and allows reactivation', async () => {
    const email = nextEmail('deactivate');
    const created = await createUser({
      email,
      rol: RolUsuario.PROFESIONAL,
      specialty: Especialidad.CLINICA_MEDICA,
    });
    const userHeaders = await sessionHeadersForUser(prisma, created.body.id);

    await server().get('/auth/me').set(userHeaders).expect(200);

    const deactivated = await server()
      .patch(`/users/${created.body.id}/deactivate`)
      .set(admin)
      .expect(200);
    expect(deactivated.body).toEqual(
      expect.objectContaining({ userId: created.body.id, active: false, sessionsRevoked: 1 }),
    );

    await server().get('/auth/me').set(userHeaders).expect(401);
    await login(email).expect(401);

    await server().patch(`/users/${created.body.id}/activate`).set(admin).expect(200);
    await login(email).expect(200);
    await server().patch(`/users/${created.body.id}/activate`).set(admin).expect(409);
  });

  it('refuses to deactivate the acting admin', async () => {
    const response = await server()
      .patch(`/users/${adminUserId}/deactivate`)
      .set(admin)
      .expect(400);

    expect(response.body.message).toBe('You cannot deactivate your own account.');
  });

  it('refuses to deactivate a professional with an active attention', async () => {
    const email = nextEmail('busy-professional');
    const created = await createUser({
      email,
      rol: RolUsuario.PROFESIONAL,
      specialty: Especialidad.PSICOLOGIA,
    });
    const professionalHeaders = await sessionHeadersForUser(prisma, created.body.id);

    const registered = await server()
      .post('/applicants')
      .set(admin)
      .send({ nombre: 'Busy', apellido: 'Professional', dni: nextEmail('dni') })
      .expect(201);

    await server()
      .post(`/journeys/${registered.body.journey.id}/attentions`)
      .set(professionalHeaders)
      .send({ specialty: Especialidad.PSICOLOGIA })
      .expect(201);

    const blocked = await server()
      .patch(`/users/${created.body.id}/deactivate`)
      .set(admin)
      .expect(409);
    expect(blocked.body.message).toBe(
      'Finalize the active attention before deactivating the professional.',
    );

    const attention = await prisma.client.atencion.findFirstOrThrow({
      where: { profesionalId: created.body.profesionalId, estado: AtencionEstado.EN_ATENCION },
      select: { id: true },
    });
    await server()
      .patch(`/attentions/${attention.id}/finalize`)
      .set(professionalHeaders)
      .send({ state: 'Finalizada' })
      .expect(200);

    await server().patch(`/users/${created.body.id}/deactivate`).set(admin).expect(200);
  });

  it('resets a password and revokes the previous sessions', async () => {
    const email = nextEmail('reset');
    const created = await createUser({ email, rol: RolUsuario.ADMIN });
    const userHeaders = await sessionHeadersForUser(prisma, created.body.id);
    const newPassword = 'another-long-password';

    const reset = await server()
      .patch(`/users/${created.body.id}/password`)
      .set(admin)
      .send({ password: newPassword })
      .expect(200);
    expect(reset.body).toEqual({ userId: created.body.id, sessionsRevoked: 1 });

    await server().get('/auth/me').set(userHeaders).expect(401);
    await login(email).expect(401);
    const relogin = await login(email, newPassword).expect(200);
    expect(relogin.body.user.id).toBe(created.body.id);

    await server()
      .patch(`/users/${created.body.id}/password`)
      .set(admin)
      .send({ password: 'short' })
      .expect(400);
  });

  it('lists users without exposing password hashes', async () => {
    const response = await server().get('/users').set(admin).expect(200);
    const users = response.body as Record<string, unknown>[];

    expect(users.length).toBeGreaterThan(0);
    expect(users.every((user) => !('passwordHash' in user))).toBe(true);
    expect(users.some((user) => user.id === adminUserId)).toBe(true);
  });
});
