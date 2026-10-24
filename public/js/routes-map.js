export const ROLE_HOME = {
  ADMIN: '#/gestion',
  PROFESIONAL: '#/evaluar',
  USER: '#/portal',
};

export function homePathFor(role) {
  return ROLE_HOME[role] ?? '#/login';
}

export function certificateSharePath(token) {
  return `#/c/${token}`;
}

export function roleLabel(role) {
  if (role === 'ADMIN') {
    return 'Administración';
  }
  if (role === 'PROFESIONAL') {
    return 'Profesional';
  }
  if (role === 'USER') {
    return 'Postulante';
  }

  return 'Sin rol';
}
