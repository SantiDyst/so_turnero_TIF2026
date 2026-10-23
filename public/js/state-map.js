export const SPECIALTIES = ['BIOQUIMICA', 'CLINICA_MEDICA', 'PSICOLOGIA'];

export const SPECIALTY_LABELS = {
  BIOQUIMICA: 'Bioquímica',
  CLINICA_MEDICA: 'Clínica Médica',
  PSICOLOGIA: 'Psicología',
};

export const SPECIALTY_CLASS = {
  BIOQUIMICA: 'bio',
  CLINICA_MEDICA: 'clinica',
  PSICOLOGIA: 'psico',
};

export const RESULT_LABELS = {
  APTO_PLENO: 'Apto pleno',
  APTO_CONDICIONAL: 'Apto condicional',
  NO_APTO: 'No apto',
};

export const RESULT_CODES = Object.keys(RESULT_LABELS);

export const APTITUDE_CLASS = {
  APTO_PLENO: 'badge ok',
  APTO_CONDICIONAL: 'badge warn',
  NO_APTO: 'badge bad',
};

export const JOURNEY_STATE_CLASS = {
  'En espera': 'badge',
  'En proceso': 'badge active',
  'Cierre final': 'badge complete',
  Anulada: 'badge bad',
};

export const ATTENTION_IN_PROGRESS = 'En atención';
export const EVALUATION_PENDING = 'PENDIENTE';
export const EVALUATION_COMPLETE = 'COMPLETA';
export const JOURNEY_CLOSED = 'Cierre final';
export const JOURNEY_ANNULLED = 'Anulada';
export const REPORT_COMPLETE = 'Completo';

export function specialtyLabel(code) {
  return SPECIALTY_LABELS[code] ?? code;
}

export function resultLabel(code) {
  return code ? (RESULT_LABELS[code] ?? code) : 'Sin resultado';
}

export function evaluationOf(journey, specialty) {
  return journey.evaluations.find((evaluation) => evaluation.specialty === specialty) ?? null;
}

export function activeAttentionOf(journey, specialty) {
  return (
    journey.attentions.find(
      (attention) => attention.specialty === specialty && attention.state === ATTENTION_IN_PROGRESS,
    ) ?? null
  );
}

export function latestAttentionOf(journey, specialty) {
  const attentions = journey.attentions.filter((attention) => attention.specialty === specialty);

  return (
    attentions.sort((left, right) =>
      String(right.startedAt ?? '').localeCompare(String(left.startedAt ?? '')),
    )[0] ?? null
  );
}

export function reportOf(journey, specialty) {
  return journey.reports.find((report) => report.specialty === specialty) ?? null;
}

export function openPendingsOf(journey, evaluationId) {
  return journey.pendings.filter(
    (pending) => pending.evaluationId === evaluationId && !pending.resolvedAt,
  );
}

export function isAnnulled(journey) {
  return journey.journey.state === JOURNEY_ANNULLED;
}

export function isClosed(journey) {
  return journey.journey.state === JOURNEY_CLOSED || journey.journey.state === JOURNEY_ANNULLED;
}

export function previousSpecialty(specialty) {
  const index = SPECIALTIES.indexOf(specialty);

  return index > 0 ? SPECIALTIES[index - 1] : null;
}

export function sequenceBlocker(journey, specialty) {
  const previous = previousSpecialty(specialty);

  if (!previous) {
    return null;
  }

  const evaluation = evaluationOf(journey, previous);

  if (!evaluation || evaluation.state === EVALUATION_COMPLETE) {
    return null;
  }

  return `Primero completá ${specialtyLabel(previous)}.`;
}

export function canStart(journey, specialty) {
  const evaluation = evaluationOf(journey, specialty);

  if (!evaluation || isClosed(journey)) {
    return false;
  }

  return evaluation.state !== EVALUATION_COMPLETE && !activeAttentionOf(journey, specialty);
}

export function canRecordResult(specialty) {
  return specialty !== 'BIOQUIMICA';
}

export function canComplete(journey, specialty) {
  const evaluation = evaluationOf(journey, specialty);

  if (!evaluation || evaluation.state === EVALUATION_COMPLETE || isClosed(journey)) {
    return false;
  }

  if (openPendingsOf(journey, evaluation.id).length > 0) {
    return false;
  }

  return specialty === 'BIOQUIMICA' || Boolean(evaluation.result);
}

export function hasAttentionFor(journey, specialty) {
  return Boolean(latestAttentionOf(journey, specialty));
}

export function canSaveReport(journey, specialty) {
  return !isClosed(journey) && Boolean(latestAttentionOf(journey, specialty));
}

export function needsFinalizeConfirmation(journey, specialty) {
  const evaluation = evaluationOf(journey, specialty);
  const report = reportOf(journey, specialty);
  const missingReport = !report || report.reportState !== REPORT_COMPLETE;
  const missingResult = canRecordResult(specialty) && !evaluation?.result;

  return missingReport || Boolean(missingResult);
}

export function entryCanAnnul(entry) {
  return (entry.state === 'En espera' || entry.state === 'En proceso') && !entry.activeSpecialty;
}

export function entryCanDelete(entry) {
  return entry.attentionCount === 0;
}
