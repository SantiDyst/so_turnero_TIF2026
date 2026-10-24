import {
  AtencionEstado,
  Especialidad,
  EvaluacionEstado,
  RecorridoEstado,
  ResultadoEspecialidad,
} from '@prisma/client';

import { QueueQueryService } from '../../src/journeys/queue-query.service';

function serviceWith(journeys: unknown[]) {
  const findMany = jest.fn().mockResolvedValue(journeys);
  const prisma = { client: { recorrido: { findMany } } };

  return { service: new QueueQueryService(prisma as never), findMany };
}

function journeyFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: 'journey-1',
    numeroAtencion: 'AT-2000',
    estado: RecorridoEstado.EN_PROCESO,
    queuedAt: new Date('2026-10-23T10:00:00.000Z'),
    postulante: { id: 'applicant-1', nombre: 'Ada', apellido: 'Lovelace' },
    atenciones: [],
    evaluaciones: [],
    resultadoAptitud: null,
    certificado: null,
    motivoAnulacion: null,
    anuladaAt: null,
    anuladoPor: null,
    ...overrides,
  };
}

describe('journey overview', () => {
  it('projects state, evaluation progress, pendings, aptitude and certificate', async () => {
    const { service, findMany } = serviceWith([
      journeyFixture({
        atenciones: [
          {
            estado: AtencionEstado.EN_ATENCION,
            especialidad: Especialidad.CLINICA_MEDICA,
          },
        ],
        evaluaciones: [
          { estado: EvaluacionEstado.COMPLETA, pendientes: [] },
          { estado: EvaluacionEstado.PENDIENTE, pendientes: [{ id: 'pending-1' }] },
        ],
        resultadoAptitud: { aptitudFinal: ResultadoEspecialidad.APTO_CONDICIONAL },
        certificado: { id: 'certificate-1' },
      }),
    ]);

    await expect(service.listOverview()).resolves.toEqual([
      {
        journeyId: 'journey-1',
        applicant: { id: 'applicant-1', nombre: 'Ada', apellido: 'Lovelace' },
        attentionNumber: 'AT-2000',
        state: 'En proceso',
        derivedState: null,
        queuedAt: new Date('2026-10-23T10:00:00.000Z'),
        activeSpecialty: Especialidad.CLINICA_MEDICA,
        attentionCount: 1,
        annulledReason: null,
        annulledAt: null,
        annulledBy: null,
        evaluations: { total: 2, complete: 1 },
        openPendings: 1,
        finalAptitude: 'APTO_CONDICIONAL',
        certificateIssued: true,
      },
    ]);

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { queuedAt: 'desc' }, take: 50 }),
    );
  });

  it('reports the derived waiting-for-call state without an active attention', async () => {
    const { service } = serviceWith([
      journeyFixture({
        evaluaciones: [{ estado: EvaluacionEstado.PENDIENTE, pendientes: [] }],
      }),
    ]);

    const [entry] = await service.listOverview();

    expect(entry.derivedState).toBe('Esperando llamado');
    expect(entry.activeSpecialty).toBeNull();
    expect(entry.finalAptitude).toBeNull();
  });
});
