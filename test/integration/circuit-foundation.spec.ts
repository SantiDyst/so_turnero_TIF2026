import { Especialidad, EvaluacionEstado, Prisma } from '@prisma/client';

import { RegistrationService } from '../../src/applicants/registration.service';
import { QueueQueryService } from '../../src/journeys/queue-query.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { assertIsolatedSchema } from '../support/runtime';

describe('circuit foundation database invariants', () => {
  const prisma = new PrismaService();
  const registration = new RegistrationService(prisma);
  const journeys = new QueueQueryService(prisma);

  beforeAll(async () => {
    await assertIsolatedSchema();
  });

  afterAll(async () => {
    await prisma.client.$disconnect();
  });

  it('creates exactly three evaluations with the journey', async () => {
    const registered = await registration.register({
      nombre: 'Eva',
      apellido: 'Foundation',
      dni: '900',
    });

    const evaluations = await prisma.client.evaluacion.findMany({
      where: { recorridoId: registered.journey.id },
      orderBy: { especialidad: 'asc' },
    });

    expect(evaluations).toHaveLength(3);
    expect(evaluations.map((evaluation) => evaluation.especialidad)).toEqual([
      Especialidad.BIOQUIMICA,
      Especialidad.CLINICA_MEDICA,
      Especialidad.PSICOLOGIA,
    ]);
    expect(
      evaluations.every((evaluation) => evaluation.estado === EvaluacionEstado.PENDIENTE),
    ).toBe(true);

    const journey = await journeys.findJourney(registered.applicant.id);
    expect(journey.evaluations).toHaveLength(3);
    expect(journey.pendings).toEqual([]);
    expect(journey.recitations).toEqual([]);
    expect(journey.reservations).toEqual([]);
    expect(journey.derivations).toEqual([]);
    expect(journey.aptitude).toBeNull();
    expect(journey.journey.derivedState).toBeNull();
  });

  it('rejects a duplicate specialty evaluation and rolls the aggregate back', async () => {
    const registered = await registration.register({
      nombre: 'Dup',
      apellido: 'Specialty',
      dni: '901',
    });
    await expect(
      prisma.client.evaluacion.create({
        data: {
          recorridoId: registered.journey.id,
          especialidad: Especialidad.CLINICA_MEDICA,
        },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });

    const before = await prisma.client.postulante.count();
    const attentionNumber = `AT-ROLLBACK-${Date.now()}`;
    await expect(
      prisma.client.$transaction(async (transaction) => {
        const applicant = await transaction.postulante.create({
          data: { nombre: 'Rolled', apellido: 'Back', dni: '902' },
        });
        const journey = await transaction.recorrido.create({
          data: { postulanteId: applicant.id, numeroAtencion: attentionNumber },
        });
        await transaction.evaluacion.create({
          data: { recorridoId: journey.id, especialidad: Especialidad.BIOQUIMICA },
        });
        await transaction.evaluacion.create({
          data: { recorridoId: journey.id, especialidad: Especialidad.BIOQUIMICA },
        });
      }),
    ).rejects.toMatchObject({ code: 'P2002' });

    expect(await prisma.client.postulante.count()).toBe(before);
    expect(
      await prisma.client.recorrido.findUnique({ where: { numeroAtencion: attentionNumber } }),
    ).toBeNull();
    expect(
      await prisma.client.evaluacion.count({
        where: { recorrido: { numeroAtencion: attentionNumber } },
      }),
    ).toBe(0);
  });

  it('rejects a missing or unsupported professional specialty', async () => {
    await expect(
      prisma.client.profesional.create({
        data: { nombre: 'No Specialty' } as never,
      }),
    ).rejects.toBeTruthy();

    await expect(
      prisma.client.$executeRawUnsafe(
        `INSERT INTO "Profesional" ("id", "nombre", "especialidad", "disponibilidad", "createdAt", "updatedAt")
         VALUES ('00000000-0000-4000-8000-000000000001', 'Invalid Specialty', 'CARDIOLOGIA', 'Disponible', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      ),
    ).rejects.toBeTruthy();

    expect(await prisma.client.profesional.count({ where: { nombre: 'Invalid Specialty' } })).toBe(
      0,
    );
    expect(await prisma.client.profesional.count({ where: { nombre: 'No Specialty' } })).toBe(0);
  });

  it('preserves the active-attention index and adds circuit uniqueness', async () => {
    const indexes = await prisma.client.$queryRaw<{ indexname: string }[]>(
      Prisma.sql`SELECT indexname FROM pg_indexes WHERE schemaname = current_schema()`,
    );
    const names = indexes.map((index) => index.indexname);

    expect(names).toContain('atencion_one_active_per_applicant');
    expect(names).toContain('Evaluacion_recorridoId_especialidad_key');
    expect(names).toContain('ResultadoAptitud_recorridoId_key');
    expect(names).toContain('Atencion_recitacionId_key');
    expect(names).toContain('Recitacion_reservaId_key');
  });

  it('stores reservation interval columns as timestamptz(3)', async () => {
    const columns = await prisma.client.$queryRaw<
      { column_name: string; data_type: string; datetime_precision: number }[]
    >(
      Prisma.sql`SELECT column_name, data_type, datetime_precision
                 FROM information_schema.columns
                 WHERE table_schema = current_schema()
                   AND table_name = 'Reserva'
                   AND column_name IN ('inicio', 'fin')
                 ORDER BY column_name`,
    );

    expect(columns).toHaveLength(2);
    for (const column of columns) {
      expect(column.data_type).toBe('timestamp with time zone');
      expect(column.datetime_precision).toBe(3);
    }
  });
});
