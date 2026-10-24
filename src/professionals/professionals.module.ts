import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { ProfessionalQueryService } from './professional-query.service';
import { ProfessionalsController } from './professionals.controller';
import { ProfessionalsService } from './professionals.service';

@Module({
  imports: [AuthModule],
  controllers: [ProfessionalsController],
  providers: [ProfessionalsService, ProfessionalQueryService],
  exports: [ProfessionalsService],
})
export class ProfessionalsModule {}
