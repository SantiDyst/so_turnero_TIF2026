import { button, el, select } from '../dom.js';
import { api } from '../api-client.js';
import * as map from '../state-map.js';

export function renderReportSection({ journey, specialty, onAction, onError }) {
  const report = map.reportOf(journey, specialty);
  const attention = map.latestAttentionOf(journey, specialty);
  const editable = map.canSaveReport(journey, specialty);

  const observations = el('textarea', {
    rows: 3,
    placeholder: 'Observaciones',
    disabled: !editable,
  });
  observations.value = report?.observations ?? '';

  const stateSelect = select(
    'reportState',
    [
      ['Pendiente', 'Pendiente'],
      ['Completo', 'Completo'],
    ],
    report?.reportState ?? 'Pendiente',
  );
  stateSelect.disabled = !editable;

  const save = button(
    'Guardar informe',
    () => {
      const text = observations.value.trim();

      if (stateSelect.value === map.REPORT_COMPLETE && text.length === 0) {
        onError('Un informe Completo requiere observaciones.');
        return;
      }

      onAction(() => api.saveReport(attention.id, { observations: text, state: stateSelect.value }));
    },
    { disabled: !editable },
  );

  return el('div', {}, [
    el('div', { class: 'card-head' }, [
      el('h3', { text: 'Informe' }),
      el('span', { class: 'badge', text: report?.reportState ?? 'Pendiente' }),
    ]),
    el('div', { class: 'grid' }, [
      observations,
      el('div', { class: 'row' }, [stateSelect, save]),
    ]),
    editable
      ? null
      : el('p', { class: 'hint', text: 'Requiere una atención iniciada para esta especialidad.' }),
  ]);
}
