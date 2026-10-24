import { Module } from '@nestjs/common';

import { AttentionsModule } from '../attentions/attentions.module';
import { AuthModule } from '../auth/auth.module';
import { EvaluationsController } from './evaluations.controller';
import { EvaluationsService } from './evaluations.service';

@Module({
  imports: [AuthModule, AttentionsModule],
  controllers: [EvaluationsController],
  providers: [EvaluationsService],
  exports: [EvaluationsService],
})
export class EvaluationsModule {}
