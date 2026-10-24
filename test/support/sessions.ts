import { randomUUID } from 'node:crypto';

import { RolUsuario } from '@prisma/client';

import { hashPassword } from '../../src/auth/password';
import { createSessionToken, hashSessionToken } from '../../src/auth/session';
import type { PrismaService } from '../../src/prisma/prisma.service';

const TEST_PASSWORD = 'test-password';
const SESSION_TTL_MS = 60 * 60 * 1000;

export type SessionHeaders = Record<string, string>;

export async function sessionHeadersForUser(
  prisma: PrismaService,
  usuarioId: string,
): Promise<SessionHeaders> {
  const token = createSessionToken();

  await prisma.client.sesion.create({
    data: {
      usuarioId,
      tokenHash: hashSessionToken(token),
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    },
  });

  return { Authorization: `Bearer ${token}` };
}

export async function professionalSessionHeaders(
  prisma: PrismaService,
  professionalId: string,
): Promise<SessionHeaders> {
  const professional = await prisma.client.profesional.findUniqueOrThrow({
    where: { id: professionalId },
    select: { id: true, nombre: true, usuarioId: true },
  });

  if (professional.usuarioId) {
    return sessionHeadersForUser(prisma, professional.usuarioId);
  }

  const usuario = await prisma.client.usuario.create({
    data: {
      nombre: professional.nombre,
      email: `professional-${professional.id}@example.test`,
      passwordHash: await hashPassword(TEST_PASSWORD),
      rol: RolUsuario.PROFESIONAL,
    },
    select: { id: true },
  });

  await prisma.client.profesional.update({
    where: { id: professional.id },
    data: { usuarioId: usuario.id },
  });

  return sessionHeadersForUser(prisma, usuario.id);
}

export async function adminSessionHeaders(prisma: PrismaService): Promise<SessionHeaders> {
  const usuario = await prisma.client.usuario.create({
    data: {
      nombre: 'Admin Test',
      email: `admin-${randomUUID()}@example.test`,
      passwordHash: await hashPassword(TEST_PASSWORD),
      rol: RolUsuario.ADMIN,
    },
    select: { id: true },
  });

  return sessionHeadersForUser(prisma, usuario.id);
}

export interface ProfessionalSessions {
  (professionalId: string): Promise<SessionHeaders>;
  headers(professionalId: string): SessionHeaders;
}

export function professionalSessions(prisma: PrismaService): ProfessionalSessions {
  const cache = new Map<string, SessionHeaders>();

  const resolve = async (professionalId: string): Promise<SessionHeaders> => {
    const cached = cache.get(professionalId);

    if (cached) {
      return cached;
    }

    const created = await professionalSessionHeaders(prisma, professionalId);
    cache.set(professionalId, created);

    return created;
  };

  const authAs = resolve as ProfessionalSessions;
  authAs.headers = (professionalId: string): SessionHeaders => {
    const cached = cache.get(professionalId);

    if (!cached) {
      throw new Error(
        `No session cached for professional ${professionalId}; await authAs(id) first.`,
      );
    }

    return cached;
  };

  return authAs;
}
