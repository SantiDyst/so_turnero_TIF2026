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
    ]);
  }

  return el('div', {}, [
    el('h3', { text: 'Certificado' }),
    el('div', { class: 'row' }, [
      button('Emitir certificado', () => onAction(() => api.issueCertificate(journey.journey.id)), {
        class: 'primary',
        disabled: !closed,
      }),
    ]),
    closed ? null : el('p', { class: 'hint', text: 'Requiere el recorrido cerrado.' }),
  ]);
}

export function renderClosurePanel({ journey, readiness, onAction }) {
  const closed = map.isClosed(journey);
  const aptitude = journey.aptitude;

  const nodes = [
    el('h2', { text: 'Cierre del recorrido' }),
    el('ul', { class: 'flags' }, [
      flag('Las tres evaluaciones están completas', readiness.allEvaluationsComplete),
      flag('Resultado clínico presente', readiness.clinicalResultPresent),
      flag('Resultado psicológico presente', readiness.psychologicalResultPresent),
      flag('Aptitud almacenada', readiness.aptitudeStored),
    ]),
    el('div', { class: 'row' }, [
      button('Cerrar recorrido', () => onAction(() => api.close(journey.journey.id)), {
        class: 'primary',
        disabled: !readiness.canClose || closed,
      }),
      closed ? el('span', { class: 'badge complete', text: 'Cierre final' }) : null,
    ]),
  ];

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
