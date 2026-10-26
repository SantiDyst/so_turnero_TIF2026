import { api } from '../api-client.js';
import { button, el } from '../dom.js';
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
  const notices = new Map();
  const editingReports = new Set();

  const isAdmin = ctx.user?.rol === 'ADMIN';
  const isProfessional = ctx.user?.rol === 'PROFESIONAL';

  async function load() {
    journey = await api.journey(attentionNumber);
    readiness = await api.readiness(journey.journey.id);
  }

  async function mutate(key, pendingText, action, successText) {
    notices.set(key, { text: pendingText, kind: 'info' });
    render();

    try {
      await action();
      editingReports.delete(key);
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

  function finalizeBlock(specialty, active) {
    const options = map.finalizeOptions(journey, specialty);

    if (options.includes('Pendiente')) {
      return el('div', {}, [
        el('p', {
          class: 'hint',
          text: 'Hay pendientes abiertos: al finalizar, la atención queda a la espera del recontrol.',
        }),
        el('div', { class: 'row' }, [
          button(
            'Finalizar como Pendiente',
            () =>
              mutate(
                specialty,
                'Finalizando atención…',
                () => api.finalizeAttention(active.id, 'Pendiente'),
                'Atención finalizada como Pendiente.',
              ),
            { class: 'blue' },
          ),
        ]),
      ]);
    }

    if (options.includes('Finalizada')) {
      return el('div', { class: 'row' }, [
        button(
          'Finalizar atención',
          () =>
            mutate(
              specialty,
              'Finalizando atención…',
              () => api.finalizeAttention(active.id, 'Finalizada'),
              'Atención finalizada.',
            ),
          { class: 'primary' },
        ),
      ]);
    }

    return el('p', {
      class: 'hint',
      text: 'Completá la evaluación y la atención se finaliza automáticamente.',
    });
  }

  function resultRow(specialty, evaluation) {
    const resultSelect = el('select', { name: 'result' });

    for (const [value, label] of [
      ['', 'Sin resultado'],
      ...map.RESULT_CODES.map((code) => [code, map.resultLabel(code)]),
    ]) {
      const option = el('option', { value, text: label });

      if (value === (evaluation.result ?? '')) {
        option.selected = true;
      }
      resultSelect.append(option);
    }

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

  function completionBlock(specialty, evaluation) {
    if (map.canComplete(journey, specialty)) {
      const hasActive = Boolean(map.activeAttentionOf(journey, specialty));
      const label = hasActive ? 'Completar y finalizar atención' : 'Completar evaluación';

      return el('div', { class: 'row' }, [
        button(
          label,
          () =>
            mutate(
              specialty,
              hasActive ? 'Completando y finalizando…' : 'Completando evaluación…',
              () => api.completeEvaluation(evaluation.id),
              hasActive ? 'Evaluación completada y atención finalizada.' : 'Evaluación completada.',
            ),
          { class: 'primary' },
        ),
      ]);
    }

    if (evaluation.state === map.EVALUATION_COMPLETE || !map.hasAttentionFor(journey, specialty)) {
      return null;
    }

    if (map.openPendingsOf(journey, evaluation.id).length > 0) {
      return el('p', { class: 'hint', text: 'Resolvé los pendientes abiertos para completar.' });
    }

    const report = map.reportOf(journey, specialty);

    if (report?.reportState !== map.REPORT_COMPLETE) {
      return el('p', {
        class: 'hint',
        text: 'Guardá el informe como Completo para poder completar la evaluación.',
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
    const ownsLatest = !latest || latest.professional?.id === ctx.user?.profesionalId;
    const canAct = canWorkOn(specialty) && ownsLatest;
    const ownsActive = active ? active.professional?.id === ctx.user?.profesionalId : true;

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

    const cardNotice = notice(notices.get(specialty));
    if (cardNotice) {
      nodes.push(cardNotice);
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

    if (canAct) {
      if (active && !ownsActive) {
        nodes.push(
          el('p', {
            class: 'hint',
            text: `Atención activa de ${active.professional?.name ?? 'otro profesional'}.`,
          }),
        );
      } else if (active) {
        if (
          evaluation &&
          map.canRecordResult(specialty) &&
          evaluation.state !== map.EVALUATION_COMPLETE
        ) {
          nodes.push(resultRow(specialty, evaluation));
        }
        nodes.push(completionBlock(specialty, evaluation));
        nodes.push(finalizeBlock(specialty, active));
      } else if (map.canStart(journey, specialty)) {
        nodes.push(startRow(specialty));
      } else if (evaluation && evaluation.state !== map.EVALUATION_COMPLETE) {
        if (map.canRecordResult(specialty) && !evaluation.result) {
          nodes.push(resultRow(specialty, evaluation));
        }
        nodes.push(completionBlock(specialty, evaluation));
      }
    }

    nodes.push(
      renderReportSection({
        journey,
        specialty,
        editable: canAct,
        editing: canAct && (editingReports.has(specialty) || !report?.reportId),
        onEdit: () => {
          editingReports.add(specialty);
          render();
        },
        onCancel: () => {
          editingReports.delete(specialty);
          render();
        },
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
