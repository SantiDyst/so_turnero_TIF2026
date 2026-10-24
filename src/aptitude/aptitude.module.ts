import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { AptitudeController } from './aptitude.controller';
import { AptitudeService } from './aptitude.service';

@Module({
  imports: [AuthModule],
  controllers: [AptitudeController],
  providers: [AptitudeService],
  exports: [AptitudeService],
})
export class AptitudeModule {}
