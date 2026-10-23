import { clear, el } from './dom.js';
import { readRoute } from './router.js';
import { renderIntake } from './views/intake.js';
import { renderJourney } from './views/journey.js';

const app = document.querySelector('#app');
const banner = document.querySelector('#banner');

const ctx = {
  showError(message, kind = 'error') {
    banner.textContent = message;
    banner.className = kind === 'info' ? 'banner info' : 'banner';
    banner.hidden = false;
  },
  clearBanner() {
    banner.textContent = '';
    banner.hidden = true;
  },
};

async function render() {
  ctx.clearBanner();
  clear(app);

  const route = readRoute();

  try {
    if (route.name === 'journey') {
      await renderJourney(app, route.attentionNumber, ctx);
    } else {
      await renderIntake(app, ctx);
    }
  } catch (error) {
    ctx.showError(error?.message ?? 'Error inesperado');
    app.append(
      el('p', { class: 'hint', text: 'No se pudo cargar la vista.' }),
      el('a', { href: '#/', text: 'Volver al inicio' }),
    );
  }
}

window.addEventListener('hashchange', render);
render();
