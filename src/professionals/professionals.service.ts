import { Injectable, NotFoundException } from '@nestjs/common';
import { DisponibilidadProfesional, Especialidad, Prisma } from '@prisma/client';

import { ProfessionalAvailability } from '../shared/state-vocabulary';

export async function releaseProfessional(
  transaction: Prisma.TransactionClient,
  professionalId: string,
): Promise<void> {
  await transaction.profesional.update({
    where: { id: professionalId },
    data: { disponibilidad: DisponibilidadProfesional.DISPONIBLE },
  });
}

export interface LockedProfessional {
  id: string;
  availability: string;
  especialidad: Especialidad;
}

@Injectable()
export class ProfessionalsService {
  async lockById(
    transaction: Prisma.TransactionClient,
    professionalId: string,
  ): Promise<LockedProfessional> {
    const rows = await transaction.$queryRaw<LockedProfessional[]>(
      Prisma.sql`SELECT "id", "disponibilidad" AS "availability", "especialidad" FROM "Profesional" WHERE "id" = ${professionalId} FOR UPDATE`,
    );
    const professional = rows[0];

    if (!professional) {
      throw new NotFoundException('Professional not found.');
    }

    return professional;
  }

  isAvailable(professional: LockedProfessional): boolean {
    return professional.availability === ProfessionalAvailability.available;
  }

  async markBusy(transaction: Prisma.TransactionClient, professionalId: string): Promise<void> {
    await transaction.profesional.update({
      where: { id: professionalId },
      data: { disponibilidad: DisponibilidadProfesional.OCUPADO },
    });
  }

  async markAvailable(
    transaction: Prisma.TransactionClient,
    professionalId: string,
  ): Promise<void> {
    await releaseProfessional(transaction, professionalId);
  }
}
