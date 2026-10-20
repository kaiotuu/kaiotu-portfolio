// node scripts/roblox.mjs [--soft]  -> writes content/roblox-cache.json
// `npm run build` runs this with --soft: if Roblox is unreachable the build
// continues with the previous cache. Entries that fail to refresh keep their
// last known good data; nothing is ever made up.
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolveExperiences } from '../lib/roblox.mjs';

const soft = process.argv.includes('--soft');
const { experiences } = JSON.parse(await readFile('content/contributions.json', 'utf8'));
const path = 'content/roblox-cache.json';
const prev = existsSync(path) ? JSON.parse(await readFile(path, 'utf8')) : { updated: 0, items: [] };
const prevBy = new Map(prev.items.map((i) => [String(i.id), i]));

const fresh = await resolveExperiences(experiences.map((e) => e.id));
const items = fresh.map((n) => (n.resolved ? n : (prevBy.get(n.id)?.resolved ? { ...prevBy.get(n.id), stale: true } : n)));
items.forEach((i) => console.log(i.id, i.resolved ? `${i.name} — ${i.visits ?? 'no visits'} visits${i.stale ? ' (kept from previous cache)' : ''}` : 'NOT RESOLVED'));

if (fresh.some((n) => n.resolved)) {
  await writeFile(path, JSON.stringify({ updated: Date.now(), items }, null, 2));
  console.log('wrote', path);
} else {
  console.warn('Roblox unreachable or nothing resolved; cache left unchanged.');
  if (!soft) process.exit(1);
}
