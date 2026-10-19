import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

const CONFLICT_CODES = new Set(['P2002', '23P01']);

export function prismaErrorCode(error: unknown): string | undefined {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    const metaCode = error.meta?.['code'];
    return typeof metaCode === 'string' ? metaCode : error.code;
  }

  if (error instanceof Prisma.PrismaClientUnknownRequestError) {
    const match = /(?:code[:`\s"]*)(P2002|23P01)/i.exec(error.message);
    return match?.[1]?.toUpperCase();
  }

  return undefined;
}

export function isPrismaConflict(error: unknown): boolean {
  const code = prismaErrorCode(error);
  return code !== undefined && CONFLICT_CODES.has(code);
}

export function rethrowPrismaConflict(error: unknown, message: string): never {
  if (isPrismaConflict(error)) {
    throw new ConflictException(message);
  }

  throw error;
}
