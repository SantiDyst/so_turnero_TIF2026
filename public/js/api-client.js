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

async function request(method, path, body) {
  const response = await fetch(path, {
    method,
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const payload = parseBody(await response.text());

  if (!response.ok) {
    throw new ApiError(describe(payload, response.status), response.status, payload);
  }

  return payload;
}

export const api = {
  register: (data) => request('POST', '/applicants', data),
  queue: () => request('GET', '/queue'),
  overview: () => request('GET', '/journeys/overview'),
  journey: (attentionNumber) =>
    request('GET', `/journeys?attentionNumber=${encodeURIComponent(attentionNumber)}`),
  professionals: () => request('GET', '/professionals'),
  readiness: (journeyId) => request('GET', `/journeys/${journeyId}/closure-readiness`),
  startAttention: (journeyId, specialty, professionalId) =>
    request('POST', `/journeys/${journeyId}/attentions`, { specialty, professionalId }),
  finalizeAttention: (attentionId, state) =>
    request('PATCH', `/attentions/${attentionId}/finalize`, { state }),
  saveResult: (evaluationId, resultado) =>
    request('PATCH', `/evaluations/${evaluationId}/result`, { resultado }),
  completeEvaluation: (evaluationId) => request('PATCH', `/evaluations/${evaluationId}/complete`),
  saveReport: (attentionId, data) => request('PUT', `/attentions/${attentionId}/report`, data),
  close: (journeyId) => request('POST', `/journeys/${journeyId}/close`),
  issueCertificate: (journeyId) => request('POST', `/journeys/${journeyId}/certificate`, {}),
};
