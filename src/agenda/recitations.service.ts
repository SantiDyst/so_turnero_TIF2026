import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ReservaEstado } from '@prisma/client';

import { ProfessionalsService } from '../professionals/professionals.service';
import { PrismaService } from '../prisma/prisma.service';
import { rethrowPrismaConflict } from '../shared/prisma-error.mapper';
import { toReservationState } from '../shared/state-vocabulary';
import { assertAgendaSlotFree } from './agenda-slot';

export interface ScheduleRecitationInput {
  pendingId: string;
  evaluationId?: string;
  professionalId: string;
  inicio: Date;
  fin: Date;
}

@Injectable()
export class RecitationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly professionalsService: ProfessionalsService,
  ) {}

  async schedule(journeyId: string, input: ScheduleRecitationInput) {
    try {
      return await this.scheduleTransaction(journeyId, input);
    } catch (error) {
      rethrowPrismaConflict(error, 'The professional already has a reservation for that slot.');
    }
  }

  private async scheduleTransaction(journeyId: string, input: ScheduleRecitationInput) {
    return this.prisma.client.$transaction(async (transaction) => {
      const journey = await transaction.recorrido.findUnique({
        where: { id: journeyId },
        select: { id: true },
      });
      if (!journey) {
        throw new NotFoundException('Journey not found.');
      }

      const pending = await transaction.pendiente.findUnique({
        where: { id: input.pendingId },
        include: {
          evaluacion: {
            select: { id: true, recorridoId: true, especialidad: true },
          },
        },
      });
      if (!pending) {
        throw new NotFoundException('Pending not found.');
      }
      if (pending.resueltoAt !== null) {
        throw new ConflictException('Pending is already resolved.');
      }
      if (pending.evaluacion.recorridoId !== journey.id) {
        throw new BadRequestException('The pending does not belong to the journey.');
      }
      if (input.evaluationId && input.evaluationId !== pending.evaluacion.id) {
        throw new BadRequestException('The pending does not belong to the evaluation.');
      }

      const professional = await this.professionalsService.lockById(
        transaction,
        input.professionalId,
      );
      if (professional.especialidad !== pending.evaluacion.especialidad) {
        throw new BadRequestException(
          'Professional specialty does not match the evaluation specialty.',
        );
      }

      await assertAgendaSlotFree(transaction, professional.id, input.inicio, input.fin);

      const recitation = await transaction.recitacion.create({
        data: {
          recorridoId: journey.id,
          evaluacionId: pending.evaluacion.id,
          pendienteId: pending.id,
          especialidad: pending.evaluacion.especialidad,
          fechaHora: input.inicio,
        },
      });
      const reservation = await transaction.reserva.create({
        data: {
          profesionalId: professional.id,
          recitacionId: recitation.id,
          inicio: input.inicio,
          fin: input.fin,
          estado: ReservaEstado.RESERVADA,
        },
      });
      const linked = await transaction.recitacion.update({
        where: { id: recitation.id },
        data: { reservaId: reservation.id },
      });

      return {
        id: linked.id,
        journeyId: linked.recorridoId,
        evaluationId: linked.evaluacionId,
        pendingId: linked.pendienteId,
        specialty: linked.especialidad,
        scheduledAt: linked.fechaHora,
        reservationId: reservation.id,
        reservation: {
          id: reservation.id,
          professionalId: reservation.profesionalId,
          start: reservation.inicio,
          end: reservation.fin,
          state: toReservationState(reservation.estado),
        },
      };
    });
  }
}
