import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AtencionEstado,
  DisponibilidadProfesional,
  Especialidad,
  EvaluacionEstado,
  Prisma,
  RecorridoEstado,
} from '@prisma/client';

import { ProfessionalsService } from '../professionals/professionals.service';
import { PrismaService } from '../prisma/prisma.service';
import { rethrowPrismaConflict } from '../shared/prisma-error.mapper';
import {
  AttentionState,
  toAttentionState,
  toJourneyState,
  toProfessionalAvailability,
} from '../shared/state-vocabulary';

export interface StartAttentionInput {
  specialty: Especialidad;
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

const STARTABLE_JOURNEY_STATES: RecorridoEstado[] = [
  RecorridoEstado.EN_ESPERA,
  RecorridoEstado.EN_PROCESO,
];

@Injectable()
export class AttentionCommandService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly professionalsService: ProfessionalsService,
  ) {}

  async start(journeyId: string, input: StartAttentionInput) {
    try {
      return await this.prisma.client.$transaction(async (transaction) => {
        const journeyRows = await transaction.$queryRaw<{ id: string }[]>(
          Prisma.sql`SELECT "id" FROM "Recorrido" WHERE "id" = ${journeyId} FOR UPDATE`,
        );
        if (!journeyRows[0]) {
          throw new NotFoundException('Journey not found.');
        }

        const journey = await transaction.recorrido.findUniqueOrThrow({
          where: { id: journeyId },
        });

        if (!STARTABLE_JOURNEY_STATES.includes(journey.estado)) {
          throw new ConflictException('Journey is not eligible to start an attention.');
        }

        const evaluation = await transaction.evaluacion.findUnique({
          where: {
            recorridoId_especialidad: {
              recorridoId: journey.id,
              especialidad: input.specialty,
            },
          },
          select: { id: true, estado: true },
        });
        if (!evaluation) {
          throw new BadRequestException('The journey has no evaluation for that specialty.');
        }
        if (evaluation.estado === EvaluacionEstado.COMPLETA) {
          throw new ConflictException('The specialty evaluation is already complete.');
        }

        const professional = await this.professionalsService.lockById(
          transaction,
          input.professionalId,
        );
        if (!this.professionalsService.isAvailable(professional)) {
          throw new ConflictException('Professional is not available.');
        }
        if (professional.especialidad !== input.specialty) {
          throw new ConflictException('Professional specialty does not match the attention.');
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
        const pendingFollowUps = await transaction.atencion.findMany({
          where: {
            recorridoId: journey.id,
            evaluacionId: evaluation.id,
            estado: AtencionEstado.EN_ESPERA,
          },
          orderBy: { createdAt: 'asc' },
          select: { id: true, recitacionId: true },
        });
        const followUp =
          pendingFollowUps.find((candidate) => candidate.recitacionId !== null) ??
          pendingFollowUps[0];

        const attention = followUp
          ? await transaction.atencion.update({
              where: { id: followUp.id },
              data: {
                estado: AtencionEstado.EN_ATENCION,
                profesionalId: professional.id,
                startedAt,
              },
            })
          : await transaction.atencion.create({
              data: {
                recorridoId: journey.id,
                postulanteId: journey.postulanteId,
                especialidad: input.specialty,
                evaluacionId: evaluation.id,
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
          evaluationId: attention.evaluacionId,
          state: toAttentionState(attention.estado),
          startedAt: attention.startedAt,
        };
      });
    } catch (error) {
      if (error instanceof BadRequestException || error instanceof NotFoundException) {
        throw error;
      }

      rethrowPrismaConflict(error, 'Applicant already has an active attention.');
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
