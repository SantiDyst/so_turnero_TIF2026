import { Controller, Get } from '@nestjs/common';

import { ProfessionalQueryService } from './professional-query.service';

@Controller()
export class ProfessionalsController {
  constructor(private readonly professionalQueryService: ProfessionalQueryService) {}

  @Get('professionals')
  list() {
    return this.professionalQueryService.list();
  }
}
