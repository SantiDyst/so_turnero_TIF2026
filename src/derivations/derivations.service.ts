import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Especialidad } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { toJourneyState } from '../shared/state-vocabulary';

export interface CreateDerivationInput {
  atencionOrigenId: string;
  especialidadDestino: Especialidad;
  motivo: string;
}

@Injectable()
export class DerivationsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(journeyId: string, input: CreateDerivationInput) {
    return this.prisma.client.$transaction(async (transaction) => {
      const journey = await transaction.recorrido.findUnique({
        where: { id: journeyId },
        select: { id: true, estado: true },
      });
      if (!journey) {
        throw new NotFoundException('Journey not found.');
      }

      const origin = await transaction.atencion.findUnique({
        where: { id: input.atencionOrigenId },
        select: { id: true, recorridoId: true, especialidad: true },
      });
      if (!origin || origin.recorridoId !== journey.id) {
        throw new BadRequestException('The origin attention does not belong to the journey.');
      }
      if (origin.especialidad === input.especialidadDestino) {
        throw new BadRequestException(
          'The destination specialty must differ from the origin specialty.',
        );
      }

      const derivation = await transaction.derivacion.create({
        data: {
          recorridoId: journey.id,
          atencionOrigenId: origin.id,
          especialidadDestino: input.especialidadDestino,
          motivo: input.motivo,
        },
      });

      return {
        id: derivation.id,
        journeyId: journey.id,
        journeyState: toJourneyState(journey.estado),
        originAttentionId: derivation.atencionOrigenId,
        destinationSpecialty: derivation.especialidadDestino,
        reason: derivation.motivo,
        createdAt: derivation.createdAt,
      };
    });
  }
}
