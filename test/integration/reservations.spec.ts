import { ConflictException, NotFoundException } from '@nestjs/common';
import { Especialidad, ReservaEstado } from '@prisma/client';

import { ReservationsService } from '../../src/agenda/reservations.service';
import { RegistrationService } from '../../src/applicants/registration.service';
import { ProfessionalsService } from '../../src/professionals/professionals.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { rethrowPrismaConflict } from '../../src/shared/prisma-error.mapper';
import { assertIsolatedSchema } from '../support/runtime';

describe('protected agenda database invariants', () => {
  const prisma = new PrismaService();
  const registration = new RegistrationService(prisma);
  const professionals = new ProfessionalsService();
  const reservations = new ReservationsService(prisma, professionals);

  let sequence = 0;

  beforeAll(async () => {
    await assertIsolatedSchema();
  });

  afterAll(async () => {
    await prisma.client.$disconnect();
  });

  async function seedRecitation() {
    sequence += 1;
    const registered = await registration.register({
      nombre: `Agenda ${sequence}`,
      apellido: 'Reservation',
      dni: `agenda-${sequence}-${Date.now()}`,
    });
    const evaluation = await prisma.client.evaluacion.findUniqueOrThrow({
      where: {
        recorridoId_especialidad: {
          recorridoId: registered.journey.id,
          especialidad: Especialidad.CLINICA_MEDICA,
        },
      },
    });
    const pending = await prisma.client.pendiente.create({
      data: { evaluacionId: evaluation.id, motivo: 'Agenda pending' },
    });
    const recitation = await prisma.client.recitacion.create({
      data: {
        recorridoId: registered.journey.id,
        evaluacionId: evaluation.id,
        pendienteId: pending.id,
        especialidad: Especialidad.CLINICA_MEDICA,
        fechaHora: new Date('2026-12-01T09:00:00.000Z'),
      },
    });

    return { registered, evaluation, pending, recitation };
  }

  async function createProfessional(name: string) {
    return prisma.client.profesional.create({
      data: { nombre: name, especialidad: Especialidad.CLINICA_MEDICA },
    });
  }

  function interval(startHour: number, endHour: number, day = 15) {
    return {
      inicio: new Date(Date.UTC(2026, 11, day, startHour, 0, 0)),
      fin: new Date(Date.UTC(2026, 11, day, endHour, 0, 0)),
    };
  }

  it('rejects an overlapping reservation for the same professional', async () => {
    const professional = await createProfessional('Dr. Overlap');
    const first = await seedRecitation();
    const second = await seedRecitation();
    const slot = interval(10, 11);
    const overlap = interval(10, 11);
    overlap.inicio.setUTCMinutes(30);

    const created = await reservations.create({
      recitacionId: first.recitation.id,
      professionalId: professional.id,
      ...slot,
    });
    expect(created.state).toBe('RESERVADA');

    await expect(
      reservations.create({
        recitacionId: second.recitation.id,
        professionalId: professional.id,
        ...overlap,
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    const active = await prisma.client.reserva.findMany({
      where: { profesionalId: professional.id, estado: ReservaEstado.RESERVADA },
    });
    expect(active).toHaveLength(1);
    expect(active[0]?.id).toBe(created.id);
  });

  it('maps the database exclusion violation (SQLSTATE 23P01) to a conflict', async () => {
    const professional = await createProfessional('Dr. SqlState');
    const first = await seedRecitation();
    const second = await seedRecitation();
    await reservations.create({
      recitacionId: first.recitation.id,
      professionalId: professional.id,
      ...interval(11, 12),
    });

    const overlapping = prisma.client
      .$transaction(async (transaction) => {
        await transaction.reserva.create({
          data: {
            profesionalId: professional.id,
            recitacionId: second.recitation.id,
            inicio: new Date('2026-12-15T11:15:00.000Z'),
            fin: new Date('2026-12-15T11:45:00.000Z'),
            estado: ReservaEstado.RESERVADA,
          },
        });
      })
      .catch((error) => rethrowPrismaConflict(error, 'overlap'));

    await expect(overlapping).rejects.toBeInstanceOf(ConflictException);
    const count = await prisma.client.reserva.count({
      where: { profesionalId: professional.id, estado: ReservaEstado.RESERVADA },
    });
    expect(count).toBe(1);
  });

  it('serializes concurrent overlapping requests into one reservation and one conflict', async () => {
    const professional = await createProfessional('Dr. Concurrent');
    const first = await seedRecitation();
    const second = await seedRecitation();

    const results = await Promise.allSettled([
      reservations.create({
        recitacionId: first.recitation.id,
        professionalId: professional.id,
        ...interval(13, 14),
      }),
      reservations.create({
        recitacionId: second.recitation.id,
        professionalId: professional.id,
        inicio: new Date('2026-12-15T13:15:00.000Z'),
        fin: new Date('2026-12-15T14:15:00.000Z'),
      }),
    ]);

    const fulfilled = results.filter((result) => result.status === 'fulfilled');
    const rejected = results.filter((result) => result.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(ConflictException);

    const active = await prisma.client.reserva.count({
      where: { profesionalId: professional.id, estado: ReservaEstado.RESERVADA },
    });
    expect(active).toBe(1);
  });

  it('releases the slot when a reservation is cancelled', async () => {
    const professional = await createProfessional('Dr. Release');
    const first = await seedRecitation();
    const second = await seedRecitation();
    const slot = interval(14, 15);

    const created = await reservations.create({
      recitacionId: first.recitation.id,
      professionalId: professional.id,
      ...slot,
    });
    const cancelled = await reservations.cancel(created.id);
    expect(cancelled.state).toBe('CANCELADA');

    const replacement = await reservations.create({
      recitacionId: second.recitation.id,
      professionalId: professional.id,
      ...slot,
    });
    expect(replacement.state).toBe('RESERVADA');
  });

  it('chains reprogrammed reservations and frees the previous slot', async () => {
    const professional = await createProfessional('Dr. Reschedule');
    const first = await seedRecitation();
    const replacementRecitation = await seedRecitation();
    const original = await reservations.create({
      recitacionId: first.recitation.id,
      professionalId: professional.id,
      ...interval(15, 16),
    });

    const rescheduled = await reservations.reschedule(original.id, interval(16, 17));
    expect(rescheduled.state).toBe('RESERVADA');
    expect(rescheduled.previousReservationId).toBe(original.id);

    const previous = await prisma.client.reserva.findUniqueOrThrow({
      where: { id: original.id },
    });
    expect(previous.estado).toBe(ReservaEstado.REPROGRAMADA);

    const recitation = await prisma.client.recitacion.findUniqueOrThrow({
      where: { id: first.recitation.id },
    });
    expect(recitation.reservaId).toBe(rescheduled.id);

    const reusedSlot = await reservations.create({
      recitacionId: replacementRecitation.recitation.id,
      professionalId: professional.id,
      ...interval(15, 16),
    });
    expect(reusedSlot.state).toBe('RESERVADA');
  });

  it('guards every transition to a RESERVADA source state', async () => {
    const professional = await createProfessional('Dr. Guards');
    const first = await seedRecitation();
    const second = await seedRecitation();
    const created = await reservations.create({
      recitacionId: first.recitation.id,
      professionalId: professional.id,
      ...interval(17, 18),
    });

    const absent = await reservations.absent(created.id);
    expect(absent.state).toBe('AUSENTE');
    await expect(reservations.absent(created.id)).rejects.toBeInstanceOf(ConflictException);
    await expect(reservations.cancel(created.id)).rejects.toBeInstanceOf(ConflictException);
    await expect(reservations.fulfill(created.id)).rejects.toBeInstanceOf(ConflictException);
    await expect(reservations.reschedule(created.id, interval(18, 19))).rejects.toBeInstanceOf(
      ConflictException,
    );

    await expect(
      reservations.cancel('00000000-0000-4000-8000-000000000000'),
    ).rejects.toBeInstanceOf(NotFoundException);

    const pending = await seedRecitation();
    const cancellable = await reservations.create({
      recitacionId: pending.recitation.id,
      professionalId: professional.id,
      ...interval(18, 19),
    });
    await reservations.cancel(cancellable.id);
    await expect(reservations.fulfill(cancellable.id)).rejects.toBeInstanceOf(ConflictException);
    await expect(reservations.cancel(second.recitation.id)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('rejects a professional whose specialty does not match the recitation', async () => {
    const professional = await prisma.client.profesional.create({
      data: { nombre: 'Dr. Wrong Agenda', especialidad: Especialidad.BIOQUIMICA },
    });
    const seeded = await seedRecitation();

    await expect(
      reservations.create({
        recitacionId: seeded.recitation.id,
        professionalId: professional.id,
        ...interval(19, 20),
      }),
    ).rejects.toBeTruthy();
    expect(await prisma.client.reserva.count({ where: { profesionalId: professional.id } })).toBe(
      0,
    );
  });
});
