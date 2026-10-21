import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AtencionEstado, EvaluacionEstado, RecorridoEstado } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import {
  DerivedJourneyState,
  toAttentionState,
  toAptitudeState,
  toEvaluationState,
  toJourneyState,
  toProfessionalAvailability,
  toReservationState,
} from '../shared/state-vocabulary';

@Injectable()
export class QueueQueryService {
  constructor(private readonly prisma: PrismaService) {}

  async listQueue() {
    const journeys = await this.prisma.client.recorrido.findMany({
      where: { estado: RecorridoEstado.EN_ESPERA },
      orderBy: { queuedAt: 'asc' },
      select: {
        postulanteId: true,
        numeroAtencion: true,
        estado: true,
        queuedAt: true,
      },
    });

    return journeys.map((journey) => ({
      applicantId: journey.postulanteId,
      attentionNumber: journey.numeroAtencion,
      journeyState: toJourneyState(journey.estado),
      queuedAt: journey.queuedAt,
    }));
  }

  async findJourney(applicantId?: string, attentionNumber?: string) {
    if (Boolean(applicantId) === Boolean(attentionNumber)) {
      throw new BadRequestException('Provide exactly one of applicantId or attentionNumber.');
    }

    const journey = await this.prisma.client.recorrido.findUnique({
      where: applicantId ? { postulanteId: applicantId } : { numeroAtencion: attentionNumber! },
      include: {
        postulante: true,
        atenciones: {
          orderBy: { createdAt: 'asc' },
          include: { profesional: true },
        },
        evaluaciones: {
          orderBy: { especialidad: 'asc' },
          include: {
            pendientes: { orderBy: { createdAt: 'asc' } },
          },
        },
        recitaciones: {
          orderBy: { fechaHora: 'asc' },
          include: { reserva: true },
        },
        derivaciones: { orderBy: { createdAt: 'asc' } },
        resultadoAptitud: true,
      },
    });

    if (!journey) {
      throw new NotFoundException('Journey not found.');
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
            psychologicalResult: toAptitudeState(
              journey.resultadoAptitud.resultadoPsicologico,
            ),
            finalAptitude: toAptitudeState(journey.resultadoAptitud.aptitudFinal),
            calculatedAt: journey.resultadoAptitud.calculatedAt,
          }
        : null,
    };
  }
}
