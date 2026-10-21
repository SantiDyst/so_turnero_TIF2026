import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';

import {
  RecitationsService,
  ScheduleRecitationInput,
} from './recitations.service';

interface ScheduleRecitationBody {
  pendingId?: unknown;
  evaluationId?: unknown;
  professionalId?: unknown;
  inicio?: unknown;
  fin?: unknown;
}

@Controller()
export class RecitationsController {
  constructor(private readonly recitationsService: RecitationsService) {}

  @Post('journeys/:id/recitations')
  @HttpCode(HttpStatus.CREATED)
  schedule(@Param('id') journeyId: string, @Body() body: ScheduleRecitationBody) {
    return this.recitationsService.schedule(journeyId, this.validate(body));
  }

  private validate(body: ScheduleRecitationBody): ScheduleRecitationInput {
    const pendingId = typeof body.pendingId === 'string' ? body.pendingId.trim() : '';
    if (pendingId.length === 0) {
      throw new BadRequestException('pendingId is required.');
    }

    const professionalId =
      typeof body.professionalId === 'string' ? body.professionalId.trim() : '';
    if (professionalId.length === 0) {
      throw new BadRequestException('professionalId is required.');
    }

    if (
      body.evaluationId !== undefined &&
      (typeof body.evaluationId !== 'string' || body.evaluationId.trim().length === 0)
    ) {
      throw new BadRequestException('evaluationId must be a non-empty string.');
    }

    const inicio = this.parseDate(body.inicio, 'inicio');
    const fin = this.parseDate(body.fin, 'fin');
    if (inicio >= fin) {
      throw new BadRequestException('inicio must be earlier than fin.');
    }

    return {
      pendingId,
      evaluationId:
        typeof body.evaluationId === 'string' ? body.evaluationId.trim() : undefined,
      professionalId,
      inicio,
      fin,
    };
  }

  private parseDate(value: unknown, field: string): Date {
    if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
      throw new BadRequestException(`${field} must be a valid ISO date.`);
    }

    return new Date(value);
  }
}
