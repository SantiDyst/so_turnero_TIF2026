import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Especialidad,
  EvaluacionEstado,
  Evaluacion,
  Pendiente,
  Prisma,
  ResultadoEspecialidad,
} from '@prisma/client';

import { storeJourneyAptitude } from '../aptitude/aptitude.service';
import { PrismaService } from '../prisma/prisma.service';
import { JourneyState, toEvaluationState } from '../shared/state-vocabulary';

export interface CreatePendingInput {
  motivo: string;
  fechaLimite: Date | null;
}

export interface SetEvaluationResultInput {
  resultado: ResultadoEspecialidad;
}

interface LockedPending {
  id: string;
  resueltoAt: Date | null;
}

interface LockedEvaluation {
  id: string;
  estado: EvaluacionEstado;
  especialidad: Especialidad;
  resultado: ResultadoEspecialidad | null;
  recorridoId: string;
}

const RESULT_SPECIALTIES: readonly Especialidad[] = [
  Especialidad.CLINICA_MEDICA,
  Especialidad.PSICOLOGIA,
];

@Injectable()
export class EvaluationsService {
  constructor(private readonly prisma: PrismaService) {}

  async createPending(attentionId: string, input: CreatePendingInput) {
    return this.prisma.client.$transaction(async (transaction) => {
      const attention = await transaction.atencion.findUnique({
        where: { id: attentionId },
        select: {
          id: true,
          recorridoId: true,
          especialidad: true,
          evaluacionId: true,
        },
      });

      if (!attention) {
        throw new NotFoundException('Attention not found.');
      }

      let evaluationId = attention.evaluacionId;
      if (!evaluationId) {
        const evaluation = await transaction.evaluacion.findUnique({
          where: {
            recorridoId_especialidad: {
              recorridoId: attention.recorridoId,
              especialidad: attention.especialidad,
            },
          },
          select: { id: true },
        });

        if (!evaluation) {
          throw new BadRequestException('The attention has no associated evaluation.');
        }
        evaluationId = evaluation.id;
      }

      const pending = await transaction.pendiente.create({
        data: {
          evaluacionId: evaluationId,
          atencionOrigenId: attention.id,
          motivo: input.motivo,
          fechaLimite: input.fechaLimite,
        },
      });

      return this.toPendingResponse(pending);
    });
  }

  async resolvePending(pendingId: string) {
    return this.prisma.client.$transaction(async (transaction) => {
      const rows = await transaction.$queryRaw<LockedPending[]>(
        Prisma.sql`SELECT "id", "resueltoAt" FROM "Pendiente" WHERE "id" = ${pendingId} FOR UPDATE`,
      );
      const pending = rows[0];

      if (!pending) {
        throw new NotFoundException('Pending not found.');
      }
      if (pending.resueltoAt !== null) {
        throw new ConflictException('Pending is already resolved.');
      }

      const resolved = await transaction.pendiente.update({
        where: { id: pending.id },
        data: { resueltoAt: new Date() },
      });

      return this.toPendingResponse(resolved);
    });
  }

  async setResult(evaluationId: string, input: SetEvaluationResultInput) {
    return this.prisma.client.$transaction(async (transaction) => {
      const evaluation = await this.lockEvaluation(transaction, evaluationId);

      if (!RESULT_SPECIALTIES.includes(evaluation.especialidad)) {
        throw new BadRequestException(
          'Only CLINICA_MEDICA and PSICOLOGIA evaluations store a specialty result.',
        );
      }
      if (evaluation.estado === EvaluacionEstado.COMPLETA) {
        throw new ConflictException('Evaluation is already complete.');
      }
      await this.assertJourneyOpen(transaction, evaluation.recorridoId);
      await this.assertAttentionStarted(transaction, evaluation.id, 'recording a result');

      const updated = await transaction.evaluacion.update({
        where: { id: evaluation.id },
        data: { resultado: input.resultado },
      });

      return this.toEvaluationResponse(updated);
    });
  }

  async complete(evaluationId: string) {
    return this.prisma.client.$transaction(async (transaction) => {
      const evaluation = await this.lockEvaluation(transaction, evaluationId);

      if (evaluation.estado === EvaluacionEstado.COMPLETA) {
        throw new ConflictException('Evaluation is already complete.');
      }
      await this.assertJourneyOpen(transaction, evaluation.recorridoId);
      await this.assertAttentionStarted(transaction, evaluation.id, 'completing the evaluation');

      const openPendings = await transaction.pendiente.count({
        where: { evaluacionId: evaluation.id, resueltoAt: null },
      });
      if (openPendings > 0) {
        throw new ConflictException('Evaluation has open pendings.');
      }

      if (RESULT_SPECIALTIES.includes(evaluation.especialidad) && !evaluation.resultado) {
        throw new ConflictException(
          'A specialty result is required before completing this evaluation.',
        );
      }

      const completed = await transaction.evaluacion.update({
        where: { id: evaluation.id },
        data: {
          estado: EvaluacionEstado.COMPLETA,
          completadaAt: new Date(),
        },
      });
      await storeJourneyAptitude(transaction, evaluation.recorridoId);

      return this.toEvaluationResponse(completed);
    });
  }

  private async lockEvaluation(
    transaction: Prisma.TransactionClient,
    evaluationId: string,
  ): Promise<LockedEvaluation> {
    const rows = await transaction.$queryRaw<LockedEvaluation[]>(
      Prisma.sql`SELECT "id", "estado", "especialidad", "resultado", "recorridoId"
                 FROM "Evaluacion" WHERE "id" = ${evaluationId} FOR UPDATE`,
    );
    const evaluation = rows[0];

    if (!evaluation) {
      throw new NotFoundException('Evaluation not found.');
    }

    return evaluation;
  }

  private async assertAttentionStarted(
    transaction: Prisma.TransactionClient,
    evaluationId: string,
    action: string,
  ): Promise<void> {
    const attentions = await transaction.atencion.count({ where: { evaluacionId: evaluationId } });

    if (attentions === 0) {
      throw new ConflictException(`Start an attention before ${action}.`);
    }
  }

  private async assertJourneyOpen(
    transaction: Prisma.TransactionClient,
    recorridoId: string,
  ): Promise<void> {
    const rows = await transaction.$queryRaw<{ estado: string }[]>(
      Prisma.sql`SELECT "estado" FROM "Recorrido" WHERE "id" = ${recorridoId} FOR UPDATE`,
    );
    const journey = rows[0];

    if (!journey) {
      throw new NotFoundException('Journey not found.');
    }
    if (journey.estado === JourneyState.closed) {
      throw new ConflictException('Journey is closed and cannot accept evaluation changes.');
    }
    if (journey.estado === JourneyState.annulled) {
      throw new ConflictException('Journey is annulled and cannot accept evaluation changes.');
    }
  }

  private toPendingResponse(pending: Pendiente) {
    return {
      id: pending.id,
      evaluationId: pending.evaluacionId,
      originAttentionId: pending.atencionOrigenId,
      reason: pending.motivo,
      limitDate: pending.fechaLimite,
      resolvedAt: pending.resueltoAt,
      createdAt: pending.createdAt,
    };
  }

  private toEvaluationResponse(evaluation: Evaluacion) {
    return {
      id: evaluation.id,
      specialty: evaluation.especialidad,
      state: toEvaluationState(evaluation.estado),
      result: evaluation.resultado,
      completedAt: evaluation.completadaAt,
    };
  }
}
