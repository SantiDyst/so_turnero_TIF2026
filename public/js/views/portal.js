import { api } from '../api-client.js';
import { button, el } from '../dom.js';
import { formatDate } from '../format.js';
import { certificateSharePath } from '../routes-map.js';
import * as map from '../state-map.js';
import { openCertificateModal } from './closure.js';

function progressBar(complete, total) {
  const percent = total === 0 ? 0 : Math.round((complete / total) * 100);

  return el('div', { class: 'progress', role: 'progressbar', 'aria-valuenow': percent }, [
    el('span', { style: `width:${percent}%` }),
  ]);
}

function specialtyCard(journey, specialty) {
  const evaluation = map.evaluationOf(journey, specialty);
  const latest = map.latestAttentionOf(journey, specialty);
  const report = map.reportOf(journey, specialty);
  const complete = evaluation?.state === map.EVALUATION_COMPLETE;

  return el('article', { class: `portal-card ${map.SPECIALTY_CLASS[specialty]}` }, [
    el('div', { class: 'card-head' }, [
      el('h3', { text: map.specialtyLabel(specialty) }),
      el('span', {
        class: complete ? 'badge ok' : 'badge',
        text: complete ? 'Lista' : 'Pendiente',
      }),
    ]),
    el('dl', {}, [
      el('div', {}, [
        el('dt', { text: 'Resultado' }),
        el('dd', { text: map.resultLabel(evaluation?.result) }),
      ]),
      el('div', {}, [
        el('dt', { text: 'Última atención' }),
        el('dd', { text: latest ? formatDate(latest.startedAt) : 'Todavía no' }),
      ]),
      el('div', {}, [
        el('dt', { text: 'Informe' }),
        el('dd', { text: report ? report.reportState : 'Pendiente' }),
      ]),
    ]),
  ]);
}

function shareRow(certificate) {
  const url = `${window.location.origin}${window.location.pathname}${certificateSharePath(certificate.shareToken)}`;
  const field = el('input', { readonly: true, value: url, 'aria-label': 'Link del certificado' });

  return el('div', { class: 'share' }, [
    field,
    button(
      'Copiar link',
      async () => {
        try {
          await navigator.clipboard.writeText(url);
        } catch {
          field.select();
        }
      },
      { class: 'chip' },
    ),
  ]);
}

function certificateSection(certificate) {
  if (!certificate) {
    return el('section', { class: 'panel' }, [
      el('h2', { text: 'Certificado' }),
      el('p', {
        class: 'hint',
        text: 'Cuando el recorrido cierre y el médico emita el certificado, lo vas a poder ver y compartir desde acá.',
      }),
    ]);
  }

  return el('section', { class: 'panel' }, [
    el('h2', { text: 'Tu certificado' }),
    el('div', { class: 'row' }, [
      el('span', {
        class: map.APTITUDE_CLASS[certificate.finalAptitude] ?? 'badge',
        text: map.resultLabel(certificate.finalAptitude),
      }),
      el('span', { class: 'hint', text: `Emitido el ${formatDate(certificate.issuedAt)}` }),
    ]),
    el('div', { class: 'row', style: 'margin-top:12px' }, [
      button('Ver certificado', () => openCertificateModal(certificate), { class: 'primary' }),
    ]),
    el('p', { class: 'hint', text: 'Compartí este link con quien necesite verificarlo:' }),
    shareRow(certificate),
  ]);
}

function emptyState(container) {
  container.append(
    el('section', { class: 'panel' }, [
      el('h1', { text: 'Todavía no tenés un turno' }),
      el('p', { class: 'hint', text: 'Pedí tu turno para empezar el recorrido.' }),
      el('a', { class: 'back', href: '#/registro', text: 'Pedir turno →' }),
    ]),
  );
}

export async function renderPortal(container, ctx) {
  let journey;

  try {
    journey = await api.myJourney();
  } catch (error) {
    if (error.status === 404) {
      emptyState(container);
      return;
    }
    throw error;
  }

  const complete = journey.evaluations.filter(
    (evaluation) => evaluation.state === map.EVALUATION_COMPLETE,
  ).length;
  const workplace = [journey.journey.puesto, journey.journey.empresa].filter(Boolean).join(' · ');

  container.append(
    el('section', { class: 'panel portal-hero' }, [
      el('h1', { text: `Hola, ${journey.applicant.nombre}` }),
      el('p', { class: 'hint', text: `Tu turno es ${journey.journey.attentionNumber}.` }),
      workplace ? el('p', { class: 'hint', text: workplace }) : null,
      el('div', { class: 'row' }, [
        el('span', {
          class: map.JOURNEY_STATE_CLASS[journey.journey.state] ?? 'badge',
          text: journey.journey.state,
        }),
        journey.journey.derivedState
          ? el('span', { class: 'badge active', text: journey.journey.derivedState })
          : null,
        journey.aptitude
          ? el('span', {
              class: map.APTITUDE_CLASS[journey.aptitude.finalAptitude] ?? 'badge',
              text: map.resultLabel(journey.aptitude.finalAptitude),
            })
          : null,
      ]),
      el('p', {
        class: 'hint',
        text: `${complete} de ${journey.evaluations.length} especialidades listas`,
      }),
      progressBar(complete, journey.evaluations.length),
      map.isAnnulled(journey)
        ? el('p', {
            class: 'notice error',
            text: `Tu turno fue anulado${journey.journey.annulledReason ? `: ${journey.journey.annulledReason}` : '.'}`,
          })
        : null,
    ]),
    el(
      'div',
      { class: 'portal-grid' },
      map.SPECIALTIES.map((specialty) => specialtyCard(journey, specialty)),
    ),
    certificateSection(journey.certificate),
  );
}
