import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AtencionEstado, Especialidad, EvaluacionEstado, RecorridoEstado } from '@prisma/client';

import { buildCertificateView } from '../certificates/certificate.view';
import { PrismaService } from '../prisma/prisma.service';
import { buildJourneyReports } from '../reports/report.view';
import {
  DerivedJourneyState,
  toAttentionState,
  toAptitudeState,
  toEvaluationState,
  toJourneyState,
  toProfessionalAvailability,
  toReservationState,
} from '../shared/state-vocabulary';

export interface ProfessionalViewer {
  professionalId: string;
  specialty: Especialidad;
}

@Injectable()
export class QueueQueryService {
  constructor(private readonly prisma: PrismaService) {}

  async listQueue(viewer?: ProfessionalViewer) {
    if (viewer) {
      const [pending, completed] = await Promise.all([
        this.professionalPendingQueue(viewer),
        this.professionalCompletedQueue(viewer),
      ]);

      return [...pending, ...completed];
    }

    const journeys = await this.prisma.client.recorrido.findMany({
      where: { estado: RecorridoEstado.EN_ESPERA },
      orderBy: { queuedAt: 'asc' },
      select: {
        postulanteId: true,
        numeroAtencion: true,
        estado: true,
        queuedAt: true,
        empresa: true,
        puesto: true,
        postulante: { select: { nombre: true, apellido: true } },
      },
    });

    return journeys.map((journey) => this.toQueueEntry(journey));
  }

  private async professionalPendingQueue(viewer: ProfessionalViewer) {
    const journeys = await this.prisma.client.recorrido.findMany({
      where: {
        estado: { in: [RecorridoEstado.EN_ESPERA, RecorridoEstado.EN_PROCESO] },
        evaluaciones: {
          some: { especialidad: viewer.specialty, estado: EvaluacionEstado.PENDIENTE },
        },
      },
      orderBy: { queuedAt: 'asc' },
      select: {
        postulanteId: true,
        numeroAtencion: true,
        estado: true,
        queuedAt: true,
        empresa: true,
        puesto: true,
        postulante: { select: { nombre: true, apellido: true } },
        atenciones: {
          where: { especialidad: viewer.specialty },
          orderBy: { createdAt: 'desc' },
          select: {
            estado: true,
            profesional: { select: { id: true, nombre: true } },
          },
        },
      },
    });

    return journeys.map((journey) => {
      const activeAttention = journey.atenciones.find(
        (attention) => attention.estado === AtencionEstado.EN_ATENCION,
      );
      const responsible = activeAttention ?? journey.atenciones[0] ?? null;

      return {
        ...this.toQueueEntry(journey),
        status: activeAttention ? 'en_atencion' : 'pendiente',
        completedAt: null,
        professional: responsible?.profesional ?? null,
      };
    });
  }

  private async professionalCompletedQueue(viewer: ProfessionalViewer) {
    const attentions = await this.prisma.client.atencion.findMany({
      where: {
        profesionalId: viewer.professionalId,
        especialidad: viewer.specialty,
        estado: { in: [AtencionEstado.EN_ATENCION, AtencionEstado.FINALIZADA] },
        evaluacion: { estado: EvaluacionEstado.COMPLETA },
        recorrido: { estado: { in: [RecorridoEstado.EN_PROCESO, RecorridoEstado.CIERRE_FINAL] } },
      },
      orderBy: { startedAt: 'desc' },
      take: 20,
      select: {
        recorridoId: true,
        estado: true,
        endedAt: true,
        profesional: { select: { id: true, nombre: true } },
        recorrido: {
          select: {
            postulanteId: true,
            numeroAtencion: true,
            estado: true,
            queuedAt: true,
            empresa: true,
            puesto: true,
            postulante: { select: { nombre: true, apellido: true } },
          },
        },
      },
    });

    const seen = new Set<string>();
    const entries: Record<string, unknown>[] = [];

    for (const attention of attentions) {
      if (seen.has(attention.recorridoId)) {
        continue;
      }
      seen.add(attention.recorridoId);

      entries.push({
        ...this.toQueueEntry(attention.recorrido),
        status: attention.estado === AtencionEstado.EN_ATENCION ? 'en_atencion' : 'completado',
        completedAt: attention.endedAt,
        professional: attention.profesional,
      });
    }

    return entries;
  }

  private toQueueEntry(journey: {
    postulanteId: string;
    numeroAtencion: string;
    estado: RecorridoEstado;
    queuedAt: Date;
    empresa: string | null;
    puesto: string | null;
    postulante: { nombre: string; apellido: string };
  }) {
    return {
      applicantId: journey.postulanteId,
      applicant: journey.postulante,
      attentionNumber: journey.numeroAtencion,
      journeyState: toJourneyState(journey.estado),
      queuedAt: journey.queuedAt,
      empresa: journey.empresa,
      puesto: journey.puesto,
    };
  }

