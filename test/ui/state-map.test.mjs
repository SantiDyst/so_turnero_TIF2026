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

test('the first specialty has no sequence blocker', () => {
  assert.equal(map.sequenceBlocker(journey(), 'BIOQUIMICA'), null);
});

test('clinical is blocked until biochemistry is complete', () => {
  assert.equal(map.sequenceBlocker(journey(), 'CLINICA_MEDICA'), 'Primero completá Bioquímica.');

  const ready = withEvaluation(journey(), 'BIOQUIMICA', { state: 'COMPLETA' });
  assert.equal(map.sequenceBlocker(ready, 'CLINICA_MEDICA'), null);
});

test('psychology is blocked until clinical is complete', () => {
  const bioDone = withEvaluation(journey(), 'BIOQUIMICA', { state: 'COMPLETA' });
  assert.equal(map.sequenceBlocker(bioDone, 'PSICOLOGIA'), 'Primero completá Clínica Médica.');

  const clinicalDone = withEvaluation(bioDone, 'CLINICA_MEDICA', { state: 'COMPLETA' });
  assert.equal(map.sequenceBlocker(clinicalDone, 'PSICOLOGIA'), null);
});

test('a start is withheld on a complete evaluation or an active attention', () => {
  assert.equal(map.canStart(journey(), 'BIOQUIMICA'), true);

  const complete = withEvaluation(journey(), 'BIOQUIMICA', { state: 'COMPLETA' });
  assert.equal(map.canStart(complete, 'BIOQUIMICA'), false);

  const active = journey({
    attentions: [
      {
        id: 'attention-1',
        specialty: 'BIOQUIMICA',
        state: 'En atención',
        professional: { id: 'pro-1', name: 'Dra. Bio' },
      },
    ],
  });
  assert.equal(map.canStart(active, 'BIOQUIMICA'), false);
});

test('finalizing asks for confirmation while the report or the result is missing', () => {
  assert.equal(map.needsFinalizeConfirmation(journey(), 'CLINICA_MEDICA'), true);

  const complete = journey({
    reports: journey().reports.map((report) =>
      report.specialty === 'CLINICA_MEDICA' ? { ...report, reportState: 'Completo' } : report,
    ),
  });
  const withResult = withEvaluation(complete, 'CLINICA_MEDICA', { result: 'APTO_PLENO' });

  assert.equal(map.needsFinalizeConfirmation(withResult, 'CLINICA_MEDICA'), false);
});

test('biochemistry can complete without a result but clinical cannot', () => {
  assert.equal(map.canComplete(journey(), 'BIOQUIMICA'), true);
  assert.equal(map.canComplete(journey(), 'CLINICA_MEDICA'), false);

  const withResult = withEvaluation(journey(), 'CLINICA_MEDICA', { result: 'APTO_CONDICIONAL' });
  assert.equal(map.canComplete(withResult, 'CLINICA_MEDICA'), true);
});

test('open pendings block completion', () => {
  const withPending = journey({
    pendings: [{ id: 'pending-1', evaluationId: 'eval-bio', resolvedAt: null }],
  });

  assert.equal(map.canComplete(withPending, 'BIOQUIMICA'), false);
});

test('reports need a started attention and a closed journey disables starts', () => {
  assert.equal(map.canSaveReport(journey(), 'BIOQUIMICA'), false);

  const attended = journey({
    attentions: [
      {
        id: 'attention-1',
        specialty: 'BIOQUIMICA',
        state: 'Finalizada',
        startedAt: '2026-10-23T10:00:00.000Z',
        professional: { id: 'pro-1', name: 'Dra. Bio' },
      },
    ],
  });
  assert.equal(map.canSaveReport(attended, 'BIOQUIMICA'), true);

  const closed = journey({
    journey: { id: 'journey-1', attentionNumber: 'AT-0001', state: 'Cierre final' },
  });
  assert.equal(map.isClosed(closed), true);
  assert.equal(map.canStart(closed, 'BIOQUIMICA'), false);
});

test('annulled journeys reject starts and expose the reason', () => {
  const annulled = journey({
    journey: {
      id: 'journey-1',
      attentionNumber: 'AT-0001',
      state: 'Anulada',
      annulledReason: 'Desisti�',
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
