import { button, el } from '../dom.js';
import { api } from '../api-client.js';
import { APTITUDE_CLASS, JOURNEY_STATE_CLASS, resultLabel, specialtyLabel } from '../state-map.js';

export async function renderEvaluateList(container, ctx) {
  const list = el('ul', { class: 'history' });
  const status = el('p', { class: 'notice', hidden: true });
  const refresh = button('Actualizar', () => load());

  const panel = el('section', { class: 'panel' }, [
    el('div', { class: 'card-head' }, [el('h2', { text: 'Turnos para evaluar' }), refresh]),
    el('p', {
      class: 'hint',
      text: 'Se listan los turnos En espera y En proceso. Abrí uno para iniciar atenciones.',
    }),
    status,
    list,
  ]);

  function setStatus(text, kind = 'error') {
    status.textContent = text;
    status.className = `notice ${kind}`;
    status.hidden = false;
  }

  function item(entry) {
    return el('li', {}, [
      el('div', { class: 'line' }, [
        el('strong', {
          text: `${entry.attentionNumber} · ${entry.applicant.nombre} ${entry.applicant.apellido}`,
        }),
        el('a', { class: 'chip active', href: `#/j/${entry.attentionNumber}`, text: 'Abrir' }),
      ]),
      el('div', { class: 'row' }, [
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
      ]),
      el('span', {
        class: 'meta',
        text: `Evaluaciones ${entry.evaluations.complete}/${entry.evaluations.total}`,
      }),
    ]);
  }

  async function load() {
    status.hidden = true;

    try {
      const entries = await api.overview();
      const active = entries.filter(
        (entry) => entry.state === 'En espera' || entry.state === 'En proceso',
      );

      list.replaceChildren();

      if (active.length === 0) {
        list.append(el('li', { text: 'No hay turnos pendientes de evaluación.' }));
        return;
      }

      for (const entry of active) {
        list.append(item(entry));
      }
    } catch (error) {
      setStatus(error.message);
    }
  }

  container.append(panel);
  await load();
}
