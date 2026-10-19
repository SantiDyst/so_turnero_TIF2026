import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  Especialidad,
  EvaluacionEstado,
  Prisma,
  RecorridoEstado,
  ResultadoAptitud,
  ResultadoEspecialidad,
} from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import {
  SUPPORTED_SPECIALTIES,
  toAptitudeState,
  toJourneyState,
} from '../shared/state-vocabulary';

export interface ClosureReadiness {
  journeyId: string;
  state: string;
  allEvaluationsComplete: boolean;
  clinicalResultPresent: boolean;
  psychologicalResultPresent: boolean;
  aptitudeStored: boolean;
  canClose: boolean;
}

interface EvaluationSnapshot {
  especialidad: Especialidad;
  estado: EvaluacionEstado;
  resultado: ResultadoEspecialidad | null;
}

interface JourneySnapshot {
  id: string;
  estado: RecorridoEstado;
  evaluaciones: EvaluationSnapshot[];
  resultadoAptitud: {
    resultadoClinico: ResultadoEspecialidad;
    resultadoPsicologico: ResultadoEspecialidad;
    aptitudFinal: ResultadoEspecialidad;
    calculatedAt: Date;
  } | null;
}

export interface LockedJourney {
  id: string;
  estado: string;
}

const CLINICAL_SPECIALTY = Especialidad.CLINICA_MEDICA;
const PSYCHOLOGICAL_SPECIALTY = Especialidad.PSICOLOGIA;

export function calculateFinalAptitude(
  clinical: ResultadoEspecialidad,
  psychological: ResultadoEspecialidad,
): ResultadoEspecialidad {
  if (
    clinical === ResultadoEspecialidad.NO_APTO ||
    psychological === ResultadoEspecialidad.NO_APTO
  ) {
    return ResultadoEspecialidad.NO_APTO;
  }
  if (
    clinical === ResultadoEspecialidad.APTO_CONDICIONAL ||
    psychological === ResultadoEspecialidad.APTO_CONDICIONAL
  ) {
    return ResultadoEspecialidad.APTO_CONDICIONAL;
  }

  return ResultadoEspecialidad.APTO_PLENO;
}

export async function lockJourney(
  transaction: Prisma.TransactionClient,
  journeyId: string,
): Promise<LockedJourney> {
  const rows = await transaction.$queryRaw<LockedJourney[]>(
    Prisma.sql`SELECT "id", "estado" FROM "Recorrido" WHERE "id" = ${journeyId} FOR UPDATE`,
  );
  const journey = rows[0];

  if (!journey) {
    throw new NotFoundException('Journey not found.');
  }

  return journey;
}

export async function storeJourneyAptitude(
  transaction: Prisma.TransactionClient,
  recorridoId: string,
): Promise<ResultadoAptitud | null> {
  await lockJourney(transaction, recorridoId);

  const evaluations = await transaction.evaluacion.findMany({
    where: { recorridoId },
    select: { especialidad: true, estado: true, resultado: true },
  });

  const clinical = evaluations.find(
    (evaluation) => evaluation.especialidad === CLINICAL_SPECIALTY,
  );
  const psychological = evaluations.find(
    (evaluation) => evaluation.especialidad === PSYCHOLOGICAL_SPECIALTY,
  );
  const allComplete = SUPPORTED_SPECIALTIES.every((specialty) =>
    evaluations.some(
      (evaluation) =>
        evaluation.especialidad === specialty &&
        evaluation.estado === EvaluacionEstado.COMPLETA,
    ),
  );

  if (!allComplete || !clinical?.resultado || !psychological?.resultado) {
    return null;
  }

  const aptitudFinal = calculateFinalAptitude(clinical.resultado, psychological.resultado);

  return transaction.resultadoAptitud.upsert({
    where: { recorridoId },
    create: {
      recorridoId,
      resultadoClinico: clinical.resultado,
      resultadoPsicologico: psychological.resultado,
      aptitudFinal,
    },
    update: {},
  });
}

@Injectable()
export class AptitudeService {
  constructor(private readonly prisma: PrismaService) {}

  async readiness(journeyId: string): Promise<ClosureReadiness> {
    const journey = await this.prisma.client.recorrido.findUnique({
      where: { id: journeyId },
      select: {
        id: true,
        estado: true,
        evaluaciones: {
          select: { especialidad: true, estado: true, resultado: true },
        },
        resultadoAptitud: {
          select: {
            resultadoClinico: true,
            resultadoPsicologico: true,
            aptitudFinal: true,
            calculatedAt: true,
          },
        },
      },
    });

    if (!journey) {
      throw new NotFoundException('Journey not found.');
    }

    return this.buildReadiness(journey);
  }

  async close(journeyId: string) {
    return this.prisma.client.$transaction(async (transaction) => {
      await lockJourney(transaction, journeyId);

      const journey = await transaction.recorrido.findUnique({
        where: { id: journeyId },
        select: {
          id: true,
          numeroAtencion: true,
          estado: true,
          evaluaciones: {
            select: { especialidad: true, estado: true, resultado: true },
          },
          resultadoAptitud: {
            select: {
              resultadoClinico: true,
              resultadoPsicologico: true,
              aptitudFinal: true,
              calculatedAt: true,
            },
          },
        },
      });

      if (!journey) {
        throw new NotFoundException('Journey not found.');
      }
      if (journey.estado === RecorridoEstado.CIERRE_FINAL) {
        throw new ConflictException('Journey is already closed.');
      }

      const readiness = this.buildReadiness(journey);
      if (!readiness.canClose) {
        throw new ConflictException('Journey does not meet the closure requirements.');
      }

      const closed = await transaction.recorrido.update({
        where: { id: journey.id },
        data: { estado: RecorridoEstado.CIERRE_FINAL },
      });

      return {
        journeyId: closed.id,
        attentionNumber: closed.numeroAtencion,
        state: toJourneyState(closed.estado),
        aptitude: journey.resultadoAptitud
          ? {
              clinicalResult: toAptitudeState(journey.resultadoAptitud.resultadoClinico),
              psychologicalResult: toAptitudeState(
                journey.resultadoAptitud.resultadoPsicologico,
              ),
              finalAptitude: toAptitudeState(journey.resultadoAptitud.aptitudFinal),
              calculatedAt: journey.resultadoAptitud.calculatedAt,
            }
          : null,
      };
    });
  }

  private buildReadiness(journey: JourneySnapshot): ClosureReadiness {
    const allEvaluationsComplete = SUPPORTED_SPECIALTIES.every((specialty) =>
      journey.evaluaciones.some(
        (evaluation) =>
          evaluation.especialidad === specialty &&
          evaluation.estado === EvaluacionEstado.COMPLETA,
      ),
    );
    const clinicalResultPresent = journey.evaluaciones.some(
      (evaluation) =>
        evaluation.especialidad === CLINICAL_SPECIALTY && evaluation.resultado !== null,
    );
    const psychologicalResultPresent = journey.evaluaciones.some(
      (evaluation) =>
        evaluation.especialidad === PSYCHOLOGICAL_SPECIALTY && evaluation.resultado !== null,
    );
    const aptitudeStored = journey.resultadoAptitud !== null;
    const canClose =
      journey.estado !== RecorridoEstado.CIERRE_FINAL &&
      allEvaluationsComplete &&
      clinicalResultPresent &&
      psychologicalResultPresent &&
      aptitudeStored;

    return {
      journeyId: journey.id,
      state: toJourneyState(journey.estado),
      allEvaluationsComplete,
      clinicalResultPresent,
      psychologicalResultPresent,
      aptitudeStored,
      canClose,
    };
  }
}
