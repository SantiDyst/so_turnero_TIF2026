import { el } from '../dom.js';

function moduleCard(title, description, href, tone) {
  return el('a', { class: `module ${tone}`, href }, [
    el('strong', { text: title }),
    el('span', { class: 'hint', text: description }),
  ]);
}

export function renderHome(container) {
  container.append(
    el('section', { class: 'panel' }, [
      el('h1', { text: 'SO Turnero' }),
      el('p', {
        class: 'hint',
        text: 'Elegí un módulo. Todavía no hay roles: cualquier persona con el enlace puede usar los tres.',
      }),
      el('div', { class: 'modules' }, [
        moduleCard(
          'Pedir turno',
          'Alta del postulante y generación del número de atención.',
          '#/turnos',
          'bio',
        ),
        moduleCard(
          'Evaluar',
          'Atenciones, resultados, informes y cierre del recorrido.',
          '#/evaluar',
          'clinica',
        ),
        moduleCard(
          'Gestión',
          'Estado de todos los turnos, anulación y borrado.',
          '#/gestion',
          'psico',
        ),
      ]),
      el('p', { class: 'hint' }, [
        'Documentación de la API: ',
        el('a', { href: '/docs', text: '/docs' }),
      ]),
    ]),
  );
}
