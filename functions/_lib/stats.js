// Everything the dashboard shows, computed in SQL on the D1 database. Times are shown in São Paulo time (UTC-3, no DST).
const DAY = 864e5, TZ = -3 * 36e5;
export const RANGES = { '24h': DAY, '7d': 7 * DAY, '30d': 30 * DAY, '90d': 90 * DAY, all: 0 };
const ACTIONS = ['cta', 'connect', 'social', 'copy', 'panel', 'menu', 'nav', 'theme', 'experience', 'outbound', 'rpause', 'rarrow', 'viewall'];
const pad = (n) => String(n).padStart(2, '0');
const sp = (ts) => new Date(ts + TZ); // read with getUTC*
const dayKey = (ts) => { const d = sp(ts); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`; };
const hourKey = (ts) => `${dayKey(ts)} ${pad(sp(ts).getUTCHours())}`;

export async function summary(env, range) {
  const now = Date.now(), key = RANGES[range] === undefined ? '7d' : range, len = RANGES[key];
  const db = env.DB;
  const all = async (sql, ...a) => ((await db.prepare(sql).bind(...a).all()).results) || [];
  const one = async (sql, ...a) => (await all(sql, ...a))[0] || {};
  let from = len ? now - len : 0;
  if (!len) { const f = await one(`SELECT MIN(ts) m FROM sessions`); from = f.m || now - 7 * DAY; }
  const span = Math.max(now - from, 1), pfrom = from - span;
  const hourly = span <= 2 * DAY, fmt = hourly ? '%Y-%m-%d %H' : '%Y-%m-%d';

  const TOT = `SELECT COUNT(*) sessions,COUNT(DISTINCT vid) visitors,COUNT(DISTINCT CASE WHEN nv=1 THEN vid END) newv,COUNT(DISTINCT CASE WHEN nv=0 THEN vid END) retv,COALESCE(AVG(CASE WHEN dur>0 THEN dur END),0) dur,COALESCE(AVG(scroll),0) scroll,SUM(CASE WHEN inter=0 AND dur<10000 THEN 1 ELSE 0 END) bounce,SUM(CASE WHEN nv=0 THEN 1 ELSE 0 END) retSessions FROM sessions WHERE ts>=? AND ts<?`;
  const [cur, prev] = await Promise.all([one(TOT, from, now + 1), one(TOT, pfrom, from)]);
  const evc = (t, extra = '', ...a) => one(`SELECT COUNT(*) c,COUNT(DISTINCT sid) s FROM events WHERE ts>=? AND t=? ${extra}`, from, t, ...a);
  const grp = (col, lim = 12) => all(`SELECT COALESCE(${col},'(desconhecido)') k,COUNT(*) c,COUNT(DISTINCT vid) v FROM sessions WHERE ts>=? GROUP BY 1 ORDER BY c DESC LIMIT ${lim}`, from);

  const [imps, secDwell, perf, perfDev, errs, series, sections, scrollB, tabs, trans, opens, byCat, dwell, actions, tabSess, opensSess, zoom, vnav, countries, devices, browsers, oss, langs, screens, refs, utm, hours, wdays, live, active30, feed, recent, newest] = await Promise.all([
    all(`SELECT a title,COALESCE(NULLIF(b,''),'') cat,COUNT(DISTINCT sid) s FROM events WHERE ts>=? AND t='imp' GROUP BY a,b`, from),
    all(`SELECT a k,SUM(n) ms,COUNT(DISTINCT sid) s FROM events WHERE ts>=? AND t='dwell' GROUP BY a`, from),
    all(`SELECT a k,AVG(n) avg,COUNT(*) c,SUM(CASE WHEN a='lcp' AND n<=2500 THEN 1 WHEN a='load' AND n<=3000 THEN 1 ELSE 0 END) good FROM events WHERE ts>=? AND t='perf' GROUP BY a`, from),
    all(`SELECT s.device d,e.a k,AVG(e.n) avg,COUNT(*) c FROM events e JOIN sessions s ON s.sid=e.sid WHERE e.ts>=? AND e.t='perf' GROUP BY 1,2`, from),
    all(`SELECT a msg,b file,COUNT(*) c,COUNT(DISTINCT sid) s,MAX(ts) last FROM events WHERE ts>=? AND t='err' GROUP BY a,b ORDER BY c DESC LIMIT 15`, from),
    all(`SELECT strftime('${fmt}',(ts+${TZ})/1000,'unixepoch') d,COUNT(*) s,COUNT(DISTINCT vid) v FROM sessions WHERE ts>=? GROUP BY 1`, from),
    all(`SELECT a k,COUNT(DISTINCT sid) c FROM events WHERE ts>=? AND t='section' GROUP BY a`, from),
    all(`SELECT CASE WHEN scroll<25 THEN 0 WHEN scroll<50 THEN 25 WHEN scroll<75 THEN 50 WHEN scroll<100 THEN 75 ELSE 100 END k,COUNT(*) c FROM sessions WHERE ts>=? GROUP BY 1`, from),
    all(`SELECT a k,COUNT(*) c,COUNT(DISTINCT sid) s FROM events WHERE ts>=? AND t='tab' GROUP BY a ORDER BY c DESC`, from),
    all(`SELECT b f,a t,COUNT(*) c FROM events WHERE ts>=? AND t='tab' GROUP BY b,a ORDER BY c DESC LIMIT 30`, from),
    all(`SELECT a title,b cat,COUNT(*) c,COUNT(DISTINCT sid) s,COUNT(DISTINCT vid) v FROM events WHERE ts>=? AND t='open' GROUP BY a,b ORDER BY c DESC LIMIT 30`, from),
    all(`SELECT COALESCE(NULLIF(b,''),'(sem categoria)') k,COUNT(*) c,COUNT(DISTINCT sid) s FROM events WHERE ts>=? AND t='open' GROUP BY 1 ORDER BY c DESC`, from),
    all(`SELECT a title,AVG(n) ms,COUNT(*) c FROM events WHERE ts>=? AND t='vclose' AND n>0 GROUP BY a`, from),
    all(`SELECT t,a,b,COUNT(*) c,COUNT(DISTINCT sid) s FROM events WHERE ts>=? AND t IN (${ACTIONS.map(() => '?').join(',')}) GROUP BY t,a,b ORDER BY c DESC LIMIT 120`, from, ...ACTIONS),
    one(`SELECT COUNT(DISTINCT sid) s,COUNT(*) c FROM events WHERE ts>=? AND t='tab'`, from),
    one(`SELECT COUNT(DISTINCT sid) s,COUNT(*) c FROM events WHERE ts>=? AND t='open'`, from),
    evc('zoom'), evc('vnav'),
    grp('country'), grp('device'), grp('browser'), grp('os'), grp('lang'), grp('scr'),
    all(`SELECT COALESCE(NULLIF(ref,''),'(direto / sem origem)') k,COUNT(*) c,COUNT(DISTINCT vid) v FROM sessions WHERE ts>=? GROUP BY 1 ORDER BY c DESC LIMIT 12`, from),
    all(`SELECT COALESCE(utm_s,'') s,COALESCE(utm_m,'') m,COALESCE(utm_c,'') cmp,COUNT(*) c FROM sessions WHERE ts>=? AND (utm_s IS NOT NULL OR utm_m IS NOT NULL OR utm_c IS NOT NULL) GROUP BY 1,2,3 ORDER BY c DESC LIMIT 12`, from),
    all(`SELECT CAST(strftime('%H',(ts+${TZ})/1000,'unixepoch') AS INTEGER) k,COUNT(*) c FROM sessions WHERE ts>=? GROUP BY 1`, from),
    all(`SELECT CAST(strftime('%w',(ts+${TZ})/1000,'unixepoch') AS INTEGER) k,COUNT(*) c FROM sessions WHERE ts>=? GROUP BY 1`, from),
    one(`SELECT COUNT(*) c FROM sessions WHERE last>=?`, now - 5 * 6e4),
    one(`SELECT COUNT(*) c FROM sessions WHERE last>=?`, now - 30 * 6e4),
    all(`SELECT e.ts,e.t,e.a,e.b,s.country,s.device FROM events e JOIN sessions s ON s.sid=e.sid WHERE e.t NOT IN ('section','imp','dwell','perf') ORDER BY e.id DESC LIMIT 25`),
    all(`SELECT sid,vid,ts,last,dur,scroll,country,region,device,browser,os,ref,nv,scr FROM sessions WHERE ts>=? ORDER BY ts DESC LIMIT 25`, from),
    one(`SELECT COUNT(*) c FROM sessions`),
  ]);

  // fill empty buckets so the chart has no holes
  const map = new Map(series.map((r) => [r.d, r])), days = [];
  const step = hourly ? 36e5 : DAY, cap = hourly ? 49 : 400;
  for (let t = from - ((from + TZ) % step + step) % step, i = 0; t <= now && i < cap; t += step, i++) {
    const k = hourly ? hourKey(t) : dayKey(t), r = map.get(k);
    days.push({ d: k, s: r ? r.s : 0, v: r ? r.v : 0 });
  }

  // journeys (anonymous): the steps each recent visit took
  let journeys = [];
  if (recent.length) {
    const ids = recent.map((r) => r.sid), evs = await all(`SELECT sid,ts,t,a,b FROM events WHERE t NOT IN ('imp','dwell','perf') AND sid IN (${ids.map(() => '?').join(',')}) ORDER BY ts,id LIMIT 1500`, ...ids);
    const by = new Map(); for (const e of evs) { if (!by.has(e.sid)) by.set(e.sid, []); by.get(e.sid).push(e); }
    journeys = recent.map((r) => ({ ts: r.ts, dur: r.dur, scroll: r.scroll, country: r.country, region: r.region, device: r.device, browser: r.browser, os: r.os, ref: r.ref, returning: r.nv === 0, vid: String(r.vid).slice(0, 6), steps: (by.get(r.sid) || []).map((e) => ({ dt: e.ts - r.ts, t: e.t, a: e.a, b: e.b })) }));
  }
  const dw = new Map(dwell.map((r) => [r.title, r]));
  const sec = Object.fromEntries(sections.map((r) => [r.k, r.c]));
  const conn = actions.filter((r) => r.t === 'connect' || r.t === 'social' || r.t === 'copy');
  const intent = (await one(`SELECT COUNT(DISTINCT sid) s FROM events WHERE ts>=? AND t IN ('connect','social','copy')`, from)).s || 0;
  const cats = new Map();
  for (const r of byCat) cats.set(r.k, { k: r.k, opens: r.c, sessions: r.s, tabs: 0 });
  for (const r of tabs) { const c = cats.get(r.k) || { k: r.k, opens: 0, sessions: 0, tabs: 0 }; c.tabs = r.c; c.tabSessions = r.s; cats.set(r.k, c); }

  return {
    range: key, from, now, hourly, tz: 'America/Sao_Paulo', totalEver: newest.c || 0,
    totals: cur, previous: prev,
    live: live.c || 0, active30: active30.c || 0,
    series: days,
    funnel: [
      { k: 'Entraram no site', c: cur.sessions || 0 },
      { k: 'Chegaram em Work', c: sec.work || 0 },
      { k: 'Abriram alguma criação', c: opensSess.s || 0 },
      { k: 'Chegaram em Contributions', c: sec.contributions || 0 },
      { k: 'Chegaram no rodapé', c: sec.contact || 0 },
      { k: 'Tentaram contato (Let’s connect, ícones ou copiar)', c: intent },
    ],
    sections: ['home', 'work', 'recent', 'contributions', 'about', 'contact'].map((k) => ({ k, c: sec[k] || 0 })),
    scroll: [0, 25, 50, 75, 100].map((k) => ({ k, c: (scrollB.find((r) => r.k === k) || {}).c || 0 })),
    behavior: {
      tabSwitches: tabSess.c || 0, tabSessions: tabSess.s || 0, opens: opensSess.c || 0, openSessions: opensSess.s || 0,
      zoomSessions: zoom.s || 0, zooms: zoom.c || 0, vnavSessions: vnav.s || 0, vnavs: vnav.c || 0,
      avgViewMs: dwell.length ? dwell.reduce((a, r) => a + r.ms * r.c, 0) / dwell.reduce((a, r) => a + r.c, 0) : 0,
    },
    categories: [...cats.values()].sort((a, b) => b.opens + b.tabs - (a.opens + a.tabs)),
    transitions: trans, tabs,
    items: (() => {
      const m = new Map(); const kk = (t, ct) => `${t}\u0000${ct}`;
      for (const r of imps) m.set(kk(r.title, r.cat), { title: r.title, cat: r.cat, c: 0, s: 0, v: 0, imps: r.s, avgViewMs: 0 });
      for (const r of opens) { const o = m.get(kk(r.title, r.cat)) || { title: r.title, cat: r.cat, imps: 0 }; Object.assign(o, { c: r.c, s: r.s, v: r.v, avgViewMs: (dw.get(r.title) || {}).ms || 0 }); m.set(kk(r.title, r.cat), o); }
      return [...m.values()].sort((a, b) => (b.c || 0) - (a.c || 0) || (b.imps || 0) - (a.imps || 0)).slice(0, 60);
    })(),
    dwellSections: ['home', 'work', 'recent', 'contributions', 'about', 'contact'].map((k) => { const r = secDwell.find((x) => x.k === k); return { k, ms: r ? r.ms / Math.max(r.s, 1) : 0, s: r ? r.s : 0 }; }),
    perf: { overall: perf, devices: perfDev },
    errors: errs,
    actions, contact: conn,
    audience: { countries, devices, browsers, os: oss, langs, screens },
    sources: { referrers: refs, utm },
    hours: Array.from({ length: 24 }, (_, h) => ({ k: h, c: (hours.find((r) => r.k === h) || {}).c || 0 })),
    weekdays: Array.from({ length: 7 }, (_, d) => ({ k: d, c: (wdays.find((r) => r.k === d) || {}).c || 0 })),
    feed, journeys,
  };
}

const csv = (rows, cols) => [cols.join(','), ...rows.map((r) => cols.map((c) => { const v = r[c] == null ? '' : String(r[c]); return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v; }).join(','))].join('\n');
export async function exportCsv(env, kind, range) {
  const len = RANGES[range] === undefined ? RANGES['30d'] : RANGES[range], from = len ? Date.now() - len : 0;
  if (kind === 'sessions') {
    const r = ((await env.DB.prepare(`SELECT * FROM sessions WHERE ts>=? ORDER BY ts`).bind(from).all()).results || []).map((x) => ({ ...x, ts: new Date(x.ts).toISOString(), last: new Date(x.last).toISOString() }));
    return csv(r, ['sid', 'vid', 'ts', 'last', 'dur', 'scroll', 'country', 'region', 'device', 'browser', 'os', 'lang', 'scr', 'ref', 'utm_s', 'utm_m', 'utm_c', 'nv', 'n', 'inter']);
  }
  const r = ((await env.DB.prepare(`SELECT * FROM events WHERE ts>=? ORDER BY ts,id`).bind(from).all()).results || []).map((x) => ({ ...x, ts: new Date(x.ts).toISOString() }));
  return csv(r, ['id', 'ts', 'sid', 'vid', 't', 'a', 'b', 'n']);
}
