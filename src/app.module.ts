import { Module } from '@nestjs/common';

import { AgendaModule } from './agenda/agenda.module';
import { AppController } from './app.controller';
import { ApplicantsModule } from './applicants/applicants.module';
import { AttentionsModule } from './attentions/attentions.module';
import { DerivationsModule } from './derivations/derivations.module';
import { EvaluationsModule } from './evaluations/evaluations.module';
import { JourneysModule } from './journeys/journeys.module';
import { ProfessionalsModule } from './professionals/professionals.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    PrismaModule,
    ApplicantsModule,
    JourneysModule,
    AttentionsModule,
    ProfessionalsModule,
    EvaluationsModule,
    AgendaModule,
    DerivationsModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
