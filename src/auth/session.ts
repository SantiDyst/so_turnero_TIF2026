import { createHash, randomBytes } from 'node:crypto';

import type { CookieOptions, Request } from 'express';

export const SESSION_COOKIE = 'so_session';

const DEFAULT_TTL_HOURS = 12;
const MAX_TTL_HOURS = 24 * 30;
const MAX_USER_AGENT_LENGTH = 255;

export function createSessionToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function sessionTtlMs(): number {
  const raw = Number(process.env['SESSION_TTL_HOURS']);
  const hours = Number.isFinite(raw) && raw > 0 ? Math.min(raw, MAX_TTL_HOURS) : DEFAULT_TTL_HOURS;

  return hours * 60 * 60 * 1000;
}

export function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) {
    return undefined;
  }

  for (const part of header.split(';')) {
    const separator = part.indexOf('=');

    if (separator === -1 || part.slice(0, separator).trim() !== name) {
      continue;
    }

    const value = part.slice(separator + 1).trim();

    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }

  return undefined;
}

export function readSessionToken(request: Request): string | undefined {
  const fromCookie = readCookie(request.headers.cookie, SESSION_COOKIE);

  if (fromCookie) {
    return fromCookie;
  }

  const authorization = request.headers.authorization;

  if (!authorization) {
    return undefined;
  }

  const [scheme, token] = authorization.split(' ');

  if (scheme?.toLowerCase() !== 'bearer' || !token) {
    return undefined;
  }

  return token.trim() || undefined;
}

export function normalizeUserAgent(userAgent: string | undefined): string | null {
  if (!userAgent) {
    return null;
  }

  return userAgent.slice(0, MAX_USER_AGENT_LENGTH);
}

export function sessionCookieOptions(maxAge?: number): CookieOptions {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env['NODE_ENV'] === 'production' || process.env['VERCEL'] === '1',
    path: '/',
    ...(maxAge === undefined ? {} : { maxAge }),
  };
}
