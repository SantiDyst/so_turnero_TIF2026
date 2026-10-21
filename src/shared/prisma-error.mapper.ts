import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

const CONFLICT_CODES = new Set(['P2002', '23P01']);

function readCode(value: unknown): string | undefined {
  return typeof value === 'string' ? value.toUpperCase() : undefined;
}

function matchConflictCode(message: unknown): string | undefined {
  if (typeof message !== 'string') {
    return undefined;
  }
  const match = /(P2002|23P01)/i.exec(message);
  return match ? match[1].toUpperCase() : undefined;
}

function driverConflictCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') {
    return undefined;
  }

  const record = error as {
    kind?: unknown;
    code?: unknown;
    cause?: unknown;
  };

  if (record.kind === 'UniqueConstraintViolation') {
    return 'P2002';
  }

  const code = readCode(record.code);
  if (code && CONFLICT_CODES.has(code)) {
    return code;
  }

  return record.cause ? driverConflictCode(record.cause) : undefined;
}

export function prismaErrorCode(error: unknown): string | undefined {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    const meta = error.meta as Record<string, unknown> | undefined;

    const metaCode = readCode(meta?.['code']);
    if (metaCode) {
      return metaCode;
    }

    const ownCode = readCode(error.code);
    if (ownCode && CONFLICT_CODES.has(ownCode)) {
      return ownCode;
    }

    return (
      matchConflictCode(error.message) ??
      driverConflictCode(meta?.['driverAdapterError']) ??
      ownCode
    );
  }

  if (error && typeof error === 'object') {
    const candidate = error as {
      code?: unknown;
      cause?: unknown;
      message?: unknown;
    };

    const causeCode = driverConflictCode(candidate.cause);
    if (causeCode) {
      return causeCode;
    }

    const directCode = readCode(candidate.code);
    if (directCode && CONFLICT_CODES.has(directCode)) {
      return directCode;
    }

    return matchConflictCode(candidate.message) ?? directCode;
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
