import {
  AtencionEstado,
  DisponibilidadProfesional,
  Especialidad,
  EvaluacionEstado,
  InformeEstado,
  RecorridoEstado,
  ReservaEstado,
  ResultadoEspecialidad,
} from '@prisma/client';

export const JourneyState = {
  waiting: 'En espera',
  inProgress: 'En proceso',
  closed: 'Cierre final',
} as const;

export const DerivedJourneyState = {
  waitingForCall: 'Esperando llamado',
} as const;

export const AttentionState = {
  notStarted: 'No iniciada',
  waiting: 'En espera',
  inAttention: 'En atención',
  finalized: 'Finalizada',
  pending: 'Pendiente',
} as const;

export const ProfessionalAvailability = {
  available: 'Disponible',
  busy: 'Ocupado',
} as const;

export const EvaluationState = {
  pending: 'PENDIENTE',
  complete: 'COMPLETA',
} as const;

export const InformeState = {
  pending: 'Pendiente',
  complete: 'Completo',
} as const;

export const ReservationState = {
  reserved: 'RESERVADA',
  fulfilled: 'CUMPLIDA',
  cancelled: 'CANCELADA',
  rescheduled: 'REPROGRAMADA',
  absent: 'AUSENTE',
} as const;

export const AptitudeState = {
  fit: 'APTO_PLENO',
  conditionallyFit: 'APTO_CONDICIONAL',
  unfit: 'NO_APTO',
} as const;

export const SUPPORTED_SPECIALTIES: readonly Especialidad[] = [
  Especialidad.BIOQUIMICA,
  Especialidad.CLINICA_MEDICA,
  Especialidad.PSICOLOGIA,
];

const journeyStates: Record<RecorridoEstado, (typeof JourneyState)[keyof typeof JourneyState]> = {
  [RecorridoEstado.EN_ESPERA]: JourneyState.waiting,
  [RecorridoEstado.EN_PROCESO]: JourneyState.inProgress,
  [RecorridoEstado.CIERRE_FINAL]: JourneyState.closed,
};

const attentionStates: Record<
  AtencionEstado,
  (typeof AttentionState)[keyof typeof AttentionState]
> = {
  [AtencionEstado.NO_INICIADA]: AttentionState.notStarted,
  [AtencionEstado.EN_ESPERA]: AttentionState.waiting,
  [AtencionEstado.EN_ATENCION]: AttentionState.inAttention,
  [AtencionEstado.FINALIZADA]: AttentionState.finalized,
  [AtencionEstado.PENDIENTE]: AttentionState.pending,
};

const professionalAvailabilities: Record<
  DisponibilidadProfesional,
  (typeof ProfessionalAvailability)[keyof typeof ProfessionalAvailability]
> = {
  [DisponibilidadProfesional.DISPONIBLE]: ProfessionalAvailability.available,
  [DisponibilidadProfesional.OCUPADO]: ProfessionalAvailability.busy,
};

const evaluationStates: Record<
  EvaluacionEstado,
  (typeof EvaluationState)[keyof typeof EvaluationState]
> = {
  [EvaluacionEstado.PENDIENTE]: EvaluationState.pending,
  [EvaluacionEstado.COMPLETA]: EvaluationState.complete,
};

const informeStates: Record<InformeEstado, (typeof InformeState)[keyof typeof InformeState]> = {
  [InformeEstado.PENDIENTE]: InformeState.pending,
  [InformeEstado.COMPLETO]: InformeState.complete,
};

const reservationStates: Record<
  ReservaEstado,
  (typeof ReservationState)[keyof typeof ReservationState]
> = {
  [ReservaEstado.RESERVADA]: ReservationState.reserved,
  [ReservaEstado.CUMPLIDA]: ReservationState.fulfilled,
  [ReservaEstado.CANCELADA]: ReservationState.cancelled,
  [ReservaEstado.REPROGRAMADA]: ReservationState.rescheduled,
  [ReservaEstado.AUSENTE]: ReservationState.absent,
};

const aptitudeStates: Record<
  ResultadoEspecialidad,
  (typeof AptitudeState)[keyof typeof AptitudeState]
> = {
  [ResultadoEspecialidad.APTO_PLENO]: AptitudeState.fit,
  [ResultadoEspecialidad.APTO_CONDICIONAL]: AptitudeState.conditionallyFit,
  [ResultadoEspecialidad.NO_APTO]: AptitudeState.unfit,
};

export function toJourneyState(
  state: RecorridoEstado,
): (typeof JourneyState)[keyof typeof JourneyState] {
  return journeyStates[state];
}

export function toAttentionState(
  state: AtencionEstado,
): (typeof AttentionState)[keyof typeof AttentionState] {
  return attentionStates[state];
}

export function toProfessionalAvailability(
  availability: DisponibilidadProfesional,
): (typeof ProfessionalAvailability)[keyof typeof ProfessionalAvailability] {
  return professionalAvailabilities[availability];
}

export function toEvaluationState(
  state: EvaluacionEstado,
): (typeof EvaluationState)[keyof typeof EvaluationState] {
  return evaluationStates[state];
}

export function toInformeState(
  state: InformeEstado,
): (typeof InformeState)[keyof typeof InformeState] {
  return informeStates[state];
}

export function toReservationState(
  state: ReservaEstado,
): (typeof ReservationState)[keyof typeof ReservationState] {
  return reservationStates[state];
}

export function toAptitudeState(
  result: ResultadoEspecialidad,
): (typeof AptitudeState)[keyof typeof AptitudeState] {
  return aptitudeStates[result];
}

export function isSupportedSpecialty(value: string): value is Especialidad {
  return SUPPORTED_SPECIALTIES.some((specialty) => specialty === value);
}
