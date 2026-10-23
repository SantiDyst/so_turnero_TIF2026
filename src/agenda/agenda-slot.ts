import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

export const AGENDA_OVERLAP_MESSAGE = 'The professional already has a reservation for that slot.';

export async function assertAgendaSlotFree(
  transaction: Prisma.TransactionClient,
  professionalId: string,
  inicio: Date,
  fin: Date,
): Promise<void> {
  const overlapping = await transaction.$queryRaw<{ id: string }[]>(
    Prisma.sql`SELECT "id" FROM "Reserva"
               WHERE "profesionalId" = ${professionalId}
                 AND "estado" = 'RESERVADA'::"ReservaEstado"
                 AND "inicio" < ${fin}
                 AND "fin" > ${inicio}
               LIMIT 1`,
  );
  if (overlapping.length > 0) {
    throw new ConflictException(AGENDA_OVERLAP_MESSAGE);
  }
}
