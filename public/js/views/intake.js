import { button, el, field, input } from '../dom.js';
import { api } from '../api-client.js';

export function renderIntake(container, ctx) {
  const status = el('p', { class: 'notice', hidden: true });
  const submit = el('button', { type: 'submit', class: 'primary', text: 'Registrar' });
  const confirmation = el('div', { class: 'notice ok', hidden: true });

  const form = el('form', { class: 'panel' }, [
    el('h2', { text: 'Agregar un postulante en espera' }),
    el('p', {
      class: 'hint',
      text: 'Completá nombre, apellido y DNI para generar el turno. El postulante queda En espera.',
    }),
    el('div', { class: 'grid two' }, [
      field('Nombre', input('nombre', { autocomplete: 'off' })),
      field('Apellido', input('apellido', { autocomplete: 'off' })),
      field('DNI', input('dni', { autocomplete: 'off', inputmode: 'numeric' })),
    ]),
    el('div', { class: 'row', style: 'margin-top:12px' }, [submit]),
    status,
    confirmation,
  ]);

  function setStatus(text, kind = 'info') {
    status.textContent = text;
    status.className = `notice ${kind}`;
    status.hidden = false;
  }

  function showConfirmation(attentionNumber, applicant) {
    confirmation.replaceChildren(
      el('strong', { text: `Turno ${attentionNumber} generado` }),
      el('span', {
        text: ` · ${applicant.nombre} ${applicant.apellido} queda En espera.`,
      }),
      el('div', { class: 'row', style: 'margin-top:8px' }, [
        el('a', { class: 'chip active', href: '#/evaluar', text: 'Ir a evaluar' }),
        button('Cargar otro', () => {
          form.reset();
          confirmation.hidden = true;
          status.hidden = true;
          form.querySelector('input[name="nombre"]')?.focus();
        }),
      ]),
    );
    confirmation.hidden = false;
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = new FormData(form);

    submit.disabled = true;
    confirmation.hidden = true;
    setStatus('Registrando postulante…');

    try {
      const created = await api.register({
        nombre: String(data.get('nombre') ?? ''),
        apellido: String(data.get('apellido') ?? ''),
        dni: String(data.get('dni') ?? ''),
      });
      ctx.clearBanner();
      status.hidden = true;
      showConfirmation(created.journey.attentionNumber, created.applicant);
      form.reset();
    } catch (error) {
      setStatus(error.message, 'error');
    } finally {
      submit.disabled = false;
    }
  });

  container.append(form);
}
