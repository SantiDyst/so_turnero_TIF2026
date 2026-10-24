import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RolUsuario } from '@prisma/client';

import { AuthGuard } from '../auth/auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { ProfessionalQueryService } from './professional-query.service';

@ApiTags('Professionals')
@ApiBearerAuth()
@Controller()
export class ProfessionalsController {
  constructor(private readonly professionalQueryService: ProfessionalQueryService) {}

  @Get('professionals')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(RolUsuario.ADMIN)
  @ApiOperation({ summary: 'List professionals with their specialty and availability' })
  list() {
    return this.professionalQueryService.list();
  }
}
