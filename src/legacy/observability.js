(function () {
  'use strict';

  function safeStringify(value) {
    try {
      return JSON.stringify(value);
    } catch (e) {
      return '[unserializable]';
    }
  }

  function init() {
    var cfg = window.__FISIO_CONFIG__ || {};
    var hasSentry = typeof window.Sentry !== 'undefined';
    var sentryDsn = cfg.sentryDsn || '';
    var environment = cfg.environment || 'production';

    if (hasSentry && sentryDsn) {
      window.Sentry.init({
        dsn: sentryDsn,
        environment: environment,
        tracesSampleRate: 0.05
      });
    }

    window.addEventListener('error', function (event) {
      if (window.Sentry && sentryDsn) {
        window.Sentry.captureException(event.error || new Error(event.message || 'Unknown runtime error'));
      } else {
        console.error('[runtime-error]', event.message, event.error);
      }
    });

    window.addEventListener('unhandledrejection', function (event) {
      if (window.Sentry && sentryDsn) {
        window.Sentry.captureException(event.reason instanceof Error ? event.reason : new Error(String(event.reason)));
      } else {
        console.error('[unhandled-rejection]', safeStringify(event.reason));
      }
    });
  }

  window.FisioObservability = { init: init };
})();
