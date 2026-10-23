import { Module } from '@nestjs/common';

import { JourneyAdminService } from './journey-admin.service';
import { JourneysController } from './journeys.controller';
import { QueueQueryService } from './queue-query.service';

@Module({
  controllers: [JourneysController],
  providers: [QueueQueryService, JourneyAdminService],
})
export class JourneysModule {}
