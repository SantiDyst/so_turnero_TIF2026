import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { InformeEstado, RolUsuario } from '@prisma/client';

import { AttentionAccessService } from '../attentions/attention-access.service';
import { AuthGuard } from '../auth/auth.guard';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { requireProfessional } from '../professionals/professional-context';
import { InformeState } from '../shared/state-vocabulary';
import { ReportsService, SaveReportInput } from './reports.service';

interface SaveReportBody {
  observations?: unknown;
  state?: unknown;
  datos?: unknown;
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
@ApiBearerAuth()
@Controller()
export class ReportsController {
  constructor(
    private readonly reportsService: ReportsService,
    private readonly attentionAccessService: AttentionAccessService,
  ) {}

  @Put('attentions/:id/report')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(RolUsuario.PROFESIONAL)
  @ApiOperation({ summary: 'Create or update the report of an attention' })
  @ApiParam({ name: 'id', description: 'Attention id' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        observations: { type: 'string', example: 'Sin hallazgos relevantes.' },
        state: { type: 'string', enum: ['Pendiente', 'Completo'], default: 'Pendiente' },
        datos: {
          type: 'object',
          additionalProperties: true,
          nullable: true,
          description:
            'Specialty-specific structured fields. The journey read model exposes the schema for each report.',
        },
      },
    },
  })
  save(
    @Param('id') attentionId: string,
    @Body() body: SaveReportBody,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const input = this.validate(body);
    const professional = requireProfessional(user);

    return this.attentionAccessService.assertAttentionOwned(attentionId, professional.id).then(() =>
      this.reportsService.saveReport(attentionId, {
        ...input,
        professionalId: professional.id,
      }),
    );
  }

  @Get('journeys/:id/reports')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(RolUsuario.ADMIN, RolUsuario.PROFESIONAL)
  @ApiOperation({ summary: 'Read the three specialty reports of a journey' })
  @ApiParam({ name: 'id', description: 'Journey id' })
  list(@Param('id') journeyId: string) {
    return this.reportsService.listJourneyReports(journeyId);
  }

  private validate(body: SaveReportBody): Omit<SaveReportInput, 'professionalId'> {
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

    return { observations, state: estado, datos: body.datos };
  }
}
