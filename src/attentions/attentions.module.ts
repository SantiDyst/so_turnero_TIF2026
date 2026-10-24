import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { ProfessionalsModule } from '../professionals/professionals.module';
import { AttentionAccessService } from './attention-access.service';
import { AttentionCommandService } from './attention-command.service';
import { AttentionsController } from './attentions.controller';

@Module({
  imports: [AuthModule, ProfessionalsModule],
  controllers: [AttentionsController],
  providers: [AttentionCommandService, AttentionAccessService],
  exports: [AttentionAccessService],
})
export class AttentionsModule {}
