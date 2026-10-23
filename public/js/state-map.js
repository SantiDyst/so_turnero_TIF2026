export const SPECIALTIES = ['BIOQUIMICA', 'CLINICA_MEDICA', 'PSICOLOGIA'];

export const SPECIALTY_LABELS = {
  BIOQUIMICA: 'Bioquímica',
  CLINICA_MEDICA: 'Clínica Médica',
  PSICOLOGIA: 'Psicología',
};

export const RESULT_LABELS = {
  APTO_PLENO: 'Apto pleno',
  APTO_CONDICIONAL: 'Apto condicional',
  NO_APTO: 'No apto',
};

export const RESULT_CODES = Object.keys(RESULT_LABELS);

export const ATTENTION_IN_PROGRESS = 'En atención';
export const EVALUATION_PENDING = 'PENDIENTE';
export const EVALUATION_COMPLETE = 'COMPLETA';
export const JOURNEY_CLOSED = 'Cierre final';
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
      (attention) =>
        attention.specialty === specialty && attention.state === ATTENTION_IN_PROGRESS,
    ) ?? null
  );
}

export function latestAttentionOf(journey, specialty) {
  const attentions = journey.attentions.filter(
    (attention) => attention.specialty === specialty,
  );

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

export function isClosed(journey) {
  return journey.journey.state === JOURNEY_CLOSED;
}

export function canStart(journey, specialty) {
  const evaluation = evaluationOf(journey, specialty);

  if (!evaluation || isClosed(journey)) {
    return false;
  }

  return (
    evaluation.state !== EVALUATION_COMPLETE && !activeAttentionOf(journey, specialty)
  );
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

export function canSaveReport(journey, specialty) {
  return !isClosed(journey) && Boolean(latestAttentionOf(journey, specialty));
}
