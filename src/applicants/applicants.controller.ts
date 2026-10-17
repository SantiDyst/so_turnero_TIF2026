import { BadRequestException, Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';

import { RegisterApplicantInput, RegistrationService } from './registration.service';

@Controller('applicants')
export class ApplicantsController {
  constructor(private readonly registrationService: RegistrationService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
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

    return {
      nombre: body.nombre!.trim(),
      apellido: body.apellido!.trim(),
      dni: body.dni!.trim(),
    };
  }
}
