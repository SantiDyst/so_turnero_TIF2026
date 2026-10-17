import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { RecorridoEstado } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import {
  toAttentionState,
  toJourneyState,
  toProfessionalAvailability,
} from '../shared/state-vocabulary';

@Injectable()
export class QueueQueryService {
  constructor(private readonly prisma: PrismaService) {}

  async listQueue() {
    const journeys = await this.prisma.client.recorrido.findMany({
      where: { estado: RecorridoEstado.EN_ESPERA },
      orderBy: { queuedAt: 'asc' },
      select: {
        postulanteId: true,
        numeroAtencion: true,
        estado: true,
        queuedAt: true,
      },
    });

    return journeys.map((journey) => ({
      applicantId: journey.postulanteId,
      attentionNumber: journey.numeroAtencion,
      journeyState: toJourneyState(journey.estado),
      queuedAt: journey.queuedAt,
    }));
  }

  async findJourney(applicantId?: string, attentionNumber?: string) {
    if (Boolean(applicantId) === Boolean(attentionNumber)) {
      throw new BadRequestException('Provide exactly one of applicantId or attentionNumber.');
    }

    const journey = await this.prisma.client.recorrido.findUnique({
      where: applicantId ? { postulanteId: applicantId } : { numeroAtencion: attentionNumber! },
      include: {
        postulante: true,
        atenciones: {
          orderBy: { createdAt: 'asc' },
          include: { profesional: true },
        },
      },
    });

    if (!journey) {
      throw new NotFoundException('Journey not found.');
    }

    return {
      applicant: {
        id: journey.postulante.id,
        nombre: journey.postulante.nombre,
        apellido: journey.postulante.apellido,
        dni: journey.postulante.dni,
      },
      journey: {
        id: journey.id,
        attentionNumber: journey.numeroAtencion,
        state: toJourneyState(journey.estado),
        queuedAt: journey.queuedAt,
      },
      attentions: journey.atenciones.map((attention) => ({
        id: attention.id,
        state: toAttentionState(attention.estado),
        specialty: attention.especialidad,
        professional: {
          id: attention.profesional.id,
          name: attention.profesional.nombre,
          availability: toProfessionalAvailability(attention.profesional.disponibilidad),
        },
        startedAt: attention.startedAt,
        endedAt: attention.endedAt,
      })),
    };
  }
}
