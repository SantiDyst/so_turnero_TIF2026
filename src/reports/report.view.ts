import { Especialidad, InformeEstado, ResultadoEspecialidad } from '@prisma/client';

import { InformeState, SUPPORTED_SPECIALTIES, toInformeState } from '../shared/state-vocabulary';

export const ADMISSION_ORIGIN_AREA = 'Admisión';

export interface ReportApplicantView {
  id: string;
  nombre: string;
  apellido: string;
}

export interface ReportProfessionalView {
  id: string;
  nombre: string;
}

export interface ReportRecordSource {
  id: string;
  observaciones: string;
  estado: InformeEstado;
  updatedAt: Date;
  profesional: ReportProfessionalView | null;
  atencion: { profesional: ReportProfessionalView | null } | null;
}

export interface ReportEvaluationSource {
  id: string;
  especialidad: Especialidad;
  resultado: ResultadoEspecialidad | null;
  informe: ReportRecordSource | null;
}

export interface JourneyReportsSource {
  numeroAtencion: string;
  postulante: ReportApplicantView;
  evaluaciones: ReportEvaluationSource[];
  resultadoAptitud: { aptitudFinal: ResultadoEspecialidad } | null;
}

export interface ReportEntryView {
  reportId: string | null;
  evaluationId: string | null;
  specialty: Especialidad;
  reportState: (typeof InformeState)[keyof typeof InformeState];
  applicant: ReportApplicantView;
  attentionNumber: string;
  originArea: typeof ADMISSION_ORIGIN_AREA;
  responsible: {
    area: Especialidad;
    professional: ReportProfessionalView | null;
  };
  observations: string | null;
  specialtyResult: ResultadoEspecialidad | null;
  finalAptitude: ResultadoEspecialidad | null;
  updatedAt: Date | null;
}

export interface ReportEntrySource {
  specialty: Especialidad;
  evaluation: { id: string; resultado: ResultadoEspecialidad | null } | null;
  applicant: ReportApplicantView;
  attentionNumber: string;
  finalAptitude: ResultadoEspecialidad | null;
  report: ReportRecordSource | null;
}

export function buildReportEntry(source: ReportEntrySource): ReportEntryView {
  const { report } = source;
  const professional = report?.profesional ?? report?.atencion?.profesional ?? null;

  return {
    reportId: report?.id ?? null,
    evaluationId: source.evaluation?.id ?? null,
    specialty: source.specialty,
    reportState: report ? toInformeState(report.estado) : InformeState.pending,
    applicant: source.applicant,
    attentionNumber: source.attentionNumber,
    originArea: ADMISSION_ORIGIN_AREA,
    responsible: {
      area: source.specialty,
      professional: professional ? { id: professional.id, nombre: professional.nombre } : null,
    },
    observations: report?.observaciones ?? null,
    specialtyResult:
      source.specialty === Especialidad.BIOQUIMICA ? null : (source.evaluation?.resultado ?? null),
    finalAptitude: source.finalAptitude,
    updatedAt: report?.updatedAt ?? null,
  };
}

export function buildJourneyReports(source: JourneyReportsSource): ReportEntryView[] {
  return SUPPORTED_SPECIALTIES.map((specialty) => {
    const evaluation =
      source.evaluaciones.find((candidate) => candidate.especialidad === specialty) ?? null;

    return buildReportEntry({
      specialty,
      evaluation: evaluation ? { id: evaluation.id, resultado: evaluation.resultado } : null,
      applicant: source.postulante,
      attentionNumber: source.numeroAtencion,
      finalAptitude: source.resultadoAptitud?.aptitudFinal ?? null,
      report: evaluation?.informe ?? null,
    });
  });
}
