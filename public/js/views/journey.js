import { api } from '../api-client.js';
import { button, el, select } from '../dom.js';
import { formatDate } from '../format.js';
import * as map from '../state-map.js';
import { renderClosurePanel } from './closure.js';
import { renderReportSection } from './reports.js';

function row(label, value) {
  return el('div', {}, [el('dt', { text: label }), el('dd', { text: value })]);
}

export async function renderJourney(container, attentionNumber, ctx) {
  let journey;
  let professionals;
  let readiness;

  async function load() {
    journey = await api.journey(attentionNumber);
    [professionals, readiness] = await Promise.all([
      api.professionals(),
      api.readiness(journey.journey.id),
    ]);
  }

  async function mutate(action) {
    try {
      await action();
      ctx.clearBanner();
    } catch (error) {
      ctx.showError(error?.message ?? 'Error inesperado');
    }

    try {
      await load();
      render();
    } catch (error) {
      ctx.showError(error?.message ?? 'No se pudo refrescar el recorrido.');
    }
  }

  function header() {
    const { applicant, journey: journeyInfo } = journey;

    return el('section', { class: 'panel' }, [
      el('div', { class: 'card-head' }, [
        el('h1', { text: `${applicant.nombre} ${applicant.apellido} · ${journeyInfo.attentionNumber}` }),
        el('span', { class: 'badge', text: journeyInfo.state }),
      ]),
      el('dl', {}, [
        row('DNI', applicant.dni),
        row('Estado del recorrido', journeyInfo.state),
        ...(journeyInfo.derivedState ? [row('Estado derivado', journeyInfo.derivedState)] : []),
        row(
          'Aptitud final',
          journey.aptitude ? map.resultLabel(journey.aptitude.finalAptitude) : 'Sin calcular',
        ),
      ]),
    ]);
  }

  function actionRow(specialty, active) {
    if (active) {
      const stateSelect = select(
        'finalizeState',
        [
          ['Finalizada', 'Finalizada'],
          ['Pendiente', 'Pendiente'],
        ],
        'Finalizada',
      );

      return el('div', { class: 'row' }, [
        stateSelect,
        button('Finalizar atención', () =>
          mutate(() => api.finalizeAttention(active.id, stateSelect.value)),
        ),
      ]);
    }

    if (!map.canStart(journey, specialty)) {
      return el('p', {
        class: 'hint',
        text: map.isClosed(journey) ? 'Recorrido cerrado.' : 'Sin acciones disponibles.',
      });
    }

    const candidates = professionals.filter(
      (professional) =>
        professional.specialty === specialty && professional.availability === 'Disponible',
    );

    if (candidates.length === 0) {
      return el('p', {
        class: 'hint',
        text: 'No hay profesionales disponibles para esta especialidad.',
      });
    }

    const professionalSelect = select(
      'professionalId',
      candidates.map((professional) => [professional.id, professional.name]),
      candidates[0].id,
    );

    return el('div', { class: 'row' }, [
      professionalSelect,
      button(
        'Iniciar atención',
        () =>
          mutate(() =>
            api.startAttention(journey.journey.id, specialty, professionalSelect.value),
          ),
        { class: 'primary' },
      ),
    ]);
  }

  function resultRow(evaluation) {
    const resultSelect = select(
      'result',
      [['', 'Sin resultado'], ...map.RESULT_CODES.map((code) => [code, map.resultLabel(code)])],
      evaluation.result ?? '',
    );

    return el('div', { class: 'row' }, [
      resultSelect,
      button('Guardar resultado', () => {
        if (!resultSelect.value) {
          ctx.showError('Elegí un resultado.');
          return;
        }
        mutate(() => api.saveResult(evaluation.id, resultSelect.value));
      }),
    ]);
  }

  function completionRow(specialty, evaluation) {
    if (map.canComplete(journey, specialty)) {
      return el('div', { class: 'row' }, [
        button('Completar evaluación', () => mutate(() => api.completeEvaluation(evaluation.id)), {
          class: 'primary',
        }),
      ]);
    }

    if (evaluation.state === map.EVALUATION_COMPLETE) {
      return null;
    }

    if (map.openPendingsOf(journey, evaluation.id).length > 0) {
      return el('p', { class: 'hint', text: 'Hay pendientes abiertos.' });
    }

    if (map.canRecordResult(specialty) && !evaluation.result) {
      return el('p', { class: 'hint', text: 'Falta guardar el resultado.' });
    }

    return null;
  }

  function card(specialty) {
    const evaluation = map.evaluationOf(journey, specialty);
    const active = map.activeAttentionOf(journey, specialty);
    const latest = map.latestAttentionOf(journey, specialty);
    const report = map.reportOf(journey, specialty);

    const badgeClass =
      evaluation?.state === map.EVALUATION_COMPLETE
        ? 'badge complete'
        : active
          ? 'badge active'
          : 'badge';

    const nodes = [
      el('div', { class: 'card-head' }, [
        el('h3', { text: map.specialtyLabel(specialty) }),
        el('span', { class: badgeClass, text: evaluation?.state ?? 'SIN EVALUACIÓN' }),
      ]),
      el('dl', {}, [
        row('Resultado', map.resultLabel(evaluation?.result)),
        row(
          'Atención',
          active
            ? `${active.state} · ${active.professional.name}`
            : latest
              ? `${latest.state} · ${latest.professional.name} · ${formatDate(latest.startedAt)}`
              : 'Sin atenciones',
        ),
        row('Informe', report ? report.reportState : 'Pendiente'),
      ]),
      actionRow(specialty, active),
    ];

    if (evaluation && map.canRecordResult(specialty) && evaluation.state !== map.EVALUATION_COMPLETE) {
      nodes.push(resultRow(evaluation));
    }

    if (evaluation) {
      nodes.push(completionRow(specialty, evaluation));
    }

    nodes.push(
      renderReportSection({
        journey,
        specialty,
        onAction: mutate,
        onError: ctx.showError,
      }),
    );

    return el('section', { class: 'card' }, nodes);
  }

  function render() {
    container.replaceChildren(
      header(),
      ...map.SPECIALTIES.map(card),
      renderClosurePanel({ journey, readiness, onAction: mutate }),
    );
  }

  await load();
  render();
}
