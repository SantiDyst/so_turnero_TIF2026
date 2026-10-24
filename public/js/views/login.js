import { api } from '../api-client.js';
import { button, el, field, input } from '../dom.js';
import { homePathFor } from '../routes-map.js';

function brandPanel() {
  return el('aside', { class: 'auth-brand' }, [
    el('img', {
      class: 'auth-logo',
      src: '/assets/logo.png',
      alt: 'Sistema de Salud Ocupacional',
    }),
    el('h1', { text: 'Sistema de Salud Ocupacional' }),
    el('p', {
      text: 'Turnos, evaluaciones y certificados del preocupacional, en un solo lugar.',
    }),
  ]);
}

export function renderLogin(container, ctx) {
  const status = el('p', { class: 'notice', hidden: true });
  const submit = el('button', { type: 'submit', class: 'primary', text: 'Ingresar' });

  const form = el('form', { class: 'panel auth-panel' }, [
    el('h1', { text: 'Ingresar' }),
    el('p', {
      class: 'hint',
      text: 'Usá la cuenta que te dio la administración. Si sos postulante, podés pedir tu turno desde acá.',
    }),
    el('div', { class: 'grid' }, [
      field(
        'Email',
        input('email', { type: 'email', autocomplete: 'email', required: true, autofocus: true }),
      ),
      field(
        'Contraseña',
        input('password', {
          type: 'password',
          autocomplete: 'current-password',
          required: true,
        }),
      ),
    ]),
    el('div', { class: 'row', style: 'margin-top:16px' }, [submit]),
    status,
    el('p', { class: 'hint' }, [
      '¿Sos postulante y todavía no tenés cuenta? ',
      el('a', { href: '#/registro', text: 'Pedí tu turno' }),
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
    setStatus('Ingresando…', 'info');

    try {
      const session = await api.login(
        String(data.get('email') ?? ''),
        String(data.get('password') ?? ''),
      );

      ctx.setUser(session.user);
      ctx.clearBanner();
      window.location.hash = homePathFor(session.user.rol);
    } catch (error) {
      setStatus(error.message, 'error');
    } finally {
      submit.disabled = false;
    }
  });

  container.append(el('section', { class: 'auth-shell' }, [brandPanel(), form]));
}
