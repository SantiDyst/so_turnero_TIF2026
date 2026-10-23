export function readRoute() {
  const hash = window.location.hash.replace(/^#/, '') || '/';
  const journeyMatch = hash.match(/^\/j\/(AT-\d+)$/);

  if (journeyMatch) {
    return { name: 'journey', attentionNumber: journeyMatch[1] };
  }
  if (hash === '/turnos') {
    return { name: 'intake' };
  }
  if (hash === '/evaluar') {
    return { name: 'evaluate' };
  }
  if (hash === '/gestion') {
    return { name: 'management' };
  }

  return { name: 'home' };
}

export function navigate(path) {
  window.location.hash = path;
}
