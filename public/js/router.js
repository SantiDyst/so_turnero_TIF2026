export function readRoute() {
  const hash = window.location.hash.replace(/^#/, '') || '/';
  const journeyMatch = hash.match(/^\/j\/(AT-\d+)$/);
  const certificateMatch = hash.match(/^\/c\/([A-Za-z0-9_-]+)$/);

  if (journeyMatch) {
    return { name: 'journey', attentionNumber: journeyMatch[1] };
  }
  if (certificateMatch) {
    return { name: 'public-certificate', token: certificateMatch[1] };
  }
  if (hash === '/login') {
    return { name: 'login' };
  }
  if (hash === '/registro') {
    return { name: 'register' };
  }
  if (hash === '/portal') {
    return { name: 'portal' };
  }
  if (hash === '/usuarios') {
    return { name: 'users' };
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
