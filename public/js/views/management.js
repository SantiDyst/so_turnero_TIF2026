import { button, el, input } from '../dom.js';
import { api } from '../api-client.js';
import {
  APTITUDE_CLASS,
  JOURNEY_STATE_CLASS,
  entryCanAnnul,
  entryCanDelete,
  resultLabel,
  specialtyLabel,
} from '../state-map.js';

const FILTERS = [
  ['todos', 'Todos'],
  ['espera', 'En espera'],
  ['proceso', 'En proceso'],
  ['cerrados', 'Cerrados'],
  ['anulados', 'Anulados'],
];

const FILTER_STATES = {
  espera: 'En espera',
  proceso: 'En proceso',
  cerrados: 'Cierre final',
  anulados: 'Anulada',
};

export async function renderManagement(container, ctx) {
  let entries = [];
  let filter = 'todos';
  let annulling = null;
  let deleting = null;

  const list = el('ul', { class: 'history' });
  const chips = el('div', { class: 'chips' });
  const status = el('p', { class: 'notice', hidden: true });
  const refresh = button('Actualizar', () => load());

  const panel = el('section', { class: 'panel' }, [
    el('div', { class: 'card-head' }, [el('h2', { text: 'Registro de turnos' }), refresh]),
    el('p', {
      class: 'hint',
      text: 'Anular conserva el historial. Eliminar solo está disponible para turnos sin atenciones.',
    }),
    chips,
    status,
    el('div', { class: 'list-panel' }, [list]),
  ]);

  function setStatus(text, kind = 'info') {
    status.textContent = text;
    status.className = `notice ${kind}`;
    status.hidden = false;
  }

  function matches(entry) {
    return filter === 'todos' || entry.state === FILTER_STATES[filter];
  }

  function annulForm(entry) {
    const motivo = input('motivo', { placeholder: 'Motivo de la anulación', autocomplete: 'off' });

    return el('div', { class: 'notice' }, [
      el('p', {
        text: `Anular ${entry.attentionNumber}: el turno queda registrado, no se borra.`,
        style: 'margin:0 0 8px',
      }),
      motivo,
      el('div', { class: 'row', style: 'margin-top:8px' }, [
        button(
          'Confirmar anulación',
          async () => {
            if (motivo.value.trim().length === 0) {
              setStatus('Indicá el motivo de la anulación.', 'error');
              return;
            }

            await run(
              () => api.annulJourney(entry.journeyId, motivo.value.trim()),
              'Turno anulado.',
            );
          },
          { class: 'primary' },
        ),
        button('Cancelar', () => {
          annulling = null;
          paint();
        }),
      ]),
    ]);
  }

  function deleteConfirm(entry) {
    return el('div', { class: 'notice' }, [
      el('p', {
        text: `¿Eliminar el turno ${entry.attentionNumber}? No tiene atenciones registradas.`,
        style: 'margin:0 0 8px',
      }),
      el('div', { class: 'row' }, [
        button(
          'Sí, eliminar',
          () => run(() => api.deleteJourney(entry.journeyId), 'Turno eliminado.'),
          { class: 'primary' },
        ),
        button('Cancelar', () => {
          deleting = null;
          paint();
        }),
      ]),
    ]);
  }

  async function run(action, successText) {
    setStatus('Procesando…', 'info');

    try {
      await action();
      annulling = null;
      deleting = null;
      await load();
      setStatus(successText, 'ok');
    } catch (error) {
      setStatus(error.message, 'error');
    }
  }

  function item(entry) {
    const initials =
      `${entry.applicant.nombre.charAt(0)}${entry.applicant.apellido.charAt(0)}`.toUpperCase();

    const nodes = [
      el('div', { class: 'line' }, [
        el('div', { class: 'person' }, [
          el('span', { class: 'avatar', text: initials }),
          el('span', {}, [
            el('div', {
              class: 'name',
              text: `${entry.applicant.nombre} ${entry.applicant.apellido}`,
            }),
            el('div', {
              class: 'meta',
              text: [
                entry.attentionNumber,
                [entry.puesto, entry.empresa].filter(Boolean).join(' · ') || null,
                `Evaluaciones ${entry.evaluations.complete}/${entry.evaluations.total}`,
                `Atenciones ${entry.attentionCount}`,
                entry.certificateIssued ? 'certificado emitido' : null,
                entry.annulledReason ? `Motivo: ${entry.annulledReason}` : null,
              ]
                .filter(Boolean)
                .join(' · '),
            }),
          ]),
        ]),
        el('a', { class: 'chip', href: `#/j/${entry.attentionNumber}`, text: 'Ver' }),
      ]),
      el('div', { class: 'row' }, [
        el('span', { class: JOURNEY_STATE_CLASS[entry.state] ?? 'badge', text: entry.state }),
        entry.activeSpecialty
          ? el('span', {
              class: 'badge active',
              text: `En atención · ${specialtyLabel(entry.activeSpecialty)}`,
            })
          : null,
        entry.finalAptitude
          ? el('span', {
              class: APTITUDE_CLASS[entry.finalAptitude] ?? 'badge',
              text: resultLabel(entry.finalAptitude),
            })
          : null,
      ]),
    ];

    const actions = el('div', { class: 'row' });

    if (entryCanAnnul(entry)) {
      actions.append(
        button('Anular', () => {
          annulling = entry.attentionNumber;
          deleting = null;
          paint();
        }),
      );
    }

    if (entryCanDelete(entry)) {
      actions.append(
        button(
          'Eliminar',
          () => {
            deleting = entry.attentionNumber;
            annulling = null;
            paint();
          },
          { class: 'danger' },
        ),
      );
    }

    if (entry.activeSpecialty && (entry.state === 'En espera' || entry.state === 'En proceso')) {
      actions.append(
        el('span', { class: 'hint', text: 'Finalizá la atención activa para poder anular.' }),
      );
    } else if (!entryCanAnnul(entry) && !entryCanDelete(entry)) {
      actions.append(el('span', { class: 'hint', text: 'Sin acciones disponibles.' }));
    }

    nodes.push(actions);

    if (annulling === entry.attentionNumber) {
      nodes.push(annulForm(entry));
    }
    if (deleting === entry.attentionNumber) {
      nodes.push(deleteConfirm(entry));
    }

    return el('li', {}, nodes);
  }

  function paint() {
    chips.replaceChildren(
      ...FILTERS.map(([key, label]) =>
        button(
          label,
          () => {
            filter = key;
            annulling = null;
            deleting = null;
            paint();
          },
          { class: key === filter ? 'chip active' : 'chip' },
        ),
      ),
    );

    list.replaceChildren();

    const visible = entries.filter(matches);

    if (visible.length === 0) {
      list.append(el('li', { class: 'empty', text: 'No hay turnos para este filtro.' }));
      return;
    }

    for (const entry of visible) {
      list.append(item(entry));
    }
  }

  async function load() {
    try {
      entries = await api.overview();
    } catch (error) {
      setStatus(error.message, 'error');
      entries = [];
    }

    paint();
  }

  container.append(panel);
  await load();
}
