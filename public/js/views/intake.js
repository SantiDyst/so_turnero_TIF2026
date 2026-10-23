import { button, el, field, input } from '../dom.js';
import { api } from '../api-client.js';
import { navigate } from '../router.js';

export async function renderIntake(container, ctx) {
  const form = el('form', { class: 'panel' }, [
    el('h2', { text: 'Alta de postulante' }),
    el('div', { class: 'grid two' }, [
      field('Nombre', input('nombre', { autocomplete: 'off' })),
      field('Apellido', input('apellido', { autocomplete: 'off' })),
      field('DNI', input('dni', { autocomplete: 'off', inputmode: 'numeric' })),
    ]),
    el('div', { class: 'row', style: 'margin-top:12px' }, [
      el('button', { type: 'submit', class: 'primary', text: 'Registrar' }),
    ]),
  ]);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = new FormData(form);

    try {
      const created = await api.register({
        nombre: String(data.get('nombre') ?? ''),
        apellido: String(data.get('apellido') ?? ''),
        dni: String(data.get('dni') ?? ''),
      });
      ctx.clearBanner();
      navigate(`/j/${created.journey.attentionNumber}`);
    } catch (error) {
      ctx.showError(error.message);
    }
  });

  const queueList = el('ul', { class: 'queue' });
  const refresh = button('Actualizar', loadQueue);
  const queuePanel = el('section', { class: 'panel' }, [
    el('div', { class: 'card-head' }, [el('h2', { text: 'Cola de espera' }), refresh]),
    queueList,
  ]);

  async function loadQueue() {
    queueList.replaceChildren();

    try {
      const entries = await api.queue();

      if (entries.length === 0) {
        queueList.append(el('li', { text: 'No hay postulantes en espera.' }));
        return;
      }

      for (const entry of entries) {
        queueList.append(
          el('li', {}, [
            el('span', { text: `${entry.attentionNumber} · ${entry.journeyState}` }),
            button('Abrir', () => navigate(`/j/${entry.attentionNumber}`)),
          ]),
        );
      }
    } catch (error) {
      ctx.showError(error.message);
    }
  }

  container.append(form, queuePanel);
  await loadQueue();
}
