import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AtencionEstado, Especialidad, Prisma, ReservaEstado } from '@prisma/client';

import { ProfessionalsService } from '../professionals/professionals.service';
import { PrismaService } from '../prisma/prisma.service';
import { rethrowPrismaConflict } from '../shared/prisma-error.mapper';
import { toAttentionState, toReservationState } from '../shared/state-vocabulary';
import { AGENDA_OVERLAP_MESSAGE, assertAgendaSlotFree } from './agenda-slot';

export interface CreateReservationInput {
  recitacionId: string;
  professionalId: string;
  inicio: Date;
  fin: Date;
}

export interface RescheduleReservationInput {
  inicio: Date;
  fin: Date;
  professionalId?: string;
}

interface LockedReservation {
  id: string;
  profesionalId: string;
  recitacionId: string | null;
  inicio: Date;
  fin: Date;
  estado: ReservaEstado;
  reservaAnteriorId: string | null;
}

interface RecitationLinks {
  id: string;
  recorridoId: string;
  evaluacionId: string;
  pendienteId: string;
  especialidad: Especialidad;
}

@Injectable()
export class ReservationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly professionalsService: ProfessionalsService,
  ) {}

  async create(input: CreateReservationInput) {
    try {
      return await this.prisma.client.$transaction(async (transaction) => {
        this.assertInterval(input.inicio, input.fin);

        const recitation = await this.loadRecitation(transaction, input.recitacionId);
        const professional = await this.professionalsService.lockById(
          transaction,
          input.professionalId,
        );
        if (professional.especialidad !== recitation.especialidad) {
          throw new BadRequestException(
            'Professional specialty does not match the recitation specialty.',
          );
        }

        const activeReservation = await transaction.reserva.findFirst({
          where: { recitacionId: recitation.id, estado: ReservaEstado.RESERVADA },
          select: { id: true },
        });
        if (activeReservation) {
          throw new ConflictException('The recitation already has an active reservation.');
        }

        await this.lockAgenda(transaction, professional.id);
        await assertAgendaSlotFree(transaction, professional.id, input.inicio, input.fin);

        const reservation = await transaction.reserva.create({
          data: {
            profesionalId: professional.id,
            recitacionId: recitation.id,
            inicio: input.inicio,
            fin: input.fin,
            estado: ReservaEstado.RESERVADA,
          },
        });
        await transaction.recitacion.update({
          where: { id: recitation.id },
          data: { reservaId: reservation.id },
        });

        return this.toReservationResponse(reservation);
      });
    } catch (error) {
      rethrowPrismaConflict(error, AGENDA_OVERLAP_MESSAGE);
    }
  }

  async cancel(reservationId: string) {
    return this.releaseTo(reservationId, ReservaEstado.CANCELADA);
  }

  async absent(reservationId: string) {
    return this.releaseTo(reservationId, ReservaEstado.AUSENTE);
  }

  async fulfill(reservationId: string) {
    try {
      return await this.prisma.client.$transaction(async (transaction) => {
        const reservation = await this.lockReservation(transaction, reservationId);
        if (!reservation.recitacionId) {
          throw new ConflictException('The reservation is not linked to a recitation.');
        }

        const recitation = await this.loadRecitation(transaction, reservation.recitacionId);
        const existing = await transaction.atencion.findFirst({
          where: { recitacionId: recitation.id },
          select: { id: true },
        });

        if (reservation.estado === ReservaEstado.RESERVADA) {
          await transaction.reserva.update({
            where: { id: reservation.id },
            data: { estado: ReservaEstado.CUMPLIDA },
          });
        } else if (reservation.estado !== ReservaEstado.CUMPLIDA || !existing) {
          throw new ConflictException('Only a reserved reservation can be fulfilled.');
        }

        if (existing) {
          const attention = await transaction.atencion.findUniqueOrThrow({
            where: { id: existing.id },
          });
          return this.toFulfillmentResponse(reservation.id, attention);
        }

        const [pending, journey] = await Promise.all([
          transaction.pendiente.findUnique({
            where: { id: recitation.pendienteId },
            select: { atencionOrigenId: true },
          }),
          transaction.recorrido.findUniqueOrThrow({
            where: { id: recitation.recorridoId },
            select: { postulanteId: true },
          }),
        ]);

        const attention = await transaction.atencion.create({
          data: {
            recorridoId: recitation.recorridoId,
            postulanteId: journey.postulanteId,
            especialidad: recitation.especialidad,
            evaluacionId: recitation.evaluacionId,
            profesionalId: reservation.profesionalId,
            estado: AtencionEstado.EN_ESPERA,
            atencionOrigenId: pending?.atencionOrigenId ?? null,
            recitacionId: recitation.id,
          },
        });

        return this.toFulfillmentResponse(reservation.id, attention);
      });
    } catch (error) {
      if (error instanceof ConflictException || error instanceof BadRequestException) {
        throw error;
      }
      rethrowPrismaConflict(error, 'A follow-up attention already exists for this recitation.');
    }
  }

  async reschedule(reservationId: string, input: RescheduleReservationInput) {
    try {
      return await this.prisma.client.$transaction(async (transaction) => {
        this.assertInterval(input.inicio, input.fin);

        const reservation = await this.lockReservation(transaction, reservationId);
        if (reservation.estado !== ReservaEstado.RESERVADA) {
          throw new ConflictException('Only a reserved reservation can be rescheduled.');
        }
        if (!reservation.recitacionId) {
          throw new ConflictException('The reservation is not linked to a recitation.');
        }

        const recitation = await this.loadRecitation(transaction, reservation.recitacionId);
        const professionalId = input.professionalId ?? reservation.profesionalId;
        const professional = await this.professionalsService.lockById(transaction, professionalId);
        if (professional.especialidad !== recitation.especialidad) {
          throw new BadRequestException(
            'Professional specialty does not match the recitation specialty.',
          );
        }

        await transaction.reserva.update({
          where: { id: reservation.id },
          data: { estado: ReservaEstado.REPROGRAMADA },
        });
        await this.lockAgenda(transaction, professional.id);
        await assertAgendaSlotFree(transaction, professional.id, input.inicio, input.fin);

        const created = await transaction.reserva.create({
          data: {
            profesionalId: professional.id,
            recitacionId: recitation.id,
            inicio: input.inicio,
            fin: input.fin,
            estado: ReservaEstado.RESERVADA,
            reservaAnteriorId: reservation.id,
          },
        });
        await transaction.recitacion.update({
          where: { id: recitation.id },
          data: { reservaId: created.id },
        });

        return this.toReservationResponse(created);
      });
    } catch (error) {
      rethrowPrismaConflict(error, AGENDA_OVERLAP_MESSAGE);
    }
  }

  private async releaseTo(reservationId: string, target: ReservaEstado) {
    return this.prisma.client.$transaction(async (transaction) => {
      const reservation = await this.lockReservation(transaction, reservationId);
      if (reservation.estado !== ReservaEstado.RESERVADA) {
        throw new ConflictException('Only a reserved reservation can be updated.');
      }

      const updated = await transaction.reserva.update({
        where: { id: reservation.id },
        data: { estado: target },
      });

      return this.toReservationResponse(updated);
    });
  }

  private assertInterval(inicio: Date, fin: Date): void {
    if (!(inicio instanceof Date) || Number.isNaN(inicio.getTime())) {
      throw new BadRequestException('inicio must be a valid ISO date.');
    }
    if (!(fin instanceof Date) || Number.isNaN(fin.getTime())) {
      throw new BadRequestException('fin must be a valid ISO date.');
    }
    if (inicio >= fin) {
      throw new BadRequestException('inicio must be earlier than fin.');
    }
  }

  private async loadRecitation(
    transaction: Prisma.TransactionClient,
    recitationId: string,
  ): Promise<RecitationLinks> {
    const recitation = await transaction.recitacion.findUnique({
      where: { id: recitationId },
      select: {
        id: true,
        recorridoId: true,
        evaluacionId: true,
        pendienteId: true,
        especialidad: true,
      },
    });

    if (!recitation) {
      throw new NotFoundException('Recitation not found.');
    }

    return recitation;
  }

  private async lockReservation(
    transaction: Prisma.TransactionClient,
    reservationId: string,
  ): Promise<LockedReservation> {
    const rows = await transaction.$queryRaw<LockedReservation[]>(
      Prisma.sql`SELECT "id", "profesionalId", "recitacionId", "inicio", "fin", "estado", "reservaAnteriorId"
                 FROM "Reserva" WHERE "id" = ${reservationId} FOR UPDATE`,
    );
    const reservation = rows[0];

    if (!reservation) {
      throw new NotFoundException('Reservation not found.');
    }

    return reservation;
  }

  private async lockAgenda(
    transaction: Prisma.TransactionClient,
    professionalId: string,
  ): Promise<void> {
    await transaction.$executeRaw(
      Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${professionalId})::bigint)`,
    );
  }

  private toReservationResponse(
    reservation:
      | LockedReservation
      | {
          id: string;
          profesionalId: string;
          recitacionId: string | null;
          inicio: Date;
          fin: Date;
          estado: ReservaEstado;
          reservaAnteriorId: string | null;
        },
  ) {
    return {
      id: reservation.id,
      professionalId: reservation.profesionalId,
      recitationId: reservation.recitacionId,
      start: reservation.inicio,
      end: reservation.fin,
      state: toReservationState(reservation.estado),
      previousReservationId: reservation.reservaAnteriorId,
    };
  }

  private toFulfillmentResponse(
    reservationId: string,
    attention: {
      id: string;
      estado: AtencionEstado;
      especialidad: Especialidad;
      evaluacionId: string | null;
      atencionOrigenId: string | null;
      recitacionId: string | null;
      profesionalId: string;
    },
  ) {
    return {
      reservationId,
      reservationState: toReservationState(ReservaEstado.CUMPLIDA),
      attention: {
        id: attention.id,
        state: toAttentionState(attention.estado),
        specialty: attention.especialidad,
        evaluationId: attention.evaluacionId,
        originAttentionId: attention.atencionOrigenId,
        recitationId: attention.recitacionId,
        professionalId: attention.profesionalId,
      },
    };
  }
}
