import { Controller, Get, Query } from '@nestjs/common';

import { QueueQueryService } from './queue-query.service';

@Controller()
export class JourneysController {
  constructor(private readonly queueQueryService: QueueQueryService) {}

  @Get('queue')
  listQueue() {
    return this.queueQueryService.listQueue();
  }

  @Get('journeys')
  findJourney(
    @Query('applicantId') applicantId?: string,
    @Query('attentionNumber') attentionNumber?: string,
  ) {
    return this.queueQueryService.findJourney(applicantId, attentionNumber);
  }
}
