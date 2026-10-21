import { BadRequestException, ConflictException } from '@nestjs/common';
import {
  Especialidad,
  EvaluacionEstado,
  ReservaEstado,
  ResultadoEspecialidad,
} from '@prisma/client';

import { RecitationsController } from '../../src/agenda/recitations.controller';
import { RecitationsService } from '../../src/agenda/recitations.service';
import { EvaluationsController } from '../../src/evaluations/evaluations.controller';
import { EvaluationsService } from '../../src/evaluations/evaluations.service';
import { PrismaService } from '../../src/prisma/prisma.service';

type AnyRecord = Record<string, unknown>;

function makePrisma(transaction: AnyRecord): PrismaService {
  return {
    client: {
      $transaction: (callback: (client: AnyRecord) => unknown) => callback(transaction),
    },
  } as unknown as PrismaService;
}

function evaluationsServiceMock() {
  return {
    createPending: jest.fn(),
    resolvePending: jest.fn(),
    setResult: jest.fn(),
    complete: jest.fn(),
  };
}

function evaluationRow(overrides: AnyRecord = {}): AnyRecord {
  return {
    id: 'evaluation-1',
    recorridoId: 'journey-1',
    estado: EvaluacionEstado.PENDIENTE,
    especialidad: Especialidad.CLINICA_MEDICA,
    resultado: null,
    completadaAt: null,
    ...overrides,
  };
}

function completionTransaction(row: AnyRecord, openPendings = 0) {
  return {
    $queryRaw: jest.fn().mockResolvedValue([row]),
    pendiente: { count: jest.fn().mockResolvedValue(openPendings) },
    evaluacion: {
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn(async ({ data }: { data: AnyRecord }) => ({ ...row, ...data })),
    },
  };
}

describe('pending creation validation', () => {
  it('rejects a pending without a reason', () => {
    const service = evaluationsServiceMock();
    const controller = new EvaluationsController(service as never);

    expect(() => controller.createPending('attention-1', {})).toThrow(BadRequestException);
    expect(() => controller.createPending('attention-1', { motivo: '   ' })).toThrow(
      BadRequestException,
    );
    expect(service.createPending).not.toHaveBeenCalled();
  });

  it('rejects an invalid limit date', () => {
    const service = evaluationsServiceMock();
    const controller = new EvaluationsController(service as never);

    expect(() =>
      controller.createPending('attention-1', {
        motivo: 'Retrieve labs',
        fechaLimite: 'not-a-date',
      }),
    ).toThrow(BadRequestException);
  });

  it('accepts a reason with an optional limit date', () => {
    const service = evaluationsServiceMock();
    const controller = new EvaluationsController(service as never);
    service.createPending.mockReturnValue({ ok: true });

    expect(
      controller.createPending('attention-1', {
        motivo: '  Retrieve labs  ',
        fechaLimite: '2026-11-01T10:00:00.000Z',
      }),
    ).toEqual({ ok: true });
    expect(service.createPending).toHaveBeenCalledWith('attention-1', {
      motivo: 'Retrieve labs',
      fechaLimite: new Date('2026-11-01T10:00:00.000Z'),
    });
  });
});

describe('pending evaluation resolution', () => {
  it('falls back to the journey evaluation and preserves the origin attention', async () => {
    const pendingRow = {
      id: 'pending-1',
      evaluacionId: 'evaluation-fallback',
      atencionOrigenId: 'attention-1',
      motivo: 'Legacy attention',
      fechaLimite: null,
      resueltoAt: null,
      createdAt: new Date('2026-11-01T10:00:00.000Z'),
    };
    const transaction = {
      atencion: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'attention-1',
          recorridoId: 'journey-1',
          especialidad: Especialidad.CLINICA_MEDICA,
          evaluacionId: null,
        }),
      },
      evaluacion: {
        findUnique: jest.fn().mockResolvedValue({ id: 'evaluation-fallback' }),
      },
      pendiente: { create: jest.fn().mockResolvedValue(pendingRow) },
    };
    const service = new EvaluationsService(makePrisma(transaction));

    const created = await service.createPending('attention-1', {
      motivo: 'Legacy attention',
      fechaLimite: null,
    });

    expect(transaction.evaluacion.findUnique).toHaveBeenCalledWith({
      where: {
        recorridoId_especialidad: {
          recorridoId: 'journey-1',
          especialidad: Especialidad.CLINICA_MEDICA,
        },
      },
      select: { id: true },
    });
    expect(transaction.pendiente.create).toHaveBeenCalledWith({
      data: {
        evaluacionId: 'evaluation-fallback',
        atencionOrigenId: 'attention-1',
        motivo: 'Legacy attention',
        fechaLimite: null,
      },
    });
    expect(created).toEqual(
      expect.objectContaining({
        id: 'pending-1',
        evaluationId: 'evaluation-fallback',
        originAttentionId: 'attention-1',
      }),
    );
  });
});

