import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';

import { QueueQueryService } from './queue-query.service';

@ApiTags('Journeys')
@Controller()
export class JourneysController {
  constructor(private readonly queueQueryService: QueueQueryService) {}

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
}
