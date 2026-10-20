// Optional Cloudflare Pages Function: GET /api/experiences
// Resolves the Roblox experiences server-side (no keys needed) and caches the
// result at the edge for 6 hours, so visitors never trigger a slow Roblox call.
import list from '../../content/contributions.json';
import { resolveExperiences } from '../../lib/roblox.mjs';

export async function onRequestGet({ request, waitUntil }) {
  const cache = caches.default;
  const key = new Request(new URL('/api/experiences', request.url).toString());
  const hit = await cache.match(key);
  if (hit) return hit;
  const items = await resolveExperiences(list.experiences.map((e) => e.id));
  const res = new Response(JSON.stringify({ updated: Date.now(), items }), {
    headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=3600, s-maxage=21600' },
  });
  if (items.some((i) => i.resolved)) waitUntil(cache.put(key, res.clone()));
  return res;
}
