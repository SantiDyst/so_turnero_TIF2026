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
} from '@nestjs/common';
import { ApiBody, ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';

import { AnnulJourneyInput, JourneyAdminService } from './journey-admin.service';
import { QueueQueryService } from './queue-query.service';

interface AnnulJourneyBody {
  motivo?: unknown;
}

@ApiTags('Journeys')
@Controller()
export class JourneysController {
  constructor(
    private readonly queueQueryService: QueueQueryService,
    private readonly journeyAdminService: JourneyAdminService,
  ) {}

  @Get('queue')
  @ApiOperation({ summary: 'List journeys waiting for attention' })
  listQueue() {
    return this.queueQueryService.listQueue();
  }

  @Get('journeys/overview')
  @ApiOperation({ summary: 'List recent journeys with their progress and final aptitude' })
  listOverview() {
    return this.queueQueryService.listOverview();
  }

  @Get('journeys')
  @ApiOperation({ summary: 'Read one journey by applicant id or attention number' })
  @ApiQuery({ name: 'applicantId', required: false })
  @ApiQuery({ name: 'attentionNumber', required: false, example: 'AT-0001' })
  findJourney(
    @Query('applicantId') applicantId?: string,
    @Query('attentionNumber') attentionNumber?: string,
  ) {
    return this.queueQueryService.findJourney(applicantId, attentionNumber);
  }

  @Post('journeys/:id/annul')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Annul a journey, keeping its data for traceability' })
  @ApiParam({ name: 'id', description: 'Journey id' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['motivo'],
      properties: { motivo: { type: 'string', example: 'El postulante desistió.' } },
    },
  })
  annul(@Param('id') journeyId: string, @Body() body: AnnulJourneyBody) {
    return this.journeyAdminService.annul(journeyId, this.validateAnnulment(body));
  }

  @Delete('journeys/:id')
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
