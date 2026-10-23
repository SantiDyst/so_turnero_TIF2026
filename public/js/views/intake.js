import { button, el, field, input } from '../dom.js';
import { api } from '../api-client.js';
import { navigate } from '../router.js';
import { APTITUDE_CLASS, JOURNEY_STATE_CLASS, resultLabel, specialtyLabel } from '../state-map.js';

const FILTERS = [
  ['todos', 'Todos'],
  ['espera', 'En espera'],
  ['proceso', 'En proceso'],
  ['cerrados', 'Cerrados'],
];

const FILTER_STATES = {
  espera: 'En espera',
  proceso: 'En proceso',
  cerrados: 'Cierre final',
};

export async function renderIntake(container, ctx) {
  let entries = [];
  let filter = 'todos';

  const status = el('p', { class: 'notice', hidden: true });
  const submit = el('button', { type: 'submit', class: 'primary', text: 'Registrar' });

  const form = el('form', { class: 'panel' }, [
    el('h2', { text: 'Agregar un postulante en espera' }),
    el('p', { class: 'hint', text: 'Completá nombre, apellido y DNI para generar el turno.' }),
    el('div', { class: 'grid two' }, [
      field('Nombre', input('nombre', { autocomplete: 'off' })),
      field('Apellido', input('apellido', { autocomplete: 'off' })),
      field('DNI', input('dni', { autocomplete: 'off', inputmode: 'numeric' })),
    ]),
    el('div', { class: 'row', style: 'margin-top:12px' }, [submit]),
    status,
  ]);

  function setStatus(text, kind = 'info') {
    status.textContent = text;
    status.className = `notice ${kind}`;
    status.hidden = false;
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = new FormData(form);

    submit.disabled = true;
    setStatus('Registrando postulante…');

    try {
      const created = await api.register({
        nombre: String(data.get('nombre') ?? ''),
        apellido: String(data.get('apellido') ?? ''),
        dni: String(data.get('dni') ?? ''),
      });
      ctx.clearBanner();
      navigate(`/j/${created.journey.attentionNumber}`);
    } catch (error) {
      setStatus(error.message, 'error');
      submit.disabled = false;
    }
  });

  const list = el('ul', { class: 'history' });
  const chips = el('div', { class: 'chips' });
  const refresh = button('Actualizar', () => load());
  const historyPanel = el('section', { class: 'panel' }, [
    el('div', { class: 'card-head' }, [el('h2', { text: 'Turnos registrados' }), refresh]),
    chips,
    list,
  ]);

  function matches(entry) {
    return filter === 'todos' || entry.state === FILTER_STATES[filter];
  }

  function paint() {
    chips.replaceChildren(
      ...FILTERS.map(([key, label]) =>
        button(label, () => {
          filter = key;
          paint();
        }, { class: key === filter ? 'chip active' : 'chip' }),
      ),
    );

    list.replaceChildren();

    const visible = entries.filter(matches);

    if (visible.length === 0) {
      list.append(el('li', { text: 'No hay turnos para este filtro.' }));
      return;
    }

    for (const entry of visible) {
      list.append(item(entry));
    }
  }

  function item(entry) {
    const badges = el('div', { class: 'row' }, [
      el('span', {
        class: JOURNEY_STATE_CLASS[entry.state] ?? 'badge',
        text: entry.state,
      }),
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
    ]);

    const meta = [
      `Evaluaciones ${entry.evaluations.complete}/${entry.evaluations.total}`,
      entry.openPendings > 0 ? `${entry.openPendings} pendiente(s)` : null,
      entry.certificateIssued ? 'certificado emitido' : null,
    ]
      .filter(Boolean)
      .join(' · ');

    return el('li', {}, [
      el('div', { class: 'line' }, [
        el('strong', {
          text: `${entry.attentionNumber} · ${entry.applicant.nombre} ${entry.applicant.apellido}`,
        }),
        button(entry.state === 'En espera' ? 'Abrir' : 'Ver', () =>
          navigate(`/j/${entry.attentionNumber}`),
        ),
      ]),
      badges,
      el('span', { class: 'meta', text: meta }),
    ]);
  }

  async function load() {
    try {
      entries = await api.overview();
    } catch (error) {
      ctx.showError(error.message);
      entries = [];
    }

    paint();
  }

  container.append(form, historyPanel);
  await load();
}
