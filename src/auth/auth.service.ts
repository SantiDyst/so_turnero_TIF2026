import { Injectable, UnauthorizedException } from '@nestjs/common';
import { Especialidad, Prisma, RolUsuario } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { normalizeEmail } from '../shared/email';
import type { AuthenticatedUser } from './auth.types';
import { verifyPassword } from './password';
import { createSessionToken, hashSessionToken, normalizeUserAgent, sessionTtlMs } from './session';

const INVALID_CREDENTIALS = 'Invalid email or password.';

const USER_SELECT = {
  id: true,
  nombre: true,
  email: true,
  rol: true,
  postulante: { select: { id: true } },
  profesional: { select: { id: true, especialidad: true } },
} satisfies Prisma.UsuarioSelect;

interface UserRecord {
  id: string;
  nombre: string;
  email: string;
  rol: RolUsuario;
  postulante: { id: string } | null;
  profesional: { id: string; especialidad: Especialidad } | null;
}

export interface LoginResult {
  token: string;
  expiresAt: Date;
  user: AuthenticatedUser;
}

function toAuthenticatedUser(record: UserRecord): AuthenticatedUser {
  return {
    id: record.id,
    nombre: record.nombre,
    email: record.email,
    rol: record.rol,
    profesionalId: record.profesional?.id ?? null,
    specialty: record.profesional?.especialidad ?? null,
    postulanteId: record.postulante?.id ?? null,
  };
}

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  async startSession(
    usuarioId: string,
    userAgent: string | undefined,
  ): Promise<{ token: string; expiresAt: Date }> {
    const token = createSessionToken();
    const expiresAt = new Date(Date.now() + sessionTtlMs());

    await this.prisma.client.sesion.create({
      data: {
        usuarioId,
        tokenHash: hashSessionToken(token),
        userAgent: normalizeUserAgent(userAgent),
        expiresAt,
      },
    });

    return { token, expiresAt };
  }

  async login(
    email: string,
    password: string,
    userAgent: string | undefined,
  ): Promise<LoginResult> {
    const record = await this.prisma.client.usuario.findUnique({
      where: { email: normalizeEmail(email) },
      select: { ...USER_SELECT, passwordHash: true, activo: true },
    });

    if (!record || !record.activo) {
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }

    const validPassword = await verifyPassword(password, record.passwordHash);

    if (!validPassword) {
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }

    const session = await this.startSession(record.id, userAgent);

    return { ...session, user: toAuthenticatedUser(record) };
  }

  async resolveSession(token: string): Promise<AuthenticatedUser | null> {
    const session = await this.prisma.client.sesion.findUnique({
      where: { tokenHash: hashSessionToken(token) },
      select: {
        expiresAt: true,
        revokedAt: true,
        usuario: { select: { ...USER_SELECT, activo: true } },
      },
    });

    if (!session || session.revokedAt !== null || !session.usuario.activo) {
      return null;
    }

    if (session.expiresAt.getTime() <= Date.now()) {
      return null;
    }

    return toAuthenticatedUser(session.usuario);
  }

  async logout(token: string): Promise<void> {
    await this.prisma.client.sesion.updateMany({
      where: { tokenHash: hashSessionToken(token), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
