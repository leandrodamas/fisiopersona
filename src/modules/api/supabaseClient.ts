import { getRuntimeConfig, hasRuntimeConfig } from '../../core/config';
import type { AuthSession } from '../../core/types';

export class SupabaseClient {
  private readonly config = getRuntimeConfig();

  ensureConfig(): void {
    if (!hasRuntimeConfig(this.config)) {
      throw new Error('Configuração ausente: preencha config.js com supabaseUrl e supabaseAnonKey.');
    }
  }

  async authRequest(path: string, body: unknown): Promise<Record<string, unknown>> {
    this.ensureConfig();
    const response = await fetch(`${this.config.supabaseUrl}/auth/v1/${path}`, {
      method: 'POST',
      headers: {
        apikey: this.config.supabaseAnonKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    const text = await response.text();
    const data = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    if (!response.ok) {
      throw new Error(String(data.msg ?? data.error_description ?? data.error ?? text ?? 'Erro de autenticação'));
    }
    return data;
  }

  async tableRequest(
    method: string,
    path: string,
    session: AuthSession,
    body?: unknown,
    extraHeaders?: Record<string, string>
  ): Promise<unknown> {
    this.ensureConfig();
    const response = await fetch(`${this.config.supabaseUrl}/rest/v1/${path}`, {
      method,
      headers: {
        apikey: this.config.supabaseAnonKey,
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
        ...extraHeaders
      },
      body: body ? JSON.stringify(body) : undefined
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(errText);
    }

    const text = await response.text();
    return text ? JSON.parse(text) : [];
  }
}
