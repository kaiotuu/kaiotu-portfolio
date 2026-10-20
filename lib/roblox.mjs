// Resolves Roblox experience IDs -> name, visits, thumbnail, correct URL.
// Shared by the build script and the optional Cloudflare edge function.
// Output order always matches the input order. Nothing is invented: IDs that
// cannot be resolved stay { resolved:false }.
//
// Findings (checked against the supplied IDs): they are UNIVERSE IDs.
//   GET apis.roblox.com/universes/v1/places/<id>/universe  -> {"universeId":null} for them
//   GET games.roblox.com/v1/games?universeIds=...          -> name, visits, rootPlaceId
//   GET thumbnails.roblox.com/v1/games/multiget/thumbnails -> 16:9 cover images
// So universe lookup goes first; the place->universe step is only a fallback
// for IDs that turn out to be place IDs. The link uses rootPlaceId.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const getJSON = async (url, f) => {
  const r = await f(url, { headers: { accept: 'application/json' } });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json();
};
const safe = async (p) => { try { return await p; } catch { return null; } };
// Roblox answers some unavailable games with id 0 / "[TITLE UNAVAILABLE]".
const bad = (g) => !g || !g.id || String(g.id) === '0' || /\[TITLE UNAVAILABLE\]/i.test(g.name || '');

async function games(ids, f) {
  const out = new Map();
  if (!ids.length) return out;
  const d = await safe(getJSON(`https://games.roblox.com/v1/games?universeIds=${ids.join(',')}`, f));
  for (const g of (d && d.data) || []) if (!bad(g)) out.set(String(g.id), g);
  return out;
}

export async function resolveExperiences(rawIds, f = fetch, { retries = 1, delay = 1200 } = {}) {
  const ids = rawIds.map(String);
  const gameBy = new Map();

  // 1. Universe lookup (with one retry for transient failures / rate limits).
  let pending = ids;
  for (let a = 0; a <= retries && pending.length; a++) {
    if (a) await sleep(delay);
    (await games(pending, f)).forEach((g, k) => gameBy.set(k, g));
    pending = ids.filter((i) => !gameBy.has(i));
  }

  // 2. Fallback: maybe the ID is a place ID.
  const viaPlace = new Map();
  await Promise.all(pending.map(async (id) => {
    const d = await safe(getJSON(`https://apis.roblox.com/universes/v1/places/${id}/universe`, f));
    if (d && d.universeId) viaPlace.set(id, String(d.universeId));
  }));
  if (viaPlace.size) (await games([...viaPlace.values()], f)).forEach((g, k) => gameBy.set(k, g));
  const uni = (id) => (gameBy.has(id) ? id : viaPlace.get(id));

  // 3. Thumbnails for what resolved: wide covers first, square icons as fallback.
  const found = [...new Set(ids.map(uni).filter((u) => u && gameBy.has(u)))];
  const list = found.join(',');
  const covers = found.length && await safe(getJSON(`https://thumbnails.roblox.com/v1/games/multiget/thumbnails?universeIds=${list}&countPerUniverse=1&defaults=false&size=768x432&format=Webp&isCircular=false`, f));
  const coverBy = new Map(((covers && covers.data) || []).map((c) => [String(c.universeId), (c.thumbnails || []).find((t) => t.state === 'Completed')]));
  const icons = found.length && await safe(getJSON(`https://thumbnails.roblox.com/v1/games/icons?universeIds=${list}&returnPolicy=PlaceHolder&size=256x256&format=Webp&isCircular=false`, f));
  const iconBy = new Map(((icons && icons.data) || []).map((i) => [String(i.targetId), i.state === 'Completed' ? i : null]));

  return ids.map((id) => {
    const u = uni(id);
    const g = u && gameBy.get(u);
    if (!g || !g.rootPlaceId) return { id, resolved: false };
    const cover = coverBy.get(u), icon = iconBy.get(u);
    return {
      id,
      resolved: true,
      universeId: u,
      placeId: String(g.rootPlaceId),
      name: String(g.name).trim(),
      visits: typeof g.visits === 'number' ? g.visits : Number.isFinite(+g.visits) ? +g.visits : null,
      thumb: (cover && cover.imageUrl) || (icon && icon.imageUrl) || null,
      thumbKind: cover ? 'cover' : icon ? 'icon' : null,
      url: `https://www.roblox.com/games/${g.rootPlaceId}`,
    };
  });
}
