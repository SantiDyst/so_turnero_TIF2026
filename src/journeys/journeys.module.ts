import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { JourneyAdminService } from './journey-admin.service';
import { JourneysController } from './journeys.controller';
import { QueueQueryService } from './queue-query.service';

@Module({
  imports: [AuthModule],
  controllers: [JourneysController],
  providers: [QueueQueryService, JourneyAdminService],
  exports: [QueueQueryService],
})
export class JourneysModule {}
