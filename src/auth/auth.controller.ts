import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';

import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';
import type { AuthenticatedUser } from './auth.types';
import { CurrentUser } from './current-user.decorator';
import { SESSION_COOKIE, readSessionToken, sessionCookieOptions, sessionTtlMs } from './session';

interface LoginBody {
  email?: unknown;
  password?: unknown;
}

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Start a session with email and password' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['email', 'password'],
      properties: {
        email: { type: 'string', example: 'admin@example.com' },
        password: { type: 'string', example: 'change-me' },
      },
    },
  })
  async login(
    @Body() body: LoginBody,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const credentials = this.validateLogin(body);
    const result = await this.authService.login(
      credentials.email,
      credentials.password,
      request.headers['user-agent'],
    );

    response.cookie(SESSION_COOKIE, result.token, sessionCookieOptions(sessionTtlMs()));

    return { user: result.user, expiresAt: result.expiresAt };
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke the current session and clear the cookie' })
  async logout(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const token = readSessionToken(request);

    if (token) {
      await this.authService.logout(token);
    }

    response.clearCookie(SESSION_COOKIE, sessionCookieOptions());
  }

  @Get('me')
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'Read the authenticated user' })
  me(@CurrentUser() user: AuthenticatedUser) {
    return { user };
  }

  private validateLogin(body: LoginBody): { email: string; password: string } {
    const email = typeof body.email === 'string' ? body.email.trim() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    const missingFields = [
      email.length === 0 ? 'email' : null,
      password.length === 0 ? 'password' : null,
    ].filter((field): field is string => field !== null);

    if (missingFields.length > 0) {
      throw new BadRequestException({ message: 'Validation failed.', missingFields });
    }

    return { email, password };
  }
}
