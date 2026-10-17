import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma, RecorridoEstado } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { toJourneyState } from '../shared/state-vocabulary';

export interface RegisterApplicantInput {
  nombre: string;
  apellido: string;
  dni: string;
}

@Injectable()
export class RegistrationService {
  constructor(private readonly prisma: PrismaService) {}

  async register(input: RegisterApplicantInput) {
    try {
      return await this.prisma.client.$transaction(async (transaction) => {
        const attentionNumber = await this.nextAttentionNumber(transaction);
        const applicant = await transaction.postulante.create({ data: input });
        const journey = await transaction.recorrido.create({
          data: {
            postulanteId: applicant.id,
            numeroAtencion: attentionNumber,
            estado: RecorridoEstado.EN_ESPERA,
          },
        });

        return {
          applicant: {
            id: applicant.id,
            nombre: applicant.nombre,
            apellido: applicant.apellido,
            dni: applicant.dni,
          },
          journey: {
            id: journey.id,
            attentionNumber: journey.numeroAtencion,
            state: toJourneyState(journey.estado),
          },
        };
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('The generated attention number is already in use.');
      }

      throw error;
    }
  }

  private async nextAttentionNumber(transaction: Prisma.TransactionClient): Promise<string> {
    const rows = await transaction.$queryRaw<{ attentionNumber: string }[]>(
      Prisma.sql`SELECT next_attention_no() AS "attentionNumber"`,
    );

    return rows[0].attentionNumber;
  }
}
