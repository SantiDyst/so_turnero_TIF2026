import { ConflictException } from '@nestjs/common';
import { Especialidad, RecorridoEstado, ResultadoEspecialidad } from '@prisma/client';

import { AptitudeService } from '../../src/aptitude/aptitude.service';
import { RegistrationService } from '../../src/applicants/registration.service';
import { EvaluationsService } from '../../src/evaluations/evaluations.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { assertIsolatedSchema } from '../support/runtime';

describe('closure race database invariants', () => {
  const prisma = new PrismaService();
  const registration = new RegistrationService(prisma);
  const evaluations = new EvaluationsService(prisma);
  const aptitude = new AptitudeService(prisma);

  beforeAll(async () => {
    await assertIsolatedSchema();
  });

  afterAll(async () => {
    await prisma.client.$disconnect();
  });

  async function completeSpecialty(
    journeyId: string,
    specialty: Especialidad,
    result?: ResultadoEspecialidad,
  ) {
    const evaluation = await prisma.client.evaluacion.findUniqueOrThrow({
      where: { recorridoId_especialidad: { recorridoId: journeyId, especialidad: specialty } },
    });
    if (result) {
      await evaluations.setResult(evaluation.id, { resultado: result });
    }
    await evaluations.complete(evaluation.id);
  }

  it('serializes concurrent close requests into one CIERRE_FINAL and one conflict', async () => {
    const registered = await registration.register({
      nombre: 'Closure Race',
      apellido: 'Concurrent',
      dni: `closure-race-${Date.now()}`,
    });
    const journeyId = registered.journey.id;

    await prisma.client.recorrido.update({
      where: { id: journeyId },
      data: { estado: RecorridoEstado.EN_PROCESO },
    });
    await completeSpecialty(journeyId, Especialidad.BIOQUIMICA);
    await completeSpecialty(
      journeyId,
      Especialidad.CLINICA_MEDICA,
      ResultadoEspecialidad.APTO_PLENO,
    );
    await completeSpecialty(
      journeyId,
      Especialidad.PSICOLOGIA,
      ResultadoEspecialidad.APTO_PLENO,
    );

    const results = await Promise.allSettled([
      aptitude.close(journeyId),
      aptitude.close(journeyId),
    ]);

    const fulfilled = results.filter((result) => result.status === 'fulfilled');
    const rejected = results.filter((result) => result.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(ConflictException);

    const journey = await prisma.client.recorrido.findUniqueOrThrow({
      where: { id: journeyId },
    });
    expect(journey.estado).toBe(RecorridoEstado.CIERRE_FINAL);
    expect(
      await prisma.client.resultadoAptitud.count({ where: { recorridoId: journeyId } }),
    ).toBe(1);
  });
});
