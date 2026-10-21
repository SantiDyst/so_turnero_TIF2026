import { Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';

import { AptitudeService } from './aptitude.service';

@Controller('journeys')
export class AptitudeController {
  constructor(private readonly aptitudeService: AptitudeService) {}

  @Get(':id/closure-readiness')
  readiness(@Param('id') journeyId: string) {
    return this.aptitudeService.readiness(journeyId);
  }

  @Post(':id/close')
  @HttpCode(HttpStatus.OK)
  close(@Param('id') journeyId: string) {
    return this.aptitudeService.close(journeyId);
  }
}
