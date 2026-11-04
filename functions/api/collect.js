// POST /api/collect: receives the anonymous events sent by the site.
// Needs a D1 database bound as DB (see README). Without it this answers 204 and stores nothing.
// Stored: random visitor/session ids made by the browser, country/region from Cloudflare, device class,
// browser, OS, language, screen size class, referrer host, and what was clicked. Never: IP, raw user agent, cookies.
import { ensure } from '../_lib/db.js';
import { isBot, parseUA, screenBucket } from '../_lib/ua.js';

const TYPES = new Set(['section', 'tab', 'viewall', 'open', 'vclose', 'vnav', 'zoom', 'cta', 'connect', 'social', 'copy', 'experience', 'outbound', 'theme', 'menu', 'nav', 'panel', 'rpause', 'rarrow', 'imp', 'dwell', 'perf', 'err']);
const ID = /^[a-f0-9]{12,40}$/;
const cut = (v, n) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f<>]/g, '').slice(0, n) : '');
const none = (status = 204) => new Response(null, { status, headers: { 'Cache-Control': 'no-store' } });

export async function onRequestPost(ctx) {
  const { request, env } = ctx;
  if (!env.DB) return none();
  try {
    const host = new URL(request.url).host, origin = request.headers.get('origin'), sfs = request.headers.get('sec-fetch-site');
    if (origin && origin !== 'null') { let oh = ''; try { oh = new URL(origin).host; } catch { /* bad */ } if (oh !== host) return none(403); }
    if (sfs && sfs !== 'same-origin' && sfs !== 'none') return none(403);
    const ua = request.headers.get('user-agent') || '';
    if (isBot(ua)) return none();
    if (Number(request.headers.get('content-length') || 0) > 12000) return none(413);
    const raw = await request.text();
    if (raw.length > 12000) return none(413);
    let p; try { p = JSON.parse(raw); } catch { return none(400); }
    if (!p || !ID.test(p.v || '') || !ID.test(p.s || '')) return none(400);

    const now = Date.now(), m = p.m && typeof p.m === 'object' ? p.m : {};
    const cf = request.cf || {}, u = parseUA(ua), w = Math.max(0, Math.min(10000, Number(m.w) || 0));
    const ref = cut(m.r, 80).toLowerCase(), us = cut(m.us, 40), um = cut(m.um, 40), uc = cut(m.uc, 60);
    const evs = (Array.isArray(p.e) ? p.e : []).slice(0, 40).filter((e) => e && TYPES.has(e.t)).map((e) => ({
      t: e.t, a: cut(e.a, 80), b: cut(e.b, 80), n: Math.max(0, Math.min(36e5, Math.round(Number(e.n) || 0))),
      ts: now - Math.max(0, Math.min(36e5, Math.round(Number(e.o) || 0))),
    }));
    const inter = evs.filter((e) => !['section', 'imp', 'dwell', 'perf', 'err'].includes(e.t)).length;
    const dur = Math.max(0, Math.min(6 * 36e5, Math.round(Number(p.d) || 0))), sc = Math.max(0, Math.min(100, Math.round(Number(p.sc) || 0)));

    await ensure(env);
    const db = env.DB, st = [];
    st.push(db.prepare(`INSERT OR IGNORE INTO sessions(sid,vid,ts,last,country,region,device,browser,os,lang,scr,ref,utm_s,utm_m,utm_c,nv) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .bind(p.s, p.v, now, now, cut(cf.country || '', 3) || null, cut(cf.region || '', 40) || null, u.device, u.browser, u.os, cut(m.l, 12) || null, w ? screenBucket(w) : null, ref || null, us || null, um || null, uc || null, m.nv ? 1 : 0));
    for (const e of evs) {
      if (e.t === 'section') {
        st.push(db.prepare(`INSERT INTO events(ts,sid,vid,t,a,b,n) SELECT ?,?,?,?,?,?,? WHERE (SELECT n FROM sessions WHERE sid=?)<600 AND NOT EXISTS(SELECT 1 FROM events WHERE sid=? AND t='section' AND a=?)`).bind(e.ts, p.s, p.v, e.t, e.a, e.b, e.n, p.s, p.s, e.a));
      } else {
        st.push(db.prepare(`INSERT INTO events(ts,sid,vid,t,a,b,n) SELECT ?,?,?,?,?,?,? WHERE (SELECT n FROM sessions WHERE sid=?)<600`).bind(e.ts, p.s, p.v, e.t, e.a, e.b, e.n, p.s));
      }
    }
    st.push(db.prepare(`UPDATE sessions SET last=?,dur=MAX(dur,?),scroll=MAX(scroll,?),n=n+?,inter=inter+? WHERE sid=? AND vid=? AND n<600`).bind(now, dur, sc, evs.length, inter, p.s, p.v));
    if (Math.random() < 0.01) { // keep only ~13 months of data
      st.push(db.prepare(`DELETE FROM events WHERE ts<?`).bind(now - 400 * 864e5), db.prepare(`DELETE FROM sessions WHERE last<?`).bind(now - 400 * 864e5), db.prepare(`DELETE FROM auth_fail WHERE ts<?`).bind(now - 864e5));
    }
    const job = db.batch(st).catch(() => {});
    if (typeof ctx.waitUntil === 'function') ctx.waitUntil(job); else await job;
    return none();
  } catch {
    return none(); // never break the site because of analytics
  }
}
export const onRequest = () => new Response(null, { status: 405, headers: { Allow: 'POST' } });
