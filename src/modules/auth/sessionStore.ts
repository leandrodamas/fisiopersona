import type { AuthSession } from '../../core/types';

const SESSION_KEY = 'fisio_session';

export function readSession(): AuthSession | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(SESSION_KEY) ?? 'null') as AuthSession | null;
    if (!parsed || !parsed.access_token || !parsed.refresh_token) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeSession(session: AuthSession | null): void {
  if (session) {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    return;
  }
  localStorage.removeItem(SESSION_KEY);
}

export function isSessionExpired(session: AuthSession | null): boolean {
  if (!session?.expires_at) return true;
  return Date.now() / 1000 > session.expires_at - 60;
}
