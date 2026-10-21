import { BadRequestException } from '@nestjs/common';
import {
  Especialidad,
  EvaluacionEstado,
  InformeEstado,
  ResultadoEspecialidad,
} from '@prisma/client';

import { buildJourneyReports, JourneyReportsSource } from '../../src/reports/report.view';
import { ReportsController } from '../../src/reports/reports.controller';
import { InformeState, toEvaluationState, toInformeState } from '../../src/shared/state-vocabulary';

type ReportServiceMock = {
  saveReport: jest.Mock;
  listJourneyReports: jest.Mock;
};

function makeController(service: ReportServiceMock): ReportsController {
  return new ReportsController(service as never);
}

function serviceMock(): ReportServiceMock {
  return { saveReport: jest.fn(), listJourneyReports: jest.fn() };
}

function reportsSource(): JourneyReportsSource {
  return {
    numeroAtencion: 'AT-1042',
    postulante: { id: 'applicant-1', nombre: 'Ana', apellido: 'Pérez' },
    evaluaciones: [
      {
        id: 'evaluation-psychology',
        especialidad: Especialidad.PSICOLOGIA,
        resultado: null,
        informe: null,
      },
      {
        id: 'evaluation-biochemistry',
        especialidad: Especialidad.BIOQUIMICA,
        resultado: ResultadoEspecialidad.APTO_PLENO,
        informe: {
          id: 'report-biochemistry',
          observaciones: 'Lab values within range',
          estado: InformeEstado.COMPLETO,
          updatedAt: new Date('2026-11-05T10:00:00.000Z'),
          profesional: null,
          atencion: { profesional: { id: 'professional-bio', nombre: 'Dra. Bio' } },
        },
      },
      {
        id: 'evaluation-clinical',
        especialidad: Especialidad.CLINICA_MEDICA,
        resultado: null,
        informe: null,
      },
    ],
    resultadoAptitud: null,
  };
}

describe('report body validation', () => {
  it('rejects Completo with empty observations', () => {
    const service = serviceMock();
    const controller = makeController(service);

    expect(() =>
      controller.save('attention-1', { observations: '   ', state: 'Completo' }),
    ).toThrow(BadRequestException);
    expect(() => controller.save('attention-1', { state: 'Completo' })).toThrow(
      BadRequestException,
    );
    expect(service.saveReport).not.toHaveBeenCalled();
  });

  it('rejects an unknown report state', () => {
    const service = serviceMock();
    const controller = makeController(service);

    expect(() =>
      controller.save('attention-1', { observations: 'Complete note', state: 'COMPLETO' }),
    ).toThrow(BadRequestException);
    expect(() =>
      controller.save('attention-1', { observations: 'Complete note', state: 'Completa' }),
    ).toThrow(BadRequestException);
    expect(service.saveReport).not.toHaveBeenCalled();
  });

  it('defaults to a pending draft and trims observations', () => {
    const service = serviceMock();
    const controller = makeController(service);
    service.saveReport.mockReturnValue({ ok: true });

    expect(controller.save('attention-1', { observations: '  Draft note  ' })).toEqual({
      ok: true,
    });
    expect(service.saveReport).toHaveBeenCalledWith('attention-1', {
      observations: 'Draft note',
      state: InformeEstado.PENDIENTE,
      professionalId: undefined,
    });
  });

  it('accepts Completo with observations and a professional', () => {
    const service = serviceMock();
    const controller = makeController(service);
    service.saveReport.mockReturnValue({ ok: true });

    controller.save('attention-1', {
      observations: '  Ready  ',
      state: 'Completo',
      professionalId: ' professional-1 ',
    });

    expect(service.saveReport).toHaveBeenCalledWith('attention-1', {
      observations: 'Ready',
      state: InformeEstado.COMPLETO,
      professionalId: 'professional-1',
    });
  });

  it('rejects a blank professionalId', () => {
    const service = serviceMock();
    const controller = makeController(service);

    expect(() =>
      controller.save('attention-1', { observations: 'Note', professionalId: '   ' }),
    ).toThrow(BadRequestException);
    expect(service.saveReport).not.toHaveBeenCalled();
  });
});

