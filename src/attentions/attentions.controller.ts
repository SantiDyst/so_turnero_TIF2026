import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { AtencionEstado, ResultadoEspecialidad, RolUsuario } from '@prisma/client';

import { AuthGuard } from '../auth/auth.guard';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { requireProfessional } from '../professionals/professional-context';
import { AttentionState, isSupportedSpecialty } from '../shared/state-vocabulary';
import { AttentionAccessService } from './attention-access.service';
import {
  AttentionCommandService,
  CompleteAttentionInput,
  FinalizeAttentionInput,
  StartAttentionInput,
} from './attention-command.service';

interface StartAttentionBody {
  specialty?: unknown;
}

interface FinalizeAttentionBody {
  state?: unknown;
}

interface CompleteAttentionBody {
  observations?: unknown;
  datos?: unknown;
  result?: unknown;
}

@ApiTags('Attentions')
@ApiBearerAuth()
@Controller()
@UseGuards(AuthGuard, RolesGuard)
@Roles(RolUsuario.PROFESIONAL)
export class AttentionsController {
  constructor(
    private readonly attentionCommandService: AttentionCommandService,
    private readonly attentionAccessService: AttentionAccessService,
  ) {}

  @Post('journeys/:id/attentions')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Start an attention for the authenticated professional and a specialty',
  })
  @ApiParam({ name: 'id', description: 'Journey id' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['specialty'],
      properties: {
        specialty: {
          type: 'string',
          enum: ['BIOQUIMICA', 'CLINICA_MEDICA', 'PSICOLOGIA'],
        },
      },
    },
  })
  start(
    @Param('id') journeyId: string,
    @Body() body: StartAttentionBody,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const professional = requireProfessional(user);

    return this.attentionCommandService.start(journeyId, {
      ...this.validateStart(body),
      professionalId: professional.id,
    });
  }

  @Patch('attentions/:id/finalize')
  @ApiOperation({ summary: 'Finalize an active attention as Finalizada or Pendiente' })
  @ApiParam({ name: 'id', description: 'Attention id' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['state'],
      properties: { state: { type: 'string', enum: ['Finalizada', 'Pendiente'] } },
    },
  })
  finalize(
    @Param('id') attentionId: string,
    @Body() body: FinalizeAttentionBody,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const input = this.validateFinalize(body);
    const professional = requireProfessional(user);

    return this.attentionAccessService
      .assertAttentionOwned(attentionId, professional.id)
      .then(() => this.attentionCommandService.finalize(attentionId, input));
  }

  @Patch('attentions/:id/complete')
  @ApiOperation({
    summary: 'Save the report and result, complete the evaluation and finalize the attention',
  })
  @ApiParam({ name: 'id', description: 'Attention id' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['observations'],
      properties: {
        observations: {
          type: 'string',
          example: 'Sin hallazgos relevantes.',
          description: 'Report conclusion. Required to close the attention.',
        },
        datos: {
          type: 'object',
          additionalProperties: true,
          nullable: true,
          description: 'Specialty-specific structured report fields.',
        },
        result: {
          type: 'string',
          nullable: true,
          enum: ['APTO_PLENO', 'APTO_CONDICIONAL', 'NO_APTO'],
          description: 'Required for CLINICA_MEDICA and PSICOLOGIA.',
        },
      },
    },
  })
  complete(
    @Param('id') attentionId: string,
    @Body() body: CompleteAttentionBody,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const input = this.validateComplete(body);
    const professional = requireProfessional(user);

    return this.attentionAccessService
      .assertAttentionOwned(attentionId, professional.id)
      .then(() => this.attentionCommandService.completeAndFinalize(attentionId, input));
  }

  private validateStart(body: StartAttentionBody): Omit<StartAttentionInput, 'professionalId'> {
    const specialty = typeof body.specialty === 'string' ? body.specialty.trim() : '';

    if (!isSupportedSpecialty(specialty)) {
      throw new BadRequestException('specialty must be BIOQUIMICA, CLINICA_MEDICA, or PSICOLOGIA.');
    }

    return { specialty };
  }

  private validateFinalize(body: FinalizeAttentionBody): FinalizeAttentionInput {
    if (body.state === AttentionState.finalized) {
      return { state: AtencionEstado.FINALIZADA };
    }
    if (body.state === AttentionState.pending) {
      return { state: AtencionEstado.PENDIENTE };
    }

    throw new BadRequestException('state must be Finalizada or Pendiente.');
  }

  private validateComplete(body: CompleteAttentionBody): CompleteAttentionInput {
    const observations = typeof body.observations === 'string' ? body.observations.trim() : '';
    let result: ResultadoEspecialidad | null = null;

    if (body.result !== undefined && body.result !== null && body.result !== '') {
      if (
        typeof body.result !== 'string' ||
        !(Object.values(ResultadoEspecialidad) as string[]).includes(body.result)
      ) {
        throw new BadRequestException('result must be APTO_PLENO, APTO_CONDICIONAL, or NO_APTO.');
      }

      result = body.result as ResultadoEspecialidad;
    }

    return { observations, datos: body.datos, result };
  }
}