describe('evaluation result validation', () => {
  it('rejects PENDIENTE and unsupported results', () => {
    const service = evaluationsServiceMock();
    const controller = new EvaluationsController(service as never);

    expect(() =>
      controller.setResult('evaluation-1', { resultado: 'PENDIENTE' }),
    ).toThrow(BadRequestException);
    expect(() =>
      controller.setResult('evaluation-1', { resultado: 'APTO' }),
    ).toThrow(BadRequestException);
    expect(service.setResult).not.toHaveBeenCalled();
  });

  it('accepts every supported specialty result', () => {
    const service = evaluationsServiceMock();
    const controller = new EvaluationsController(service as never);
    service.setResult.mockReturnValue({ ok: true });

    controller.setResult('evaluation-1', {
      resultado: ResultadoEspecialidad.APTO_CONDICIONAL,
    });

    expect(service.setResult).toHaveBeenCalledWith('evaluation-1', {
      resultado: ResultadoEspecialidad.APTO_CONDICIONAL,
    });
  });
});

describe('evaluation completion gate', () => {
  it('rejects completion while a pending is open', async () => {
    const transaction = completionTransaction(evaluationRow(), 1);
    const service = new EvaluationsService(makePrisma(transaction));

    await expect(service.complete('evaluation-1')).rejects.toThrow(ConflictException);
    expect(transaction.evaluacion.update).not.toHaveBeenCalled();
  });

  it.each([Especialidad.CLINICA_MEDICA, Especialidad.PSICOLOGIA])(
    'rejects %s completion without a stored result',
    async (especialidad) => {
      const transaction = completionTransaction(evaluationRow({ especialidad, resultado: null }));
      const service = new EvaluationsService(makePrisma(transaction));

      await expect(service.complete('evaluation-1')).rejects.toThrow(ConflictException);
      expect(transaction.evaluacion.update).not.toHaveBeenCalled();
    },
  );

  it('rejects an evaluation that is already complete', async () => {
    const transaction = completionTransaction(
      evaluationRow({ estado: EvaluacionEstado.COMPLETA }),
    );
    const service = new EvaluationsService(makePrisma(transaction));

    await expect(service.complete('evaluation-1')).rejects.toThrow(ConflictException);
    expect(transaction.pendiente.count).not.toHaveBeenCalled();
  });

  it('completes Bioquimica without a specialty result', async () => {
    const transaction = completionTransaction(
      evaluationRow({ especialidad: Especialidad.BIOQUIMICA, resultado: null }),
    );
    const service = new EvaluationsService(makePrisma(transaction));

    const completed = await service.complete('evaluation-1');

    expect(completed.state).toBe('COMPLETA');
    expect(completed.result).toBeNull();
    expect(transaction.evaluacion.update).toHaveBeenCalledWith({
      where: { id: 'evaluation-1' },
      data: {
        estado: EvaluacionEstado.COMPLETA,
        completadaAt: expect.any(Date),
      },
    });
  });

  it('completes a clinical evaluation with a result and no open pendings', async () => {
    const transaction = completionTransaction(
      evaluationRow({ resultado: ResultadoEspecialidad.APTO_PLENO }),
    );
    const service = new EvaluationsService(makePrisma(transaction));

    const completed = await service.complete('evaluation-1');

    expect(completed.state).toBe('COMPLETA');
    expect(completed.result).toBe(ResultadoEspecialidad.APTO_PLENO);
  });
});

