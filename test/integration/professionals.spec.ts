import { DisponibilidadProfesional, Especialidad } from '@prisma/client';

import { ProfessionalQueryService } from '../../src/professionals/professional-query.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { assertIsolatedSchema } from '../support/runtime';

describe('professional listing read model', () => {
  const prisma = new PrismaService();
  const service = new ProfessionalQueryService(prisma);
  const stamp = Date.now().toString(36);

  beforeAll(async () => {
    await assertIsolatedSchema();
  });

  afterAll(async () => {
    await prisma.client.$disconnect();
  });

  it('lists the seeded specialties ordered by specialty then name', async () => {
    const bio = await prisma.client.profesional.create({
      data: {
        nombre: `A Bioquimica ${stamp}`,
        especialidad: Especialidad.BIOQUIMICA,
        disponibilidad: DisponibilidadProfesional.DISPONIBLE,
      },
    });
    const clinical = await prisma.client.profesional.create({
      data: {
        nombre: `B Clinica ${stamp}`,
        especialidad: Especialidad.CLINICA_MEDICA,
        disponibilidad: DisponibilidadProfesional.OCUPADO,
      },
    });
    const psychological = await prisma.client.profesional.create({
      data: {
        nombre: `C Psicologia ${stamp}`,
        especialidad: Especialidad.PSICOLOGIA,
        disponibilidad: DisponibilidadProfesional.DISPONIBLE,
      },
    });

    const created = [bio.id, clinical.id, psychological.id];
    const listed = (await service.list()).filter((professional) =>
      created.includes(professional.id),
    );

    expect(listed.map((professional) => professional.id)).toEqual(created);
    expect(listed[0]).toEqual({
      id: bio.id,
      name: bio.nombre,
      specialty: Especialidad.BIOQUIMICA,
      availability: 'Disponible',
    });
    expect(listed[1]).toEqual({
      id: clinical.id,
      name: clinical.nombre,
      specialty: Especialidad.CLINICA_MEDICA,
      availability: 'Ocupado',
    });
  });

  it('orders professionals by name within the same specialty', async () => {
    const first = await prisma.client.profesional.create({
      data: {
        nombre: `A Clinical ${stamp}`,
        especialidad: Especialidad.CLINICA_MEDICA,
      },
    });
    const second = await prisma.client.profesional.create({
      data: {
        nombre: `Z Clinical ${stamp}`,
        especialidad: Especialidad.CLINICA_MEDICA,
      },
    });

    const listed = (await service.list()).filter((professional) =>
      [first.id, second.id].includes(professional.id),
    );

    expect(listed.map((professional) => professional.id)).toEqual([first.id, second.id]);
  });

  it('reads without changing availability or records', async () => {
    const professional = await prisma.client.profesional.create({
      data: {
        nombre: `Read Only ${stamp}`,
        especialidad: Especialidad.BIOQUIMICA,
        disponibilidad: DisponibilidadProfesional.OCUPADO,
      },
    });
    const before = await prisma.client.profesional.count();

    await service.list();

    const after = await prisma.client.profesional.findUniqueOrThrow({
      where: { id: professional.id },
    });

    expect(after.disponibilidad).toBe(DisponibilidadProfesional.OCUPADO);
    expect(await prisma.client.profesional.count()).toBe(before);
  });
});
