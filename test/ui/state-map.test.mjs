import assert from 'node:assert/strict';
import test from 'node:test';

import * as map from '../../public/js/state-map.js';

function journey(overrides = {}) {
  return {
    journey: {
      id: 'journey-1',
      attentionNumber: 'AT-0001',
      state: 'En proceso',
      derivedState: null,
    },
    evaluations: [
      { id: 'eval-bio', specialty: 'BIOQUIMICA', state: 'PENDIENTE', result: null },
      { id: 'eval-cli', specialty: 'CLINICA_MEDICA', state: 'PENDIENTE', result: null },
      { id: 'eval-psi', specialty: 'PSICOLOGIA', state: 'PENDIENTE', result: null },
    ],
    attentions: [],
    reports: [
      { specialty: 'BIOQUIMICA', reportState: 'Pendiente', observations: null },
      { specialty: 'CLINICA_MEDICA', reportState: 'Pendiente', observations: null },
      { specialty: 'PSICOLOGIA', reportState: 'Pendiente', observations: null },
    ],
    pendings: [],
    ...overrides,
  };
}

function withEvaluation(data, specialty, changes) {
  return {
    ...data,
    evaluations: data.evaluations.map((evaluation) =>
      evaluation.specialty === specialty ? { ...evaluation, ...changes } : evaluation,
    ),
  };
}

function withReport(data, specialty, reportState) {
  return {
    ...data,
    reports: data.reports.map((report) =>
      report.specialty === specialty ? { ...report, reportState } : report,
    ),
  };
}

function attention(specialty, state, id = 'attention-1') {
  return {
    id,
    specialty,
    state,
    startedAt: '2026-10-23T10:00:00.000Z',
    professional: { id: 'pro-1', name: 'Dra. Bio' },
  };
}

test('any specialty can start when there is no active attention', () => {
  assert.equal(map.canStart(journey(), 'BIOQUIMICA'), true);
  assert.equal(map.canStart(journey(), 'CLINICA_MEDICA'), true);
  assert.equal(map.canStart(journey(), 'PSICOLOGIA'), true);
});

test('a start is withheld on a complete evaluation or an active attention', () => {
  const complete = withEvaluation(journey(), 'BIOQUIMICA', { state: 'COMPLETA' });
  assert.equal(map.canStart(complete, 'BIOQUIMICA'), false);

  const active = journey({ attentions: [attention('BIOQUIMICA', 'En atención')] });
  assert.equal(map.canStart(active, 'BIOQUIMICA'), false);
});

test('a finalized attention cannot be started again', () => {
  const finalized = journey({ attentions: [attention('BIOQUIMICA', 'Finalizada')] });
  assert.equal(map.canStart(finalized, 'BIOQUIMICA'), false);
});

test('a waiting follow-up attention can be adopted', () => {
  const withFollowUp = journey({
    attentions: [
      attention('BIOQUIMICA', 'Finalizada', 'attention-1'),
      attention('BIOQUIMICA', 'En espera', 'attention-2'),
    ],
  });
  assert.equal(map.canStart(withFollowUp, 'BIOQUIMICA'), true);
});

test('completion requires a complete report and the specialty result', () => {
  assert.equal(map.canComplete(journey(), 'BIOQUIMICA'), false);

  const bioReported = withReport(journey(), 'BIOQUIMICA', 'Completo');
  assert.equal(map.canComplete(bioReported, 'BIOQUIMICA'), true);

  const clinicalReported = withReport(journey(), 'CLINICA_MEDICA', 'Completo');
  assert.equal(map.canComplete(clinicalReported, 'CLINICA_MEDICA'), false);

  const withResult = withEvaluation(clinicalReported, 'CLINICA_MEDICA', {
    result: 'APTO_CONDICIONAL',
  });
  assert.equal(map.canComplete(withResult, 'CLINICA_MEDICA'), true);
});

test('open pendings block completion', () => {
  const withPending = withReport(journey(), 'BIOQUIMICA', 'Completo');
  withPending.pendings = [{ id: 'pending-1', evaluationId: 'eval-bio', resolvedAt: null }];

  assert.equal(map.canComplete(withPending, 'BIOQUIMICA'), false);
});

test('finalizing follows the evaluation state', () => {
  assert.deepEqual(map.finalizeOptions(journey(), 'BIOQUIMICA'), []);

  const complete = withEvaluation(journey(), 'BIOQUIMICA', { state: 'COMPLETA' });
  assert.deepEqual(map.finalizeOptions(complete, 'BIOQUIMICA'), ['Finalizada']);

  const withPending = journey({
    pendings: [{ id: 'pending-1', evaluationId: 'eval-bio', resolvedAt: null }],
  });
  assert.deepEqual(map.finalizeOptions(withPending, 'BIOQUIMICA'), ['Pendiente']);
});

test('reports need a started attention and a closed journey disables saves', () => {
  assert.equal(map.canSaveReport(journey(), 'BIOQUIMICA'), false);

  const attended = journey({ attentions: [attention('BIOQUIMICA', 'Finalizada')] });
  assert.equal(map.canSaveReport(attended, 'BIOQUIMICA'), true);

  const closed = journey({
    journey: { id: 'journey-1', attentionNumber: 'AT-0001', state: 'Cierre final' },
  });
  assert.equal(map.isClosed(closed), true);
  assert.equal(map.canStart(closed, 'BIOQUIMICA'), false);
  assert.equal(map.canSaveReport(closed, 'BIOQUIMICA'), false);
});

test('annulled journeys reject starts and expose the reason', () => {
  const annulled = journey({
    journey: {
      id: 'journey-1',
      attentionNumber: 'AT-0001',
      state: 'Anulada',
      annulledReason: 'Desistió',
    },
  });

  assert.equal(map.isAnnulled(annulled), true);
  assert.equal(map.isClosed(annulled), true);
  assert.equal(map.canStart(annulled, 'BIOQUIMICA'), false);
});

test('management actions depend on state and recorded attentions', () => {
  assert.equal(map.entryCanAnnul({ state: 'En espera', activeSpecialty: null }), true);
  assert.equal(map.entryCanAnnul({ state: 'En proceso', activeSpecialty: 'BIOQUIMICA' }), false);
  assert.equal(map.entryCanAnnul({ state: 'Cierre final', activeSpecialty: null }), false);
  assert.equal(map.entryCanAnnul({ state: 'Anulada', activeSpecialty: null }), false);

  assert.equal(map.entryCanDelete({ attentionCount: 0 }), true);
  assert.equal(map.entryCanDelete({ attentionCount: 2 }), false);
});

test('results require a started attention for the specialty', () => {
  assert.equal(map.hasAttentionFor(journey(), 'CLINICA_MEDICA'), false);

  const attended = journey({ attentions: [attention('CLINICA_MEDICA', 'En atención')] });

  assert.equal(map.hasAttentionFor(attended, 'CLINICA_MEDICA'), true);
  assert.equal(map.hasAttentionFor(attended, 'PSICOLOGIA'), false);
});
