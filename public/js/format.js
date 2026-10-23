export function formatDate(value) {
  if (!value) {
    return 'Sin fecha';
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? 'Sin fecha' : date.toLocaleString('es-AR');
}
