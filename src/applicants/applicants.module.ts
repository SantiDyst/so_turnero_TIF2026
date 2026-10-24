import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { ApplicantsController } from './applicants.controller';
import { RegistrationService } from './registration.service';

@Module({
  imports: [AuthModule],
  controllers: [ApplicantsController],
  providers: [RegistrationService],
  exports: [RegistrationService],
})
export class ApplicantsModule {}
