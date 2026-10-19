import { Module } from '@nestjs/common';

import { ProfessionalsModule } from '../professionals/professionals.module';
import { RecitationsController } from './recitations.controller';
import { RecitationsService } from './recitations.service';
import { ReservationsController } from './reservations.controller';
import { ReservationsService } from './reservations.service';

@Module({
  imports: [ProfessionalsModule],
  controllers: [RecitationsController, ReservationsController],
  providers: [RecitationsService, ReservationsService],
})
export class AgendaModule {}
