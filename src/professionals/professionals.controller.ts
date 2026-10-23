import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { ProfessionalQueryService } from './professional-query.service';

@ApiTags('Professionals')
@Controller()
export class ProfessionalsController {
  constructor(private readonly professionalQueryService: ProfessionalQueryService) {}

  @Get('professionals')
  @ApiOperation({ summary: 'List professionals with their specialty and availability' })
  list() {
    return this.professionalQueryService.list();
  }
}
