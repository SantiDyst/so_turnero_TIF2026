import { ConflictException, NotFoundException } from '@nestjs/common';
import { AtencionEstado, Especialidad, InformeEstado, ResultadoEspecialidad } from '@prisma/client';

import { RegistrationService } from '../../src/applicants/registration.service';
import { AptitudeService } from '../../src/aptitude/aptitude.service';
import { AttentionCommandService } from '../../src/attentions/attention-command.service';
import { EvaluationsService } from '../../src/evaluations/evaluations.service';
import { ProfessionalsService } from '../../src/professionals/professionals.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { ReportsService } from '../../src/reports/reports.service';
import { ensureAttention } from '../support/attendance';
import { assertIsolatedSchema } from '../support/runtime';

describe('specialty reports persistence', () => {
  const prisma = new PrismaService();
  const registration = new RegistrationService(prisma);
  const professionals = new ProfessionalsService();
  const attentions = new AttentionCommandService(prisma, professionals);
  const evaluations = new EvaluationsService(prisma);
  const aptitudeService = new AptitudeService(prisma);
  const reports = new ReportsService(prisma);

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
      apellido: 'Reports',
      dni: `${name}-${sequence}-${Date.now()}`,
    });
  }

  async function clinicalEvaluation(journeyId: string) {
    return prisma.client.evaluacion.findUniqueOrThrow({
      where: {
        recorridoId_especialidad: {
          recorridoId: journeyId,
          especialidad: Especialidad.CLINICA_MEDICA,
        },
      },
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

  async function circuitSnapshot(journeyId: string) {
    const [journey, evaluationRows, pendingRows, aptitude, readiness] = await Promise.all([
      prisma.client.recorrido.findUniqueOrThrow({
        where: { id: journeyId },
        select: { estado: true },
      }),
      prisma.client.evaluacion.findMany({
        where: { recorridoId: journeyId },
        orderBy: { especialidad: 'asc' },
        select: {
          id: true,
          especialidad: true,
          estado: true,
          resultado: true,
          completadaAt: true,
        },
      }),
      prisma.client.pendiente.findMany({
        where: { evaluacion: { recorridoId: journeyId } },
        orderBy: { id: 'asc' },
        select: { id: true, resueltoAt: true },
      }),
      prisma.client.resultadoAptitud.findUnique({ where: { recorridoId: journeyId } }),
      aptitudeService.readiness(journeyId),
    ]);

    return { journey, evaluationRows, pendingRows, aptitude, readiness };
  }

  it('reuses one report row for a recitation and leaves the circuit unchanged', async () => {
    const registered = await registerJourney('Recitation');
    const journeyId = registered.journey.id;
    const professional = await prisma.client.profesional.create({
      data: { nombre: 'Dr. Report', especialidad: Especialidad.CLINICA_MEDICA },
    });

    const first = await attentions.start(journeyId, {
      specialty: Especialidad.CLINICA_MEDICA,
      professionalId: professional.id,
    });
    await attentions.finalize(first.attentionId, { state: AtencionEstado.FINALIZADA });

    const clinical = await clinicalEvaluation(journeyId);
    const pending = await evaluations.createPending(first.attentionId, {
      motivo: 'Retrieve labs',
      fechaLimite: null,
    });

    const saved = await reports.saveReport(first.attentionId, {
      observations: 'First clinical note',
      state: InformeEstado.COMPLETO,
    });
    expect(saved).toEqual(
      expect.objectContaining({
        evaluationId: clinical.id,
        specialty: Especialidad.CLINICA_MEDICA,
        reportState: 'Completo',
        attentionNumber: registered.journey.attentionNumber,
        originArea: 'Admisión',
        observations: 'First clinical note',
        specialtyResult: null,
        finalAptitude: null,
      }),
    );
    expect(saved.responsible).toEqual({
      area: Especialidad.CLINICA_MEDICA,
      professional: { id: professional.id, nombre: 'Dr. Report' },
    });

    const recitation = await attentions.start(journeyId, {
      specialty: Especialidad.CLINICA_MEDICA,
      professionalId: professional.id,
    });
    expect(recitation.attentionId).not.toBe(first.attentionId);

    const before = await circuitSnapshot(journeyId);
    const updated = await reports.saveReport(recitation.attentionId, {
      observations: 'Recitation note',
      state: InformeEstado.COMPLETO,
    });
    const after = await circuitSnapshot(journeyId);

    expect(updated.reportId).toBe(saved.reportId);
    expect(updated.observations).toBe('Recitation note');

    const stored = await prisma.client.informe.findMany({
      where: { evaluacionId: clinical.id },
    });
    expect(stored).toHaveLength(1);
    expect(stored[0]).toEqual(
      expect.objectContaining({
        observaciones: 'Recitation note',
        estado: InformeEstado.COMPLETO,
        atencionId: recitation.attentionId,
      }),
    );
    expect(stored[0]?.completadoAt).toBeInstanceOf(Date);

    expect(after).toEqual(before);
    const pendingRow = await prisma.client.pendiente.findUniqueOrThrow({
      where: { id: pending.id },
    });
    expect(pendingRow.resueltoAt).toBeNull();

    const read = await reports.listJourneyReports(journeyId);
    expect(read.reports.map((report) => report.specialty)).toEqual([
      Especialidad.BIOQUIMICA,
      Especialidad.CLINICA_MEDICA,
      Especialidad.PSICOLOGIA,
    ]);
    expect(read.reports[1]).toEqual(
      expect.objectContaining({
        reportId: saved.reportId,
        reportState: 'Completo',
        observations: 'Recitation note',
      }),
    );
  });

  it('rejects writes after closure while reads stay available', async () => {
    const registered = await registerJourney('Closed Reports');
    const journeyId = registered.journey.id;
    const professional = await prisma.client.profesional.create({
      data: { nombre: 'Dr. Closure', especialidad: Especialidad.CLINICA_MEDICA },
    });

    const attention = await attentions.start(journeyId, {
      specialty: Especialidad.CLINICA_MEDICA,
      professionalId: professional.id,
    });
    await attentions.finalize(attention.attentionId, { state: AtencionEstado.FINALIZADA });

    const saved = await reports.saveReport(attention.attentionId, {
      observations: 'Prepared before closure',
      state: InformeEstado.COMPLETO,
    });

    await completeSpecialty(journeyId, Especialidad.BIOQUIMICA);
    await completeSpecialty(
      journeyId,
      Especialidad.CLINICA_MEDICA,
      ResultadoEspecialidad.APTO_CONDICIONAL,
    );
    await completeSpecialty(journeyId, Especialidad.PSICOLOGIA, ResultadoEspecialidad.APTO_PLENO);
    await aptitudeService.close(journeyId);

    await expect(
      reports.saveReport(attention.attentionId, {
        observations: 'After closure',
        state: InformeEstado.COMPLETO,
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    const stored = await prisma.client.informe.findUniqueOrThrow({
      where: { evaluacionId: saved.evaluationId! },
    });
    expect(stored.observaciones).toBe('Prepared before closure');

    const read = await reports.listJourneyReports(journeyId);
    expect(read.reports).toHaveLength(3);
    expect(read.reports[1]).toEqual(
      expect.objectContaining({
        reportId: saved.reportId,
        reportState: 'Completo',
        observations: 'Prepared before closure',
        specialtyResult: ResultadoEspecialidad.APTO_CONDICIONAL,
        finalAptitude: ResultadoEspecialidad.APTO_CONDICIONAL,
      }),
    );
    expect(read.reports[0]?.specialtyResult).toBeNull();
    expect(read.reports[0]?.finalAptitude).toBe(ResultadoEspecialidad.APTO_CONDICIONAL);
  });

  it('rejects unknown attentions, journeys, and professionals', async () => {
    const missing = '00000000-0000-4000-8000-000000000000';
    await expect(
      reports.saveReport(missing, {
        observations: 'Unknown attention',
        state: InformeEstado.PENDIENTE,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(reports.listJourneyReports(missing)).rejects.toBeInstanceOf(NotFoundException);

    const registered = await registerJourney('Unknown Professional');
    const professional = await prisma.client.profesional.create({
      data: { nombre: 'Dr. Known', especialidad: Especialidad.CLINICA_MEDICA },
    });
    const attention = await attentions.start(registered.journey.id, {
      specialty: Especialidad.CLINICA_MEDICA,
      professionalId: professional.id,
    });

    await expect(
      reports.saveReport(attention.attentionId, {
        observations: 'Unknown professional',
        state: InformeEstado.PENDIENTE,
        professionalId: missing,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
