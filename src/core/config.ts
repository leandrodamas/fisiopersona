export interface RuntimeConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
  sentryDsn?: string;
  environment?: string;
}

declare global {
  interface Window {
    __FISIO_CONFIG__?: Partial<RuntimeConfig>;
  }
}

export function getRuntimeConfig(): RuntimeConfig {
  const raw = window.__FISIO_CONFIG__ ?? {};
  return {
    supabaseUrl: String(raw.supabaseUrl ?? ''),
    supabaseAnonKey: String(raw.supabaseAnonKey ?? ''),
    sentryDsn: raw.sentryDsn ? String(raw.sentryDsn) : '',
    environment: raw.environment ? String(raw.environment) : 'production'
  };
}

export function hasRuntimeConfig(cfg: RuntimeConfig): boolean {
  return Boolean(cfg.supabaseUrl && cfg.supabaseAnonKey);
}
