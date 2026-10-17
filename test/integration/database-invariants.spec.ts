import { AtencionEstado, DisponibilidadProfesional, Prisma, RecorridoEstado } from '@prisma/client';

import { RegistrationService } from '../../src/applicants/registration.service';
import { AttentionCommandService } from '../../src/attentions/attention-command.service';
import { ProfessionalsService } from '../../src/professionals/professionals.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { assertIsolatedSchema } from '../support/runtime';

describe('isolated database invariants', () => {
  const prisma = new PrismaService();
  const registration = new RegistrationService(prisma);
  const professionals = new ProfessionalsService();
  const attention = new AttentionCommandService(prisma, professionals);

  beforeAll(async () => {
    await assertIsolatedSchema();
  });

  afterAll(async () => {
    await prisma.client.$disconnect();
  });

  it('applies the migration and assigns distinct attention numbers', async () => {
    const migrationTable = await prisma.client.$queryRaw<{ exists: boolean }[]>(
      Prisma.sql`SELECT to_regclass('_prisma_migrations') IS NOT NULL AS "exists"`,
    );
    expect(migrationTable[0]?.exists).toBe(true);

    const first = await registration.register({ nombre: 'Ada', apellido: 'One', dni: '100' });
    const second = await registration.register({ nombre: 'Bea', apellido: 'Two', dni: '200' });
    expect(first.journey.attentionNumber).toMatch(/^AT-\d{4,}$/);
    expect(second.journey.attentionNumber).not.toBe(first.journey.attentionNumber);
  });

  it('enforces the partial active-attention index and rolls back a failing aggregate', async () => {
    const applicant = await registration.register({ nombre: 'Cai', apellido: 'Three', dni: '300' });
    const professional = await prisma.client.profesional.create({ data: { nombre: 'Dr. Index' } });
    await prisma.client.atencion.create({
      data: {
        recorridoId: applicant.journey.id,
        postulanteId: applicant.applicant.id,
        especialidad: 'Clinical',
        profesionalId: professional.id,
        estado: AtencionEstado.EN_ATENCION,
        startedAt: new Date(),
      },
    });
    await expect(
      prisma.client.atencion.create({
        data: {
          recorridoId: applicant.journey.id,
          postulanteId: applicant.applicant.id,
          especialidad: 'Clinical',
          profesionalId: professional.id,
          estado: AtencionEstado.EN_ATENCION,
          startedAt: new Date(),
        },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });

    const before = await prisma.client.postulante.count();
    await expect(
      prisma.client.$transaction(async (transaction) => {
        const partial = await transaction.postulante.create({
          data: { nombre: 'Rollback', apellido: 'Case', dni: '400' },
        });
        await transaction.recorrido.create({
          data: {
            postulanteId: partial.id,
            numeroAtencion: applicant.journey.attentionNumber,
            estado: RecorridoEstado.EN_ESPERA,
          },
        });
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
    expect(await prisma.client.postulante.count()).toBe(before);
  });

  it('releases the professional while preserving the in-progress journey', async () => {
    const applicant = await registration.register({ nombre: 'Dee', apellido: 'Four', dni: '500' });
    const professional = await prisma.client.profesional.create({
      data: { nombre: 'Dr. Release' },
    });
    const started = await attention.start(applicant.journey.id, {
      specialty: 'Occupational medicine',
      professionalId: professional.id,
    });

    const result = await attention.finalize(started.attentionId, {
      state: AtencionEstado.FINALIZADA,
    });
    const journey = await prisma.client.recorrido.findUniqueOrThrow({
      where: { id: applicant.journey.id },
    });
    const released = await prisma.client.profesional.findUniqueOrThrow({
      where: { id: professional.id },
    });
    expect(result.state).toBe('Finalizada');
    expect(journey.estado).toBe(RecorridoEstado.EN_PROCESO);
    expect(released.disponibilidad).toBe(DisponibilidadProfesional.DISPONIBLE);
  });
});
