import { Module } from '@nestjs/common';

import { AgendaModule } from './agenda/agenda.module';
import { AppController } from './app.controller';
import { AptitudeModule } from './aptitude/aptitude.module';
import { ApplicantsModule } from './applicants/applicants.module';
import { AttentionsModule } from './attentions/attentions.module';
import { AuthModule } from './auth/auth.module';
import { CertificatesModule } from './certificates/certificates.module';
import { DerivationsModule } from './derivations/derivations.module';
import { EvaluationsModule } from './evaluations/evaluations.module';
import { JourneysModule } from './journeys/journeys.module';
import { MeModule } from './me/me.module';
import { ProfessionalsModule } from './professionals/professionals.module';
import { PrismaModule } from './prisma/prisma.module';
import { RegistrationModule } from './registration/registration.module';
import { ReportsModule } from './reports/reports.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    UsersModule,
    RegistrationModule,
    MeModule,
    ApplicantsModule,
    JourneysModule,
    AttentionsModule,
    ProfessionalsModule,
    EvaluationsModule,
    AgendaModule,
    DerivationsModule,
    AptitudeModule,
    ReportsModule,
    CertificatesModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
