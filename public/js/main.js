import { api, SESSION_EXPIRED } from './api-client.js';
import { clear, el } from './dom.js';
import { navigate, readRoute } from './router.js';
import { homePathFor, roleLabel } from './routes-map.js';
import { renderEvaluateList } from './views/evaluate-list.js';
import { renderHome } from './views/home.js';
import { renderIntake } from './views/intake.js';
import { renderJourney } from './views/journey.js';
import { renderLogin } from './views/login.js';
import { renderManagement } from './views/management.js';
import { renderPortal } from './views/portal.js';
import { renderPublicCertificate } from './views/public-certificate.js';
import { renderRegister } from './views/register.js';
import { renderUsers } from './views/users.js';

const app = document.querySelector('#app');
const banner = document.querySelector('#banner');
const topnav = document.querySelector('#topnav');

const ROUTE_ROLES = {
  intake: ['ADMIN'],
  evaluate: ['PROFESIONAL'],
  management: ['ADMIN'],
  users: ['ADMIN'],
  portal: ['USER'],
  journey: ['ADMIN', 'PROFESIONAL'],
};

const PUBLIC_ROUTES = new Set(['login', 'register', 'public-certificate']);

let user = null;

const ctx = {
  get user() {
    return user;
  },
  showError(message, kind = 'error') {
    banner.textContent = message;
    banner.className = kind === 'info' ? 'banner info' : 'banner';
    banner.hidden = false;
  },
  clearBanner() {
    banner.textContent = '';
    banner.hidden = true;
  },
  setUser(next) {
    user = next;
    paintChrome();
  },
  async signOut() {
    try {
      await api.logout();
    } catch {
      // The session is already gone; the UI only needs to drop its copy.
    }
    user = null;
    paintChrome();
    navigate('/login');
  },
};

function navLink(label, path) {
  return el('a', { href: path, text: label });
}

function paintChrome() {
  const nodes = [];

  if (user?.rol === 'ADMIN') {
    nodes.push(
      navLink('Turnos', '#/turnos'),
      navLink('Gestión', '#/gestion'),
      navLink('Usuarios', '#/usuarios'),
    );
  } else if (user?.rol === 'PROFESIONAL') {
    nodes.push(navLink('Mi jornada', '#/evaluar'));
  } else if (user?.rol === 'USER') {
    nodes.push(navLink('Mi recorrido', '#/portal'));
  }

  if (user) {
    nodes.push(
      el('span', { class: 'account' }, [
        el('span', { class: 'account-name', text: user.nombre }),
        el('span', { class: 'role-badge', text: roleLabel(user.rol) }),
      ]),
      el('button', {
        type: 'button',
        class: 'link-button',
        text: 'Salir',
        onClick: () => void ctx.signOut(),
      }),
    );
  } else {
    nodes.push(navLink('Ingresar', '#/login'), navLink('Pedir turno', '#/registro'));
  }

  topnav.replaceChildren(...nodes);
}

function renderForbidden() {
  app.append(
    el('section', { class: 'panel' }, [
      el('h1', { text: 'No tenés permiso para ver esta sección' }),
      el('p', { class: 'hint', text: 'Tu rol no incluye esta pantalla.' }),
      el('a', { class: 'back', href: homePathFor(user?.rol), text: '← Volver al inicio' }),
    ]),
  );
}

async function render() {
  ctx.clearBanner();
  clear(app);

  const route = readRoute();

  if (!PUBLIC_ROUTES.has(route.name)) {
    if (!user) {
      navigate('/login');
      return;
    }

    const allowedRoles = ROUTE_ROLES[route.name];

    if (allowedRoles && !allowedRoles.includes(user.rol)) {
      renderForbidden();
      return;
    }
  }

  try {
    if (route.name === 'login') {
      renderLogin(app, ctx);
      return;
    }
    if (route.name === 'register') {
      renderRegister(app, ctx);
      return;
    }
    if (route.name === 'public-certificate') {
      await renderPublicCertificate(app, route.token);
      return;
    }
    if (route.name === 'portal') {
      await renderPortal(app, ctx);
      return;
    }
    if (route.name === 'users') {
      await renderUsers(app, ctx);
      return;
    }
    if (route.name === 'intake') {
      renderIntake(app, ctx);
      return;
    }
    if (route.name === 'evaluate') {
      await renderEvaluateList(app, ctx);
      return;
    }
    if (route.name === 'management') {
      await renderManagement(app, ctx);
      return;
    }
    if (route.name === 'journey') {
      await renderJourney(app, route.attentionNumber, ctx);
      return;
    }

    renderHome(app, ctx);
  } catch (error) {
    ctx.showError(error?.message ?? 'Error inesperado');
    app.append(
      el('p', { class: 'hint', text: 'No se pudo cargar la vista.' }),
      el('a', { class: 'back', href: homePathFor(user?.rol), text: 'Volver al inicio' }),
    );
  }
}

async function boot() {
  try {
    const session = await api.me();
    user = session.user;
  } catch {
    user = null;
  }

  paintChrome();
  await render();
}

window.addEventListener('hashchange', () => {
  void render();
});

window.addEventListener(SESSION_EXPIRED, () => {
  user = null;
  paintChrome();
  ctx.showError('Tu sesión expiró. Volvé a ingresar.', 'info');
  navigate('/login');
});

void boot();
