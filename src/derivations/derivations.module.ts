import { Module } from '@nestjs/common';

import { DerivationsController } from './derivations.controller';
import { DerivationsService } from './derivations.service';

@Module({
  controllers: [DerivationsController],
  providers: [DerivationsService],
})
export class DerivationsModule {}
