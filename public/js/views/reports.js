import { button, el, select } from '../dom.js';
import { api } from '../api-client.js';
import * as map from '../state-map.js';

function fieldControl(field, value, disabled) {
  if (field.type === 'select') {
    const control = select(
      field.key,
      [['', '—'], ...(field.options ?? []).map((option) => [option, option])],
      value ?? '',
    );
    control.disabled = disabled;

    return control;
  }

  if (field.type === 'textarea') {
    const control = el('textarea', {
      name: field.key,
      rows: 2,
      placeholder: field.label,
      disabled,
    });
    control.value = value ?? '';

    return control;
  }

  const control = el('input', {
    name: field.key,
    type: field.type === 'number' ? 'number' : 'text',
    step: 'any',
    placeholder: field.label,
    disabled,
  });
  control.value = value ?? '';

  return control;
}

function dataSection(fields, data, editable) {
  if (fields.length === 0) {
    return null;
  }

  const grid = el('div', { class: 'grid two' });

  for (const field of fields) {
    grid.append(
      el('label', { class: 'field' }, [
        el('span', { text: field.unit ? `${field.label} (${field.unit})` : field.label }),
        fieldControl(field, data?.[field.key], !editable),
      ]),
    );
  }

  return el('div', {}, [el('h4', { text: 'Datos del informe' }), grid]);
}

function readData(fields, root) {
  const data = {};

  for (const field of fields) {
    const control = root.querySelector(`[name="${field.key}"]`);

    if (!control) {
      continue;
    }

    const value = String(control.value ?? '').trim();

    if (value === '') {
      continue;
    }

    data[field.key] = field.type === 'number' ? Number(value) : value;
  }

  return data;
}

export function renderReportSection({ journey, specialty, locked = false, onAction, onError }) {
  const report = map.reportOf(journey, specialty);
  const attention = map.latestAttentionOf(journey, specialty);
  const fields = report?.fields ?? [];
  const editable = !locked && map.canSaveReport(journey, specialty);

  const observations = el('textarea', {
    rows: 3,
    placeholder: 'Conclusión y recomendaciones',
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

  const body = el('div', {}, [
    dataSection(fields, report?.data, editable),
    el('div', { class: 'grid' }, [
      el('label', { class: 'field' }, [
        el('span', { text: 'Conclusión / recomendación' }),
        observations,
      ]),
    ]),
  ]);

  const save = button(
    'Guardar informe',
    () => {
      const text = observations.value.trim();

      if (stateSelect.value === map.REPORT_COMPLETE && text.length === 0) {
        onError('Un informe Completo requiere una conclusión.');
        return;
      }

      onAction(
        'Guardando informe…',
        () =>
          api.saveReport(attention.id, {
            observations: text,
            state: stateSelect.value,
            datos: readData(fields, body),
          }),
        'Informe guardado.',
      );
    },
    { class: 'blue', disabled: !editable },
  );

  return el('div', {}, [
    el('div', { class: 'card-head' }, [
      el('h3', { text: 'Informe' }),
      el('span', {
        class: report?.reportState === 'Completo' ? 'badge active' : 'badge',
        text: report?.reportState ?? 'Pendiente',
      }),
    ]),
    body,
    el('div', { class: 'row', style: 'margin-top:10px' }, [stateSelect, save]),
    !locked && !attention
      ? el('p', { class: 'hint', text: 'Requiere una atención iniciada para esta especialidad.' })
      : null,
  ]);
}
