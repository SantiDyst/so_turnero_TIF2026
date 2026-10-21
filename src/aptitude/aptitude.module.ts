import { Module } from '@nestjs/common';

import { AptitudeController } from './aptitude.controller';
import { AptitudeService } from './aptitude.service';

@Module({
  controllers: [AptitudeController],
  providers: [AptitudeService],
  exports: [AptitudeService],
})
export class AptitudeModule {}
