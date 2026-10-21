// node scripts/build.mjs -> dist/ (one HTML file with inlined CSS + JS, plus images)
// No dependencies. Content comes from content/*.json.
import { readFile, writeFile, mkdir, copyFile, readdir } from 'node:fs/promises';
import { existsSync, statSync } from 'node:fs';

const rd = async (p, d = null) => (existsSync(p) ? JSON.parse(await readFile(p, 'utf8')) : d);
const site = await rd('content/site.json');
const works = await rd('content/works.json');
const contrib = await rd('content/contributions.json');
const cache = await rd('content/roblox-cache.json', { updated: 0, items: [] });
const manifest = await rd('dist/img/manifest.json', {});
const posts = await rd('content/discord-posts.json', { items: [] });

const esc = (s = '') => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nf = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });
const origin = (site.url || '').replace(/\/$/, '');
const warn = (m) => console.warn('! ' + m);
const PREV = works.previewCount || 3;

/* ---------- images ---------- */
const big = (m) => Math.max(...m.widths);
function picture(rel, { sizes, alt, eager = false }) {
  const m = manifest[rel];
  if (!m) { warn(`image not optimized (run npm run optimize): ${rel}`); return ''; }
  const set = (ext) => m.widths.map((w) => `img/${m.base}-${w}.${ext} ${w}w`).join(', ');
  const mid = m.widths.includes(960) ? 960 : big(m);
  const h = Math.round((m.h * mid) / m.w);
  return `<picture><source type="image/avif" srcset="${set('avif')}" sizes="${sizes}"><source type="image/webp" srcset="${set('webp')}" sizes="${sizes}"><img src="img/${m.base}-${mid}.webp" width="${mid}" height="${h}" alt="${esc(alt)}" ${eager ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async"></picture>`;
}
const fullSrc = (rel) => { const m = manifest[rel]; if (!m) return null; const w = big(m); return { src: `img/${m.base}-${w}.webp`, w, h: Math.round((m.h * w) / m.w) }; };

/* dates: "2026-10", "2026-10-18" or a full ISO timestamp ("2026-10-18T14:03:00Z", used by Discord posts).
   Never guessed: items without a valid date are not shown as recent. */
const parseDate = (d) => {
  if (!d) return null;
  if (/^\d{4}-\d{2}-\d{2}T/.test(d)) { const t = Date.parse(d); return Number.isNaN(t) ? null : { t, prec: 'time' }; }
  const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(d);
  return m ? { t: Date.UTC(+m[1], +m[2] - 1, +(m[3] || 1)), prec: m[3] ? 'day' : 'month' } : null;
};
const fmtDate = (d) => { const p = parseDate(d); return p ? new Intl.DateTimeFormat('en', { month: 'short', ...(p.prec !== 'month' ? { day: 'numeric' } : {}), year: 'numeric', timeZone: 'UTC' }).format(p.t) : ''; };

/* ---------- work items ---------- */
const catIds = new Set(works.categories.map((c) => c.id));
const items = [];
const postItems = (posts.items || []).map((p) => ({ title: p.title, images: p.images, date: p.published, recent: true, alt: p.title, fromDiscord: true }));
/* easy adding: any image dropped in source-images/<category id>/ (clothes, weapons, vehicles, assets) that
   content/works.json does not mention becomes a piece automatically. Title = file name ("03-stone-bridge.webp"
   -> "Stone bridge"; the leading number only sets the order). Use works.json for multi-image pieces, descriptions, software, dates. */
const usedImgs = new Set(works.items.flatMap((i) => i.images || []));
const prettify = (f) => { const t = f.replace(/\.[^.]+$/, '').replace(/^\d+[-_. ]+/, '').replace(/[-_]+/g, ' ').trim(); return t ? t[0].toUpperCase() + t.slice(1) : ''; };
const autoItems = Object.keys(manifest).sort().filter((k) => works.categories.some((c) => k.startsWith(c.id + '/')) && !usedImgs.has(k))
  .map((k) => ({ title: prettify(k.split('/').pop()), category: k.split('/')[0], images: [k], auto: true }));
/* Recent Work from a folder: drop images in source-images/recent/. Name them "2026-10-20-title.png" (date first) or
   "2026-10-20-1430-title.png" (with time). Without a date in the name, the file's own modified time is used. */
