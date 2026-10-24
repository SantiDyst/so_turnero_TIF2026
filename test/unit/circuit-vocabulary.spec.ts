import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import {
  AtencionEstado,
  DisponibilidadProfesional,
  Especialidad,
  EvaluacionEstado,
  Prisma,
  RecorridoEstado,
  ReservaEstado,
  ResultadoEspecialidad,
} from '@prisma/client';

import { AttentionsController } from '../../src/attentions/attentions.controller';
import {
  isPrismaConflict,
  prismaErrorCode,
  rethrowPrismaConflict,
} from '../../src/shared/prisma-error.mapper';
import { attentionAccessStub, professionalUser } from '../support/actors';
import {
  AptitudeState,
  AttentionState,
  DerivedJourneyState,
  EvaluationState,
  JourneyState,
  ProfessionalAvailability,
  ReservationState,
  isSupportedSpecialty,
  toAttentionState,
  toAptitudeState,
  toEvaluationState,
  toJourneyState,
  toProfessionalAvailability,
  toReservationState,
} from '../../src/shared/state-vocabulary';

function knownError(code: string, meta?: Record<string, unknown>) {
  return new Prisma.PrismaClientKnownRequestError('query failed', {
    code,
    clientVersion: '7.0.0',
    meta,
  });
}

describe('circuit vocabulary', () => {
  it('maps every circuit state to its approved human value', () => {
    expect(toJourneyState(RecorridoEstado.CIERRE_FINAL)).toBe(JourneyState.closed);
    expect(toEvaluationState(EvaluacionEstado.PENDIENTE)).toBe(EvaluationState.pending);
    expect(toEvaluationState(EvaluacionEstado.COMPLETA)).toBe(EvaluationState.complete);
    expect(toReservationState(ReservaEstado.RESERVADA)).toBe(ReservationState.reserved);
    expect(toReservationState(ReservaEstado.REPROGRAMADA)).toBe(ReservationState.rescheduled);
    expect(toAptitudeState(ResultadoEspecialidad.APTO_CONDICIONAL)).toBe(
      AptitudeState.conditionallyFit,
    );
    expect(toAttentionState(AtencionEstado.EN_ESPERA)).toBe(AttentionState.waiting);
    expect(toProfessionalAvailability(DisponibilidadProfesional.OCUPADO)).toBe(
      ProfessionalAvailability.busy,
    );
  });

  it('keeps journey, derived, evaluation, and reservation vocabularies separate', () => {
    const journeyValues = Object.values(JourneyState);
    expect(journeyValues).not.toContain(DerivedJourneyState.waitingForCall);
    expect(journeyValues).not.toContain(EvaluationState.pending);
    expect(Object.values(EvaluationState)).not.toContain(ReservationState.reserved);
    expect(Object.values(ReservationState)).not.toContain(AptitudeState.fit);
    expect(DerivedJourneyState.waitingForCall).toBe('Esperando llamado');
  });

  it('accepts only the three supported specialties', () => {
    expect(isSupportedSpecialty(Especialidad.BIOQUIMICA)).toBe(true);
    expect(isSupportedSpecialty('PSICOLOGIA')).toBe(true);
    expect(isSupportedSpecialty('Clinical')).toBe(false);
    expect(isSupportedSpecialty('Occupational medicine')).toBe(false);
  });

  it('rejects invalid specialties before starting an attention', () => {
    const start = jest.fn().mockReturnValue({ ok: true });
    const controller = new AttentionsController(
      { start, finalize: jest.fn() } as never,
      attentionAccessStub() as never,
    );
    const user = professionalUser({ specialty: Especialidad.PSICOLOGIA });

    expect(() => controller.start('journey', { specialty: 'Clinical' }, user)).toThrow(
      BadRequestException,
    );
    expect(() =>
      controller.start(
        'journey',
        { specialty: 'PSICOLOGIA' },
        professionalUser({ profesionalId: null, specialty: null }),
      ),
    ).toThrow(ForbiddenException);
    expect(controller.start('journey', { specialty: 'PSICOLOGIA' }, user)).toEqual({ ok: true });
    expect(start).toHaveBeenCalledWith('journey', {
      specialty: 'PSICOLOGIA',
      professionalId: 'professional-1',
    });
  });
});

describe('prisma error mapping', () => {
  it('maps a unique violation (P2002) to HTTP 409', () => {
    const error = knownError('P2002');

    expect(prismaErrorCode(error)).toBe('P2002');
    expect(isPrismaConflict(error)).toBe(true);
    expect(() => rethrowPrismaConflict(error, 'conflict')).toThrow(ConflictException);
  });

  it('maps an exclusion violation (23P01) carried in meta to HTTP 409', () => {
    const error = knownError('P2010', { code: '23P01' });

    expect(prismaErrorCode(error)).toBe('23P01');
    expect(() => rethrowPrismaConflict(error, 'conflict')).toThrow(ConflictException);
  });

  it('recognizes a raw 23P01 violation surfaced as an unknown request error', () => {
    const error = new Prisma.PrismaClientUnknownRequestError(
      'Raw query failed. Code: `23P01`. Message: conflicting key value violates exclusion constraint',
      { clientVersion: '7.0.0' },
    );

    expect(prismaErrorCode(error)).toBe('23P01');
    expect(() => rethrowPrismaConflict(error, 'conflict')).toThrow(ConflictException);
  });

  it('rethrows non-conflict errors unchanged', () => {
    const error = knownError('P2025');

    expect(isPrismaConflict(error)).toBe(false);
    expect(() => rethrowPrismaConflict(error, 'conflict')).toThrow(error);
  });
});
