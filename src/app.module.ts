import { Module } from '@nestjs/common';

import { AppController } from './app.controller';
import { ApplicantsModule } from './applicants/applicants.module';
import { AttentionsModule } from './attentions/attentions.module';
import { JourneysModule } from './journeys/journeys.module';
import { ProfessionalsModule } from './professionals/professionals.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [PrismaModule, ApplicantsModule, JourneysModule, AttentionsModule, ProfessionalsModule],
  controllers: [AppController],
})
export class AppModule {}
