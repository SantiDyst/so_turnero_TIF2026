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
import { ResultadoEspecialidad, RolUsuario } from '@prisma/client';

import { AttentionAccessService } from '../attentions/attention-access.service';
import { AuthGuard } from '../auth/auth.guard';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { requireProfessional } from '../professionals/professional-context';
import {
  CreatePendingInput,
  EvaluationsService,
  SetEvaluationResultInput,
} from './evaluations.service';

interface CreatePendingBody {
  motivo?: unknown;
  fechaLimite?: unknown;
}

interface SetEvaluationResultBody {
  resultado?: unknown;
}

function isSpecialtyResult(value: string): value is ResultadoEspecialidad {
  return (Object.values(ResultadoEspecialidad) as string[]).includes(value);
}

@ApiTags('Evaluations')
@ApiBearerAuth()
@Controller()
@UseGuards(AuthGuard, RolesGuard)
@Roles(RolUsuario.PROFESIONAL)
export class EvaluationsController {
  constructor(
    private readonly evaluationsService: EvaluationsService,
    private readonly attentionAccessService: AttentionAccessService,
  ) {}

  @Post('attentions/:id/pendings')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Record an open pending on an attention' })
  @ApiParam({ name: 'id', description: 'Attention id' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['motivo'],
      properties: {
        motivo: { type: 'string', example: 'Falta resultado de laboratorio' },
        fechaLimite: { type: 'string', format: 'date-time', nullable: true },
      },
    },
  })
  createPending(
    @Param('id') attentionId: string,
    @Body() body: CreatePendingBody,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const input = this.validatePending(body);
    const professional = requireProfessional(user);

    return this.attentionAccessService
      .assertAttentionOwned(attentionId, professional.id)
      .then(() => this.evaluationsService.createPending(attentionId, input));
  }

  @Patch('pendings/:id/resolve')
  @ApiOperation({ summary: 'Resolve an open pending' })
  @ApiParam({ name: 'id', description: 'Pending id' })
  resolvePending(@Param('id') pendingId: string, @CurrentUser() user: AuthenticatedUser) {
    const professional = requireProfessional(user);

    return this.attentionAccessService
      .assertPendingSpecialty(pendingId, professional.specialty)
      .then(() => this.evaluationsService.resolvePending(pendingId));
  }

  @Patch('evaluations/:id/result')
  @ApiOperation({ summary: 'Store the specialty result of an evaluation' })
  @ApiParam({ name: 'id', description: 'Evaluation id' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['resultado'],
      properties: {
        resultado: {
          type: 'string',
          enum: ['APTO_PLENO', 'APTO_CONDICIONAL', 'NO_APTO'],
        },
      },
    },
  })
  setResult(
    @Param('id') evaluationId: string,
    @Body() body: SetEvaluationResultBody,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const input = this.validateResult(body);
    const professional = requireProfessional(user);

    return this.attentionAccessService
      .assertEvaluationSpecialty(evaluationId, professional.specialty)
      .then(() => this.evaluationsService.setResult(evaluationId, input));
  }

  @Patch('evaluations/:id/complete')
  @ApiOperation({
    summary:
      'Complete an evaluation when its work is closed (no pendings, required result present)',
  })
  @ApiParam({ name: 'id', description: 'Evaluation id' })
  complete(@Param('id') evaluationId: string, @CurrentUser() user: AuthenticatedUser) {
    const professional = requireProfessional(user);

    return this.attentionAccessService
      .assertEvaluationSpecialty(evaluationId, professional.specialty)
      .then(() => this.evaluationsService.complete(evaluationId));
  }

  private validatePending(body: CreatePendingBody): CreatePendingInput {
    const motivo = typeof body.motivo === 'string' ? body.motivo.trim() : '';
    if (motivo.length === 0) {
      throw new BadRequestException('motivo is required.');
    }

    let fechaLimite: Date | null = null;
    if (body.fechaLimite !== undefined && body.fechaLimite !== null) {
      if (typeof body.fechaLimite !== 'string' || Number.isNaN(Date.parse(body.fechaLimite))) {
        throw new BadRequestException('fechaLimite must be a valid ISO date.');
      }
      fechaLimite = new Date(body.fechaLimite);
    }

    return { motivo, fechaLimite };
  }

  private validateResult(body: SetEvaluationResultBody): SetEvaluationResultInput {
    if (typeof body.resultado !== 'string' || !isSpecialtyResult(body.resultado)) {
      throw new BadRequestException('resultado must be APTO_PLENO, APTO_CONDICIONAL, or NO_APTO.');
    }

    return { resultado: body.resultado };
  }
}
