import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ResultadoEspecialidad } from '@prisma/client';

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

@Controller()
export class EvaluationsController {
  constructor(private readonly evaluationsService: EvaluationsService) {}

  @Post('attentions/:id/pendings')
  @HttpCode(HttpStatus.CREATED)
  createPending(@Param('id') attentionId: string, @Body() body: CreatePendingBody) {
    return this.evaluationsService.createPending(attentionId, this.validatePending(body));
  }

  @Patch('pendings/:id/resolve')
  resolvePending(@Param('id') pendingId: string) {
    return this.evaluationsService.resolvePending(pendingId);
  }

  @Patch('evaluations/:id/result')
  setResult(@Param('id') evaluationId: string, @Body() body: SetEvaluationResultBody) {
    return this.evaluationsService.setResult(evaluationId, this.validateResult(body));
  }

  @Patch('evaluations/:id/complete')
  complete(@Param('id') evaluationId: string) {
    return this.evaluationsService.complete(evaluationId);
  }

  private validatePending(body: CreatePendingBody): CreatePendingInput {
    const motivo = typeof body.motivo === 'string' ? body.motivo.trim() : '';
    if (motivo.length === 0) {
      throw new BadRequestException('motivo is required.');
    }

    let fechaLimite: Date | null = null;
    if (body.fechaLimite !== undefined && body.fechaLimite !== null) {
      if (
        typeof body.fechaLimite !== 'string' ||
        Number.isNaN(Date.parse(body.fechaLimite))
      ) {
        throw new BadRequestException('fechaLimite must be a valid ISO date.');
      }
      fechaLimite = new Date(body.fechaLimite);
    }

    return { motivo, fechaLimite };
  }

  private validateResult(body: SetEvaluationResultBody): SetEvaluationResultInput {
    if (typeof body.resultado !== 'string' || !isSpecialtyResult(body.resultado)) {
      throw new BadRequestException(
        'resultado must be APTO_PLENO, APTO_CONDICIONAL, or NO_APTO.',
      );
    }

    return { resultado: body.resultado };
  }
}
