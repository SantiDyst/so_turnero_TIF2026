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
import { AtencionEstado } from '@prisma/client';

import { AttentionState } from '../shared/state-vocabulary';
import {
  AttentionCommandService,
  FinalizeAttentionInput,
  StartAttentionInput,
} from './attention-command.service';

interface StartAttentionBody {
  specialty?: unknown;
  professionalId?: unknown;
}

interface FinalizeAttentionBody {
  state?: unknown;
}

@Controller()
export class AttentionsController {
  constructor(private readonly attentionCommandService: AttentionCommandService) {}

  @Post('journeys/:id/attentions')
  @HttpCode(HttpStatus.CREATED)
  start(@Param('id') journeyId: string, @Body() body: StartAttentionBody) {
    return this.attentionCommandService.start(journeyId, this.validateStart(body));
  }

  @Patch('attentions/:id/finalize')
  finalize(@Param('id') attentionId: string, @Body() body: FinalizeAttentionBody) {
    return this.attentionCommandService.finalize(attentionId, this.validateFinalize(body));
  }

  private validateStart(body: StartAttentionBody): StartAttentionInput {
    if (typeof body.specialty !== 'string' || body.specialty.trim().length === 0) {
      throw new BadRequestException('specialty is required.');
    }
    if (typeof body.professionalId !== 'string' || body.professionalId.trim().length === 0) {
      throw new BadRequestException('professionalId is required.');
    }

    return {
      specialty: body.specialty.trim(),
      professionalId: body.professionalId.trim(),
    };
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
}
