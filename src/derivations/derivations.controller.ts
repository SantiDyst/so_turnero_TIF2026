import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import { Especialidad } from '@prisma/client';

import { isSupportedSpecialty } from '../shared/state-vocabulary';
import { CreateDerivationInput, DerivationsService } from './derivations.service';

interface CreateDerivationBody {
  atencionOrigenId?: unknown;
  especialidadDestino?: unknown;
  motivo?: unknown;
}

@Controller()
export class DerivationsController {
  constructor(private readonly derivationsService: DerivationsService) {}

  @Post('journeys/:id/derivations')
  @HttpCode(HttpStatus.CREATED)
  create(@Param('id') journeyId: string, @Body() body: CreateDerivationBody) {
    return this.derivationsService.create(journeyId, this.validate(body));
  }

  private validate(body: CreateDerivationBody): CreateDerivationInput {
    const atencionOrigenId =
      typeof body.atencionOrigenId === 'string' ? body.atencionOrigenId.trim() : '';
    if (atencionOrigenId.length === 0) {
      throw new BadRequestException('atencionOrigenId is required.');
    }

    const especialidadDestino =
      typeof body.especialidadDestino === 'string' ? body.especialidadDestino.trim() : '';
    if (!isSupportedSpecialty(especialidadDestino)) {
      throw new BadRequestException(
        'especialidadDestino must be BIOQUIMICA, CLINICA_MEDICA, or PSICOLOGIA.',
      );
    }

    const motivo = typeof body.motivo === 'string' ? body.motivo.trim() : '';
    if (motivo.length === 0) {
      throw new BadRequestException('motivo is required.');
    }

    return {
      atencionOrigenId,
      especialidadDestino: especialidadDestino as Especialidad,
      motivo,
    };
  }
}
