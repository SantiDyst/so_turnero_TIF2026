import { Module } from '@nestjs/common';

import { ProfessionalsModule } from '../professionals/professionals.module';
import { AttentionCommandService } from './attention-command.service';
import { AttentionsController } from './attentions.controller';

@Module({
  imports: [ProfessionalsModule],
  controllers: [AttentionsController],
  providers: [AttentionCommandService],
})
export class AttentionsModule {}
