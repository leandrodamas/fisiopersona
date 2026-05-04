import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SupabaseClient } from './supabaseClient';

describe('SupabaseClient', () => {
  beforeEach(() => {
    window.__FISIO_CONFIG__ = {
      supabaseUrl: 'https://demo.supabase.co',
      supabaseAnonKey: 'anon'
    };
    vi.restoreAllMocks();
  });

  it('throws for missing runtime config', async () => {
    window.__FISIO_CONFIG__ = {};
    const client = new SupabaseClient();
    await expect(client.authRequest('signup', {})).rejects.toThrow('Configuração ausente');
  });

  it('parses auth response payload', async () => {
    vi.spyOn(window, 'fetch').mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ access_token: 'token' })
    } as Response);

    const client = new SupabaseClient();
    const data = await client.authRequest('token?grant_type=password', { email: 'a@a.com', password: '123' });
    expect(data.access_token).toBe('token');
  });

  it('returns parsed payload on table request', async () => {
    vi.spyOn(window, 'fetch').mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify([{ id: 'prof-1' }])
    } as Response);

    const client = new SupabaseClient();
    const rows = await client.tableRequest('GET', 'professores', {
      access_token: 'token',
      refresh_token: 'refresh',
      expires_at: 123
    });
    expect(Array.isArray(rows)).toBe(true);
  });
});