const recentFolder = Object.keys(manifest).sort().filter((k) => k.startsWith('recent/') && !usedImgs.has(k)).map((k) => {
  const f = k.split('/').pop();
  const m = f.match(/^(\d{4}-\d{2}-\d{2})(?:[-_T](\d{2})(\d{2}))?[-_ ]?(.*)$/);
  let date;
  if (m) date = `${m[1]}T${m[2] ? `${m[2]}:${m[3]}` : '12:00'}:00-03:00`;
  else { const sp = ['source-images/' + k, ...['.jpg', '.jpeg', '.png', '.webp', '.avif'].map((e) => 'source-images/' + k.replace(/\.[^.]+$/, e))].find((x) => existsSync(x)); date = sp ? statSync(sp).mtime.toISOString() : null; }
  const rest = m ? m[4] : f;
  return { title: prettify(rest.replace(/^[-_ ]+/, '') || f) , images: [k], date, recent: true, auto: true };
});
for (const it of [...works.items, ...autoItems, ...postItems, ...recentFolder]) {
  const imgs = (it.images || []).map((r) => ({ rel: r, full: fullSrc(r) })).filter((x) => x.full);
  if (!imgs.length) { warn(`skipped (no usable image): ${it.title || '(untitled)'}`); continue; }
  if (it.category && !catIds.has(it.category)) warn(`unknown category "${it.category}" on ${it.title || '(untitled)'}`);
  if (it.recent && !parseDate(it.date)) warn(`not shown in Recent Work (needs a real "date" like 2026-10): ${it.title || '(untitled)'}`);
  items.push({ ...it, imgs, dt: fmtDate(it.date) });
}
const gallery = items.filter((i) => catIds.has(i.category));
const recent = items.filter((i) => i.recent && parseDate(i.date)).sort((a, b) => parseDate(b.date).t - parseDate(a.date).t).slice(0, Math.min(12, works.recentLimit || 12));
const all = [...gallery, ...recent];          // index in this list = data-i in the page
const idxG = new Map(gallery.map((it, i) => [it, i]));
const idxR = new Map(recent.map((it, i) => [it, gallery.length + i]));

const thumbSizes = '(min-width:1000px) 30vw, (min-width:701px) 45vw, 76vw';
const altOf = (it) => it.alt || it.title || '3D artwork by kaiotu';
const arrow = (d) => `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`;
const VISIBLE = 6; // cards shown in full (3 per row, 2 rows); more than this shows a faded peek of the next row and "View all"
const shelfCats = [...works.categories, { id: 'all', name: 'All' }];   // "All" = every gallery piece (never the Recent-only items)
const firstShown = Math.max(0, shelfCats.findIndex((c) => (c.id === 'all' ? gallery : gallery.filter((i) => i.category === c.id)).length > 0));   // open on the first category that has pieces
const catHtml = shelfCats.map((c, ci) => {
  const list = c.id === 'all' ? gallery : gallery.filter((i) => i.category === c.id);
  const lis = list.length
    ? list.map((it) => `<li class="item"><button type="button" class="thumb" data-i="${idxG.get(it)}" aria-label="View ${esc(it.title || 'artwork')}${it.imgs.length > 1 ? ` (${it.imgs.length} images)` : ''}">${picture(it.imgs[0].rel, { sizes: thumbSizes, alt: altOf(it) })}</button>${it.title ? `<p class="cap">${esc(it.title)}</p>` : ''}</li>`).join('')
    : '<li class="rempty"><div><b>No creations yet.</b><br>New projects will appear here soon.</div></li>';
  const more = list.length > VISIBLE
    ? `<div class="more"><button type="button" class="viewall" aria-expanded="false">View all (${list.length})</button></div>` : '';
  return `<div class="cat" data-cat="${c.id}" data-n="${list.length}" data-vis="${VISIBLE}"${ci !== firstShown ? ' hidden' : ''}><div class="gw"><ul class="row">${lis}</ul></div>${more}</div>`;
}).join('');
const tabsHtml = shelfCats.map((c, ci) => `<button type="button" role="tab" data-cat="${c.id}" aria-selected="${ci === firstShown}">${esc(c.name)}</button>`).join('');

