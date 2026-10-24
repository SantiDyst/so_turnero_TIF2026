import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AtencionEstado, Especialidad, Prisma, RolUsuario } from '@prisma/client';

import { hashPassword } from '../auth/password';
import { PrismaService } from '../prisma/prisma.service';
import { rethrowPrismaConflict } from '../shared/prisma-error.mapper';
import { normalizeEmail } from '../shared/email';

const ADMIN_INVARIANT_LOCK = 'usuario-admin-invariant';

const USER_SELECT = {
  id: true,
  nombre: true,
  email: true,
  rol: true,
  activo: true,
  createdAt: true,
  profesional: { select: { id: true, especialidad: true } },
  postulante: { select: { id: true } },
} satisfies Prisma.UsuarioSelect;

interface UserRecord {
  id: string;
  nombre: string;
  email: string;
  rol: RolUsuario;
  activo: boolean;
  createdAt: Date;
  profesional: { id: string; especialidad: Especialidad } | null;
  postulante: { id: string } | null;
}

export interface CreateUserInput {
  nombre: string;
  email: string;
  password: string;
  rol: RolUsuario;
  specialty?: Especialidad;
  professionalId?: string;
}

function toUserView(record: UserRecord) {
  return {
    id: record.id,
    nombre: record.nombre,
    email: record.email,
    rol: record.rol,
    activo: record.activo,
    profesionalId: record.profesional?.id ?? null,
    specialty: record.profesional?.especialidad ?? null,
    applicantId: record.postulante?.id ?? null,
    createdAt: record.createdAt,
  };
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async list() {
    const users = await this.prisma.client.usuario.findMany({
      orderBy: [{ rol: 'asc' }, { nombre: 'asc' }],
      select: USER_SELECT,
    });

    return users.map((user) => toUserView(user));
  }

  async create(input: CreateUserInput) {
    try {
      const usuario = await this.prisma.client.$transaction(async (transaction) => {
        const professionalId = await this.resolveProfessionalLink(transaction, input);

        const created = await transaction.usuario.create({
          data: {
            nombre: input.nombre,
            email: normalizeEmail(input.email),
            passwordHash: await hashPassword(input.password),
            rol: input.rol,
          },
          select: { id: true },
        });

        if (professionalId) {
          await transaction.profesional.update({
            where: { id: professionalId },
            data: { usuarioId: created.id },
          });
        }

        return transaction.usuario.findUniqueOrThrow({
          where: { id: created.id },
          select: USER_SELECT,
        });
      });

      return toUserView(usuario);
    } catch (error) {
      rethrowPrismaConflict(error, 'The email or the professional link is already in use.');
    }
  }

  async deactivate(actorId: string, userId: string) {
    if (actorId === userId) {
      throw new BadRequestException('You cannot deactivate your own account.');
    }

    return this.prisma.client.$transaction(async (transaction) => {
      await transaction.$executeRaw(
        Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${ADMIN_INVARIANT_LOCK}))`,
      );

      const target = await transaction.usuario.findUnique({
        where: { id: userId },
        select: {
          id: true,
          rol: true,
          activo: true,
          profesional: { select: { id: true } },
        },
      });

      if (!target) {
        throw new NotFoundException('User not found.');
      }
      if (!target.activo) {
        throw new ConflictException('The user is already inactive.');
      }

      await this.assertAnAdminRemains(transaction, target);
      await this.assertNoActiveAttention(transaction, target.profesional?.id);

      await transaction.usuario.update({ where: { id: userId }, data: { activo: false } });
      const revoked = await transaction.sesion.updateMany({
        where: { usuarioId: userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });

      return { userId, active: false, sessionsRevoked: revoked.count };
    });
  }

  async activate(userId: string) {
    const target = await this.prisma.client.usuario.findUnique({
      where: { id: userId },
      select: { id: true, activo: true },
    });

    if (!target) {
      throw new NotFoundException('User not found.');
    }
    if (target.activo) {
      throw new ConflictException('The user is already active.');
    }

    await this.prisma.client.usuario.update({ where: { id: userId }, data: { activo: true } });

    return { userId, active: true };
  }

  async changePassword(userId: string, password: string) {
    const target = await this.prisma.client.usuario.findUnique({
      where: { id: userId },
      select: { id: true },
    });

    if (!target) {
      throw new NotFoundException('User not found.');
    }

    const passwordHash = await hashPassword(password);

    return this.prisma.client.$transaction(async (transaction) => {
      await transaction.usuario.update({ where: { id: userId }, data: { passwordHash } });
      const revoked = await transaction.sesion.updateMany({
        where: { usuarioId: userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });

      return { userId, sessionsRevoked: revoked.count };
    });
  }

  private async resolveProfessionalLink(
    transaction: Prisma.TransactionClient,
    input: CreateUserInput,
  ): Promise<string | null> {
    if (input.rol !== RolUsuario.PROFESIONAL) {
      return null;
    }

    if (input.professionalId) {
      const existing = await transaction.profesional.findUnique({
        where: { id: input.professionalId },
        select: { id: true, usuarioId: true },
      });

      if (!existing) {
        throw new NotFoundException('Professional not found.');
      }
      if (existing.usuarioId) {
        throw new ConflictException('The professional already has a user account.');
      }

      return existing.id;
    }

    if (!input.specialty) {
      throw new BadRequestException('A professional user needs a specialty.');
    }

    const professional = await transaction.profesional.create({
      data: { nombre: input.nombre, especialidad: input.specialty },
      select: { id: true },
    });

    return professional.id;
  }

  private async assertAnAdminRemains(
    transaction: Prisma.TransactionClient,
    target: { rol: RolUsuario; activo: boolean },
  ): Promise<void> {
    if (target.rol !== RolUsuario.ADMIN) {
      return;
    }

    const activeAdmins = await transaction.usuario.count({
      where: { rol: RolUsuario.ADMIN, activo: true },
    });

    if (activeAdmins <= 1) {
      throw new ConflictException('The last active admin cannot be deactivated.');
    }
  }

  private async assertNoActiveAttention(
    transaction: Prisma.TransactionClient,
    professionalId: string | undefined,
  ): Promise<void> {
    if (!professionalId) {
      return;
    }

    await transaction.$queryRaw(
      Prisma.sql`SELECT "id" FROM "Profesional" WHERE "id" = ${professionalId} FOR UPDATE`,
    );

    const activeAttentions = await transaction.atencion.count({
      where: { profesionalId: professionalId, estado: AtencionEstado.EN_ATENCION },
    });

    if (activeAttentions > 0) {
      throw new ConflictException(
        'Finalize the active attention before deactivating the professional.',
      );
    }
  }
}
