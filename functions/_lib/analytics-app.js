// /analytics: login page, dashboard, JSON data and CSV export. Everything except the login form needs the signed cookie.
import { ensure } from './db.js';
import { COOKIE, addFail, checkCreds, clearFails, configured, ipKey, makeToken, readCookie, sessionCookie, tooMany, verifyToken } from './auth.js';
import { RANGES, exportCsv, summary } from './stats.js';
import { APP, LOGIN } from './pages.gen.js';

const nonce = () => { const a = new Uint8Array(16); crypto.getRandomValues(a); return btoa(String.fromCharCode(...a)).replace(/[^a-zA-Z0-9]/g, ''); };
const base = (n) => ({
  'Cache-Control': 'no-store, private', 'X-Robots-Tag': 'noindex, nofollow, noarchive', 'Referrer-Policy': 'same-origin',
  'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Cross-Origin-Opener-Policy': 'same-origin', 'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Content-Security-Policy': `default-src 'none'; script-src 'nonce-${n}'; style-src 'nonce-${n}'; style-src-attr 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'self'; frame-ancestors 'none'`,
});
const page = (html, status = 200, extra = {}) => { const n = nonce(); return new Response(html.replaceAll('__NONCE__', n), { status, headers: { ...base(n), 'Content-Type': 'text/html; charset=utf-8', ...extra } }); };
const loginPage = (msg = '', status = 200, extra = {}) => page(LOGIN.replace('<!--MSG-->', msg ? `<p class="err" role="alert">${msg}</p>` : ''), status, extra);
const json = (o, status = 200) => { const n = nonce(); return new Response(JSON.stringify(o), { status, headers: { ...base(n), 'Content-Type': 'application/json; charset=utf-8' } }); };
const sameOrigin = (request) => { // browsers send Sec-Fetch-Site (cannot be faked by a web page); Origin can be the string "null" on form posts
  const sfs = request.headers.get('sec-fetch-site'), o = request.headers.get('origin');
  if (sfs) return sfs === 'same-origin';
  if (!o) return true;
  try { return new URL(o).host === new URL(request.url).host; } catch { return false; }
};

export async function handle(request, env) {
  const url = new URL(request.url), path = url.pathname.replace(/\/+$/, '') || '/', sub = path.replace(/^\/analytics/, '') || '/';
  if (!configured(env)) return loginPage('O painel ainda não foi configurado: faltam os segredos ANALYTICS_USER e ANALYTICS_PASSWORD (mínimo 10 caracteres) no Cloudflare. Veja o README.', 503);
  const authed = await verifyToken(env, readCookie(request, COOKIE));

  if (sub === '/login' && request.method === 'POST') {
    if (!env.DB) return loginPage('Banco de dados (D1) não conectado. Veja o README.', 503);
    if (!sameOrigin(request)) return loginPage('Pedido inválido.', 403);
    await ensure(env);
    const key = await ipKey(env, request);
    if (await tooMany(env, key)) return loginPage('Muitas tentativas. Espere 15 minutos.', 429);
    let user = '', pass = '';
    try { const f = await request.formData(); user = String(f.get('u') || '').slice(0, 200); pass = String(f.get('p') || '').slice(0, 400); } catch { /* empty */ }
    if (await checkCreds(env, user, pass)) {
      await clearFails(env, key);
      return new Response(null, { status: 303, headers: { ...base('x'), Location: '/analytics', 'Set-Cookie': sessionCookie(await makeToken(env)) } });
    }
    await addFail(env, key);
    await new Promise((r) => setTimeout(r, 700));
    return loginPage('Usuário ou senha incorretos.', 401);
  }
  if (sub === '/logout' && request.method === 'POST') {
    if (!sameOrigin(request)) return json({ error: 'forbidden' }, 403);
    return new Response(null, { status: 303, headers: { ...base('x'), Location: '/analytics', 'Set-Cookie': sessionCookie('', 0) } });
  }
  if (sub === '/api') {
    if (!authed) return json({ error: 'unauthorized' }, 401);
    if (!env.DB) return json({ error: 'no_db' }, 503);
    await ensure(env);
    const range = RANGES[url.searchParams.get('range')] === undefined ? '7d' : url.searchParams.get('range');
    const kind = url.searchParams.get('export');
    if (kind === 'events' || kind === 'sessions') {
      const body = await exportCsv(env, kind, range), n = nonce();
      return new Response(body, { headers: { ...base(n), 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="kaiotu-${kind}-${range}.csv"` } });
    }
    return json(await summary(env, range));
  }
  if (sub === '/reset' && request.method === 'POST') {
    if (!authed || !env.DB) return json({ error: 'unauthorized' }, 401);
    if (!sameOrigin(request) || request.headers.get('x-kt') !== '1') return json({ error: 'forbidden' }, 403);
    let body = {}; try { body = await request.json(); } catch { /* empty */ }
    if (body.confirm !== 'APAGAR') return json({ error: 'confirm' }, 400);
    await ensure(env);
    await env.DB.batch([env.DB.prepare('DELETE FROM events'), env.DB.prepare('DELETE FROM sessions')]);
    return json({ ok: true });
  }
  if (sub === '/' && request.method === 'GET') return authed ? page(APP) : loginPage();
  return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });
}
