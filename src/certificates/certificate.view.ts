import { ResultadoEspecialidad } from '@prisma/client';

import { AptitudeState, toAptitudeState } from '../shared/state-vocabulary';

export interface CertificateApplicantView {
  id: string;
  nombre: string;
  apellido: string;
}

export interface CertificateProfessionalView {
  id: string;
  nombre: string;
}

export interface CertificateRecordSource {
  id: string;
  identificador: string;
  token: string;
  aptitudFinal: ResultadoEspecialidad;
  emitidoAt: Date;
  profesional: CertificateProfessionalView | null;
}

export interface CertificateView {
  id: string;
  identifier: string;
  attentionNumber: string;
  applicant: CertificateApplicantView;
  finalAptitude: (typeof AptitudeState)[keyof typeof AptitudeState];
  issuedAt: Date;
  responsibleProfessional: CertificateProfessionalView | null;
  shareToken: string;
}

export interface PublicCertificateView {
  identifier: string;
  attentionNumber: string;
  applicant: CertificateApplicantView;
  finalAptitude: (typeof AptitudeState)[keyof typeof AptitudeState];
  issuedAt: Date;
  responsibleProfessional: CertificateProfessionalView | null;
}

export function certificateIdentifier(attentionNumber: string): string {
  return `CERT-${attentionNumber}`;
}

export function buildCertificateView(source: {
  certificate: CertificateRecordSource;
  attentionNumber: string;
  applicant: CertificateApplicantView;
}): CertificateView {
  return {
    id: source.certificate.id,
    identifier: source.certificate.identificador,
    attentionNumber: source.attentionNumber,
    applicant: source.applicant,
    finalAptitude: toAptitudeState(source.certificate.aptitudFinal),
    issuedAt: source.certificate.emitidoAt,
    responsibleProfessional: source.certificate.profesional
      ? {
          id: source.certificate.profesional.id,
          nombre: source.certificate.profesional.nombre,
        }
      : null,
    shareToken: source.certificate.token,
  };
}

export function buildPublicCertificateView(source: {
  certificate: CertificateRecordSource;
  attentionNumber: string;
  applicant: CertificateApplicantView;
}): PublicCertificateView {
  const view = buildCertificateView(source);

  return {
    identifier: view.identifier,
    attentionNumber: view.attentionNumber,
    applicant: view.applicant,
    finalAptitude: view.finalAptitude,
    issuedAt: view.issuedAt,
    responsibleProfessional: view.responsibleProfessional,
  };
}
