import { button, el } from '../dom.js';
import { api } from '../api-client.js';
import { formatDate } from '../format.js';
import { JOURNEY_STATE_CLASS } from '../state-map.js';

const STATUS = {
  pendiente: { class: 'badge', text: 'Pendiente' },
  en_atencion: { class: 'badge active', text: 'En atención' },
  completado: { class: 'badge complete', text: 'Completado' },
};

export async function renderEvaluateList(container, ctx) {
  const list = el('ul', { class: 'history' });
  const status = el('p', { class: 'notice', hidden: true });
  const refresh = button('Actualizar', () => load());

  const panel = el('section', { class: 'panel' }, [
    el('div', { class: 'card-head' }, [el('h2', { text: 'Mi jornada' }), refresh]),
    el('p', {
      class: 'hint',
      text: 'Turnos pendientes de tu especialidad y los que ya atendiste. Abrí uno para continuar.',
    }),
    status,
    el('div', { class: 'list-panel scroll-list' }, [list]),
  ]);

  function setStatus(text, kind = 'error') {
    status.textContent = text;
    status.className = `notice ${kind}`;
    status.hidden = false;
  }

  function item(entry) {
    const initials =
      `${entry.applicant.nombre.charAt(0)}${entry.applicant.apellido.charAt(0)}`.toUpperCase();
    const badge = STATUS[entry.status] ?? STATUS.pendiente;
    const when = entry.completedAt
      ? `Atendido ${formatDate(entry.completedAt)}`
      : `En cola desde ${formatDate(entry.queuedAt)}`;
    const workplace = [entry.puesto, entry.empresa].filter(Boolean).join(' · ');

    return el('li', {}, [
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
              text: [entry.attentionNumber, workplace, when].filter(Boolean).join(' · '),
            }),
          ]),
        ]),
        el('a', { class: 'chip active', href: `#/j/${entry.attentionNumber}`, text: 'Abrir' }),
      ]),
      el('div', { class: 'row' }, [
        el('span', { class: badge.class, text: badge.text }),
        el('span', {
          class: JOURNEY_STATE_CLASS[entry.journeyState] ?? 'badge',
          text: entry.journeyState,
        }),
      ]),
    ]);
  }

  async function load() {
    status.hidden = true;

    try {
      const entries = await api.queue();

      list.replaceChildren();

      if (entries.length === 0) {
        list.append(el('li', { class: 'empty', text: 'No tenés turnos pendientes.' }));
        return;
      }

      for (const entry of entries) {
        list.append(item(entry));
      }
    } catch (error) {
      setStatus(error.message);
    }
  }

  container.append(panel);
  await load();
}
