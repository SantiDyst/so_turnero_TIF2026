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
      title: field.help,
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
    title: field.help,
    disabled,
  });
  control.value = value ?? '';

  return control;
}

function dataSection(fields, data) {
  if (fields.length === 0) {
    return null;
  }

  const grid = el('div', { class: 'grid two' });

  for (const field of fields) {
    grid.append(
      el('label', { class: 'field' }, [
        el('span', { text: field.unit ? `${field.label} (${field.unit})` : field.label }),
        fieldControl(field, data?.[field.key], false),
        field.help ? el('small', { class: 'field-help', text: field.help }) : null,
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

function readOnlyView(fields, data, observations) {
  const nodes = [];
  const filled = (fields ?? []).filter(
    (field) =>
      data?.[field.key] !== undefined && data?.[field.key] !== null && data?.[field.key] !== '',
  );

  if (filled.length > 0) {
    nodes.push(el('h4', { text: 'Datos del informe' }));
    nodes.push(
      el(
        'dl',
        { class: 'report-view' },
        filled.map((field) =>
          el('div', {}, [
            el('dt', { text: field.label }),
            el('dd', {
              text: `${data[field.key]}${field.unit ? ` ${field.unit}` : ''}`,
            }),
          ]),
        ),
      ),
    );
  }

  nodes.push(el('h4', { text: 'Conclusión / recomendación' }));
  nodes.push(
    el('p', {
      class: observations ? 'report-conclusion' : 'hint',
      text: observations || 'Sin conclusión registrada.',
    }),
  );

  return nodes;
}

export function renderClosingForm({ specialty, report, evaluation, onSubmit, onError }) {
  const fields = report?.fields ?? [];
  const includeResult = map.canRecordResult(specialty);

  const observations = el('textarea', {
    rows: 3,
    placeholder: 'Conclusión y recomendaciones',
  });
  observations.value = report?.observations ?? '';

  const resultSelect = includeResult
    ? select(
        'result',
        [['', '—'], ...map.RESULT_CODES.map((code) => [code, map.resultLabel(code)])],
        evaluation?.result ?? '',
      )
    : null;

  const body = el('div', {}, [
    dataSection(fields, report?.data),
    el('label', { class: 'field' }, [
      el('span', { text: 'Conclusión / recomendación' }),
      observations,
    ]),
  ]);

  const save = button(
    'Guardar y finalizar atención',
    () => {
      const text = observations.value.trim();

      if (text.length === 0) {
        onError('La conclusión es obligatoria para finalizar la atención.');
        return;
      }
      if (resultSelect && resultSelect.value.length === 0) {
        onError('Elegí un resultado antes de finalizar.');
        return;
      }

      onSubmit({
        observations: text,
        datos: readData(fields, body),
        result: resultSelect ? resultSelect.value : null,
      });
    },
    { class: 'primary' },
  );

  return el('section', { class: 'closing' }, [
    el('div', { class: 'card-head' }, [el('h3', { text: 'Cierre de atención' })]),
    el('p', {
      class: 'hint',
      text: 'Un solo guardado: informe completo, resultado y finalización de la atención.',
    }),
    body,
    el('div', { class: 'row', style: 'margin-top:10px' }, [
      ...(resultSelect ? [resultSelect] : []),
      save,
    ]),
  ]);
}

export function renderReportSection({
  journey,
  specialty,
  editable = false,
  editing = false,
  onEdit,
  onCancel,
  onAction,
  onError,
}) {
  const report = map.reportOf(journey, specialty);
  const attention = map.latestAttentionOf(journey, specialty);
  const fields = report?.fields ?? [];
  const canEdit = editable && map.canSaveReport(journey, specialty);

  const header = el('div', { class: 'card-head' }, [
    el('h3', { text: 'Informe' }),
    el('span', {
      class: report?.reportState === 'Completo' ? 'badge active' : 'badge',
      text: report?.reportState ?? 'Pendiente',
    }),
  ]);

  if (!canEdit || !editing) {
    const nodes = [header, ...readOnlyView(fields, report?.data, report?.observations)];

    if (canEdit) {
      nodes.push(
        el('div', { class: 'row', style: 'margin-top:10px' }, [
          button('Editar informe', onEdit, { class: 'blue' }),
        ]),
      );
    } else if (!attention) {
      nodes.push(
        el('p', { class: 'hint', text: 'Requiere una atención iniciada para esta especialidad.' }),
      );
    }

    return el('div', {}, nodes);
  }

  const observations = el('textarea', {
    rows: 3,
    placeholder: 'Conclusión y recomendaciones',
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

  const body = el('div', {}, [
    dataSection(fields, report?.data),
    el('label', { class: 'field' }, [
      el('span', { text: 'Conclusión / recomendación' }),
      observations,
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
    { class: 'primary' },
  );

  return el('div', {}, [
    header,
    body,
    el('div', { class: 'row', style: 'margin-top:10px' }, [
      stateSelect,
      save,
      report?.reportId ? button('Cancelar edición', onCancel) : null,
    ]),
  ]);
}
