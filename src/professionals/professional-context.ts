import { ForbiddenException } from '@nestjs/common';
import { Especialidad } from '@prisma/client';

import type { AuthenticatedUser } from '../auth/auth.types';

export interface ProfessionalIdentity {
  id: string;
  specialty: Especialidad;
}

export function requireProfessional(user: AuthenticatedUser): ProfessionalIdentity {
  if (!user.profesionalId || !user.specialty) {
    throw new ForbiddenException('The user is not linked to a professional.');
  }

  return { id: user.profesionalId, specialty: user.specialty };
}

export function requireClinicalProfessional(user: AuthenticatedUser): ProfessionalIdentity {
  const professional = requireProfessional(user);

  if (professional.specialty !== Especialidad.CLINICA_MEDICA) {
    throw new ForbiddenException('Only a clinical medicine professional can perform this action.');
  }

  return professional;
}
