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

  window.FisioCore = {
    get config() { return getConfig(); },
    hasSupabaseConfig: hasSupabaseConfig,
    getSession: getSession,
    setSession: setSession,
    sessionExpired: sessionExpired,
    authToken: authToken,
    sbReq: sbReq,
    authReq: authReq
  };
})();