const recentLi = (it, hidden) => { const p = parseDate(it.date); return `<li${hidden ? ' aria-hidden="true" data-clone inert' : ''}><button type="button" class="thumb" data-i="${idxR.get(it)}"${hidden ? ' tabindex="-1"' : ''} aria-label="View ${esc(it.title || 'artwork')}, ${esc(it.dt)}">${picture(it.imgs[0].rel, { sizes: '200px', alt: hidden ? '' : altOf(it) })}</button><p class="cap"><span>${esc(it.title || '')}</span><time class="rel" datetime="${esc(it.date)}" data-t="${p.t}" data-p="${p.prec}" title="${esc(it.dt)}">${esc(it.dt)}</time></p></li>`; };
const recentHtml = recent.length
  ? `<div class="stripwrap"><div class="strip" id="strip" tabindex="0" role="region" aria-label="Recent work, scrolls sideways"><ul>${recent.map((it) => recentLi(it, false)).join('')}</ul></div></div>`
  
  : `<div class="rempty"><p><strong>No creations yet.</strong></p><p>New projects will appear here soon.</p></div>`;

/* ---------- contributions (order always follows contributions.json) ---------- */
const byId = new Map(cache.items.map((e) => [String(e.id), e]));
const xHtml = contrib.experiences.map(({ id, note }) => {
  const e = byId.get(String(id));
  const ok = !!(e && e.resolved);
  const thumb = ok && e.thumb ? `<img src="${esc(e.thumb)}" width="768" height="432" alt="" loading="lazy" decoding="async">` : `<div class="ph">Thumbnail</div>`;
  const open = ok ? `<a class="card" href="${esc(e.url)}" target="_blank" rel="noopener">` : '<a class="card">';
  return `<li class="x" data-id="${id}" data-ok="${ok ? 1 : 0}">${open}<div class="im">${thumb}</div><h3>${ok ? esc(e.name) : 'Roblox experience'}</h3><p class="vis">${ok && typeof e.visits === 'number' ? nf.format(e.visits) + ' Visits' : ''}</p><span class="go"${ok ? '' : ' hidden'}>View Experience ↗</span></a>${note ? `<p class="note">${esc(note)}</p>` : ''}</li>`;
}).join('');

/* ---------- misc sections ---------- */
const c = site.contact;
const dHandle = c.discord.handle || c.discord, dUrl = c.discord.url || '', dApp = c.discord.appUrl || '';
const dAttr = dApp ? ` data-app="${esc(dApp)}"` : '';
const contactRows = `<li><span>Twitter / X</span><a href="${esc(c.x.url)}" target="_blank" rel="noopener me">${esc(c.x.handle)}</a><span></span></li><li><span>Discord</span><span class="dv">${esc(dHandle)}</span><button type="button" class="copy" data-copy="${esc(dHandle)}" aria-label="Copy Discord username ${esc(dHandle)}">Copy</button></li><li><span>Email</span><a href="mailto:${esc(c.email)}">${esc(c.email)}</a><span></span></li>`;
const photo = site.photo && manifest[site.photo]
  ? picture(site.photo, { sizes: '(min-width:761px) 40vw, 420px', alt: site.photoAlt, eager: true })
  : `<div class="ph">Placeholder<br>Your portrait goes here<br><small>set "photo" in content/site.json</small></div>`;
const eventsHtml = site.events.map((e) => `<li><h4>${esc(e.name)}</h4><span class="y">${esc(e.year)}</span><span class="s">${esc(e.status)}</span></li>`).join('');
const stylesLine = site.styles.map(esc).join(' · ');

const ld = {
  preview: PREV,
  items: all.map((it) => ({ t: it.title || '', d: it.description || '', s: it.software || '', dt: it.dt, imgs: it.imgs.map((x) => ({ ...x.full, alt: altOf(it) })) })),
  expUpdated: cache.updated || 0,
};
const ogImg = origin && all[0] ? `${origin}/${all[0].imgs[0].full.src}` : '';

const css = (await readFile('src/styles.css', 'utf8')).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s*([{}:;,>])\s*/g, '$1').replace(/;}/g, '}').trim();
const js = await readFile('src/app.js', 'utf8');
const year = new Date().getFullYear();
const svgX = '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>';
const svgDc = '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M20.317 4.37a19.79 19.79 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 00-5.487 0 12.64 12.64 0 00-.617-1.25.077.077 0 00-.079-.037A19.74 19.74 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 00.031.057 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 00-.041-.106 13.1 13.1 0 01-1.872-.892.077.077 0 01-.008-.128c.126-.094.252-.192.372-.292a.074.074 0 01.078-.01c3.928 1.793 8.18 1.793 12.061 0a.074.074 0 01.079.009c.12.099.246.198.373.293a.077.077 0 01-.006.127 12.3 12.3 0 01-1.873.892.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028 19.84 19.84 0 006.002-3.03.077.077 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.06.06 0 00-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/></svg>';
const svgMail = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg>';
const ico = (d, extra = '') => `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"${extra}>${d}</svg>`;

