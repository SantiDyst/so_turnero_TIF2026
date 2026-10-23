export function readRoute() {
  const hash = window.location.hash.replace(/^#/, '') || '/';
  const journeyMatch = hash.match(/^\/j\/(AT-\d+)$/);

  if (journeyMatch) {
    return { name: 'journey', attentionNumber: journeyMatch[1] };
  }

  return { name: 'intake' };
}

export function navigate(path) {
  window.location.hash = path;
}
