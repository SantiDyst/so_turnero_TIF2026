import { Controller, Get, NotFoundException, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RolUsuario } from '@prisma/client';

import { AuthGuard } from '../auth/auth.guard';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { QueueQueryService } from '../journeys/queue-query.service';

@ApiTags('Me')
@ApiBearerAuth()
@Controller('me')
@UseGuards(AuthGuard, RolesGuard)
@Roles(RolUsuario.USER)
export class MeController {
  constructor(private readonly queueQueryService: QueueQueryService) {}

  @Get('journeys')
  @ApiOperation({ summary: 'Read the journey of the authenticated applicant' })
  journey(@CurrentUser() user: AuthenticatedUser) {
    if (!user.postulanteId) {
      throw new NotFoundException('The user has no applicant record.');
    }

    return this.queueQueryService.findJourney(user.postulanteId);
  }
}
