import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isSessionExpired, readSession, writeSession } from './sessionStore';

describe('sessionStore', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useRealTimers();
  });

  it('reads null when session is missing', () => {
    expect(readSession()).toBeNull();
  });

  it('writes and reads valid session', () => {
    const session = {
      access_token: 'token',
      refresh_token: 'refresh',
      expires_at: Math.floor(Date.now() / 1000) + 3600
    };
    writeSession(session);
    expect(readSession()).toEqual(session);
  });

  it('returns null for malformed persisted session', () => {
    localStorage.setItem('fisio_session', JSON.stringify({ foo: 'bar' }));
    expect(readSession()).toBeNull();
  });

  it('detects expiration with safety margin', () => {
    vi.setSystemTime(new Date('2026-01-01T10:00:00Z'));
    const nowSec = Math.floor(Date.now() / 1000);
    expect(isSessionExpired({ access_token: 'a', refresh_token: 'b', expires_at: nowSec + 30 })).toBe(true);
    expect(isSessionExpired({ access_token: 'a', refresh_token: 'b', expires_at: nowSec + 600 })).toBe(false);
  });
});
