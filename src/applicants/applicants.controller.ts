import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RolUsuario } from '@prisma/client';

import { AuthGuard } from '../auth/auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { RegisterApplicantInput, RegistrationService } from './registration.service';

@ApiTags('Applicants')
@ApiBearerAuth()
@Controller('applicants')
@UseGuards(AuthGuard, RolesGuard)
@Roles(RolUsuario.ADMIN)
export class ApplicantsController {
  constructor(private readonly registrationService: RegistrationService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Register an applicant and create the journey with its three evaluations',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['nombre', 'apellido', 'dni'],
      properties: {
        nombre: { type: 'string', example: 'Ada' },
        apellido: { type: 'string', example: 'Lovelace' },
        dni: { type: 'string', example: '12345678' },
        empresa: { type: 'string', nullable: true, example: 'Ministerio de Salud' },
        puesto: { type: 'string', nullable: true, example: 'Administrativo' },
      },
    },
  })
  async register(@Body() body: Partial<RegisterApplicantInput>) {
    const input = this.validateRegistration(body);
    return this.registrationService.register(input);
  }

  private validateRegistration(body: Partial<RegisterApplicantInput>): RegisterApplicantInput {
    const errors = ['nombre', 'apellido', 'dni'].filter((field) => {
      const value = body[field as keyof RegisterApplicantInput];
      return typeof value !== 'string' || value.trim().length === 0;
    });

    if (errors.length > 0) {
      throw new BadRequestException({
        message: 'Validation failed.',
        missingFields: errors,
      });
    }

    const empresa = typeof body.empresa === 'string' ? body.empresa.trim() : '';
    const puesto = typeof body.puesto === 'string' ? body.puesto.trim() : '';

    return {
      nombre: body.nombre!.trim(),
      apellido: body.apellido!.trim(),
      dni: body.dni!.trim(),
      empresa: empresa || null,
      puesto: puesto || null,
    };
  }
}
