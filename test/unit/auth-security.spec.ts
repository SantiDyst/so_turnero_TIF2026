import type { Request } from 'express';

import { hashPassword, verifyPassword } from '../../src/auth/password';
import {
  createSessionToken,
  hashSessionToken,
  readCookie,
  readSessionToken,
  sessionTtlMs,
} from '../../src/auth/session';

const DAY_MS = 24 * 60 * 60 * 1000;

describe('password hashing', () => {
  it('accepts the original password and rejects a different one', async () => {
    const stored = await hashPassword('correct horse battery');

    await expect(verifyPassword('correct horse battery', stored)).resolves.toBe(true);
    await expect(verifyPassword('correct horse batterY', stored)).resolves.toBe(false);
  });

  it('never stores the password in clear text and salts every hash', async () => {
    const first = await hashPassword('same-password');
    const second = await hashPassword('same-password');

    expect(first).not.toContain('same-password');
    expect(first).not.toEqual(second);
    expect(first.split('$')).toHaveLength(3);
  });

  it('rejects malformed or truncated stored values', async () => {
    await expect(verifyPassword('anything', 'plain-text')).resolves.toBe(false);
    await expect(verifyPassword('anything', 'scrypt$onlysalt')).resolves.toBe(false);
    await expect(verifyPassword('anything', 'bcrypt$c2FsdA$aGFzaA')).resolves.toBe(false);

    const valid = await hashPassword('anything');
    const [scheme, salt] = valid.split('$');

    await expect(verifyPassword('anything', `${scheme}$${salt}$AAAA`)).resolves.toBe(false);
  });
});

describe('session tokens', () => {
  it('creates a long random token and hashes it deterministically', () => {
    const first = createSessionToken();
    const second = createSessionToken();

    expect(first).not.toEqual(second);
    expect(first.length).toBeGreaterThanOrEqual(43);
    expect(hashSessionToken(first)).toMatch(/^[a-f0-9]{64}$/);
    expect(hashSessionToken(first)).toEqual(hashSessionToken(first));
    expect(hashSessionToken(first)).not.toEqual(hashSessionToken(second));
  });
});

describe('cookie parsing', () => {
  it('reads the requested cookie among others', () => {
    expect(readCookie('a=1; so_session=token-value; b=2', 'so_session')).toBe('token-value');
    expect(readCookie('so_session=first; so_session=second', 'so_session')).toBe('first');
  });

  it('returns undefined for missing or malformed headers', () => {
    expect(readCookie(undefined, 'so_session')).toBeUndefined();
    expect(readCookie('other=1', 'so_session')).toBeUndefined();
    expect(readCookie('so_session', 'so_session')).toBeUndefined();
  });

  it('prefers the cookie and falls back to a bearer token', () => {
    const withCookie = {
      headers: { cookie: 'so_session=from-cookie', authorization: 'Bearer from-header' },
    } as unknown as Request;
    const withBearer = {
      headers: { authorization: 'Bearer from-header' },
    } as unknown as Request;

    expect(readSessionToken(withCookie)).toBe('from-cookie');
    expect(readSessionToken(withBearer)).toBe('from-header');
  });

  it('ignores non-bearer authorization headers', () => {
    const basic = { headers: { authorization: 'Basic abc' } } as unknown as Request;
    const empty = { headers: {} } as unknown as Request;

    expect(readSessionToken(basic)).toBeUndefined();
    expect(readSessionToken(empty)).toBeUndefined();
  });
});

describe('session ttl', () => {
  const original = process.env['SESSION_TTL_HOURS'];

  afterEach(() => {
    if (original === undefined) {
      delete process.env['SESSION_TTL_HOURS'];
    } else {
      process.env['SESSION_TTL_HOURS'] = original;
    }
  });

  it('defaults to twelve hours', () => {
    delete process.env['SESSION_TTL_HOURS'];

    expect(sessionTtlMs()).toBe(12 * 60 * 60 * 1000);
  });

  it('honours the configured value', () => {
    process.env['SESSION_TTL_HOURS'] = '3';

    expect(sessionTtlMs()).toBe(3 * 60 * 60 * 1000);
  });

  it('ignores invalid values and caps absurd ones', () => {
    process.env['SESSION_TTL_HOURS'] = 'not-a-number';
    expect(sessionTtlMs()).toBe(12 * 60 * 60 * 1000);

    process.env['SESSION_TTL_HOURS'] = '-5';
    expect(sessionTtlMs()).toBe(12 * 60 * 60 * 1000);

    process.env['SESSION_TTL_HOURS'] = '100000';
    expect(sessionTtlMs()).toBe(30 * DAY_MS);
  });
});
