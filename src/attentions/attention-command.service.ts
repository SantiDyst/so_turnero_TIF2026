import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AtencionEstado, DisponibilidadProfesional, Prisma, RecorridoEstado } from '@prisma/client';

import { ProfessionalsService } from '../professionals/professionals.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  AttentionState,
  toAttentionState,
  toJourneyState,
  toProfessionalAvailability,
} from '../shared/state-vocabulary';

export interface StartAttentionInput {
  specialty: string;
  professionalId: string;
}

export interface FinalizeAttentionInput {
  state: AtencionEstado;
}

interface LockedAttention {
  id: string;
  estado: string;
  profesionalId: string;
}

@Injectable()
export class AttentionCommandService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly professionalsService: ProfessionalsService,
  ) {}

  async start(journeyId: string, input: StartAttentionInput) {
    try {
      return await this.prisma.client.$transaction(async (transaction) => {
        const journey = await transaction.recorrido.findUnique({ where: { id: journeyId } });

        if (!journey) {
          throw new NotFoundException('Journey not found.');
        }

        if (journey.estado !== RecorridoEstado.EN_ESPERA) {
          throw new ConflictException('Journey is not eligible to start an attention.');
        }

        const professional = await this.professionalsService.lockById(
          transaction,
          input.professionalId,
        );
        if (!this.professionalsService.isAvailable(professional)) {
          throw new ConflictException('Professional is not available.');
        }

        const activeAttention = await transaction.atencion.findFirst({
          where: {
            postulanteId: journey.postulanteId,
            estado: AtencionEstado.EN_ATENCION,
          },
          select: { id: true },
        });
        if (activeAttention) {
          throw new ConflictException('Applicant already has an active attention.');
        }

        const startedAt = new Date();
        const attention = await transaction.atencion.create({
          data: {
            recorridoId: journey.id,
            postulanteId: journey.postulanteId,
            especialidad: input.specialty,
            profesionalId: professional.id,
            estado: AtencionEstado.EN_ATENCION,
            startedAt,
          },
        });

        await transaction.recorrido.update({
          where: { id: journey.id },
          data: { estado: RecorridoEstado.EN_PROCESO },
        });
        await this.professionalsService.markBusy(transaction, professional.id);

        return {
          attentionId: attention.id,
          state: toAttentionState(attention.estado),
          startedAt: attention.startedAt,
        };
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Applicant already has an active attention.');
      }

      throw error;
    }
  }

  async finalize(attentionId: string, input: FinalizeAttentionInput) {
    return this.prisma.client.$transaction(async (transaction) => {
      const attention = await this.lockAttention(transaction, attentionId);

      if (attention.estado !== AttentionState.inAttention) {
        throw new ConflictException('Only an active attention can be finalized.');
      }

      await this.professionalsService.lockById(transaction, attention.profesionalId);

      const endedAt = new Date();
      const finalizedAttention = await transaction.atencion.update({
        where: { id: attention.id },
        data: { estado: input.state, endedAt },
      });
      await this.professionalsService.markAvailable(transaction, attention.profesionalId);

      return {
        id: finalizedAttention.id,
        state: toAttentionState(finalizedAttention.estado),
        endedAt: finalizedAttention.endedAt,
        journeyState: toJourneyState(RecorridoEstado.EN_PROCESO),
        professionalAvailability: toProfessionalAvailability(DisponibilidadProfesional.DISPONIBLE),
      };
    });
  }

  private async lockAttention(
    transaction: Prisma.TransactionClient,
    attentionId: string,
  ): Promise<LockedAttention> {
    const rows = await transaction.$queryRaw<LockedAttention[]>(
      Prisma.sql`SELECT "id", "estado", "profesionalId" FROM "Atencion" WHERE "id" = ${attentionId} FOR UPDATE`,
    );
    const attention = rows[0];

    if (!attention) {
      throw new NotFoundException('Attention not found.');
    }

    return attention;
  }
}
