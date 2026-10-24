import { Controller, Get, HttpCode, HttpStatus, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { RolUsuario } from '@prisma/client';

import { AuthGuard } from '../auth/auth.guard';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { requireClinicalProfessional } from '../professionals/professional-context';
import { AptitudeService } from './aptitude.service';

@ApiTags('Closure')
@ApiBearerAuth()
@Controller('journeys')
export class AptitudeController {
  constructor(private readonly aptitudeService: AptitudeService) {}

  @Get(':id/closure-readiness')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(RolUsuario.ADMIN, RolUsuario.PROFESIONAL)
  @ApiOperation({ summary: 'Read the closure readiness flags of a journey' })
  @ApiParam({ name: 'id', description: 'Journey id' })
  readiness(@Param('id') journeyId: string) {
    return this.aptitudeService.readiness(journeyId);
  }

  @Post(':id/close')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(RolUsuario.PROFESIONAL)
  @ApiOperation({ summary: 'Close the journey and store its final aptitude' })
  @ApiParam({ name: 'id', description: 'Journey id' })
  close(@Param('id') journeyId: string, @CurrentUser() user: AuthenticatedUser) {
    requireClinicalProfessional(user);

    return this.aptitudeService.close(journeyId);
  }
}