describe('evaluation result storage', () => {
  it('rejects a result on a Bioquimica evaluation', async () => {
    const row = evaluationRow({ especialidad: Especialidad.BIOQUIMICA });
    const transaction = {
      $queryRaw: jest.fn().mockResolvedValue([row]),
      evaluacion: {
        update: jest.fn(),
      },
    };
    const service = new EvaluationsService(makePrisma(transaction));

    await expect(
      service.setResult('evaluation-1', { resultado: ResultadoEspecialidad.APTO_PLENO }),
    ).rejects.toThrow(BadRequestException);
    expect(transaction.evaluacion.update).not.toHaveBeenCalled();
  });

  it('stores a result without completing the evaluation', async () => {
    const row = evaluationRow({ especialidad: Especialidad.PSICOLOGIA });
    const transaction = {
      $queryRaw: jest.fn().mockResolvedValue([row]),
      evaluacion: {
        update: jest.fn(async ({ data }: { data: AnyRecord }) => ({ ...row, ...data })),
      },
    };
    const service = new EvaluationsService(makePrisma(transaction));

    const updated = await service.setResult('evaluation-1', {
      resultado: ResultadoEspecialidad.NO_APTO,
    });

    expect(updated.state).toBe('PENDIENTE');
    expect(updated.result).toBe(ResultadoEspecialidad.NO_APTO);
  });
});

describe('recitation scheduling validation', () => {
  const scheduleDate = '2026-11-02T09:00:00.000Z';
  const endDate = '2026-11-02T09:30:00.000Z';

  function controllerWith(service: { schedule: jest.Mock }) {
    return new RecitationsController(service as never);
  }

  it('requires a pending and a professional', () => {
    const service = { schedule: jest.fn() };
    const controller = controllerWith(service);

    expect(() =>
      controller.schedule('journey-1', { professionalId: 'professional-1', inicio: scheduleDate, fin: endDate }),
    ).toThrow(BadRequestException);
    expect(() =>
      controller.schedule('journey-1', { pendingId: 'pending-1', inicio: scheduleDate, fin: endDate }),
    ).toThrow(BadRequestException);
    expect(service.schedule).not.toHaveBeenCalled();
  });

  it('requires valid ISO dates and a positive interval', () => {
    const service = { schedule: jest.fn() };
    const controller = controllerWith(service);

    expect(() =>
      controller.schedule('journey-1', {
        pendingId: 'pending-1',
        professionalId: 'professional-1',
        inicio: 'tomorrow',
        fin: endDate,
      }),
    ).toThrow(BadRequestException);
    expect(() =>
      controller.schedule('journey-1', {
        pendingId: 'pending-1',
        professionalId: 'professional-1',
        inicio: endDate,
        fin: scheduleDate,
      }),
    ).toThrow(BadRequestException);
    expect(service.schedule).not.toHaveBeenCalled();
  });

  it('delegates a valid recitation with parsed dates', () => {
    const service = { schedule: jest.fn().mockReturnValue({ ok: true }) };
    const controller = controllerWith(service);

    expect(
      controller.schedule('journey-1', {
        pendingId: 'pending-1',
        evaluationId: 'evaluation-1',
        professionalId: 'professional-1',
        inicio: scheduleDate,
        fin: endDate,
      }),
    ).toEqual({ ok: true });
    expect(service.schedule).toHaveBeenCalledWith('journey-1', {
      pendingId: 'pending-1',
      evaluationId: 'evaluation-1',
      professionalId: 'professional-1',
      inicio: new Date(scheduleDate),
      fin: new Date(endDate),
    });
  });
});

