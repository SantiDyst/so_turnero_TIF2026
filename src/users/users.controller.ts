import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { RolUsuario } from '@prisma/client';

import { AuthGuard } from '../auth/auth.guard';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { MIN_PASSWORD_LENGTH } from '../auth/password';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { isValidEmail, normalizeEmail } from '../shared/email';
import { isSupportedSpecialty } from '../shared/state-vocabulary';
import { CreateUserInput, UsersService } from './users.service';

interface CreateUserBody {
  nombre?: unknown;
  email?: unknown;
  password?: unknown;
  rol?: unknown;
  specialty?: unknown;
  professionalId?: unknown;
}

interface ChangePasswordBody {
  password?: unknown;
}

@ApiTags('Users')
@ApiBearerAuth()
@Controller('users')
@UseGuards(AuthGuard, RolesGuard)
@Roles(RolUsuario.ADMIN)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @ApiOperation({ summary: 'List every user account with its role and links' })
  list() {
    return this.usersService.list();
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create an admin or professional user account' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['nombre', 'email', 'password', 'rol'],
      properties: {
        nombre: { type: 'string', example: 'Dra. Ana Pérez' },
        email: { type: 'string', example: 'ana@example.com' },
        password: { type: 'string', example: 'change-me-please' },
        rol: { type: 'string', enum: ['ADMIN', 'PROFESIONAL'] },
        specialty: {
          type: 'string',
          enum: ['BIOQUIMICA', 'CLINICA_MEDICA', 'PSICOLOGIA'],
          nullable: true,
          description: 'Creates a new professional with this specialty',
        },
        professionalId: {
          type: 'string',
          nullable: true,
          description: 'Links an existing professional without an account',
        },
      },
    },
  })
  create(@Body() body: CreateUserBody) {
    return this.usersService.create(this.validateCreate(body));
  }

  @Patch(':id/deactivate')
  @ApiOperation({ summary: 'Deactivate an account and revoke its sessions' })
  @ApiParam({ name: 'id', description: 'User id' })
  deactivate(@Param('id') userId: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.usersService.deactivate(actor.id, userId);
  }

  @Patch(':id/activate')
  @ApiOperation({ summary: 'Reactivate a deactivated account' })
  @ApiParam({ name: 'id', description: 'User id' })
  activate(@Param('id') userId: string) {
    return this.usersService.activate(userId);
  }

  @Patch(':id/password')
  @ApiOperation({ summary: 'Reset a password and revoke the user sessions' })
  @ApiParam({ name: 'id', description: 'User id' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['password'],
      properties: { password: { type: 'string', example: 'new-password' } },
    },
  })
  changePassword(@Param('id') userId: string, @Body() body: ChangePasswordBody) {
    return this.usersService.changePassword(userId, this.validatePassword(body));
  }

  private validateCreate(body: CreateUserBody): CreateUserInput {
    const nombre = typeof body.nombre === 'string' ? body.nombre.trim() : '';
    const email = typeof body.email === 'string' ? normalizeEmail(body.email) : '';
    const password = typeof body.password === 'string' ? body.password : '';
    const rol = typeof body.rol === 'string' ? body.rol : '';

    const missingFields = [
      nombre.length === 0 ? 'nombre' : null,
      email.length === 0 ? 'email' : null,
      password.length === 0 ? 'password' : null,
      rol.length === 0 ? 'rol' : null,
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

    if (rol === RolUsuario.ADMIN) {
      if (body.specialty !== undefined || body.professionalId !== undefined) {
        throw new BadRequestException('An admin user cannot have a professional link.');
      }

      return { nombre, email, password, rol: RolUsuario.ADMIN };
    }

    if (rol !== RolUsuario.PROFESIONAL) {
      throw new BadRequestException('rol must be ADMIN or PROFESIONAL.');
    }

    const specialty = typeof body.specialty === 'string' ? body.specialty.trim() : '';
    const professionalId =
      typeof body.professionalId === 'string' ? body.professionalId.trim() : '';

    if (specialty.length > 0 && professionalId.length > 0) {
      throw new BadRequestException('Provide either specialty or professionalId, not both.');
    }
    if (specialty.length === 0 && professionalId.length === 0) {
      throw new BadRequestException('A professional user needs specialty or professionalId.');
    }
    if (professionalId.length > 0) {
      return { nombre, email, password, rol: RolUsuario.PROFESIONAL, professionalId };
    }
    if (!isSupportedSpecialty(specialty)) {
      throw new BadRequestException('specialty must be BIOQUIMICA, CLINICA_MEDICA, or PSICOLOGIA.');
    }

    return { nombre, email, password, rol: RolUsuario.PROFESIONAL, specialty };
  }

  private validatePassword(body: ChangePasswordBody): string {
    const password = typeof body.password === 'string' ? body.password : '';

    if (password.length < MIN_PASSWORD_LENGTH) {
      throw new BadRequestException(`password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
    }

    return password;
  }
}
