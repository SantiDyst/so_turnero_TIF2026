import { el } from '../dom.js';
import { roleLabel } from '../routes-map.js';

function moduleCard(title, description, href) {
  return el('a', { class: 'module', href }, [
    el('strong', { text: title }),
    el('span', { class: 'hint', text: description }),
  ]);
}

function cardsFor(role) {
  if (role === 'ADMIN') {
    return [
      moduleCard('Nuevo turno', 'Alta del postulante y número de atención.', '#/turnos'),
      moduleCard('Gestión', 'Estado de todos los turnos, anulación y borrado.', '#/gestion'),
      moduleCard('Usuarios', 'Cuentas de administración y profesionales.', '#/usuarios'),
    ];
  }

  if (role === 'PROFESIONAL') {
    return [moduleCard('Mi jornada', 'Turnos pendientes de tu especialidad.', '#/evaluar')];
  }

  if (role === 'USER') {
    return [moduleCard('Mi recorrido', 'Tu turno, tus resultados y tu certificado.', '#/portal')];
  }

  return [];
}

export function renderHome(container, ctx) {
  const user = ctx.user;

  container.append(
    el('section', { class: 'panel' }, [
      el('h1', { text: `Hola, ${user.nombre}` }),
      el('p', { class: 'hint', text: `Ingresaste como ${roleLabel(user.rol)}.` }),
      el('div', { class: 'modules' }, cardsFor(user.rol)),
      el('p', { class: 'hint' }, [
        'Documentación de la API: ',
        el('a', { href: '/docs', text: '/docs' }),
      ]),
    ]),
  );
}
