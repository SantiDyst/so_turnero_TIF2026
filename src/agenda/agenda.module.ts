import { Module } from '@nestjs/common';

import { ProfessionalsModule } from '../professionals/professionals.module';
import { RecitationsController } from './recitations.controller';
import { RecitationsService } from './recitations.service';

@Module({
  imports: [ProfessionalsModule],
  controllers: [RecitationsController],
  providers: [RecitationsService],
})
export class AgendaModule {}
