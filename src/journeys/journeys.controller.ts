import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { RolUsuario } from '@prisma/client';

import { AuthGuard } from '../auth/auth.guard';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { requireProfessional } from '../professionals/professional-context';
import { AnnulJourneyInput, JourneyAdminService } from './journey-admin.service';
import { QueueQueryService } from './queue-query.service';

interface AnnulJourneyBody {
  motivo?: unknown;
}

@ApiTags('Journeys')
@ApiBearerAuth()
@Controller()
export class JourneysController {
  constructor(
    private readonly queueQueryService: QueueQueryService,
    private readonly journeyAdminService: JourneyAdminService,
  ) {}

  @Get('queue')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(RolUsuario.ADMIN, RolUsuario.PROFESIONAL)
  @ApiOperation({ summary: 'List journeys waiting for attention' })
  listQueue(@CurrentUser() user: AuthenticatedUser) {
    if (user.rol === RolUsuario.PROFESIONAL) {
      const professional = requireProfessional(user);

      return this.queueQueryService.listQueue({
        professionalId: professional.id,
        specialty: professional.specialty,
      });
    }

    return this.queueQueryService.listQueue();
  }

  @Get('journeys/overview')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(RolUsuario.ADMIN)
  @ApiOperation({ summary: 'List recent journeys with their progress and final aptitude' })
  listOverview() {
    return this.queueQueryService.listOverview();
  }

  @Get('journeys')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(RolUsuario.ADMIN, RolUsuario.PROFESIONAL)
  @ApiOperation({ summary: 'Read one journey by applicant id or attention number' })
  @ApiQuery({ name: 'applicantId', required: false })
  @ApiQuery({ name: 'attentionNumber', required: false, example: 'AT-0001' })
  findJourney(
    @CurrentUser() user: AuthenticatedUser,
    @Query('applicantId') applicantId?: string,
    @Query('attentionNumber') attentionNumber?: string,
  ) {
    const professional = user.rol === RolUsuario.PROFESIONAL ? requireProfessional(user) : null;
    const viewer = professional
      ? { professionalId: professional.id, specialty: professional.specialty }
      : undefined;

    return this.queueQueryService.findJourney(applicantId, attentionNumber, viewer);
  }

  @Post('journeys/:id/annul')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(RolUsuario.ADMIN)
  @ApiOperation({ summary: 'Annul a journey, keeping its data for traceability' })
  @ApiParam({ name: 'id', description: 'Journey id' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['motivo'],
      properties: { motivo: { type: 'string', example: 'El postulante desistió.' } },
    },
  })
  annul(
    @Param('id') journeyId: string,
    @Body() body: AnnulJourneyBody,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.journeyAdminService.annul(journeyId, this.validateAnnulment(body), user.id);
  }

  @Delete('journeys/:id')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(RolUsuario.ADMIN)
  @ApiOperation({ summary: 'Delete a journey that has no recorded attentions' })
  @ApiParam({ name: 'id', description: 'Journey id' })
  remove(@Param('id') journeyId: string) {
    return this.journeyAdminService.remove(journeyId);
  }

  private validateAnnulment(body: AnnulJourneyBody): AnnulJourneyInput {
    const motivo = typeof body.motivo === 'string' ? body.motivo.trim() : '';

    if (motivo.length === 0) {
      throw new BadRequestException('motivo is required.');
    }

    return { motivo };
  }
}
