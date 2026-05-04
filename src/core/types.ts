export type SessionStatus = 'P' | 'F' | 'FJ' | 'AV' | 'D' | 'TM';

export interface Professor {
  id: string;
  nome: string;
  cns?: string;
  /** Universidade ou empresa parceira (convênio de estágio). */
  instituicao_parceira?: string;
  /** Curso ou área em que atua como preceptor (ex.: Fisioterapia). */
  curso_preceptoria?: string;
  cor: string;
  dias: string[];
  estagiarios: string[];
}

export interface Patient {
  id: string;
  prof: string;
  nome: string;
  cid?: string;
  /** Código de procedimento compatível com o CID (faturação / relatório). */
  cod_procedimento?: string;
  diag?: string;
  orig?: string;
  tel?: string;
  adm?: string;
  alta?: string;
  presc: number;
  real: number;
  est: string;
  hor: string;
  ativo: boolean;
  obs?: string;
}

export interface Sessao {
  id: string;
  pid: string;
  prof: string;
  data: string;
  status: SessionStatus;
  est: string;
  obs?: string;
}

export interface AuthSession {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  [key: string]: unknown;
}

export interface AppState {
  profs: Professor[];
  patients: Patient[];
  sessoes: Sessao[];
  tab: 'dash' | 'grade' | 'pacs' | 'vencs' | 'rel' | 'cfg';
  session: AuthSession | null;
}
