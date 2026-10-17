import { Module } from '@nestjs/common';

import { ApplicantsController } from './applicants.controller';
import { RegistrationService } from './registration.service';

@Module({
  controllers: [ApplicantsController],
  providers: [RegistrationService],
})
export class ApplicantsModule {}
