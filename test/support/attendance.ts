import { AtencionEstado, Especialidad } from '@prisma/client';

import type { PrismaService } from '../../src/prisma/prisma.service';

export async function ensureAttention(
  prisma: PrismaService,
  journeyId: string,
  specialty: Especialidad,
): Promise<void> {
  const evaluation = await prisma.client.evaluacion.findUniqueOrThrow({
    where: { recorridoId_especialidad: { recorridoId: journeyId, especialidad: specialty } },
  });

  const existing = await prisma.client.atencion.count({ where: { evaluacionId: evaluation.id } });
  if (existing > 0) {
    return;
  }

  const journey = await prisma.client.recorrido.findUniqueOrThrow({
    where: { id: journeyId },
    select: { postulanteId: true },
  });
  const professional = await prisma.client.profesional.create({
    data: {
      nombre: `Demo ${specialty} ${Math.random().toString(36).slice(2, 8)}`,
      especialidad: specialty,
    },
  });
  const now = new Date();

  await prisma.client.atencion.create({
    data: {
      recorridoId: journeyId,
      postulanteId: journey.postulanteId,
      especialidad: specialty,
      profesionalId: professional.id,
      estado: AtencionEstado.FINALIZADA,
      startedAt: now,
      endedAt: now,
      evaluacionId: evaluation.id,
    },
  });
}
