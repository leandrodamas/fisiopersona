/**
 * Gera window.__FISIO_CONFIG__ em runtime — no Vercel as env do projeto
 * expõem-se ao servidor; o build estático por vezes não recebe estas variáveis.
 */
module.exports = function configHandler(req, res) {
  function pickEnv() {
    var names = Array.prototype.slice.call(arguments);
    for (var i = 0; i < names.length; i++) {
      var v = process.env[names[i]];
      if (v != null && String(v).trim() !== '') return String(v).trim();
    }
    return '';
  }
  var supabaseUrl = pickEnv(
    'FISIO_SUPABASE_URL',
    'SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_URL',
    'VITE_SUPABASE_URL'
  );
  var supabaseAnonKey = pickEnv(
    'FISIO_SUPABASE_ANON_KEY',
    'SUPABASE_ANON_KEY',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'VITE_SUPABASE_ANON_KEY'
  );
  var sentryDsn = pickEnv('FISIO_SENTRY_DSN', 'SENTRY_DSN', 'NEXT_PUBLIC_SENTRY_DSN');
  var environment = pickEnv('FISIO_ENVIRONMENT', 'VERCEL_ENV') || 'production';
  var body =
    'window.__FISIO_CONFIG__ = ' +
    JSON.stringify(
      {
        supabaseUrl: supabaseUrl,
        supabaseAnonKey: supabaseAnonKey,
        sentryDsn: sentryDsn,
        environment: environment
      },
      null,
      2
    ) +
    ';\n';
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  res.setHeader('Cache-Control', 'private, no-cache, no-store, must-revalidate');
  res.end(body);
};