describe('recitation scheduling guards', () => {
  const inicio = new Date('2026-11-02T09:00:00.000Z');
  const fin = new Date('2026-11-02T09:30:00.000Z');

  function recitationTransaction(overrides: {
    journeyId?: string;
    evaluationId?: string;
    specialty?: Especialidad;
    resolvedAt?: Date | null;
  } = {}) {
    const specialty = overrides.specialty ?? Especialidad.CLINICA_MEDICA;
    const recitation = {
      id: 'recitation-1',
      recorridoId: 'journey-1',
      evaluacionId: overrides.evaluationId ?? 'evaluation-1',
      pendienteId: 'pending-1',
      especialidad: specialty,
      fechaHora: inicio,
    };
    const transaction = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      recorrido: {
        findUnique: jest.fn().mockResolvedValue({ id: 'journey-1' }),
        update: jest.fn(),
      },
      pendiente: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'pending-1',
          resueltoAt: overrides.resolvedAt ?? null,
          evaluacion: {
            id: overrides.evaluationId ?? 'evaluation-1',
            recorridoId: overrides.journeyId ?? 'journey-1',
            especialidad: specialty,
          },
        }),
        update: jest.fn(),
      },
      evaluacion: { update: jest.fn() },
      recitacion: {
        create: jest.fn().mockResolvedValue(recitation),
        update: jest.fn(async ({ data }: { data: AnyRecord }) => ({ ...recitation, ...data })),
      },
      reserva: {
        create: jest.fn().mockResolvedValue({
          id: 'reservation-1',
          profesionalId: 'professional-1',
          inicio,
          fin,
          estado: ReservaEstado.RESERVADA,
        }),
      },
    };
    return transaction;
  }

  function serviceWith(
    transaction: AnyRecord,
    professionalSpecialty: Especialidad = Especialidad.CLINICA_MEDICA,
  ) {
    const professionals = {
      lockById: jest.fn().mockResolvedValue({
        id: 'professional-1',
        availability: 'Disponible',
        especialidad: professionalSpecialty,
      }),
    };
    return {
      service: new RecitationsService(
        makePrisma(transaction),
        professionals as never,
      ),
      professionals,
    };
  }

  it('rejects an already resolved pending', async () => {
    const transaction = recitationTransaction({ resolvedAt: new Date() });
    const { service, professionals } = serviceWith(transaction);

    await expect(
      service.schedule('journey-1', {
        pendingId: 'pending-1',
        professionalId: 'professional-1',
        inicio,
        fin,
      }),
    ).rejects.toThrow(ConflictException);
    expect(professionals.lockById).not.toHaveBeenCalled();
  });

  it('rejects a pending that belongs to another journey', async () => {
    const transaction = recitationTransaction({ journeyId: 'journey-2' });
    const { service } = serviceWith(transaction);

    await expect(
      service.schedule('journey-1', {
        pendingId: 'pending-1',
        professionalId: 'professional-1',
        inicio,
        fin,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects a professional whose specialty does not match', async () => {
    const transaction = recitationTransaction();
    const { service } = serviceWith(transaction, Especialidad.BIOQUIMICA);

    await expect(
      service.schedule('journey-1', {
        pendingId: 'pending-1',
        professionalId: 'professional-1',
        inicio,
        fin,
      }),
    ).rejects.toThrow(BadRequestException);
    expect(transaction.recitacion.create).not.toHaveBeenCalled();
  });

  it('rejects a recitation whose slot overlaps an existing reservation', async () => {
    const transaction = recitationTransaction();
    transaction.$queryRaw.mockResolvedValueOnce([{ id: 'reservation-existing' }]);
    const { service } = serviceWith(transaction);

    await expect(
      service.schedule('journey-1', {
        pendingId: 'pending-1',
        professionalId: 'professional-1',
        inicio,
        fin,
      }),
    ).rejects.toThrow(ConflictException);
    expect(transaction.recitacion.create).not.toHaveBeenCalled();
  });

  it('creates a recitation and reservation without changing circuit state', async () => {
    const transaction = recitationTransaction();
    const { service } = serviceWith(transaction);

    const scheduled = await service.schedule('journey-1', {
      pendingId: 'pending-1',
      professionalId: 'professional-1',
      inicio,
      fin,
    });

    expect(scheduled).toMatchObject({
      id: 'recitation-1',
      journeyId: 'journey-1',
      evaluationId: 'evaluation-1',
      pendingId: 'pending-1',
      reservationId: 'reservation-1',
      reservation: {
        id: 'reservation-1',
        professionalId: 'professional-1',
        state: 'RESERVADA',
      },
    });
    expect(transaction.reserva.create).toHaveBeenCalledWith({
      data: {
        profesionalId: 'professional-1',
        recitacionId: 'recitation-1',
        inicio,
        fin,
        estado: ReservaEstado.RESERVADA,
      },
    });
    expect(transaction.pendiente.update).not.toHaveBeenCalled();
    expect(transaction.evaluacion.update).not.toHaveBeenCalled();
    expect(transaction.recorrido.update).not.toHaveBeenCalled();
  });
});
