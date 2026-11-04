// node scripts/test-analytics.mjs : exercises the collector, the login and the dashboard data against a SQLite stand-in for D1.
import assert from 'node:assert/strict';
import { makeD1 } from './d1-shim.mjs';
import { onRequestPost as collect } from '../functions/api/collect.js';
import { handle } from '../functions/_lib/analytics-app.js';
import { resetForTests } from '../functions/_lib/db.js';

const env = { DB: makeD1(), ANALYTICS_USER: 'kaiotu', ANALYTICS_PASSWORD: 'correct horse battery' };
const ID = (n) => n.toString(16).padStart(24, '0');
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const post = (body, headers = {}) => collect({ request: new Request('https://kaiotu.test/api/collect', { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body), headers: { 'user-agent': UA, origin: 'https://kaiotu.test', 'sec-fetch-site': 'same-origin', ...headers } }), env });
let pass = 0; const ok = (name, fn) => fn().then(() => { pass++; console.log('ok  ', name); }, (e) => { console.error('FAIL', name, '\n', e); process.exitCode = 1; });

await ok('collector stores a visit with events', async () => {
  const r = await post({ v: ID(1), s: ID(10), m: { nv: 1, l: 'pt-BR', w: 390, r: 'discord.com' }, d: 42000, sc: 80, e: [
    { t: 'section', a: 'work', o: 3000 }, { t: 'section', a: 'work', o: 2000 }, { t: 'tab', a: 'weapons', b: 'clothes', o: 1500 },
    { t: 'open', a: 'P90', b: 'weapons', o: 1000 }, { t: 'vclose', a: 'P90', n: 8000, o: 100 }, { t: 'connect', a: 'discord', o: 0 }, { t: 'hacker', a: 'x' } ] });
  assert.equal(r.status, 204);
  const s = env.DB.raw.prepare('select * from sessions').all();
  assert.equal(s.length, 1); assert.equal(s[0].device, 'Mobile'); assert.equal(s[0].browser, 'Safari'); assert.equal(s[0].os, 'iOS'); assert.equal(s[0].ref, 'discord.com'); assert.equal(s[0].scroll, 80); assert.equal(s[0].inter, 4);
  assert.equal(env.DB.raw.prepare("select count(*) c from events").get().c, 5, 'unknown type dropped, duplicate section ignored');
});
await ok('collector rejects bots, strangers and junk', async () => {
  assert.equal((await post({ v: ID(2), s: ID(20), e: [{ t: 'tab', a: 'x' }] }, { 'user-agent': 'Googlebot/2.1' })).status, 204);
  assert.equal((await post({ v: ID(2), s: ID(20) }, { origin: 'https://evil.example' })).status, 403);
  assert.equal((await post('not json')).status, 400);
  assert.equal((await post({ v: 'nope', s: ID(1) })).status, 400);
  assert.equal(env.DB.raw.prepare("select count(*) c from sessions").get().c, 1);
});
await ok('a second person and a returning visit', async () => {
  await post({ v: ID(3), s: ID(30), m: { nv: 1, w: 1440 }, d: 5000, sc: 20, e: [] });
  await post({ v: ID(1), s: ID(11), m: { nv: 0, w: 1440, us: 'bio', um: 'link', uc: 'oct' }, d: 90000, sc: 100, e: [{ t: 'section', a: 'contact' }, { t: 'social', a: 'x', b: 'footer' }, { t: 'experience', a: 'Ink Game' }] });
  const t = env.DB.raw.prepare('select count(distinct vid) v, count(*) s from sessions').get(); assert.equal(t.v, 2); assert.equal(t.s, 3);
});
await ok('dashboard needs login; wrong password is refused; good password works', async () => {
  const get = (path, cookie, extra = {}) => handle(new Request('https://kaiotu.test' + path, { headers: { ...(cookie ? { cookie } : {}), ...extra } }), env);
  assert.equal((await get('/analytics/api')).status, 401);
  const login = (u, p) => handle(new Request('https://kaiotu.test/analytics/login', { method: 'POST', body: new URLSearchParams({ u, p }), headers: { origin: 'https://kaiotu.test', 'cf-connecting-ip': '203.0.113.9' } }), env);
  const bad = await login('kaiotu', 'wrong'); assert.equal(bad.status, 401);
  const good = await login('kaiotu', 'correct horse battery'); assert.equal(good.status, 303);
  const ck = good.headers.get('set-cookie'); assert.match(ck, /^__Host-kt_a=\d+\.[a-f0-9]{64}; Path=\/; Max-Age=\d+; HttpOnly; Secure; SameSite=Strict$/);
  const cookie = ck.split(';')[0];
  assert.equal((await get('/analytics', cookie)).status, 200);
  assert.match(await (await get('/analytics', cookie)).text(), /analytics/);
  const tampered = cookie.replace(/.$/, (c) => (c === '0' ? '1' : '0')); assert.equal((await get('/analytics/api', tampered)).status, 401);
  const api = await (await get('/analytics/api?range=30d', cookie)).json();
  assert.equal(api.totals.visitors, 2); assert.equal(api.totals.sessions, 3); assert.equal(api.totals.retSessions, 1);
  assert.equal(api.sections.find((s) => s.k === 'work').c, 1);
  assert.equal(api.items[0].title, 'P90'); assert.equal(Math.round(api.items[0].avgViewMs), 8000);
  assert.equal(api.categories.find((c) => c.k === 'weapons').tabs, 1);
  assert.equal(api.transitions[0].f, 'clothes'); assert.equal(api.transitions[0].t, 'weapons');
  assert.ok(api.actions.find((a) => a.t === 'connect') && api.actions.find((a) => a.t === 'social'));
  assert.ok(api.audience.countries.length >= 1 && api.sources.utm[0].s === 'bio');
  assert.equal(api.journeys.length, 3); assert.ok(api.journeys.some((j) => j.steps.some((s) => s.t === 'open')));
  const csv = await (await get('/analytics/api?export=events&range=all', cookie)).text(); assert.match(csv, /^id,ts,sid,vid,t,a,b,n\n/); assert.ok(csv.includes('P90'));
  const h = (await get('/analytics', cookie)).headers; assert.match(h.get('content-security-policy'), /script-src 'nonce-/); assert.match(h.get('x-robots-tag'), /noindex/); assert.match(h.get('cache-control'), /no-store/);
});
await ok('form posts that arrive with Origin "null" (strict referrer policy) still work, cross-site ones do not', async () => {
  const login = (headers) => handle(new Request('https://kaiotu.test/analytics/login', { method: 'POST', body: new URLSearchParams({ u: 'kaiotu', p: 'correct horse battery' }), headers: { 'cf-connecting-ip': '192.0.2.77', ...headers } }), env);
  assert.equal((await login({ origin: 'null', 'sec-fetch-site': 'same-origin' })).status, 303);
  assert.equal((await login({ origin: 'https://evil.example', 'sec-fetch-site': 'cross-site' })).status, 403);
  assert.equal((await login({ origin: 'null' })).status, 403);
});
await ok('five wrong passwords lock that address for a while, even with the right one', async () => {
  const login = (p, ip) => handle(new Request('https://kaiotu.test/analytics/login', { method: 'POST', body: new URLSearchParams({ u: 'kaiotu', p }), headers: { origin: 'https://kaiotu.test', 'cf-connecting-ip': ip } }), env);
  for (let i = 0; i < 5; i++) assert.equal((await login('nope' + i, '198.51.100.7')).status, 401);
  assert.equal((await login('correct horse battery', '198.51.100.7')).status, 429);
  assert.equal((await login('correct horse battery', '198.51.100.8')).status, 303, 'other addresses are not affected');
});
await ok('not configured / weak password = closed', async () => {
  const r = await handle(new Request('https://kaiotu.test/analytics'), { DB: env.DB, ANALYTICS_USER: 'a', ANALYTICS_PASSWORD: 'short' });
  assert.equal(r.status, 503);
  const r2 = await collect({ request: new Request('https://kaiotu.test/api/collect', { method: 'POST', body: '{}', headers: { 'user-agent': UA } }), env: {} });
  assert.equal(r2.status, 204);
});
await ok('new events: views, dwell, speed, errors; passive events are not interactions; reset works', async () => {
  const before = env.DB.raw.prepare('select count(*) c from sessions').get().c;
  await post({ v: ID(4), s: ID(40), m: { nv: 1, w: 1440 }, d: 20000, sc: 40, e: [
    { t: 'imp', a: 'P90', b: 'weapons' }, { t: 'imp', a: 'Swords', b: 'recent' }, { t: 'dwell', a: 'work', n: 12000 }, { t: 'dwell', a: 'home', n: 3000 },
    { t: 'perf', a: 'lcp', n: 1800 }, { t: 'perf', a: 'load', n: 2400 }, { t: 'err', a: 'x is not a function', b: 'app.js' } ] });
  const s = env.DB.raw.prepare('select * from sessions where sid=?').get(ID(40));
  assert.equal(s.inter, 0, 'only passive events: still counts as no interaction'); assert.equal(env.DB.raw.prepare('select count(*) c from sessions').get().c, before + 1);
  const get = async (path, cookie) => handle(new Request('https://kaiotu.test' + path, { headers: { cookie } }), env);
  const login = await handle(new Request('https://kaiotu.test/analytics/login', { method: 'POST', body: new URLSearchParams({ u: 'kaiotu', p: 'correct horse battery' }), headers: { origin: 'https://kaiotu.test', 'cf-connecting-ip': '192.0.2.50' } }), env);
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const api = await (await get('/analytics/api?range=30d', cookie)).json();
  const p90 = api.items.find((i) => i.title === 'P90'); assert.equal(p90.imps, 1); assert.ok(p90.c >= 1);
  assert.ok(api.items.find((i) => i.title === 'Swords' && i.imps === 1), 'seen but never opened pieces are listed too');
  assert.equal(api.dwellSections.find((x) => x.k === 'work').ms, 12000);
  assert.equal(api.perf.overall.find((x) => x.k === 'lcp').good, 1);
  assert.equal(api.errors[0].msg, 'x is not a function');
  assert.ok(!api.journeys.some((j) => j.steps.some((st) => ['imp', 'dwell', 'perf'].includes(st.t))), 'passive events stay out of the journeys');
  const reset = (conf, hdr = { 'x-kt': '1' }) => handle(new Request('https://kaiotu.test/analytics/reset', { method: 'POST', body: JSON.stringify({ confirm: conf }), headers: { cookie, origin: 'https://kaiotu.test', ...hdr } }), env);
  assert.equal((await reset('nao')).status, 400); assert.equal((await reset('APAGAR', {})).status, 403);
  assert.equal((await handle(new Request('https://kaiotu.test/analytics/reset', { method: 'POST', body: '{"confirm":"APAGAR"}', headers: { origin: 'https://kaiotu.test', 'x-kt': '1' } }), env)).status, 401, 'needs login');
  assert.equal((await reset('APAGAR')).status, 200);
  assert.equal(env.DB.raw.prepare('select count(*) c from sessions').get().c, 0);
});
console.log(`\n${pass} checks passed`);