  async listOverview() {
    const journeys = await this.prisma.client.recorrido.findMany({
      orderBy: { queuedAt: 'desc' },
      take: 50,
      select: {
        id: true,
        numeroAtencion: true,
        estado: true,
        queuedAt: true,
        empresa: true,
        puesto: true,
        motivoAnulacion: true,
        anuladaAt: true,
        anuladoPor: { select: { id: true, nombre: true } },
        postulante: { select: { id: true, nombre: true, apellido: true } },
        atenciones: {
          orderBy: { createdAt: 'desc' },
          select: {
            estado: true,
            especialidad: true,
            profesional: { select: { id: true, nombre: true, especialidad: true } },
          },
        },
        evaluaciones: {
          select: {
            estado: true,
            pendientes: { where: { resueltoAt: null }, select: { id: true } },
          },
        },
        resultadoAptitud: { select: { aptitudFinal: true } },
        certificado: { select: { id: true } },
      },
    });

    return journeys.map((journey) => {
      const activeAttention = journey.atenciones.find(
        (attention) => attention.estado === AtencionEstado.EN_ATENCION,
      );
      const responsible = activeAttention ?? journey.atenciones[0] ?? null;
      const hasPendingEvaluation = journey.evaluaciones.some(
        (evaluation) => evaluation.estado === EvaluacionEstado.PENDIENTE,
      );
      const derivedState =
        journey.estado === RecorridoEstado.EN_PROCESO && !activeAttention && hasPendingEvaluation
          ? DerivedJourneyState.waitingForCall
          : null;

      return {
        journeyId: journey.id,
        applicant: journey.postulante,
        attentionNumber: journey.numeroAtencion,
        state: toJourneyState(journey.estado),
        derivedState,
        queuedAt: journey.queuedAt,
        empresa: journey.empresa,
        puesto: journey.puesto,
        activeSpecialty: activeAttention?.especialidad ?? null,
        responsibleProfessional: responsible?.profesional ?? null,
        attentionCount: journey.atenciones.length,
        annulledReason: journey.motivoAnulacion,
        annulledAt: journey.anuladaAt,
        annulledBy: journey.anuladoPor
          ? { id: journey.anuladoPor.id, name: journey.anuladoPor.nombre }
          : null,
        evaluations: {
          total: journey.evaluaciones.length,
          complete: journey.evaluaciones.filter(
            (evaluation) => evaluation.estado === EvaluacionEstado.COMPLETA,
          ).length,
        },
        openPendings: journey.evaluaciones.reduce(
          (total, evaluation) => total + evaluation.pendientes.length,
          0,
        ),
        finalAptitude: journey.resultadoAptitud
          ? toAptitudeState(journey.resultadoAptitud.aptitudFinal)
          : null,
        certificateIssued: Boolean(journey.certificado),
      };
    });
  }

