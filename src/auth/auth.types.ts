import { Especialidad, RolUsuario } from '@prisma/client';
import type { Request } from 'express';

export interface AuthenticatedUser {
  id: string;
  nombre: string;
  email: string;
  rol: RolUsuario;
  profesionalId: string | null;
  specialty: Especialidad | null;
  postulanteId: string | null;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
}
