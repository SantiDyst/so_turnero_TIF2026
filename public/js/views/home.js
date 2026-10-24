import { el } from '../dom.js';

function moduleCard(title, description, href) {
  return el('a', { class: 'module', href }, [
    el('strong', { text: title }),
    el('span', { class: 'hint', text: description }),
  ]);
}

export function renderHome(container) {
  container.append(
    el('section', { class: 'panel' }, [
      el('h1', { text: '¿Cómo podemos ayudarte hoy?' }),
      el('p', {
        class: 'hint',
        text: 'Elegí un módulo. Todavía no hay roles: cualquier persona con el enlace puede usar los tres.',
      }),
      el('div', { class: 'modules' }, [
        moduleCard('Nuevo turno', 'Alta del postulante y número de atención.', '#/turnos'),
        moduleCard('Evaluar', 'Atenciones, resultados, informes y cierre.', '#/evaluar'),
        moduleCard('Gestión', 'Estado de todos los turnos, anulación y borrado.', '#/gestion'),
      ]),
      el('p', { class: 'hint' }, [
        'Documentación de la API: ',
        el('a', { href: '/docs', text: '/docs' }),
      ]),
    ]),
  );
}
