import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { JourneysModule } from '../journeys/journeys.module';
import { MeController } from './me.controller';

@Module({
  imports: [AuthModule, JourneysModule],
  controllers: [MeController],
})
export class MeModule {}
