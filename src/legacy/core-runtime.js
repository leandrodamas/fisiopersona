(function () {
  'use strict';

  var SESSION_KEY = 'fisio_session';
  var cfg = window.__FISIO_CONFIG__ || {};

  function getConfig() {
    return {
      supabaseUrl: cfg.supabaseUrl || '',
      supabaseAnonKey: cfg.supabaseAnonKey || ''
    };
  }

  function hasSupabaseConfig() {
    var c = getConfig();
    return !!(c.supabaseUrl && c.supabaseAnonKey);
  }

  function getSession() {
    try {
      var parsed = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
      if (!parsed || typeof parsed !== 'object') return null;
      if (!parsed.access_token || !parsed.refresh_token) return null;
      return parsed;
    } catch (e) {
      return null;
    }
  }

  function setSession(session) {
    if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    else localStorage.removeItem(SESSION_KEY);
  }

  function sessionExpired(session) {
    return !!(session && session.expires_at && Date.now() / 1000 > session.expires_at - 60);
  }

  function authToken(session) {
    return session && session.access_token ? session.access_token : null;
  }

  function responseLooksLikeJwtExpired(status, text) {
    try {
      var o = JSON.parse(text || '{}');
      var code = String(o.code || '').toUpperCase();
      var msg = String(o.message || '').toLowerCase();
      if (code === 'PGRST301') return true;
      if (msg.indexOf('jwt expired') >= 0) return true;
    } catch (e) {}
    return status === 401;
  }

  /** Renova access_token; persiste e tenta alinhar window.ST.session (index.html). */
  function refreshAccessTokenFromRefreshToken() {
    var session = getSession();
    if (!session || !session.refresh_token) {
      return Promise.reject(new Error('Sessão expirada. Entre novamente.'));
    }
    return authReq('token?grant_type=refresh_token', { refresh_token: session.refresh_token }).then(function (s) {
      setSession(s);
      try {
        if (typeof window !== 'undefined' && window.ST) window.ST.session = s;
      } catch (e2) {}
      return s;
    });
  }

  function sbReq(method, path, session, body, extraHeaders, retryDepth) {
    retryDepth = retryDepth || 0;
    if (!hasSupabaseConfig()) {
      return Promise.reject(new Error('Configuração ausente: preencha config.js com supabaseUrl e supabaseAnonKey.'));
    }

    var live = session || getSession();
    var token = authToken(live);
    if (!token) return Promise.reject(new Error('Sessão inválida. Entre novamente.'));

    var c = getConfig();
    var opts = {
      method: method,
      headers: {
        apikey: c.supabaseAnonKey,
        Authorization: 'Bearer ' + token,
        'Content-Type': 'application/json',
        Prefer: 'return=representation'
      }
    };

    if (extraHeaders) Object.keys(extraHeaders).forEach(function (k) { opts.headers[k] = extraHeaders[k]; });
    if (body) opts.body = JSON.stringify(body);

    return fetch(c.supabaseUrl + '/rest/v1/' + path, opts).then(function (r) {
      return r.text().then(function (t) {
        if (!r.ok) {
          if (retryDepth < 1 && responseLooksLikeJwtExpired(r.status, t)) {
            return refreshAccessTokenFromRefreshToken().then(function () {
              return sbReq(method, path, getSession(), body, extraHeaders, retryDepth + 1);
            });
          }
          throw new Error(t || 'HTTP ' + r.status);
        }
        return t ? JSON.parse(t) : [];
      });
    });
  }

  function authReq(path, body) {
    if (!hasSupabaseConfig()) {
      return Promise.reject(new Error('Configuração ausente: preencha config.js com supabaseUrl e supabaseAnonKey.'));
    }

    var c = getConfig();
    return fetch(c.supabaseUrl + '/auth/v1/' + path, {
      method: 'POST',
      headers: { apikey: c.supabaseAnonKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }).then(function (r) {
      return r.text().then(function (t) {
        var data = t ? JSON.parse(t) : {};
        if (!r.ok) throw new Error(data.msg || data.error_description || data.error || t || 'Erro de autenticação');
        return data;
      });
    });
  }

  function configMissingHelpHtml() {
    var c = window.__FISIO_CONFIG__;
    var hasObj = c && typeof c === 'object';
    var url = hasObj ? String(c.supabaseUrl || '').trim() : '';
    var key = hasObj ? String(c.supabaseAnonKey || '').trim() : '';
    if (hasObj && !url && !key) {
      return '\u274c Supabase n\u00e3o configurado neste deploy<br><br>' +
        '<span style="color:#64748b;font-size:12px">As credenciais est\u00e3o vazias ou incompletas. No <b>Vercel</b> \u2192 <b>Settings \u2192 Environment Variables</b>, <b>edite</b> <b>FISIO_SUPABASE_URL</b> e <b>FISIO_SUPABASE_ANON_KEY</b>: cole o URL completo (<b>https://\u2026.supabase.co</b>) e a chave <b>anon public</b> completa do Supabase (JWT longo). Valores muito curtos n\u00e3o funcionam. Marque <b>Production</b> e <b>Preview</b>, guarde e fa\u00e7a <b>Redeploy</b>. Se continuar falhando, recrie as vari\u00e1veis sem <b>Sensitive</b> para testar.<br><br>' +
        'Se o link de <b>pr\u00e9-visualiza\u00e7\u00e3o</b> mostrar <b>403 Forbidden</b>: <b>Settings \u2192 Deployment Protection</b> \u2014 desative nas previews ou use o dom\u00ednio de <b>Production</b>.</span>';
    }
    return '\u274c Configura\u00e7\u00e3o n\u00e3o encontrada<br><br>' +
      '<span style="color:#64748b;font-size:12px">Crie/edite o arquivo <b>config.js</b> com as credenciais do Supabase.<br>Use <b>config.example.js</b> como modelo.</span>';
  }

  window.FisioCore = {
    get config() { return getConfig(); },
    hasSupabaseConfig: hasSupabaseConfig,
    configMissingHelpHtml: configMissingHelpHtml,
    getSession: getSession,
    setSession: setSession,
    sessionExpired: sessionExpired,
    authToken: authToken,
    sbReq: sbReq,
    authReq: authReq
  };
})();
