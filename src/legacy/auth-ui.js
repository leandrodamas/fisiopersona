(function () {
  'use strict';

  function createAuthHandlers(deps) {
    function authFields() {
      return {
        email: ((document.getElementById('auth-email') || {}).value || '').trim(),
        password: (document.getElementById('auth-pass') || {}).value || ''
      };
    }

    function authMessage(msg, ok) {
      var el = document.getElementById('auth-msg');
      if (!el) return;
      el.textContent = msg || '';
      el.style.color = ok ? '#00e5a0' : '#ff4d6d';
    }

    function authLogin() {
      var f = authFields();
      if (!f.email || !f.password) {
        authMessage('Informe e-mail e senha.', false);
        return;
      }
      authMessage('Validando acesso...', true);
      deps.authReq('token?grant_type=password', f).then(function (s) {
        deps.setSession(s);
        document.getElementById('auth').classList.remove('on');
        deps.loadAll();
      }).catch(function (e) {
        authMessage(e.message, false);
      });
    }

    function authSignup() {
      var f = authFields();
      if (!f.email || !f.password) {
        authMessage('Informe e-mail e senha.', false);
        return;
      }
      authMessage('Criando acesso...', true);
      deps.authReq('signup', f).then(function (s) {
        if (s.access_token) {
          deps.setSession(s);
          document.getElementById('auth').classList.remove('on');
          deps.loadAll();
        } else {
          authMessage('Conta criada. Confirme o e-mail se o Supabase solicitar, depois entre.', true);
        }
      }).catch(function (e) {
        authMessage(e.message, false);
      });
    }

    function refreshSession() {
      var session = deps.getSession();
      if (!session || !session.refresh_token) return Promise.reject(new Error('Sessão expirada'));
      return deps.authReq('token?grant_type=refresh_token', { refresh_token: session.refresh_token }).then(function (s) {
        deps.setSession(s);
        return s;
      });
    }

    function authLogout() {
      deps.setSession(null);
      deps.clearData();
      document.getElementById('auth').classList.add('on');
      deps.setLoading(false);
    }

    return {
      authFields: authFields,
      authMessage: authMessage,
      authLogin: authLogin,
      authSignup: authSignup,
      refreshSession: refreshSession,
      authLogout: authLogout
    };
  }

  window.createFisioAuthHandlers = createAuthHandlers;
})();
