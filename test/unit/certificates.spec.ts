import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Especialidad, ResultadoEspecialidad } from '@prisma/client';

import {
  buildCertificateView,
  certificateIdentifier,
} from '../../src/certificates/certificate.view';
import { CertificatesController } from '../../src/certificates/certificates.controller';
import {
  IssueCertificateResult,
  resolveResponsibleProfessional,
} from '../../src/certificates/certificates.service';

type CertificateServiceMock = {
  issue: jest.Mock;
  read: jest.Mock;
};

function makeController(service: CertificateServiceMock): CertificatesController {
  return new CertificatesController(service as never);
}

function serviceMock(): CertificateServiceMock {
  return { issue: jest.fn(), read: jest.fn() };
}

function responseMock() {
  return { status: jest.fn() };
}

const issuedAt = new Date('2026-11-10T12:00:00.000Z');

const certificateRecord = {
  id: 'certificate-1',
  identificador: 'CERT-AT-1042',
  aptitudFinal: ResultadoEspecialidad.APTO_CONDICIONAL,
  emitidoAt: issuedAt,
  profesional: { id: 'professional-1', nombre: 'Dr. Clinical' },
};

describe('certificate view', () => {
  it('builds a deterministic identifier from the attention number', () => {
    expect(certificateIdentifier('AT-1042')).toBe('CERT-AT-1042');
  });

  it('exposes the aptitude snapshot, issue date, and professional', () => {
    expect(
      buildCertificateView({
        certificate: certificateRecord,
        attentionNumber: 'AT-1042',
        applicant: { id: 'applicant-1', nombre: 'Ana', apellido: 'Pérez' },
      }),
    ).toEqual({
      id: 'certificate-1',
      identifier: 'CERT-AT-1042',
      attentionNumber: 'AT-1042',
      applicant: { id: 'applicant-1', nombre: 'Ana', apellido: 'Pérez' },
      finalAptitude: 'APTO_CONDICIONAL',
      issuedAt,
      responsibleProfessional: { id: 'professional-1', nombre: 'Dr. Clinical' },
    });
  });

  it('accepts a null responsible professional', () => {
    const view = buildCertificateView({
      certificate: { ...certificateRecord, profesional: null },
      attentionNumber: 'AT-1042',
      applicant: { id: 'applicant-1', nombre: 'Ana', apellido: 'Pérez' },
    });

    expect(view.responsibleProfessional).toBeNull();
  });
});

describe('certificate body validation', () => {
  it('accepts an omitted professionalId', async () => {
    const service = serviceMock();
    const controller = makeController(service);
    const response = responseMock();
    service.issue.mockReturnValue({ created: true, certificate: { id: 'certificate-1' } });

    await controller.issue('journey-1', {}, response as never);

    expect(service.issue).toHaveBeenCalledWith('journey-1', {});
    expect(response.status).toHaveBeenCalledWith(201);
  });

  it('trims an explicit professionalId', async () => {
    const service = serviceMock();
    const controller = makeController(service);
    service.issue.mockReturnValue({ created: false, certificate: { id: 'certificate-1' } });

    const result = await controller.issue(
      'journey-1',
      { professionalId: ' professional-1 ' },
      responseMock() as never,
    );

    expect(service.issue).toHaveBeenCalledWith('journey-1', {
      professionalId: 'professional-1',
    });
    expect(result).toEqual({ id: 'certificate-1' });
  });

  it('rejects a blank or non-string professionalId without calling the service', async () => {
    const service = serviceMock();
    const controller = makeController(service);

    await expect(
      controller.issue('journey-1', { professionalId: '   ' }, responseMock() as never),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      controller.issue('journey-1', { professionalId: 42 }, responseMock() as never),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(service.issue).not.toHaveBeenCalled();
  });

  it('returns 200 for an existing certificate', async () => {
    const service = serviceMock();
    const controller = makeController(service);
    const response = responseMock();
    const existing: IssueCertificateResult = {
      created: false,
      certificate: {
        id: 'certificate-1',
        identifier: 'CERT-AT-1042',
        attentionNumber: 'AT-1042',
        applicant: { id: 'applicant-1', nombre: 'Ana', apellido: 'Pérez' },
        finalAptitude: 'APTO_CONDICIONAL',
        issuedAt,
        responsibleProfessional: null,
      },
    };
    service.issue.mockResolvedValue(existing);

    await expect(controller.issue('journey-1', {}, response as never)).resolves.toEqual(
      existing.certificate,
    );
    expect(response.status).toHaveBeenCalledWith(200);
  });
});

describe('responsible professional resolution', () => {
  const clinical = {
    id: 'clinical-1',
    nombre: 'Dr. Clinical',
    especialidad: Especialidad.CLINICA_MEDICA,
  };
  const psychologist = {
    id: 'psychologist-1',
    nombre: 'Dr. Psychology',
    especialidad: Especialidad.PSICOLOGIA,
  };

  it('prefers the explicit clinical professional', () => {
    expect(resolveResponsibleProfessional('clinical-1', clinical, psychologist)).toBe(clinical);
  });

  it('rejects an explicit professional from another specialty with 400', () => {
    expect(() => resolveResponsibleProfessional('psychologist-1', psychologist, null)).toThrow(
      BadRequestException,
    );
  });

  it('rejects an unknown explicit professional with 404', () => {
    expect(() => resolveResponsibleProfessional('missing', null, clinical)).toThrow(
      NotFoundException,
    );
  });

  it('falls back to the latest clinical professional', () => {
    expect(resolveResponsibleProfessional(undefined, null, clinical)).toBe(clinical);
  });

  it('returns null when there is no clinical attention', () => {
    expect(resolveResponsibleProfessional(undefined, null, null)).toBeNull();
  });
});
