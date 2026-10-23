import { Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';

import { AptitudeService } from './aptitude.service';

@ApiTags('Closure')
@Controller('journeys')
export class AptitudeController {
  constructor(private readonly aptitudeService: AptitudeService) {}

  @Get(':id/closure-readiness')
  @ApiOperation({ summary: 'Read the closure readiness flags of a journey' })
  @ApiParam({ name: 'id', description: 'Journey id' })
  readiness(@Param('id') journeyId: string) {
    return this.aptitudeService.readiness(journeyId);
  }

  @Post(':id/close')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Close the journey and store its final aptitude' })
  @ApiParam({ name: 'id', description: 'Journey id' })
  close(@Param('id') journeyId: string) {
    return this.aptitudeService.close(journeyId);
  }
}
