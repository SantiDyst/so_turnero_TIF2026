import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import {
  AtencionEstado,
  Especialidad,
  EvaluacionEstado,
  RecorridoEstado,
  ResultadoEspecialidad,
} from '@prisma/client';

import { RegistrationService } from '../../src/applicants/registration.service';
import { AptitudeService } from '../../src/aptitude/aptitude.service';
import { AttentionCommandService } from '../../src/attentions/attention-command.service';
import { CertificatesService } from '../../src/certificates/certificates.service';
import { EvaluationsService } from '../../src/evaluations/evaluations.service';
import { ProfessionalsService } from '../../src/professionals/professionals.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { ensureAttention } from '../support/attendance';
import { assertIsolatedSchema } from '../support/runtime';

describe('final certificate persistence', () => {
  const prisma = new PrismaService();
  const registration = new RegistrationService(prisma);
  const professionals = new ProfessionalsService();
  const attentions = new AttentionCommandService(prisma, professionals);
  const evaluations = new EvaluationsService(prisma);
  const aptitudeService = new AptitudeService(prisma);
  const certificates = new CertificatesService(prisma);

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
      apellido: 'Certificate',
      dni: `${name}-${sequence}-${Date.now()}`,
    });
  }

  async function completeSpecialty(
    journeyId: string,
    specialty: Especialidad,
    result?: ResultadoEspecialidad,
  ) {
    const evaluation = await prisma.client.evaluacion.findUniqueOrThrow({
      where: { recorridoId_especialidad: { recorridoId: journeyId, especialidad: specialty } },
    });
    await ensureAttention(prisma, journeyId, specialty);
    if (result) {
      await evaluations.setResult(evaluation.id, { resultado: result });
    }
    await evaluations.complete(evaluation.id);
  }

  async function closeJourney(journeyId: string) {
    await completeSpecialty(journeyId, Especialidad.BIOQUIMICA);
    await completeSpecialty(
      journeyId,
      Especialidad.CLINICA_MEDICA,
      ResultadoEspecialidad.APTO_CONDICIONAL,
    );
    await completeSpecialty(journeyId, Especialidad.PSICOLOGIA, ResultadoEspecialidad.APTO_PLENO);
    await aptitudeService.close(journeyId);
  }

  async function clinicalAttention(journeyId: string, professionalId: string) {
    const attention = await attentions.start(journeyId, {
      specialty: Especialidad.CLINICA_MEDICA,
      professionalId,
    });
    await attentions.finalize(attention.attentionId, { state: AtencionEstado.FINALIZADA });
    return attention.attentionId;
  }

  it('issues CERT-AT-1042 once with the latest clinical professional and repeats idempotently', async () => {
    const registered = await registerJourney('Deterministic');
    const journeyId = registered.journey.id;
    await prisma.client.recorrido.update({
      where: { id: journeyId },
      data: { numeroAtencion: 'AT-1042' },
    });

    const [firstProfessional, latestProfessional] = await Promise.all(
      ['Dr. Certificate First', 'Dr. Certificate Latest'].map((nombre) =>
        prisma.client.profesional.create({
          data: { nombre, especialidad: Especialidad.CLINICA_MEDICA },
        }),
      ),
    );
    await clinicalAttention(journeyId, firstProfessional.id);
    await clinicalAttention(journeyId, latestProfessional.id);
    await closeJourney(journeyId);

    await expect(certificates.read(journeyId)).rejects.toBeInstanceOf(NotFoundException);

    const results = await Promise.all([
      certificates.issue(journeyId, {}),
      certificates.issue(journeyId, {}),
    ]);
    const created = results.filter((result) => result.created);
    expect(created).toHaveLength(1);
    expect(results.map((result) => result.certificate)).toEqual([
      created[0]?.certificate,
      created[0]?.certificate,
    ]);

    const certificate = created[0]!.certificate;
    expect(certificate).toEqual(
      expect.objectContaining({
        identifier: 'CERT-AT-1042',
        attentionNumber: 'AT-1042',
        applicant: expect.objectContaining({ id: registered.applicant.id }),
        finalAptitude: 'APTO_CONDICIONAL',
        issuedAt: expect.any(Date),
        responsibleProfessional: {
          id: latestProfessional.id,
          nombre: 'Dr. Certificate Latest',
        },
      }),
    );

    const repeated = await certificates.issue(journeyId, {});
    expect(repeated.created).toBe(false);
    expect(repeated.certificate).toEqual(certificate);

    const stored = await prisma.client.certificado.findMany({ where: { recorridoId: journeyId } });
    expect(stored).toHaveLength(1);
    expect(stored[0]).toEqual(
      expect.objectContaining({
        identificador: 'CERT-AT-1042',
        aptitudFinal: ResultadoEspecialidad.APTO_CONDICIONAL,
        profesionalId: latestProfessional.id,
      }),
    );
  });

  it('issues without a clinical attention using an explicit clinical professional', async () => {
    const registered = await registerJourney('No Clinical');
    const journeyId = registered.journey.id;
    await closeJourney(journeyId);

    const psychologist = await prisma.client.profesional.create({
      data: { nombre: 'Dr. Not Clinical', especialidad: Especialidad.PSICOLOGIA },
    });
    const clinical = await prisma.client.profesional.create({
      data: { nombre: 'Dr. Explicit Clinical', especialidad: Especialidad.CLINICA_MEDICA },
    });

    await expect(
      certificates.issue(journeyId, { professionalId: psychologist.id }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      certificates.issue(journeyId, { professionalId: '00000000-0000-4000-8000-000000000000' }),
    ).rejects.toBeInstanceOf(NotFoundException);

    const issued = await certificates.issue(journeyId, { professionalId: clinical.id });
    expect(issued.created).toBe(true);
    expect(issued.certificate.responsibleProfessional).toEqual({
      id: clinical.id,
      nombre: 'Dr. Explicit Clinical',
    });
  });

  it('issues with a null professional when the journey has no clinical attention', async () => {
    const registered = await registerJourney('Null Professional');
    const journeyId = registered.journey.id;

    await prisma.client.evaluacion.updateMany({
      where: {
        recorridoId: journeyId,
        especialidad: { in: [Especialidad.CLINICA_MEDICA, Especialidad.PSICOLOGIA] },
      },
      data: { resultado: ResultadoEspecialidad.APTO_PLENO },
    });
    await prisma.client.evaluacion.updateMany({
      where: { recorridoId: journeyId },
      data: { estado: EvaluacionEstado.COMPLETA, completadaAt: new Date() },
    });
    await prisma.client.resultadoAptitud.create({
      data: {
        recorridoId: journeyId,
        resultadoClinico: ResultadoEspecialidad.APTO_PLENO,
        resultadoPsicologico: ResultadoEspecialidad.APTO_PLENO,
        aptitudFinal: ResultadoEspecialidad.APTO_PLENO,
      },
    });
    await prisma.client.recorrido.update({
      where: { id: journeyId },
      data: { estado: RecorridoEstado.CIERRE_FINAL },
    });

    const issued = await certificates.issue(journeyId, {});

    expect(issued.created).toBe(true);
    expect(issued.certificate.responsibleProfessional).toBeNull();
  });

  it('rejects issuance for ineligible journeys and unknown journeys', async () => {
    const open = await registerJourney('Not Closed');
    await expect(certificates.issue(open.journey.id, {})).rejects.toBeInstanceOf(ConflictException);

    const closedWithoutAptitude = await registerJourney('Closed Without Aptitude');
    await prisma.client.recorrido.update({
      where: { id: closedWithoutAptitude.journey.id },
      data: { estado: RecorridoEstado.CIERRE_FINAL },
    });
    await expect(certificates.issue(closedWithoutAptitude.journey.id, {})).rejects.toBeInstanceOf(
      ConflictException,
    );

    const stored = await prisma.client.certificado.count({
      where: {
        recorridoId: { in: [open.journey.id, closedWithoutAptitude.journey.id] },
      },
    });
    expect(stored).toBe(0);

    const missing = '00000000-0000-4000-8000-000000000000';
    await expect(certificates.issue(missing, {})).rejects.toBeInstanceOf(NotFoundException);
    await expect(certificates.read(missing)).rejects.toBeInstanceOf(NotFoundException);
  });
});