describe('report state vocabulary', () => {
  it('maps report states without reusing the evaluation vocabulary', () => {
    expect(InformeState.pending).toBe('Pendiente');
    expect(InformeState.complete).toBe('Completo');
    expect(toInformeState(InformeEstado.PENDIENTE)).toBe('Pendiente');
    expect(toInformeState(InformeEstado.COMPLETO)).toBe('Completo');
    expect(toEvaluationState(EvaluacionEstado.PENDIENTE)).toBe('PENDIENTE');
    expect(toInformeState(InformeEstado.PENDIENTE)).not.toBe(
      toEvaluationState(EvaluacionEstado.PENDIENTE),
    );
  });

  it('exposes reportState and never conflates it with the attention state key', () => {
    const [biochemistry] = buildJourneyReports(reportsSource());

    expect(biochemistry).toHaveProperty('reportState', 'Completo');
    expect(biochemistry).not.toHaveProperty('state');
  });
});

describe('composed report view', () => {
  it('orders the three specialties and fills unwritten placeholders with nulls', () => {
    const reports = buildJourneyReports(reportsSource());

    expect(reports.map((report) => report.specialty)).toEqual([
      Especialidad.BIOQUIMICA,
      Especialidad.CLINICA_MEDICA,
      Especialidad.PSICOLOGIA,
    ]);
    expect(reports.map((report) => report.reportState)).toEqual([
      'Completo',
      'Pendiente',
      'Pendiente',
    ]);

    const [, clinical, psychology] = reports;
    expect(clinical).toEqual(
      expect.objectContaining({
        reportId: null,
        evaluationId: 'evaluation-clinical',
        specialty: Especialidad.CLINICA_MEDICA,
        reportState: 'Pendiente',
        attentionNumber: 'AT-1042',
        originArea: 'Admisión',
        observations: null,
        specialtyResult: null,
        finalAptitude: null,
        updatedAt: null,
      }),
    );
    expect(clinical.responsible).toEqual({
      area: Especialidad.CLINICA_MEDICA,
      professional: null,
    });
    expect(psychology.reportState).toBe('Pendiente');
    expect(psychology.observations).toBeNull();
  });

  it('nulls the specialty result for Bioquimica and the aptitude before storage', () => {
    const reports = buildJourneyReports(reportsSource());
    const [biochemistry] = reports;

    expect(biochemistry.reportState).toBe('Completo');
    expect(biochemistry.observations).toBe('Lab values within range');
    expect(biochemistry.specialtyResult).toBeNull();
    expect(biochemistry.finalAptitude).toBeNull();
    expect(biochemistry.updatedAt).toEqual(new Date('2026-11-05T10:00:00.000Z'));
    expect(biochemistry.responsible.professional).toEqual({
      id: 'professional-bio',
      nombre: 'Dra. Bio',
    });
    expect(reports.every((report) => report.finalAptitude === null)).toBe(true);
  });

  it('composes stored clinical values with the aptitude snapshot', () => {
    const source = reportsSource();
    source.evaluaciones = [
      {
        id: 'evaluation-clinical',
        especialidad: Especialidad.CLINICA_MEDICA,
        resultado: ResultadoEspecialidad.APTO_CONDICIONAL,
        informe: {
          id: 'report-clinical',
          observaciones: 'Follow-up required',
          estado: InformeEstado.COMPLETO,
          updatedAt: new Date('2026-11-06T09:30:00.000Z'),
          profesional: { id: 'professional-1', nombre: 'Dr. Clinical' },
          atencion: null,
        },
      },
    ];
    source.resultadoAptitud = { aptitudFinal: ResultadoEspecialidad.APTO_CONDICIONAL };

    const [, clinical] = buildJourneyReports(source);

    expect(clinical).toEqual(
      expect.objectContaining({
        reportId: 'report-clinical',
        evaluationId: 'evaluation-clinical',
        specialty: Especialidad.CLINICA_MEDICA,
        reportState: 'Completo',
        applicant: { id: 'applicant-1', nombre: 'Ana', apellido: 'Pérez' },
        attentionNumber: 'AT-1042',
        originArea: 'Admisión',
        observations: 'Follow-up required',
        specialtyResult: ResultadoEspecialidad.APTO_CONDICIONAL,
        finalAptitude: ResultadoEspecialidad.APTO_CONDICIONAL,
      }),
    );
    expect(clinical.responsible).toEqual({
      area: Especialidad.CLINICA_MEDICA,
      professional: { id: 'professional-1', nombre: 'Dr. Clinical' },
    });
    expect(clinical.updatedAt).toEqual(new Date('2026-11-06T09:30:00.000Z'));
  });
});