const html = `<!doctype html>
<html lang="en" data-theme="dark">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(site.title)}</title>
<meta name="description" content="${esc(site.description)}">
<meta name="theme-color" content="#ffffff">
<meta name="color-scheme" content="dark light">
<script>try{var t=localStorage.getItem('kt-theme')}catch(e){}if(t!=='light'&&t!=='dark')t=matchMedia('(prefers-color-scheme:light)').matches?'light':'dark';document.documentElement.dataset.theme=t</script>
<link rel="icon" href="favicon.svg" type="image/svg+xml">
${origin ? `<link rel="canonical" href="${origin}/">` : '<!-- canonical: set "url" in content/site.json once the domain is known -->'}
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(site.title)}">
<meta property="og:description" content="${esc(site.description)}">
${origin ? `<meta property="og:url" content="${origin}/">` : ''}
${ogImg ? `<meta property="og:image" content="${ogImg}"><meta name="twitter:card" content="summary_large_image">` : '<meta name="twitter:card" content="summary">'}
<style>${css}</style>
</head>
<body>
<a class="skip" href="#work">Skip to work</a>
<header class="hdr"><div class="wrap">
<a class="logo" href="#home" aria-label="kaiotu, home">${esc(site.name)}</a>
<div class="r">
<button type="button" class="ibtn" id="theme" aria-label="Switch theme"><span class="sun">${ico('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>')}</span><span class="moon">${ico('<path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z"/>')}</span></button>
<button type="button" class="ibtn" id="contact-btn" aria-label="Contact" aria-expanded="false" aria-controls="cpanel">${ico('<rect x="3" y="5" width="18" height="14" rx="1"/><path d="M3 7l9 6 9-6"/>')}</button>
<button type="button" class="ibtn burger" id="burger" aria-label="Open menu" aria-expanded="false" aria-controls="menu"><span><i></i><i></i></span></button>
</div>
</div></header>

<div class="cpanel" id="cpanel" role="dialog" aria-label="Contact" inert>
<div class="cp-h"><span>Contact</span><button type="button" class="ibtn" id="cp-close" aria-label="Close contact panel">${ico('<path d="M5 5l14 14M19 5L5 19"/>')}</button></div>
<ul class="clist">${contactRows}</ul>
</div>
<p class="sr" id="live" aria-live="polite"></p>

<div class="scrim" id="scrim"></div>
<aside class="menu" id="menu" aria-label="Menu">
<div class="menu-top"><span class="logo">${esc(site.name)}</span><button type="button" class="ibtn" id="menu-close" aria-label="Close menu">${ico('<path d="M5 5l14 14M19 5L5 19"/>')}</button></div>
<nav><a href="#home">Home</a><a href="#work">Work</a><a href="#contributions">Contributions</a><a href="#about">About</a><a href="#contact" data-open-contact>Contact</a></nav>
<p class="sub"><a href="#recent"><span class="dot" aria-hidden="true"></span>Recent Work</a></p>
</aside>

<main>
<section id="home" class="hero"><div class="wrap hero-grid">
<div class="hero-t">
<h1>${esc(site.name)}</h1>
<p class="lead">${esc(site.tagline)}</p>
<p class="intro">${esc(site.intro)}</p>
<p class="styles">${stylesLine}</p>
<div class="actions"><a class="btn" href="#work">Explore My Work</a><a class="lnk" href="#contributions">Contributions</a></div>
</div>
<div class="portrait">${photo}</div>
</div></section>

<section id="work" class="alt"><div class="wrap">
<div class="sec-head"><h2>Work. <span class="g">Selected pieces across every style.</span></h2></div>
<div class="tabs" role="tablist" aria-label="Categories">${tabsHtml}</div>
${catHtml}
</div></section>

<section id="recent" class="recent"><div class="wrap">
<div class="sec-head"><h2>Recent Work</h2><div class="rtools" id="rtools" hidden><button type="button" class="rarrow" id="rprev" aria-label="Previous" hidden>${arrow('M15 5l-7 7 7 7')}</button><button type="button" class="rarrow" id="rnext" aria-label="Next" hidden>${arrow('M9 5l7 7-7 7')}</button><button type="button" class="pause" id="rpause" aria-pressed="false" aria-label="Pause automatic scrolling">Pause</button></div></div>
${recentHtml}
</div></section>

<section id="contributions" class="alt"><div class="wrap">
<div class="sec-head"><h2>Contributions. <span class="g">Roblox experiences I\u2019ve contributed to.</span></h2></div>
<ul class="xgrid">${xHtml}</ul>
</div></section>

<section id="about"><div class="wrap">
<div class="sec-head"><h2>About Me</h2></div>
<div class="about">
<div class="t">${site.about.map((p) => `<p>${esc(p)}</p>`).join('')}</div>
<div>
<h3>Areas of work</h3>
<ul class="skills">${site.skills.map((x) => `<li>${esc(typeof x === 'string' ? x : x.title)}</li>`).join('')}</ul>
<div class="ev"><h3>Events &amp; participation</h3><ul>${eventsHtml}</ul></div>
</div>
</div>
</div></section>
</main>

<footer id="contact" class="alt"><div class="wrap">
<p class="big">${esc(site.closing)}</p>
<div class="actions">${dUrl ? `<a class="btn" href="${esc(dUrl)}" target="_blank" rel="noopener"${dAttr}>Let\u2019s connect</a>` : `<button type="button" class="btn copy" data-copy="${esc(dHandle)}" data-done="Copied ${esc(dHandle)}">Let\u2019s connect</button>`}</div>
<ul class="icons" aria-label="Contact links"><li><a href="${esc(c.x.url)}" target="_blank" rel="noopener me" aria-label="X ${esc(c.x.handle)}">${svgX}</a></li><li>${dUrl ? `<a href="${esc(dUrl)}" target="_blank" rel="noopener"${dAttr} aria-label="Discord ${esc(dHandle)}">${svgDc}</a>` : `<button type="button" class="copy" data-copy="${esc(dHandle)}" aria-label="Copy Discord username ${esc(dHandle)}">${svgDc}</button>`}</li><li><a href="mailto:${esc(c.email)}" aria-label="Email ${esc(c.email)}">${svgMail}</a></li></ul>
<p class="fine">© ${year} ${esc(site.name)}</p>
</div></footer>

<dialog id="viewer" aria-label="Image viewer"><div class="v">
<div class="v-top"><span id="v-count" class="v-count"></span><button type="button" class="round" id="v-close" aria-label="Close viewer">${ico('<path d="M5 5l14 14M19 5L5 19"/>')}</button></div>
<div class="v-stage" id="v-stage"><img id="v-img" alt="" draggable="false"><button type="button" class="vnav l" id="v-prev" aria-label="Previous image">${ico('<path d="M15 5l-7 7 7 7"/>').replace('width="20" height="20"', 'width="26" height="26"').replace('stroke-width="1.8"', 'stroke-width="2.2"')}</button><button type="button" class="vnav r" id="v-next" aria-label="Next image">${ico('<path d="M9 5l7 7-7 7"/>').replace('width="20" height="20"', 'width="26" height="26"').replace('stroke-width="1.8"', 'stroke-width="2.2"')}</button></div>
<div class="v-bot"><p class="v-meta" id="v-meta"></p><p class="v-hint">Tap or pinch to zoom \u00b7 drag to move</p></div>
</div></dialog>
<script type="application/json" id="data">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>
<script>${js}</script>
</body>
</html>`;

await mkdir('dist', { recursive: true });
await writeFile('dist/index.html', html);
for (const f of existsSync('static') ? await readdir('static') : []) await copyFile(`static/${f}`, `dist/${f}`);
await writeFile('dist/robots.txt', `User-agent: *\nAllow: /\n${origin ? `Sitemap: ${origin}/sitemap.xml\n` : ''}`);
if (origin) await writeFile('dist/sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${origin}/</loc></url></urlset>\n`);
else warn('site.url is empty: sitemap.xml, canonical and og:url skipped until you set it');
const resolved = contrib.experiences.filter(({ id }) => byId.get(String(id))?.resolved).length;
console.log(`built dist/index.html (${(html.length / 1024).toFixed(1)} KB) — ${gallery.length} gallery item(s), ${recent.length} recent, ${resolved}/${contrib.experiences.length} experiences resolved`);
