import { Injectable } from '@nestjs/common';
import { Especialidad } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { toProfessionalAvailability } from '../shared/state-vocabulary';

export interface ProfessionalListItem {
  id: string;
  name: string;
  specialty: Especialidad;
  availability: string;
  accountLinked: boolean;
}

@Injectable()
export class ProfessionalQueryService {
  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<ProfessionalListItem[]> {
    const professionals = await this.prisma.client.profesional.findMany({
      orderBy: [{ especialidad: 'asc' }, { nombre: 'asc' }],
      select: {
        id: true,
        nombre: true,
        especialidad: true,
        disponibilidad: true,
        usuarioId: true,
      },
    });

    return professionals.map((professional) => ({
      id: professional.id,
      name: professional.nombre,
      specialty: professional.especialidad,
      availability: toProfessionalAvailability(professional.disponibilidad),
      accountLinked: professional.usuarioId !== null,
    }));
  }
}
