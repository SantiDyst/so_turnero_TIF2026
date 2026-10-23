import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBody, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';

import {
  CreateReservationInput,
  ReservationsService,
  RescheduleReservationInput,
} from './reservations.service';

interface CreateReservationBody {
  recitacionId?: unknown;
  professionalId?: unknown;
  inicio?: unknown;
  fin?: unknown;
}

interface RescheduleReservationBody {
  professionalId?: unknown;
  inicio?: unknown;
  fin?: unknown;
}

@ApiTags('Reservations')
@Controller()
export class ReservationsController {
  constructor(private readonly reservationsService: ReservationsService) {}

  @Post('reservations')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Reserve a protected agenda slot for a recitation' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['recitacionId', 'professionalId', 'inicio', 'fin'],
      properties: {
        recitacionId: { type: 'string' },
        professionalId: { type: 'string' },
        inicio: { type: 'string', format: 'date-time' },
        fin: { type: 'string', format: 'date-time' },
      },
    },
  })
  create(@Body() body: CreateReservationBody) {
    return this.reservationsService.create(this.validateCreate(body));
  }

  @Patch('reservations/:id/fulfill')
  @ApiOperation({ summary: 'Mark a reservation as fulfilled' })
  @ApiParam({ name: 'id', description: 'Reservation id' })
  fulfill(@Param('id') reservationId: string) {
    return this.reservationsService.fulfill(reservationId);
  }

  @Patch('reservations/:id/cancel')
  @ApiOperation({ summary: 'Cancel a reservation' })
  @ApiParam({ name: 'id', description: 'Reservation id' })
  cancel(@Param('id') reservationId: string) {
    return this.reservationsService.cancel(reservationId);
  }

  @Patch('reservations/:id/absent')
  @ApiOperation({ summary: 'Mark the applicant as absent for a reservation' })
  @ApiParam({ name: 'id', description: 'Reservation id' })
  absent(@Param('id') reservationId: string) {
    return this.reservationsService.absent(reservationId);
  }

  @Patch('reservations/:id/reschedule')
  @ApiOperation({ summary: 'Reschedule a reservation to a new slot' })
  @ApiParam({ name: 'id', description: 'Reservation id' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['inicio', 'fin'],
      properties: {
        professionalId: { type: 'string', nullable: true },
        inicio: { type: 'string', format: 'date-time' },
        fin: { type: 'string', format: 'date-time' },
      },
    },
  })
  reschedule(@Param('id') reservationId: string, @Body() body: RescheduleReservationBody) {
    return this.reservationsService.reschedule(reservationId, this.validateReschedule(body));
  }

  private validateCreate(body: CreateReservationBody): CreateReservationInput {
    const recitacionId = typeof body.recitacionId === 'string' ? body.recitacionId.trim() : '';
    if (recitacionId.length === 0) {
      throw new BadRequestException('recitacionId is required.');
    }

    const professionalId =
      typeof body.professionalId === 'string' ? body.professionalId.trim() : '';
    if (professionalId.length === 0) {
      throw new BadRequestException('professionalId is required.');
    }

    const inicio = this.parseDate(body.inicio, 'inicio');
    const fin = this.parseDate(body.fin, 'fin');
    if (inicio >= fin) {
      throw new BadRequestException('inicio must be earlier than fin.');
    }

    return { recitacionId, professionalId, inicio, fin };
  }

  private validateReschedule(body: RescheduleReservationBody): RescheduleReservationInput {
    if (
      body.professionalId !== undefined &&
      (typeof body.professionalId !== 'string' || body.professionalId.trim().length === 0)
    ) {
      throw new BadRequestException('professionalId must be a non-empty string.');
    }

    const inicio = this.parseDate(body.inicio, 'inicio');
    const fin = this.parseDate(body.fin, 'fin');
    if (inicio >= fin) {
      throw new BadRequestException('inicio must be earlier than fin.');
    }

    return {
      inicio,
      fin,
      professionalId:
        typeof body.professionalId === 'string' ? body.professionalId.trim() : undefined,
    };
  }

  private parseDate(value: unknown, field: string): Date {
    if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
      throw new BadRequestException(`${field} must be a valid ISO date.`);
    }

    return new Date(value);
  }
}
