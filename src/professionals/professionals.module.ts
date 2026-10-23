import { Module } from '@nestjs/common';

import { ProfessionalQueryService } from './professional-query.service';
import { ProfessionalsController } from './professionals.controller';
import { ProfessionalsService } from './professionals.service';

@Module({
  controllers: [ProfessionalsController],
  providers: [ProfessionalsService, ProfessionalQueryService],
  exports: [ProfessionalsService],
})
export class ProfessionalsModule {}
