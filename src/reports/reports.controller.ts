import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Put,
} from '@nestjs/common';
import { ApiBody, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { InformeEstado } from '@prisma/client';

import { InformeState } from '../shared/state-vocabulary';
import { ReportsService, SaveReportInput } from './reports.service';

interface SaveReportBody {
  observations?: unknown;
  state?: unknown;
  professionalId?: unknown;
}

function toInformeEstado(value: unknown): InformeEstado {
  if (value === InformeState.pending) {
    return InformeEstado.PENDIENTE;
  }
  if (value === InformeState.complete) {
    return InformeEstado.COMPLETO;
  }

  throw new BadRequestException('state must be Pendiente or Completo.');
}

@ApiTags('Reports')
@Controller()
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Put('attentions/:id/report')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Create or update the report of an attention' })
  @ApiParam({ name: 'id', description: 'Attention id' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        observations: { type: 'string', example: 'Sin hallazgos relevantes.' },
        state: { type: 'string', enum: ['Pendiente', 'Completo'], default: 'Pendiente' },
        professionalId: { type: 'string', nullable: true },
      },
    },
  })
  save(@Param('id') attentionId: string, @Body() body: SaveReportBody) {
    return this.reportsService.saveReport(attentionId, this.validate(body));
  }

  @Get('journeys/:id/reports')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Read the three specialty reports of a journey' })
  @ApiParam({ name: 'id', description: 'Journey id' })
  list(@Param('id') journeyId: string) {
    return this.reportsService.listJourneyReports(journeyId);
  }

  private validate(body: SaveReportBody): SaveReportInput {
    let observations = '';
    if (body.observations !== undefined && body.observations !== null) {
      if (typeof body.observations !== 'string') {
        throw new BadRequestException('observations must be a string.');
      }
      observations = body.observations.trim();
    }

    const state =
      body.state === undefined || body.state === null ? InformeState.pending : body.state;
    const estado = toInformeEstado(state);

    if (estado === InformeEstado.COMPLETO && observations.length === 0) {
      throw new BadRequestException('A Completo report requires non-empty observations.');
    }

    let professionalId: string | undefined;
    if (body.professionalId !== undefined && body.professionalId !== null) {
      if (typeof body.professionalId !== 'string' || body.professionalId.trim().length === 0) {
        throw new BadRequestException('professionalId must be a non-empty string.');
      }
      professionalId = body.professionalId.trim();
    }

    return { observations, state: estado, professionalId };
  }
}
