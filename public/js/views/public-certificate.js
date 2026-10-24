import { api } from '../api-client.js';
import { button, el } from '../dom.js';
import { buildCertificateSheet } from './closure.js';

export async function renderPublicCertificate(container, token) {
  try {
    const certificate = await api.publicCertificate(token);

    container.append(
      el('section', { class: 'panel public-cert' }, [
        buildCertificateSheet(certificate),
        el('div', { class: 'row no-print' }, [
          button('Descargar PDF', () => window.print(), { class: 'primary' }),
        ]),
        el('p', {
          class: 'hint',
          text: 'Verificá el identificador con la institución emisora.',
        }),
      ]),
    );
  } catch {
    container.append(
      el('section', { class: 'panel' }, [
        el('h1', { text: 'Certificado no encontrado' }),
        el('p', {
          class: 'hint',
          text: 'El link no es válido o el certificado no existe.',
        }),
      ]),
    );
  }
}
