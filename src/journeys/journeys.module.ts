import { Module } from '@nestjs/common';

import { JourneysController } from './journeys.controller';
import { QueueQueryService } from './queue-query.service';

@Module({
  controllers: [JourneysController],
  providers: [QueueQueryService],
})
export class JourneysModule {}
