import { BadRequestException, ConflictException } from '@nestjs/common';
import {
  AtencionEstado,
  DisponibilidadProfesional,
  Especialidad,
  Prisma,
  RecorridoEstado,
} from '@prisma/client';

import { ApplicantsController } from '../../src/applicants/applicants.controller';
import { RegistrationService } from '../../src/applicants/registration.service';
import { AttentionCommandService } from '../../src/attentions/attention-command.service';
import { AttentionsController } from '../../src/attentions/attentions.controller';
import { ProfessionalsService } from '../../src/professionals/professionals.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import {
  AttentionState,
  JourneyState,
  ProfessionalAvailability,
  toAttentionState,
  toJourneyState,
  toProfessionalAvailability,
} from '../../src/shared/state-vocabulary';

describe('validation and state vocabulary', () => {
  it('reports every missing registration field', async () => {
    const controller = new ApplicantsController({
      register: jest.fn(),
    } as unknown as RegistrationService);

    await expect(controller.register({})).rejects.toMatchObject({
      response: { missingFields: ['nombre', 'apellido', 'dni'] },
    });
  });

  it('accepts only Finalizada or Pendiente for finalization', async () => {
    const controller = new AttentionsController({ finalize: jest.fn(), start: jest.fn() } as never);

    expect(() => controller.finalize('attention', { state: AttentionState.inAttention })).toThrow(
      BadRequestException,
    );
    expect(controller.finalize('attention', { state: AttentionState.finalized })).toBeUndefined();
    expect(controller.finalize('attention', { state: AttentionState.pending })).toBeUndefined();
  });

  it('keeps journey, attention, and professional vocabulary distinct', () => {
    expect(toJourneyState(RecorridoEstado.EN_ESPERA)).toBe(JourneyState.waiting);
    expect(toAttentionState(AtencionEstado.EN_ESPERA)).toBe(AttentionState.waiting);
    expect(toAttentionState(AtencionEstado.EN_ATENCION)).toBe(AttentionState.inAttention);
    expect(toProfessionalAvailability(DisponibilidadProfesional.DISPONIBLE)).toBe(
      ProfessionalAvailability.available,
    );
  });

  it('maps a unique constraint error to conflict when starting an attention', async () => {
    const error = new Prisma.PrismaClientKnownRequestError('unique', {
      code: 'P2002',
      clientVersion: '7.0.0',
    });
    const prisma = {
      client: { $transaction: jest.fn().mockRejectedValue(error) },
    } as unknown as PrismaService;
    const service = new AttentionCommandService(prisma, {} as ProfessionalsService);

    await expect(
      service.start('journey', {
        specialty: Especialidad.CLINICA_MEDICA,
        professionalId: 'professional',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
