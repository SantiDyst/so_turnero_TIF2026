import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma, RecorridoEstado, RolUsuario } from '@prisma/client';

import { hashPassword } from '../auth/password';
import { PrismaService } from '../prisma/prisma.service';
import { normalizeEmail } from '../shared/email';
import { rethrowPrismaConflict } from '../shared/prisma-error.mapper';
import { SUPPORTED_SPECIALTIES, toJourneyState } from '../shared/state-vocabulary';

export interface RegisterApplicantInput {
  nombre: string;
  apellido: string;
  dni: string;
  empresa?: string | null;
  puesto?: string | null;
}

export interface SelfRegistrationInput {
  nombre: string;
  apellido: string;
  dni: string;
  email: string;
  password: string;
  empresa?: string | null;
  puesto?: string | null;
}

interface Workplace {
  empresa: string | null;
  puesto: string | null;
}

interface JourneyRecord {
  id: string;
  numeroAtencion: string;
  estado: RecorridoEstado;
  empresa: string | null;
  puesto: string | null;
}

@Injectable()
export class RegistrationService {
  constructor(private readonly prisma: PrismaService) {}

  async register(input: RegisterApplicantInput) {
    try {
      return await this.prisma.client.$transaction(async (transaction) => {
        const existing = await transaction.postulante.findFirst({
          where: { dni: input.dni },
          select: { id: true },
        });

        if (existing) {
          throw new ConflictException('An applicant with that DNI already exists.');
        }

        const applicant = await transaction.postulante.create({
          data: { nombre: input.nombre, apellido: input.apellido, dni: input.dni },
        });
        const journey = await this.createJourney(
          transaction,
          applicant.id,
          this.workplaceOf(input),
        );

        return {
          applicant: {
            id: applicant.id,
            nombre: applicant.nombre,
            apellido: applicant.apellido,
            dni: applicant.dni,
          },
          journey: this.toJourneySummary(journey),
        };
      });
    } catch (error) {
      rethrowPrismaConflict(error, 'The generated attention number is already in use.');
    }
  }

  async registerWithAccount(input: SelfRegistrationInput) {
    const email = normalizeEmail(input.email);
    const passwordHash = await hashPassword(input.password);

    try {
      return await this.prisma.client.$transaction(async (transaction) => {
        const existing = await transaction.postulante.findFirst({
          where: { dni: input.dni },
          select: { id: true },
        });

        if (existing) {
          throw new ConflictException('An applicant with that DNI already exists.');
        }

        const usuario = await transaction.usuario.create({
          data: {
            nombre: `${input.nombre} ${input.apellido}`.trim(),
            email,
            passwordHash,
            rol: RolUsuario.USER,
          },
          select: { id: true, nombre: true, email: true, rol: true },
        });

        const applicant = await transaction.postulante.create({
          data: {
            nombre: input.nombre,
            apellido: input.apellido,
            dni: input.dni,
            email,
            usuarioId: usuario.id,
          },
        });
        const journey = await this.createJourney(
          transaction,
          applicant.id,
          this.workplaceOf(input),
        );

        return {
          user: usuario,
          applicant: {
            id: applicant.id,
            nombre: applicant.nombre,
            apellido: applicant.apellido,
            dni: applicant.dni,
            email: applicant.email,
          },
          journey: this.toJourneySummary(journey),
        };
      });
    } catch (error) {
      rethrowPrismaConflict(error, 'The email or DNI is already registered.');
    }
  }

  private workplaceOf(input: { empresa?: string | null; puesto?: string | null }): Workplace {
    return {
      empresa: input.empresa?.trim() || null,
      puesto: input.puesto?.trim() || null,
    };
  }

  private async createJourney(
    transaction: Prisma.TransactionClient,
    applicantId: string,
    workplace: Workplace,
  ): Promise<JourneyRecord> {
    const attentionNumber = await this.nextAttentionNumber(transaction);
    const journey = await transaction.recorrido.create({
      data: {
        postulanteId: applicantId,
        numeroAtencion: attentionNumber,
        estado: RecorridoEstado.EN_ESPERA,
        empresa: workplace.empresa,
        puesto: workplace.puesto,
      },
      select: {
        id: true,
        numeroAtencion: true,
        estado: true,
        empresa: true,
        puesto: true,
      },
    });

    await transaction.evaluacion.createMany({
      data: SUPPORTED_SPECIALTIES.map((especialidad) => ({
        recorridoId: journey.id,
        especialidad,
      })),
    });

    return journey;
  }

  private toJourneySummary(journey: JourneyRecord) {
    return {
      id: journey.id,
      attentionNumber: journey.numeroAtencion,
      state: toJourneyState(journey.estado),
      empresa: journey.empresa,
      puesto: journey.puesto,
    };
  }

  private async nextAttentionNumber(transaction: Prisma.TransactionClient): Promise<string> {
    const rows = await transaction.$queryRaw<{ attentionNumber: string }[]>(
      Prisma.sql`SELECT next_attention_no() AS "attentionNumber"`,
    );

    return rows[0].attentionNumber;
  }
}
