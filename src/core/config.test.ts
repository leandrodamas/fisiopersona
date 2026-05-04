import { describe, expect, it } from 'vitest';
import { getRuntimeConfig, hasRuntimeConfig } from './config';

describe('runtime config', () => {
  it('reads config from window', () => {
    window.__FISIO_CONFIG__ = {
      supabaseUrl: 'https://demo.supabase.co',
      supabaseAnonKey: 'anon',
      sentryDsn: 'https://dsn.ingest.sentry.io/1',
      environment: 'staging'
    };

    const cfg = getRuntimeConfig();
    expect(cfg.supabaseUrl).toBe('https://demo.supabase.co');
    expect(cfg.supabaseAnonKey).toBe('anon');
    expect(cfg.sentryDsn).toContain('sentry.io');
    expect(cfg.environment).toBe('staging');
    expect(hasRuntimeConfig(cfg)).toBe(true);
  });

  it('handles empty config safely', () => {
    window.__FISIO_CONFIG__ = {};
    const cfg = getRuntimeConfig();
    expect(cfg.supabaseUrl).toBe('');
    expect(cfg.supabaseAnonKey).toBe('');
    expect(hasRuntimeConfig(cfg)).toBe(false);
  });
});
