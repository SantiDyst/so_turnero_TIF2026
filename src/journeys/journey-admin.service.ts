import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AtencionEstado, Prisma, RecorridoEstado } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { JourneyState, toJourneyState } from '../shared/state-vocabulary';

export interface AnnulJourneyInput {
  motivo: string;
}

@Injectable()
export class JourneyAdminService {
  constructor(private readonly prisma: PrismaService) {}

  async annul(journeyId: string, input: AnnulJourneyInput) {
    const motivo = input.motivo.trim();

    if (motivo.length === 0) {
      throw new BadRequestException('motivo is required.');
    }

    return this.prisma.client.$transaction(async (transaction) => {
      const journey = await this.lockJourney(transaction, journeyId);

      if (journey.estado === JourneyState.annulled) {
        throw new ConflictException('Journey is already annulled.');
      }
      if (journey.estado === JourneyState.closed) {
        throw new ConflictException('A closed journey cannot be annulled.');
      }

      const activeAttentions = await transaction.atencion.count({
        where: { recorridoId: journey.id, estado: AtencionEstado.EN_ATENCION },
      });
      if (activeAttentions > 0) {
        throw new ConflictException('Finalize the active attention before annulling the journey.');
      }

      const anuladaAt = new Date();
      const updated = await transaction.recorrido.update({
        where: { id: journey.id },
        data: {
          estado: RecorridoEstado.ANULADA,
          motivoAnulacion: motivo,
          anuladaAt,
        },
      });

      return {
        journeyId: updated.id,
        attentionNumber: updated.numeroAtencion,
        state: toJourneyState(updated.estado),
        reason: updated.motivoAnulacion,
        annulledAt: updated.anuladaAt,
      };
    });
  }

  async remove(journeyId: string) {
    return this.prisma.client.$transaction(async (transaction) => {
      const journey = await this.lockJourney(transaction, journeyId);

      const attentions = await transaction.atencion.count({
        where: { recorridoId: journey.id },
      });
      if (attentions > 0) {
        throw new ConflictException(
          'Journey has recorded attentions and cannot be deleted; annul it instead.',
        );
      }

      await transaction.recorrido.delete({ where: { id: journey.id } });
      await transaction.postulante.delete({ where: { id: journey.postulanteId } });

      return {
        journeyId: journey.id,
        attentionNumber: journey.numeroAtencion,
        deleted: true,
      };
    });
  }

  private async lockJourney(
    transaction: Prisma.TransactionClient,
    journeyId: string,
  ): Promise<{ id: string; postulanteId: string; numeroAtencion: string; estado: string }> {
    const rows = await transaction.$queryRaw<
      { id: string; postulanteId: string; numeroAtencion: string; estado: string }[]
    >(
      Prisma.sql`SELECT "id", "postulanteId", "numeroAtencion", "estado" FROM "Recorrido" WHERE "id" = ${journeyId} FOR UPDATE`,
    );
    const journey = rows[0];

    if (!journey) {
      throw new NotFoundException('Journey not found.');
    }

    return journey;
  }
}
