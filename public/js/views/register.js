import { api } from '../api-client.js';
import { el, field, input } from '../dom.js';

function brandPanel() {
  return el('aside', { class: 'auth-brand' }, [
    el('img', {
      class: 'auth-logo',
      src: '/assets/logo.png',
      alt: 'Sistema de Salud Ocupacional',
    }),
    el('h1', { text: 'Pedí tu turno' }),
    el('p', {
      text: 'Creá tu cuenta y tu turno de preocupacional en un mismo paso. Después seguí el estado desde tu recorrido.',
    }),
  ]);
}

export function renderRegister(container, ctx) {
  const status = el('p', { class: 'notice', hidden: true });
  const submit = el('button', { type: 'submit', class: 'primary', text: 'Pedir turno' });

  const form = el('form', { class: 'panel auth-panel' }, [
    el('h1', { text: 'Pedir turno' }),
    el('p', {
      class: 'hint',
      text: 'Completá tus datos. Te creamos la cuenta y el turno en el mismo paso.',
    }),
    el('div', { class: 'grid two' }, [
      field('Nombre', input('nombre', { autocomplete: 'given-name', required: true })),
      field('Apellido', input('apellido', { autocomplete: 'family-name', required: true })),
      field('DNI', input('dni', { autocomplete: 'off', inputmode: 'numeric', required: true })),
      field('Email', input('email', { type: 'email', autocomplete: 'email', required: true })),
      field('Empresa', input('empresa', { autocomplete: 'organization' })),
      field('Puesto', input('puesto', { autocomplete: 'organization-title' })),
    ]),
    el('div', { class: 'grid' }, [
      field(
        'Contraseña',
        input('password', {
          type: 'password',
          autocomplete: 'new-password',
          required: true,
          minlength: 10,
        }),
      ),
    ]),
    el('div', { class: 'row', style: 'margin-top:16px' }, [submit]),
    status,
    el('p', { class: 'hint' }, [
      '¿Ya tenés cuenta? ',
      el('a', { href: '#/login', text: 'Ingresá' }),
    ]),
  ]);

  function setStatus(text, kind) {
    status.textContent = text;
    status.className = `notice ${kind ?? ''}`.trim();
    status.hidden = false;
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = new FormData(form);

    submit.disabled = true;
    setStatus('Creando tu turno…', 'info');

    try {
      const session = await api.register({
        nombre: String(data.get('nombre') ?? ''),
        apellido: String(data.get('apellido') ?? ''),
        dni: String(data.get('dni') ?? ''),
        email: String(data.get('email') ?? ''),
        password: String(data.get('password') ?? ''),
        empresa: String(data.get('empresa') ?? ''),
        puesto: String(data.get('puesto') ?? ''),
      });

      ctx.setUser(session.user);
      ctx.clearBanner();
      window.location.hash = '#/portal';
    } catch (error) {
      setStatus(error.message, 'error');
    } finally {
      submit.disabled = false;
    }
  });

  container.append(el('section', { class: 'auth-shell' }, [brandPanel(), form]));
}
