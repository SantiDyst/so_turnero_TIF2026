import { Module } from '@nestjs/common';

import { ApplicantsModule } from '../applicants/applicants.module';
import { AuthModule } from '../auth/auth.module';
import { RegistrationController } from './registration.controller';

@Module({
  imports: [AuthModule, ApplicantsModule],
  controllers: [RegistrationController],
})
export class RegistrationModule {}
