import { Especialidad, RolUsuario } from '@prisma/client';

import type { AuthenticatedUser } from '../../src/auth/auth.types';

export function professionalUser(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return {
    id: 'user-professional',
    nombre: 'Professional',
    email: 'professional@example.com',
    rol: RolUsuario.PROFESIONAL,
    profesionalId: 'professional-1',
    specialty: Especialidad.CLINICA_MEDICA,
    postulanteId: null,
    ...overrides,
  };
}

export function adminUser(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return {
    id: 'user-admin',
    nombre: 'Admin',
    email: 'admin@example.com',
    rol: RolUsuario.ADMIN,
    profesionalId: null,
    specialty: null,
    postulanteId: null,
    ...overrides,
  };
}

export function attentionAccessStub() {
  return {
    assertAttentionOwned: jest.fn().mockResolvedValue(undefined),
    assertEvaluationSpecialty: jest.fn().mockResolvedValue(undefined),
    assertPendingSpecialty: jest.fn().mockResolvedValue(undefined),
  };
}
