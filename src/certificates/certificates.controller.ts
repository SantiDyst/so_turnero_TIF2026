import { Controller, Get, HttpStatus, Param, Post, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { RolUsuario } from '@prisma/client';
import { Response } from 'express';

import { AuthGuard } from '../auth/auth.guard';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { requireClinicalProfessional } from '../professionals/professional-context';
import { CertificatesService } from './certificates.service';

@ApiTags('Certificates')
@ApiBearerAuth()
@Controller()
export class CertificatesController {
  constructor(private readonly certificatesService: CertificatesService) {}

  @Post('journeys/:id/certificate')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(RolUsuario.PROFESIONAL)
  @ApiOperation({
    summary: 'Issue the final certificate (idempotent: 201 on first issue, 200 afterwards)',
  })
  @ApiParam({ name: 'id', description: 'Journey id' })
  async issue(
    @Param('id') journeyId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: true }) response: Response,
  ) {
    const professional = requireClinicalProfessional(user);
    const result = await this.certificatesService.issue(journeyId, {
      professionalId: professional.id,
    });
    response.status(result.created ? HttpStatus.CREATED : HttpStatus.OK);

    return result.certificate;
  }

  @Get('journeys/:id/certificate')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(RolUsuario.ADMIN, RolUsuario.PROFESIONAL)
  @ApiOperation({ summary: 'Read the issued certificate of a journey' })
  @ApiParam({ name: 'id', description: 'Journey id' })
  read(@Param('id') journeyId: string) {
    return this.certificatesService.read(journeyId);
  }

  @Get('certificates/public/:token')
  @ApiOperation({ summary: 'Read a certificate through its public share token' })
  @ApiParam({ name: 'token', description: 'Opaque certificate token' })
  readPublic(@Param('token') token: string) {
    return this.certificatesService.readPublic(token);
  }
}
