import { api } from '../api-client.js';
import { button, el } from '../dom.js';
import { formatDate } from '../format.js';
import * as map from '../state-map.js';

function flag(label, value) {
  return el('li', { class: value ? 'on' : 'off', text: `${value ? 'OK' : 'FALTA'} · ${label}` });
}

function detail(label, value) {
  return el('div', {}, [el('dt', { text: label }), el('dd', { text: value })]);
}

function openCertificateModal(certificate) {
  document.querySelector('.modal')?.remove();

  const sheet = el('article', { id: 'certificate-sheet', class: 'certificate' }, [
    el('h3', { text: 'Certificado de Aptitud' }),
    el('p', { class: 'subtitle', text: 'Documento ficticio generado para la demostración del sistema.' }),
    el('dl', {}, [
      detail('Identificador', certificate.identifier),
      detail('N° de atención', certificate.attentionNumber),
      detail(
        'Postulante',
        `${certificate.applicant.nombre} ${certificate.applicant.apellido}`,
      ),
      detail('Aptitud final', map.resultLabel(certificate.finalAptitude)),
      detail('Fecha de emisión', formatDate(certificate.issuedAt)),
      detail('Profesional responsable', certificate.responsibleProfessional?.nombre ?? 'Sin responsable'),
    ]),
    el('p', { class: 'stamp', text: 'SO Turnero · Consola de verificación' }),
  ]);

  const modal = el('div', { class: 'modal' }, [
    el('div', { class: 'modal-body' }, [
      sheet,
      el('div', { class: 'row no-print' }, [
        button('Descargar PDF', () => window.print(), { class: 'primary' }),
        button('Cerrar', () => modal.remove()),
      ]),
    ]),
  ]);

  modal.addEventListener('click', (event) => {
    if (event.target === modal) {
      modal.remove();
    }
  });

  document.body.append(modal);
}

function certificateBlock(journey, closed, onAction) {
  const certificate = journey.certificate;

  if (certificate) {
    return el('div', {}, [
      el('h3', { text: 'Certificado' }),
      el('dl', {}, [
        detail('Identificador', certificate.identifier),
        detail('Aptitud final', map.resultLabel(certificate.finalAptitude)),
        detail('Emitido', formatDate(certificate.issuedAt)),
        detail('Responsable', certificate.responsibleProfessional?.nombre ?? 'Sin responsable'),
      ]),
      el('div', { class: 'row' }, [
        button('Ver certificado', () => openCertificateModal(certificate), { class: 'primary' }),
      ]),
    ]);
  }

  return el('div', {}, [
    el('h3', { text: 'Certificado' }),
    el('div', { class: 'row' }, [
      button(
        'Emitir certificado',
        () =>
          onAction(
            'Emitiendo certificado…',
            async () => {
              const issued = await api.issueCertificate(journey.journey.id);
              openCertificateModal(issued);
            },
            'Certificado emitido.',
          ),
        { class: 'primary', disabled: !closed },
      ),
    ]),
    closed ? null : el('p', { class: 'hint', text: 'Requiere el recorrido cerrado.' }),
  ]);
}

export function renderClosurePanel({ journey, readiness, notice, onAction }) {
  const closed = map.isClosed(journey);
  const aptitude = journey.aptitude;

  const nodes = [el('h2', { text: 'Cierre del recorrido' })];

  if (notice) {
    nodes.push(el('p', { class: `notice ${notice.kind ?? ''}`.trim(), text: notice.text }));
  }

  nodes.push(
    el('ul', { class: 'flags' }, [
      flag('Las tres evaluaciones están completas', readiness.allEvaluationsComplete),
      flag('Resultado clínico presente', readiness.clinicalResultPresent),
      flag('Resultado psicológico presente', readiness.psychologicalResultPresent),
      flag('Aptitud almacenada', readiness.aptitudeStored),
    ]),
    el('div', { class: 'row' }, [
      button(
        'Cerrar recorrido',
        () =>
          onAction(
            'Cerrando recorrido…',
            () => api.close(journey.journey.id),
            'Recorrido cerrado.',
          ),
        { class: 'primary', disabled: !readiness.canClose || closed },
      ),
      closed ? el('span', { class: 'badge complete', text: 'Cierre final' }) : null,
    ]),
  );

  if (aptitude) {
    nodes.push(
      el('dl', { style: 'margin-top:12px' }, [
        detail('Resultado clínico', map.resultLabel(aptitude.clinicalResult)),
        detail('Resultado psicológico', map.resultLabel(aptitude.psychologicalResult)),
        detail('Aptitud final', map.resultLabel(aptitude.finalAptitude)),
      ]),
    );
  }

  nodes.push(certificateBlock(journey, closed, onAction));

  return el('section', { class: 'panel' }, nodes);
}
