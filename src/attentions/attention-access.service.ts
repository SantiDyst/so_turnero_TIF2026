import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Especialidad } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AttentionAccessService {
  constructor(private readonly prisma: PrismaService) {}

  async assertAttentionOwned(attentionId: string, professionalId: string): Promise<void> {
    const attention = await this.prisma.client.atencion.findUnique({
      where: { id: attentionId },
      select: { profesionalId: true },
    });

    if (!attention) {
      throw new NotFoundException('Attention not found.');
    }

    if (attention.profesionalId !== professionalId) {
      throw new ForbiddenException('The attention belongs to another professional.');
    }
  }

  async assertEvaluationSpecialty(evaluationId: string, specialty: Especialidad): Promise<void> {
    const evaluation = await this.prisma.client.evaluacion.findUnique({
      where: { id: evaluationId },
      select: { especialidad: true },
    });

    if (!evaluation) {
      throw new NotFoundException('Evaluation not found.');
    }

    if (evaluation.especialidad !== specialty) {
      throw new ForbiddenException('The evaluation belongs to another specialty.');
    }
  }

  async assertPendingSpecialty(pendingId: string, specialty: Especialidad): Promise<void> {
    const pending = await this.prisma.client.pendiente.findUnique({
      where: { id: pendingId },
      select: { evaluacion: { select: { especialidad: true } } },
    });

    if (!pending) {
      throw new NotFoundException('Pending not found.');
    }

    if (pending.evaluacion.especialidad !== specialty) {
      throw new ForbiddenException('The pending belongs to another specialty.');
    }
  }
}
