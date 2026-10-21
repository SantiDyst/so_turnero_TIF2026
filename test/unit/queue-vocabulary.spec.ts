import {
  AtencionEstado,
  DisponibilidadProfesional,
  Especialidad,
  EvaluacionEstado,
  InformeEstado,
  RecorridoEstado,
  ResultadoEspecialidad,
} from '@prisma/client';

import { QueueQueryService } from '../../src/journeys/queue-query.service';

const TIMESTAMP = new Date('2026-11-05T10:00:00.000Z');

function certificateFixture() {
  return {
    id: 'certificate-1',
    recorridoId: 'journey-1',
    identificador: 'CERT-AT-1042',
    aptitudFinal: ResultadoEspecialidad.APTO_CONDICIONAL,
    profesionalId: 'professional-clinical',
    emitidoAt: new Date('2026-11-07T12:00:00.000Z'),
    createdAt: new Date('2026-11-07T12:00:00.000Z'),
    updatedAt: new Date('2026-11-07T12:00:00.000Z'),
    profesional: { id: 'professional-clinical', nombre: 'Dr. Clinical' },
  };
}

function journeyFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: 'journey-1',
    postulanteId: 'applicant-1',
    numeroAtencion: 'AT-1042',
    estado: RecorridoEstado.EN_PROCESO,
    queuedAt: TIMESTAMP,
    postulante: { id: 'applicant-1', nombre: 'Ana', apellido: 'Pérez', dni: '12345678' },
    atenciones: [
      {
        id: 'attention-clinical',
        estado: AtencionEstado.PENDIENTE,
        especialidad: Especialidad.CLINICA_MEDICA,
        evaluacionId: 'evaluation-clinical',
        atencionOrigenId: null,
        recitacionId: null,
        startedAt: TIMESTAMP,
        endedAt: TIMESTAMP,
        profesional: {
          id: 'professional-clinical',
          nombre: 'Dr. Clinical',
          especialidad: Especialidad.CLINICA_MEDICA,
          disponibilidad: DisponibilidadProfesional.DISPONIBLE,
        },
      },
    ],
    evaluaciones: [
      {
        id: 'evaluation-bio',
        especialidad: Especialidad.BIOQUIMICA,
        estado: EvaluacionEstado.PENDIENTE,
        resultado: null,
        completadaAt: null,
        pendientes: [],
        informe: null,
      },
      {
        id: 'evaluation-clinical',
        especialidad: Especialidad.CLINICA_MEDICA,
        estado: EvaluacionEstado.PENDIENTE,
        resultado: null,
        completadaAt: null,
        pendientes: [],
        informe: {
          id: 'report-clinical',
          observaciones: 'Draft clinical note',
          estado: InformeEstado.PENDIENTE,
          updatedAt: TIMESTAMP,
          profesional: null,
          atencion: { profesional: { id: 'professional-clinical', nombre: 'Dr. Clinical' } },
        },
      },
      {
        id: 'evaluation-psychology',
        especialidad: Especialidad.PSICOLOGIA,
        estado: EvaluacionEstado.PENDIENTE,
        resultado: null,
        completadaAt: null,
        pendientes: [],
        informe: null,
      },
    ],
    recitaciones: [],
    derivaciones: [],
    resultadoAptitud: null,
    certificado: null,
    ...overrides,
  };
}

function serviceWith(journey: Record<string, unknown> | null): QueueQueryService {
  const prisma = {
    client: {
      recorrido: { findUnique: jest.fn().mockResolvedValue(journey) },
      reserva: { findMany: jest.fn().mockResolvedValue([]) },
    },
  };

  return new QueueQueryService(prisma as never);
}

describe('journey read model vocabulary', () => {
  it('exposes three ordered reports with reportState distinct from the attention state', async () => {
    const read = await serviceWith(journeyFixture()).findJourney(undefined, 'AT-1042');

    expect(read.attentions[0]).toEqual(
      expect.objectContaining({ id: 'attention-clinical', state: 'Pendiente' }),
    );
    expect(read.reports.map((report) => report.specialty)).toEqual([
      Especialidad.BIOQUIMICA,
      Especialidad.CLINICA_MEDICA,
      Especialidad.PSICOLOGIA,
    ]);
    expect(read.reports.map((report) => report.reportState)).toEqual([
      'Pendiente',
      'Pendiente',
      'Pendiente',
    ]);

    const [biochemistry, clinical] = read.reports;
    expect(clinical).toEqual(
      expect.objectContaining({
        reportId: 'report-clinical',
        evaluationId: 'evaluation-clinical',
        reportState: 'Pendiente',
        observations: 'Draft clinical note',
        specialtyResult: null,
        finalAptitude: null,
      }),
    );
    expect(clinical).not.toHaveProperty('state');
    expect(clinical.responsible).toEqual({
      area: Especialidad.CLINICA_MEDICA,
      professional: { id: 'professional-clinical', nombre: 'Dr. Clinical' },
    });
    expect(biochemistry).toEqual(
      expect.objectContaining({ reportId: null, observations: null, updatedAt: null }),
    );
  });

  it('keeps existing keys, derives Esperando llamado, and exposes a null certificate', async () => {
    const read = await serviceWith(journeyFixture()).findJourney(undefined, 'AT-1042');

    expect(Object.keys(read).sort()).toEqual(
      [
        'applicant',
        'aptitude',
        'attentions',
        'certificate',
        'derivations',
        'evaluations',
        'journey',
        'pendings',
        'recitations',
        'reports',
        'reservations',
      ].sort(),
    );
    expect(read.journey).toEqual(
      expect.objectContaining({
        attentionNumber: 'AT-1042',
        state: 'En proceso',
        derivedState: 'Esperando llamado',
      }),
    );
    expect(read.aptitude).toBeNull();
    expect(read.certificate).toBeNull();
  });

  it('composes an issued certificate without duplicating report entries', async () => {
    const read = await serviceWith(
      journeyFixture({ certificado: certificateFixture() }),
    ).findJourney(undefined, 'AT-1042');

    expect(read.certificate).toEqual({
      id: 'certificate-1',
      identifier: 'CERT-AT-1042',
      attentionNumber: 'AT-1042',
      applicant: { id: 'applicant-1', nombre: 'Ana', apellido: 'Pérez' },
      finalAptitude: 'APTO_CONDICIONAL',
      issuedAt: new Date('2026-11-07T12:00:00.000Z'),
      responsibleProfessional: { id: 'professional-clinical', nombre: 'Dr. Clinical' },
    });
    expect(read.reports).toHaveLength(3);
  });
});
