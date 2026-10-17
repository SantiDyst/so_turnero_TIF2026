import { AtencionEstado, DisponibilidadProfesional, RecorridoEstado } from '@prisma/client';

export const JourneyState = {
  waiting: 'En espera',
  inProgress: 'En proceso',
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

const journeyStates: Record<RecorridoEstado, (typeof JourneyState)[keyof typeof JourneyState]> = {
  [RecorridoEstado.EN_ESPERA]: JourneyState.waiting,
  [RecorridoEstado.EN_PROCESO]: JourneyState.inProgress,
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
