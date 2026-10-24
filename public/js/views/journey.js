import { api } from '../api-client.js';
import { button, el, select } from '../dom.js';
import { formatDate } from '../format.js';
import * as map from '../state-map.js';
import { renderClosurePanel } from './closure.js';
import { renderReportSection } from './reports.js';

function row(label, value) {
  return el('div', {}, [el('dt', { text: label }), el('dd', { text: value })]);
}

function notice(noticeState) {
  if (!noticeState) {
    return null;
  }

  return el('p', {
    class: `notice ${noticeState.kind ?? ''}`.trim(),
    text: noticeState.text,
  });
}

export async function renderJourney(container, attentionNumber, ctx) {
  let journey;
  let readiness;
  let confirmFinalize = null;
  const notices = new Map();

  const isAdmin = ctx.user?.rol === 'ADMIN';
  const isProfessional = ctx.user?.rol === 'PROFESIONAL';

  async function load() {
    journey = await api.journey(attentionNumber);
    readiness = await api.readiness(journey.journey.id);
  }

  async function mutate(key, pendingText, action, successText) {
    notices.set(key, { text: pendingText, kind: 'info' });
    confirmFinalize = null;
    render();

    try {
      await action();
      notices.set(key, { text: successText, kind: 'ok' });
    } catch (error) {
      notices.set(key, { text: error?.message ?? 'Error inesperado', kind: 'error' });
    }

    try {
      await load();
    } catch (error) {
      notices.set(key, { text: error?.message ?? 'No se pudo refrescar.', kind: 'error' });
    }

    render();
  }

  function canWorkOn(specialty) {
    return isProfessional && ctx.user.specialty === specialty;
  }

  function header() {
    const { applicant, journey: journeyInfo } = journey;

    return el('section', { class: 'panel' }, [
      el('a', {
        class: 'back',
        href: isAdmin ? '#/gestion' : '#/evaluar',
        text: isAdmin ? '← Volver a gestión' : '← Volver a mi jornada',
      }),
      el('div', { class: 'card-head', style: 'margin-top:10px' }, [
        el('h1', {
          text: `${applicant.nombre} ${applicant.apellido} · ${journeyInfo.attentionNumber}`,
        }),
        el('span', {
          class: map.JOURNEY_STATE_CLASS[journeyInfo.state] ?? 'badge',
          text: journeyInfo.state,
        }),
      ]),
      el('dl', {}, [
        row('DNI', applicant.dni),
        ...(journeyInfo.empresa ? [row('Empresa', journeyInfo.empresa)] : []),
        ...(journeyInfo.puesto ? [row('Puesto', journeyInfo.puesto)] : []),
        row('Estado del recorrido', journeyInfo.state),
        ...(journeyInfo.derivedState ? [row('Estado derivado', journeyInfo.derivedState)] : []),
        row(
          'Aptitud final',
          journey.aptitude ? map.resultLabel(journey.aptitude.finalAptitude) : 'Sin calcular',
        ),
      ]),
      map.isAnnulled(journey)
        ? el('p', {
            class: 'notice error',
            text: `Turno anulado${journeyInfo.annulledReason ? `: ${journeyInfo.annulledReason}` : '.'}`,
          })
        : null,
    ]);
  }

  function startRow(specialty) {
    return el('div', { class: 'row' }, [
      button(
        'Iniciar atención',
        () =>
          mutate(
            specialty,
            'Iniciando atención…',
            () => api.startAttention(journey.journey.id, specialty),
            'Atención iniciada.',
          ),
        { class: 'primary' },
      ),
    ]);
  }

  function finalizeRow(specialty, active) {
    const owned = active.professional?.id === ctx.user?.profesionalId;

    if (!owned) {
      return el('p', {
        class: 'hint',
        text: `Atención activa de ${active.professional?.name ?? 'otro profesional'}.`,
      });
    }

    if (confirmFinalize === specialty) {
      return el('div', { class: 'notice' }, [
        el('p', {
          text: '¿Finalizar la atención sin cargar el informe y el resultado?',
          style: 'margin:0 0 8px',
        }),
        el('div', { class: 'row' }, [
          button(
            'Sí, finalizar',
            () =>
              mutate(
                specialty,
                'Finalizando atención…',
                () => api.finalizeAttention(active.id, 'Finalizada'),
                'Atención finalizada.',
              ),
            { class: 'primary' },
          ),
          button('Cancelar', () => {
            confirmFinalize = null;
            render();
          }),
        ]),
      ]);
    }

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
      button(
        'Finalizar atención',
        () => {
          if (
            stateSelect.value === 'Finalizada' &&
            map.needsFinalizeConfirmation(journey, specialty)
          ) {
            confirmFinalize = specialty;
            render();
            return;
          }

          mutate(
            specialty,
            'Finalizando atención…',
            () => api.finalizeAttention(active.id, stateSelect.value),
            'Atención finalizada.',
          );
        },
        { class: 'blue' },
      ),
    ]);
  }

  function resultRow(specialty, evaluation) {
    const resultSelect = select(
      'result',
      [['', 'Sin resultado'], ...map.RESULT_CODES.map((code) => [code, map.resultLabel(code)])],
      evaluation.result ?? '',
    );

    return el('div', { class: 'row' }, [
      resultSelect,
      button(
        'Guardar resultado',
        () => {
          if (!resultSelect.value) {
            notices.set(specialty, { text: 'Elegí un resultado antes de guardar.', kind: 'error' });
            render();
            return;
          }

          mutate(
            specialty,
            'Guardando resultado…',
            () => api.saveResult(evaluation.id, resultSelect.value),
            'Resultado guardado.',
          );
        },
        { class: 'blue' },
      ),
    ]);
  }

  function completionRow(specialty, evaluation) {
    if (map.canComplete(journey, specialty)) {
      return el('div', { class: 'row' }, [
        button(
          'Completar evaluación',
          () =>
            mutate(
              specialty,
              'Completando evaluación…',
              () => api.completeEvaluation(evaluation.id),
              'Evaluación completada.',
            ),
          { class: 'primary' },
        ),
      ]);
    }

    if (evaluation.state === map.EVALUATION_COMPLETE) {
      return null;
    }

    if (map.openPendingsOf(journey, evaluation.id).length > 0) {
      return el('p', {
        class: 'hint',
        text: 'Hay pendientes abiertos: no se puede completar.',
      });
    }

    if (map.canRecordResult(specialty) && !evaluation.result) {
      return el('p', { class: 'hint', text: 'Falta guardar el resultado para poder completar.' });
    }

    return null;
  }

  function card(specialty) {
    const evaluation = map.evaluationOf(journey, specialty);
    const active = map.activeAttentionOf(journey, specialty);
    const latest = map.latestAttentionOf(journey, specialty);
    const report = map.reportOf(journey, specialty);
    const blocker = map.sequenceBlocker(journey, specialty);
    const canAct = canWorkOn(specialty);

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
    ];

    if (blocker) {
      nodes.push(el('p', { class: 'notice', text: blocker }));
    } else {
      const cardNotice = notice(notices.get(specialty));
      if (cardNotice) {
        nodes.push(cardNotice);
      }
    }

    nodes.push(
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
    );

    if (canAct && !blocker) {
      if (active) {
        nodes.push(finalizeRow(specialty, active));
      } else if (map.canStart(journey, specialty)) {
        nodes.push(startRow(specialty));
      } else if (map.isClosed(journey)) {
        nodes.push(el('p', { class: 'hint', text: 'Recorrido cerrado.' }));
      }
    }

    if (
      canAct &&
      !blocker &&
      evaluation &&
      map.hasAttentionFor(journey, specialty) &&
      map.canRecordResult(specialty) &&
      evaluation.state !== map.EVALUATION_COMPLETE
    ) {
      nodes.push(resultRow(specialty, evaluation));
    }

    if (canAct && !blocker && evaluation && map.hasAttentionFor(journey, specialty)) {
      nodes.push(completionRow(specialty, evaluation));
    }

    nodes.push(
      renderReportSection({
        journey,
        specialty,
        locked: Boolean(blocker) || !canAct,
        onAction: (pendingText, action, successText) =>
          mutate(specialty, pendingText, action, successText),
        onError: (message) => {
          notices.set(specialty, { text: message, kind: 'error' });
          render();
        },
      }),
    );

    return el('section', { class: `card ${map.SPECIALTY_CLASS[specialty]}` }, nodes);
  }

  function closurePanel() {
    const canCloseJourney = isProfessional && ctx.user.specialty === 'CLINICA_MEDICA';

    return renderClosurePanel({
      journey,
      readiness,
      readOnly: !canCloseJourney,
      notice: notices.get('closure'),
      onAction: (pendingText, action, successText) =>
        mutate('closure', pendingText, action, successText),
    });
  }

  function render() {
    container.replaceChildren(header(), ...map.SPECIALTIES.map(card), closurePanel());
  }

  await load();
  render();
}
