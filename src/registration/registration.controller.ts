import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';

import { AuthService } from '../auth/auth.service';
import { MIN_PASSWORD_LENGTH } from '../auth/password';
import { SESSION_COOKIE, sessionCookieOptions, sessionTtlMs } from '../auth/session';
import { RegistrationService, SelfRegistrationInput } from '../applicants/registration.service';
import { isValidEmail, normalizeEmail } from '../shared/email';

interface RegisterBody {
  nombre?: unknown;
  apellido?: unknown;
  dni?: unknown;
  email?: unknown;
  password?: unknown;
  empresa?: unknown;
  puesto?: unknown;
}

@ApiTags('Registration')
@Controller('register')
export class RegistrationController {
  constructor(
    private readonly registrationService: RegistrationService,
    private readonly authService: AuthService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Self-register an applicant and open a session' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['nombre', 'apellido', 'dni', 'email', 'password'],
      properties: {
        nombre: { type: 'string', example: 'Ada' },
        apellido: { type: 'string', example: 'Lovelace' },
        dni: { type: 'string', example: '12345678' },
        email: { type: 'string', example: 'ada@example.com' },
        password: { type: 'string', example: 'change-me-please' },
        empresa: { type: 'string', nullable: true, example: 'Ministerio de Salud' },
        puesto: { type: 'string', nullable: true, example: 'Administrativo' },
      },
    },
  })
  async register(
    @Body() body: RegisterBody,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const input = this.validate(body);
    const result = await this.registrationService.registerWithAccount(input);
    const session = await this.authService.startSession(
      result.user.id,
      request.headers['user-agent'],
    );

    response.cookie(SESSION_COOKIE, session.token, sessionCookieOptions(sessionTtlMs()));

    return {
      user: result.user,
      applicant: result.applicant,
      journey: result.journey,
      expiresAt: session.expiresAt,
    };
  }

  private validate(body: RegisterBody): SelfRegistrationInput {
    const nombre = typeof body.nombre === 'string' ? body.nombre.trim() : '';
    const apellido = typeof body.apellido === 'string' ? body.apellido.trim() : '';
    const dni = typeof body.dni === 'string' ? body.dni.trim() : '';
    const email = typeof body.email === 'string' ? normalizeEmail(body.email) : '';
    const password = typeof body.password === 'string' ? body.password : '';

    const missingFields = [
      nombre.length === 0 ? 'nombre' : null,
      apellido.length === 0 ? 'apellido' : null,
      dni.length === 0 ? 'dni' : null,
      email.length === 0 ? 'email' : null,
      password.length === 0 ? 'password' : null,
    ].filter((field): field is string => field !== null);

    if (missingFields.length > 0) {
      throw new BadRequestException({ message: 'Validation failed.', missingFields });
    }
    if (!isValidEmail(email)) {
      throw new BadRequestException('email must be a valid address.');
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      throw new BadRequestException(`password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
    }

    const empresa = typeof body.empresa === 'string' ? body.empresa.trim() : '';
    const puesto = typeof body.puesto === 'string' ? body.puesto.trim() : '';

    return {
      nombre,
      apellido,
      dni,
      email,
      password,
      empresa: empresa || null,
      puesto: puesto || null,
    };
  }
}
