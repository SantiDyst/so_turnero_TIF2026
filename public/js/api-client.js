export const SESSION_EXPIRED = 'so:session-expired';

export class ApiError extends Error {
  constructor(message, status, body) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

function parseBody(text) {
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function describe(body, status) {
  if (body && typeof body === 'object') {
    const raw = body.message;
    const parts = Array.isArray(raw) ? raw : typeof raw === 'string' ? [raw] : [];

    if (Array.isArray(body.missingFields) && body.missingFields.length > 0) {
      parts.push(`Campos faltantes: ${body.missingFields.join(', ')}`);
    }

    if (parts.length > 0) {
      return parts.join(' ');
    }
  }

  if (typeof body === 'string' && body.length > 0) {
    return body;
  }

  return `Error HTTP ${status}`;
}

async function request(method, path, body, options = {}) {
  const response = await fetch(path, {
    method,
    credentials: 'same-origin',
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const payload = parseBody(await response.text());

  if (!response.ok) {
    if (response.status === 401 && !options.silent401) {
      window.dispatchEvent(new CustomEvent(SESSION_EXPIRED));
    }

    throw new ApiError(describe(payload, response.status), response.status, payload);
  }

  return payload;
}

export const api = {
  login: (email, password) =>
    request('POST', '/auth/login', { email, password }, { silent401: true }),
  logout: () => request('POST', '/auth/logout'),
  me: () => request('GET', '/auth/me', undefined, { silent401: true }),

  register: (data) => request('POST', '/register', data, { silent401: true }),
  myJourney: () => request('GET', '/me/journeys'),
  publicCertificate: (token) =>
    request('GET', `/certificates/public/${encodeURIComponent(token)}`, undefined, {
      silent401: true,
    }),

  registerApplicant: (data) => request('POST', '/applicants', data),
  queue: () => request('GET', '/queue'),
  overview: () => request('GET', '/journeys/overview'),
  journey: (attentionNumber) =>
    request('GET', `/journeys?attentionNumber=${encodeURIComponent(attentionNumber)}`),
  professionals: () => request('GET', '/professionals'),
  readiness: (journeyId) => request('GET', `/journeys/${journeyId}/closure-readiness`),
  startAttention: (journeyId, specialty) =>
    request('POST', `/journeys/${journeyId}/attentions`, { specialty }),
  finalizeAttention: (attentionId, state) =>
    request('PATCH', `/attentions/${attentionId}/finalize`, { state }),
  completeAttention: (attentionId, data) =>
    request('PATCH', `/attentions/${attentionId}/complete`, data),
  saveResult: (evaluationId, resultado) =>
    request('PATCH', `/evaluations/${evaluationId}/result`, { resultado }),
  completeEvaluation: (evaluationId) => request('PATCH', `/evaluations/${evaluationId}/complete`),
  saveReport: (attentionId, data) => request('PUT', `/attentions/${attentionId}/report`, data),
  close: (journeyId) => request('POST', `/journeys/${journeyId}/close`),
  issueCertificate: (journeyId) => request('POST', `/journeys/${journeyId}/certificate`),
  annulJourney: (journeyId, motivo) => request('POST', `/journeys/${journeyId}/annul`, { motivo }),
  deleteJourney: (journeyId) => request('DELETE', `/journeys/${journeyId}`),

  users: () => request('GET', '/users'),
  createUser: (data) => request('POST', '/users', data),
  deactivateUser: (userId) => request('PATCH', `/users/${userId}/deactivate`),
  activateUser: (userId) => request('PATCH', `/users/${userId}/activate`),
  resetUserPassword: (userId, password) =>
    request('PATCH', `/users/${userId}/password`, { password }),
};
