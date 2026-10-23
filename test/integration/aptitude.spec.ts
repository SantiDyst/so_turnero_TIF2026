import { ConflictException, NotFoundException } from '@nestjs/common';
import {
  Especialidad,
  EvaluacionEstado,
  RecorridoEstado,
  ResultadoEspecialidad,
} from '@prisma/client';

import { AptitudeService } from '../../src/aptitude/aptitude.service';
import { RegistrationService } from '../../src/applicants/registration.service';
import { AttentionCommandService } from '../../src/attentions/attention-command.service';
import { EvaluationsService } from '../../src/evaluations/evaluations.service';
import { QueueQueryService } from '../../src/journeys/queue-query.service';
import { ProfessionalsService } from '../../src/professionals/professionals.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { assertIsolatedSchema } from '../support/runtime';

describe('final aptitude and closure database invariants', () => {
  const prisma = new PrismaService();
  const registration = new RegistrationService(prisma);
  const evaluations = new EvaluationsService(prisma);
  const journeys = new QueueQueryService(prisma);
  const professionals = new ProfessionalsService();
  const attentions = new AttentionCommandService(prisma, professionals);
  const aptitude = new AptitudeService(prisma);

  let sequence = 0;

  beforeAll(async () => {
    await assertIsolatedSchema();
  });

  afterAll(async () => {
    await prisma.client.$disconnect();
  });

  async function registerJourney(name: string) {
    sequence += 1;
    return registration.register({
      nombre: name,
      apellido: 'Aptitude',
      dni: `${name}-${sequence}-${Date.now()}`,
    });
  }

  async function evaluationOf(journeyId: string, specialty: Especialidad) {
    return prisma.client.evaluacion.findUniqueOrThrow({
      where: { recorridoId_especialidad: { recorridoId: journeyId, especialidad: specialty } },
    });
  }

  async function completeSpecialty(
    journeyId: string,
    specialty: Especialidad,
    result?: ResultadoEspecialidad,
  ) {
    const evaluation = await evaluationOf(journeyId, specialty);
    if (result) {
      await evaluations.setResult(evaluation.id, { resultado: result });
    }
    return evaluations.complete(evaluation.id);
  }

  async function completeAll(
    journeyId: string,
    clinical: ResultadoEspecialidad,
    psychological: ResultadoEspecialidad,
  ) {
    await completeSpecialty(journeyId, Especialidad.BIOQUIMICA);
    await completeSpecialty(journeyId, Especialidad.CLINICA_MEDICA, clinical);
    await completeSpecialty(journeyId, Especialidad.PSICOLOGIA, psychological);
  }

  function storedAptitude(journeyId: string) {
    return prisma.client.resultadoAptitud.findUnique({ where: { recorridoId: journeyId } });
  }

  async function moveToInProgress(journeyId: string) {
    await prisma.client.recorrido.update({
      where: { id: journeyId },
      data: { estado: RecorridoEstado.EN_PROCESO },
    });
  }

  it.each([
    [
      ResultadoEspecialidad.APTO_PLENO,
      ResultadoEspecialidad.APTO_PLENO,
      ResultadoEspecialidad.APTO_PLENO,
    ],
    [
      ResultadoEspecialidad.APTO_PLENO,
      ResultadoEspecialidad.APTO_CONDICIONAL,
      ResultadoEspecialidad.APTO_CONDICIONAL,
    ],
    [
      ResultadoEspecialidad.NO_APTO,
      ResultadoEspecialidad.APTO_PLENO,
      ResultadoEspecialidad.NO_APTO,
    ],
  ])('stores %s clinical and %s psychological as %s', async (clinical, psychological, expected) => {
    const registered = await registerJourney(`Matrix ${clinical} ${psychological}`);
    await completeAll(registered.journey.id, clinical, psychological);

    const stored = await storedAptitude(registered.journey.id);
    expect(stored).toEqual(
      expect.objectContaining({
        resultadoClinico: clinical,
        resultadoPsicologico: psychological,
        aptitudFinal: expected,
      }),
    );
    expect(
      await prisma.client.resultadoAptitud.count({
        where: { recorridoId: registered.journey.id },
      }),
    ).toBe(1);
  });

  it('stores nothing before the third evaluation completes', async () => {
    const registered = await registerJourney('Early Aptitude');

    await completeSpecialty(registered.journey.id, Especialidad.BIOQUIMICA);
    expect(await storedAptitude(registered.journey.id)).toBeNull();

    await completeSpecialty(
      registered.journey.id,
      Especialidad.CLINICA_MEDICA,
      ResultadoEspecialidad.APTO_PLENO,
    );
    expect(await storedAptitude(registered.journey.id)).toBeNull();

    await completeSpecialty(
      registered.journey.id,
      Especialidad.PSICOLOGIA,
      ResultadoEspecialidad.APTO_PLENO,
    );
    expect(await storedAptitude(registered.journey.id)).not.toBeNull();
  });

  it('stores exactly one aptitude under concurrent final completions', async () => {
    const registered = await registerJourney('Concurrent Aptitude');
    await completeSpecialty(registered.journey.id, Especialidad.BIOQUIMICA);

    const clinical = await evaluationOf(registered.journey.id, Especialidad.CLINICA_MEDICA);
    const psychological = await evaluationOf(registered.journey.id, Especialidad.PSICOLOGIA);
    await evaluations.setResult(clinical.id, {
      resultado: ResultadoEspecialidad.APTO_CONDICIONAL,
    });
    await evaluations.setResult(psychological.id, {
      resultado: ResultadoEspecialidad.APTO_PLENO,
    });

    const results = await Promise.allSettled([
      evaluations.complete(clinical.id),
      evaluations.complete(psychological.id),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(2);

    const stored = await prisma.client.resultadoAptitud.findMany({
      where: { recorridoId: registered.journey.id },
    });
    expect(stored).toHaveLength(1);
    expect(stored[0]?.aptitudFinal).toBe(ResultadoEspecialidad.APTO_CONDICIONAL);
    expect(
      (
        await prisma.client.evaluacion.findMany({
          where: { recorridoId: registered.journey.id },
        })
      ).every((evaluation) => evaluation.estado === EvaluacionEstado.COMPLETA),
    ).toBe(true);
  });

  it('reports readiness, rejects early closure, closes explicitly, and locks writes', async () => {
    const registered = await registerJourney('Closure Flow');
    const journeyId = registered.journey.id;
    await moveToInProgress(journeyId);

    const before = await aptitude.readiness(journeyId);
    expect(before).toEqual(
      expect.objectContaining({
        journeyId,
        state: 'En proceso',
        allEvaluationsComplete: false,
        clinicalResultPresent: false,
        psychologicalResultPresent: false,
        aptitudeStored: false,
        canClose: false,
      }),
    );
    await expect(aptitude.close(journeyId)).rejects.toBeInstanceOf(ConflictException);
    expect(
      (await prisma.client.recorrido.findUniqueOrThrow({ where: { id: journeyId } })).estado,
    ).toBe(RecorridoEstado.EN_PROCESO);

    await completeSpecialty(journeyId, Especialidad.BIOQUIMICA);
    await completeSpecialty(
      journeyId,
      Especialidad.CLINICA_MEDICA,
      ResultadoEspecialidad.APTO_PLENO,
    );

    const partial = await aptitude.readiness(journeyId);
    expect(partial).toEqual(
      expect.objectContaining({
        allEvaluationsComplete: false,
        clinicalResultPresent: true,
        psychologicalResultPresent: false,
        aptitudeStored: false,
        canClose: false,
      }),
    );
    await expect(aptitude.close(journeyId)).rejects.toBeInstanceOf(ConflictException);

    await completeSpecialty(journeyId, Especialidad.PSICOLOGIA, ResultadoEspecialidad.NO_APTO);

    const ready = await aptitude.readiness(journeyId);
    expect(ready).toEqual(
      expect.objectContaining({
        state: 'En proceso',
        allEvaluationsComplete: true,
        clinicalResultPresent: true,
        psychologicalResultPresent: true,
        aptitudeStored: true,
        canClose: true,
      }),
    );
    expect(
      (await prisma.client.recorrido.findUniqueOrThrow({ where: { id: journeyId } })).estado,
    ).toBe(RecorridoEstado.EN_PROCESO);

    const closed = await aptitude.close(journeyId);
    expect(closed).toEqual(
      expect.objectContaining({
        journeyId,
        state: 'Cierre final',
        aptitude: expect.objectContaining({ finalAptitude: 'NO_APTO' }),
      }),
    );

    const after = await aptitude.readiness(journeyId);
    expect(after).toEqual(
      expect.objectContaining({ state: 'Cierre final', canClose: false, aptitudeStored: true }),
    );

    const readModel = await journeys.findJourney(registered.applicant.id);
    expect(readModel.journey.state).toBe('Cierre final');
    expect(readModel.aptitude).toEqual(
      expect.objectContaining({
        clinicalResult: 'APTO_PLENO',
        psychologicalResult: 'NO_APTO',
        finalAptitude: 'NO_APTO',
      }),
    );

    await expect(aptitude.close(journeyId)).rejects.toBeInstanceOf(ConflictException);

    const psychological = await evaluationOf(journeyId, Especialidad.PSICOLOGIA);
    await prisma.client.evaluacion.update({
      where: { id: psychological.id },
      data: { estado: EvaluacionEstado.PENDIENTE, resultado: null },
    });

    await expect(
      evaluations.setResult(psychological.id, {
        resultado: ResultadoEspecialidad.APTO_PLENO,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(evaluations.complete(psychological.id)).rejects.toBeInstanceOf(ConflictException);

    const professional = await prisma.client.profesional.create({
      data: { nombre: 'Dr. Closed Journey', especialidad: Especialidad.CLINICA_MEDICA },
    });
    await expect(
      attentions.start(journeyId, {
        specialty: Especialidad.CLINICA_MEDICA,
        professionalId: professional.id,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(
      (await prisma.client.recorrido.findUniqueOrThrow({ where: { id: journeyId } })).estado,
    ).toBe(RecorridoEstado.CIERRE_FINAL);
  });

  it('rejects readiness and closure for an unknown journey', async () => {
    const missing = '00000000-0000-4000-8000-000000000000';
    await expect(aptitude.readiness(missing)).rejects.toBeInstanceOf(NotFoundException);
    await expect(aptitude.close(missing)).rejects.toBeInstanceOf(NotFoundException);
  });
});
