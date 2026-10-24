import { INestApplication } from '@nestjs/common';
import { RolUsuario } from '@prisma/client';
import request from 'supertest';

import { createApp } from '../../src/app.factory';
import { hashPassword } from '../../src/auth/password';
import { createSessionToken, hashSessionToken } from '../../src/auth/session';
import { PrismaService } from '../../src/prisma/prisma.service';
import { assertIsolatedSchema } from '../support/runtime';

describe('auth HTTP API', () => {
  const prisma = new PrismaService();
  let app: INestApplication;
  const stamp = Date.now().toString(36);
  const password = 'correct horse battery';
  const email = `admin-${stamp}@example.com`;
  let userId: string;

  const credentials = (overrides: Record<string, unknown> = {}) => ({
    email,
    password,
    ...overrides,
  });

  beforeAll(async () => {
    await assertIsolatedSchema();
    app = await createApp();
    await app.init();

    const usuario = await prisma.client.usuario.create({
      data: {
        nombre: 'Admin E2E',
        email,
        passwordHash: await hashPassword(password),
        rol: RolUsuario.ADMIN,
      },
      select: { id: true },
    });
    userId = usuario.id;
  });

  afterAll(async () => {
    await app.close();
    await prisma.client.$disconnect();
  });

  it('rejects missing credentials with the shared validation shape', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: '  ' })
      .expect(400);

    expect(response.body).toEqual({
      message: 'Validation failed.',
      missingFields: ['email', 'password'],
    });
  });

  it('rejects a wrong password without revealing whether the account exists', async () => {
    const wrongPassword = await request(app.getHttpServer())
      .post('/auth/login')
      .send(credentials({ password: 'wrong-password' }))
      .expect(401);
    const unknownEmail = await request(app.getHttpServer())
      .post('/auth/login')
      .send(credentials({ email: `nobody-${stamp}@example.com` }))
      .expect(401);

    expect(wrongPassword.body.message).toBe('Invalid email or password.');
    expect(unknownEmail.body.message).toBe('Invalid email or password.');
  });

  it('rejects a deactivated account', async () => {
    const inactive = await prisma.client.usuario.create({
      data: {
        nombre: 'Inactive E2E',
        email: `inactive-${stamp}@example.com`,
        passwordHash: await hashPassword(password),
        rol: RolUsuario.PROFESIONAL,
        activo: false,
      },
      select: { id: true },
    });

    await request(app.getHttpServer())
      .post('/auth/login')
      .send(credentials({ email: `inactive-${stamp}@example.com` }))
      .expect(401);

    await prisma.client.usuario.delete({ where: { id: inactive.id } });
  });

  it('creates an httpOnly session cookie and resolves the current user', async () => {
    const agent = request.agent(app.getHttpServer());
    const login = await agent.post('/auth/login').send(credentials()).expect(200);

    expect(login.body.user).toEqual({
      id: userId,
      nombre: 'Admin E2E',
      email,
      rol: RolUsuario.ADMIN,
      profesionalId: null,
      specialty: null,
      postulanteId: null,
    });

    const setCookie = login.headers['set-cookie'];
    const cookieHeader = Array.isArray(setCookie) ? setCookie.join(';') : String(setCookie);

    expect(cookieHeader).toContain('so_session=');
    expect(cookieHeader.toLowerCase()).toContain('httponly');

    const me = await agent.get('/auth/me').expect(200);
    expect(me.body.user).toEqual(login.body.user);
  });

  it('requires a session for /auth/me', async () => {
    await request(app.getHttpServer()).get('/auth/me').expect(401);
  });

  it('accepts a bearer token for API clients', async () => {
    const token = createSessionToken();
    const session = await prisma.client.sesion.create({
      data: {
        usuarioId: userId,
        tokenHash: hashSessionToken(token),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
      select: { id: true },
    });

    const me = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(me.body.user.id).toBe(userId);

    await prisma.client.sesion.delete({ where: { id: session.id } });
  });

  it('rejects an expired session', async () => {
    const token = createSessionToken();
    const session = await prisma.client.sesion.create({
      data: {
        usuarioId: userId,
        tokenHash: hashSessionToken(token),
        expiresAt: new Date(Date.now() - 1000),
      },
      select: { id: true },
    });

    await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(401);

    await prisma.client.sesion.delete({ where: { id: session.id } });
  });

  it('logs out by revoking the stored session', async () => {
    const logoutEmail = `logout-${stamp}@example.com`;
    const logoutUser = await prisma.client.usuario.create({
      data: {
        nombre: 'Logout E2E',
        email: logoutEmail,
        passwordHash: await hashPassword(password),
        rol: RolUsuario.ADMIN,
      },
      select: { id: true },
    });

    const agent = request.agent(app.getHttpServer());
    await agent.post('/auth/login').send({ email: logoutEmail, password }).expect(200);
    await agent.get('/auth/me').expect(200);
    await agent.post('/auth/logout').expect(204);
    await agent.get('/auth/me').expect(401);

    const active = await prisma.client.sesion.count({
      where: { usuarioId: logoutUser.id, revokedAt: null },
    });
    expect(active).toBe(0);
  });
});
