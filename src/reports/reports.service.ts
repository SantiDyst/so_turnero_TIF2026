import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Especialidad, InformeEstado, Prisma, ResultadoEspecialidad } from '@prisma/client';

import { lockJourney } from '../aptitude/aptitude.service';
import { PrismaService } from '../prisma/prisma.service';
import { JourneyState } from '../shared/state-vocabulary';
import {
  buildJourneyReports,
  buildReportEntry,
  JourneyReportsSource,
  ReportEntryView,
} from './report.view';

export interface SaveReportInput {
  observations: string;
  state: InformeEstado;
  professionalId?: string;
}

interface AttentionSource {
  id: string;
  recorridoId: string;
  especialidad: Especialidad;
  evaluacionId: string | null;
  profesionalId: string;
}

interface EvaluationSource {
  id: string;
  especialidad: Especialidad;
  resultado: ResultadoEspecialidad | null;
}

const EVALUATION_SELECT = {
  id: true,
  especialidad: true,
  resultado: true,
} satisfies Prisma.EvaluacionSelect;

const REPORT_INCLUDE = {
  profesional: { select: { id: true, nombre: true } },
  atencion: { select: { profesional: { select: { id: true, nombre: true } } } },
} satisfies Prisma.InformeInclude;

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async saveReport(attentionId: string, input: SaveReportInput): Promise<ReportEntryView> {
    return this.prisma.client.$transaction(async (transaction) => {
      const attention = await transaction.atencion.findUnique({
        where: { id: attentionId },
        select: {
          id: true,
          recorridoId: true,
          especialidad: true,
          evaluacionId: true,
          profesionalId: true,
        },
      });

      if (!attention) {
        throw new NotFoundException('Attention not found.');
      }

      const evaluation = await this.resolveEvaluation(transaction, attention);
      const journey = await lockJourney(transaction, attention.recorridoId);

      if (journey.estado === JourneyState.closed) {
        throw new ConflictException('Journey is closed and cannot accept report changes.');
      }

      const professionalId = input.professionalId ?? attention.profesionalId;
      if (input.professionalId) {
        const professional = await transaction.profesional.findUnique({
          where: { id: input.professionalId },
          select: { id: true },
        });
        if (!professional) {
          throw new NotFoundException('Professional not found.');
        }
      }

      const completadoAt = input.state === InformeEstado.COMPLETO ? new Date() : null;
      const report = await transaction.informe.upsert({
        where: { evaluacionId: evaluation.id },
        create: {
          evaluacionId: evaluation.id,
          atencionId: attention.id,
          profesionalId: professionalId,
          observaciones: input.observations,
          estado: input.state,
          completadoAt,
        },
        update: {
          atencionId: attention.id,
          profesionalId: professionalId,
          observaciones: input.observations,
          estado: input.state,
          completadoAt,
        },
        include: REPORT_INCLUDE,
      });

      const snapshot = await transaction.recorrido.findUniqueOrThrow({
        where: { id: attention.recorridoId },
        select: {
          numeroAtencion: true,
          postulante: { select: { id: true, nombre: true, apellido: true } },
          resultadoAptitud: { select: { aptitudFinal: true } },
        },
      });

      return buildReportEntry({
        specialty: evaluation.especialidad,
        evaluation: { id: evaluation.id, resultado: evaluation.resultado },
        applicant: snapshot.postulante,
        attentionNumber: snapshot.numeroAtencion,
        finalAptitude: snapshot.resultadoAptitud?.aptitudFinal ?? null,
        report,
      });
    });
  }

  async listJourneyReports(journeyId: string) {
    const journey = await this.prisma.client.recorrido.findUnique({
      where: { id: journeyId },
      select: {
        id: true,
        numeroAtencion: true,
        postulante: { select: { id: true, nombre: true, apellido: true } },
        evaluaciones: {
          select: {
            id: true,
            especialidad: true,
            resultado: true,
            informe: { include: REPORT_INCLUDE },
          },
        },
        resultadoAptitud: { select: { aptitudFinal: true } },
      },
    });

    if (!journey) {
      throw new NotFoundException('Journey not found.');
    }

    const source: JourneyReportsSource = journey;

    return {
      journeyId: journey.id,
      reports: buildJourneyReports(source),
    };
  }

  private async resolveEvaluation(
    transaction: Prisma.TransactionClient,
    attention: AttentionSource,
  ): Promise<EvaluationSource> {
    const evaluation = attention.evaluacionId
      ? await transaction.evaluacion.findUnique({
          where: { id: attention.evaluacionId },
          select: EVALUATION_SELECT,
        })
      : await transaction.evaluacion.findUnique({
          where: {
            recorridoId_especialidad: {
              recorridoId: attention.recorridoId,
              especialidad: attention.especialidad,
            },
          },
          select: EVALUATION_SELECT,
        });

    if (!evaluation) {
      throw new BadRequestException('The attention has no associated evaluation.');
    }

    return evaluation;
  }
}