  async findJourney(applicantId?: string, attentionNumber?: string, viewer?: ProfessionalViewer) {
    if (Boolean(applicantId) === Boolean(attentionNumber)) {
      throw new BadRequestException('Provide exactly one of applicantId or attentionNumber.');
    }

    const journey = await this.prisma.client.recorrido.findUnique({
      where: applicantId ? { postulanteId: applicantId } : { numeroAtencion: attentionNumber! },
      include: {
        postulante: true,
        anuladoPor: { select: { id: true, nombre: true } },
        atenciones: {
          orderBy: { createdAt: 'asc' },
          include: { profesional: true },
        },
        evaluaciones: {
          orderBy: { especialidad: 'asc' },
          include: {
            pendientes: { orderBy: { createdAt: 'asc' } },
            informe: {
              include: {
                profesional: { select: { id: true, nombre: true } },
                atencion: {
                  select: { profesional: { select: { id: true, nombre: true } } },
                },
              },
            },
          },
        },
        recitaciones: {
          orderBy: { fechaHora: 'asc' },
          include: { reserva: true },
        },
        derivaciones: { orderBy: { createdAt: 'asc' } },
        resultadoAptitud: true,
        certificado: {
          include: { profesional: { select: { id: true, nombre: true } } },
        },
      },
    });

    if (!journey) {
      throw new NotFoundException('Journey not found.');
    }

    if (viewer) {
      this.assertVisibleToProfessional(journey, viewer);
    }

    const reservations = await this.prisma.client.reserva.findMany({
      where: { recitacion: { recorridoId: journey.id } },
      orderBy: { inicio: 'asc' },
    });

    const hasActiveAttention = journey.atenciones.some(
      (attention) => attention.estado === AtencionEstado.EN_ATENCION,
    );
    const hasPendingEvaluation = journey.evaluaciones.some(
      (evaluation) => evaluation.estado === EvaluacionEstado.PENDIENTE,
    );
    const derivedState =
      journey.estado === RecorridoEstado.EN_PROCESO && !hasActiveAttention && hasPendingEvaluation
        ? DerivedJourneyState.waitingForCall
        : null;

    const applicant = {
      id: journey.postulante.id,
      nombre: journey.postulante.nombre,
      apellido: journey.postulante.apellido,
    };

    return {
      applicant: {
        id: journey.postulante.id,
        nombre: journey.postulante.nombre,
        apellido: journey.postulante.apellido,
        dni: journey.postulante.dni,
      },
      journey: {
        id: journey.id,
        attentionNumber: journey.numeroAtencion,
        state: toJourneyState(journey.estado),
        derivedState,
        queuedAt: journey.queuedAt,
        empresa: journey.empresa,
        puesto: journey.puesto,
        annulledReason: journey.motivoAnulacion,
        annulledAt: journey.anuladaAt,
        annulledBy: journey.anuladoPor
          ? { id: journey.anuladoPor.id, name: journey.anuladoPor.nombre }
          : null,
      },
      attentions: journey.atenciones.map((attention) => ({
        id: attention.id,
        state: toAttentionState(attention.estado),
        specialty: attention.especialidad,
        evaluationId: attention.evaluacionId,
        originAttentionId: attention.atencionOrigenId,
        recitationId: attention.recitacionId,
        professional: {
          id: attention.profesional.id,
          name: attention.profesional.nombre,
          specialty: attention.profesional.especialidad,
          availability: toProfessionalAvailability(attention.profesional.disponibilidad),
        },
        startedAt: attention.startedAt,
        endedAt: attention.endedAt,
      })),
      evaluations: journey.evaluaciones.map((evaluation) => ({
        id: evaluation.id,
        specialty: evaluation.especialidad,
        state: toEvaluationState(evaluation.estado),
        result: evaluation.resultado,
        completedAt: evaluation.completadaAt,
      })),
      pendings: journey.evaluaciones.flatMap((evaluation) =>
        evaluation.pendientes.map((pending) => ({
          id: pending.id,
          evaluationId: pending.evaluacionId,
          originAttentionId: pending.atencionOrigenId,
          reason: pending.motivo,
          limitDate: pending.fechaLimite,
          resolvedAt: pending.resueltoAt,
          createdAt: pending.createdAt,
        })),
      ),
      recitations: journey.recitaciones.map((recitation) => ({
        id: recitation.id,
        evaluationId: recitation.evaluacionId,
        pendingId: recitation.pendienteId,
        specialty: recitation.especialidad,
        scheduledAt: recitation.fechaHora,
        reservationId: recitation.reservaId,
      })),
      reservations: reservations.map((reservation) => ({
        id: reservation.id,
        professionalId: reservation.profesionalId,
        recitationId: reservation.recitacionId,
        start: reservation.inicio,
        end: reservation.fin,
        state: toReservationState(reservation.estado),
        previousReservationId: reservation.reservaAnteriorId,
      })),
      derivations: journey.derivaciones.map((derivation) => ({
        id: derivation.id,
        originAttentionId: derivation.atencionOrigenId,
        destinationSpecialty: derivation.especialidadDestino,
        reason: derivation.motivo,
        createdAt: derivation.createdAt,
      })),
      aptitude: journey.resultadoAptitud
        ? {
            clinicalResult: toAptitudeState(journey.resultadoAptitud.resultadoClinico),
            psychologicalResult: toAptitudeState(journey.resultadoAptitud.resultadoPsicologico),
            finalAptitude: toAptitudeState(journey.resultadoAptitud.aptitudFinal),
            calculatedAt: journey.resultadoAptitud.calculatedAt,
          }
        : null,
      reports: buildJourneyReports({
        numeroAtencion: journey.numeroAtencion,
        postulante: applicant,
        evaluaciones: journey.evaluaciones,
        resultadoAptitud: journey.resultadoAptitud,
      }),
      certificate: journey.certificado
        ? buildCertificateView({
            certificate: journey.certificado,
            attentionNumber: journey.numeroAtencion,
            applicant,
          })
        : null,
    };
  }

  private assertVisibleToProfessional(
    journey: {
      atenciones: { profesionalId: string }[];
      evaluaciones: { especialidad: Especialidad; estado: EvaluacionEstado }[];
    },
    viewer: ProfessionalViewer,
  ): void {
    const ownsAttention = journey.atenciones.some(
      (attention) => attention.profesionalId === viewer.professionalId,
    );
    const pendingForSpecialty = journey.evaluaciones.some(
      (evaluation) =>
        evaluation.especialidad === viewer.specialty &&
        evaluation.estado === EvaluacionEstado.PENDIENTE,
    );

    if (!ownsAttention && !pendingForSpecialty) {
      throw new ForbiddenException('The journey is not part of your queue.');
    }
  }
}
