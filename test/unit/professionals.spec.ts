import { DisponibilidadProfesional, Especialidad } from '@prisma/client';

import { ProfessionalQueryService } from '../../src/professionals/professional-query.service';
import { ProfessionalsController } from '../../src/professionals/professionals.controller';

function serviceWith(rows: unknown[]) {
  const findMany = jest.fn().mockResolvedValue(rows);
  const prisma = { client: { profesional: { findMany } } };

  return { service: new ProfessionalQueryService(prisma as never), findMany };
}

describe('professional listing', () => {
  it('maps stored professionals to the public listing shape', async () => {
    const { service, findMany } = serviceWith([
      {
        id: 'professional-bio',
        nombre: 'Dra. Bio',
        especialidad: Especialidad.BIOQUIMICA,
        disponibilidad: DisponibilidadProfesional.DISPONIBLE,
      },
    ]);

    await expect(service.list()).resolves.toEqual([
      {
        id: 'professional-bio',
        name: 'Dra. Bio',
        specialty: Especialidad.BIOQUIMICA,
        availability: 'Disponible',
      },
    ]);

    expect(findMany).toHaveBeenCalledWith({
      orderBy: [{ especialidad: 'asc' }, { nombre: 'asc' }],
      select: { id: true, nombre: true, especialidad: true, disponibilidad: true },
    });
  });

  it('reports a busy professional through the shared availability vocabulary', async () => {
    const { service } = serviceWith([
      {
        id: 'professional-clinical',
        nombre: 'Dr. Clinical',
        especialidad: Especialidad.CLINICA_MEDICA,
        disponibilidad: DisponibilidadProfesional.OCUPADO,
      },
    ]);

    const [listed] = await service.list();

    expect(listed).toEqual(
      expect.objectContaining({ availability: 'Ocupado', specialty: Especialidad.CLINICA_MEDICA }),
    );
  });

  it('delegates the controller route to the query service', async () => {
    const list = jest.fn().mockResolvedValue([]);
    const controller = new ProfessionalsController({ list } as unknown as ProfessionalQueryService);

    await expect(controller.list()).resolves.toEqual([]);
    expect(list).toHaveBeenCalledTimes(1);
  });
});
