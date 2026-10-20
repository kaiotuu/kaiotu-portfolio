// node scripts/discord-sync.mjs
// Publishes portfolio creations from a Discord channel: image attachment + message text (= title).
// Runs server-side only (locally, or on a schedule in GitHub Actions). Secrets come from the environment:
//   DISCORD_BOT_TOKEN          bot token (needs "View Channel" + "Read Message History" on the channel,
//                              and the "Message Content" intent enabled in the developer portal)
//   DISCORD_CHANNEL_ID         the channel to watch
//   DISCORD_ALLOWED_AUTHOR_IDS comma-separated Discord user IDs allowed to publish (yours). Required.
//   DISCORD_BACKFILL=1         optional: on the very first run, import the existing messages too
//   DISCORD_API                optional base URL (used by tests)
// Output: source-images/discord/<messageId>-<n>.<ext> (permanent copy, kept in the repo) and
//         content/discord-posts.json (title, images, publication timestamp, ids, hashes).
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';

const API = process.env.DISCORD_API || 'https://discord.com/api/v10';
const { DISCORD_BOT_TOKEN: TOKEN, DISCORD_CHANNEL_ID: CH, DISCORD_ALLOWED_AUTHOR_IDS } = process.env;
const ALLOWED = new Set((DISCORD_ALLOWED_AUTHOR_IDS || '').split(',').map((s) => s.trim()).filter(Boolean));
const FILE = 'content/discord-posts.json', DIR = 'source-images/discord';
const MAX_BYTES = 12 * 1024 * 1024, MAX_MSGS = 200;
const TYPES = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };
const CDN = /^(cdn\.discordapp\.com|media\.discordapp\.net)$/;
const log = (...a) => console.log('[discord-sync]', ...a), err = (...a) => console.error('[discord-sync] ERROR', ...a);

if (!TOKEN || !CH) { log('DISCORD_BOT_TOKEN / DISCORD_CHANNEL_ID not set — nothing to do (feature not configured).'); process.exit(0); }
if (!ALLOWED.size) { err('DISCORD_ALLOWED_AUTHOR_IDS is empty. Refusing to publish messages from anyone.'); process.exit(1); }

const state = existsSync(FILE) ? JSON.parse(await readFile(FILE, 'utf8')) : { lastId: null, hashes: [], items: [] };
state.items ??= []; state.hashes ??= [];
const seen = new Set(state.items.map((i) => i.id));
const hashes = new Set(state.hashes);
const bigger = (a, b) => (BigInt(a) > BigInt(b) ? a : b);

const api = async (path) => {
  for (let i = 0; i < 3; i++) {
    const r = await fetch(API + path, { headers: { authorization: `Bot ${TOKEN}` } });
    if (r.status === 429) { await new Promise((s) => setTimeout(s, (+r.headers.get('retry-after') || 1) * 1000 + 100)); continue; }
    if (!r.ok) throw new Error(`Discord API ${r.status} for ${path.split('?')[0]}`);
    return r.json();
  }
  throw new Error('Discord API rate limited');
};

/* title = the message text, cleaned: mentions/urls/markdown removed, one line, max 120 chars */
const cleanTitle = (t) => (t || '').replace(/<[@#&!:][^>]*>/g, '').replace(/https?:\/\/\S+/g, '').replace(/[*_~`>|]/g, '').replace(/\s+/g, ' ').trim().slice(0, 120);

const isPng = (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
const isJpg = (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
const isWebp = (b) => b.slice(0, 4).toString() === 'RIFF' && b.slice(8, 12).toString() === 'WEBP';

async function fetchAll() {
  // first run: only record a baseline so old channel history is not published by surprise
  if (!state.lastId) {
    const latest = await api(`/channels/${CH}/messages?limit=${process.env.DISCORD_BACKFILL ? 100 : 1}`);
    if (!process.env.DISCORD_BACKFILL) {
      state.lastId = latest[0]?.id || '0'; log(`first run: baseline set at message ${state.lastId}; only newer posts will be published`);
      return [];
    }
    state.lastId = '0';
  }
  const out = []; let after = state.lastId;
  while (out.length < MAX_MSGS) {
    const page = await api(`/channels/${CH}/messages?limit=100&after=${after}`);
    if (!page.length) break;
    page.sort((a, b) => (BigInt(a.id) < BigInt(b.id) ? -1 : 1));
    out.push(...page); after = page[page.length - 1].id;
    if (page.length < 100) break;
  }
  return out;
}

async function handle(m) {
  if (seen.has(m.id)) return 'dup-message';
  if (!ALLOWED.has(m.author?.id)) return 'skipped: author not allowed';
  const title = cleanTitle(m.content);
  const atts = (m.attachments || []).filter((a) => TYPES[a.content_type?.split(';')[0]] || /\.(png|jpe?g|webp)$/i.test(a.filename || ''));
  if (!atts.length) return 'skipped: no supported image (png, jpg, webp)';
  if (!title) return 'skipped: message has no text, so no title (write the title in the message)';
  const files = [];
  for (const [n, a] of atts.entries()) {
    const u = new URL(a.url);
    if (!process.env.DISCORD_API && (u.protocol !== 'https:' || !CDN.test(u.hostname))) throw Object.assign(new Error(`unexpected attachment host ${u.hostname}`), { permanent: true });
    if (a.size > MAX_BYTES) { err(`message ${m.id}: "${a.filename}" is ${(a.size / 1048576).toFixed(1)} MB (limit ${MAX_BYTES / 1048576} MB), image skipped`); continue; }
    const r = await fetch(a.url);                       // network failure here throws -> retried on the next run
    if (!r.ok) throw new Error(`download ${r.status} for message ${m.id}`);
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > MAX_BYTES) { err(`message ${m.id}: file too large, skipped`); continue; }
    const ext = isPng(buf) ? 'png' : isJpg(buf) ? 'jpg' : isWebp(buf) ? 'webp' : null;
    if (!ext) { err(`message ${m.id}: "${a.filename}" is not a real png/jpg/webp, skipped`); continue; }
    const h = createHash('sha256').update(buf).digest('hex');
    if (hashes.has(h) || files.some((f) => f.h === h)) { log(`message ${m.id}: duplicate image ignored`); continue; }
    files.push({ buf, ext, h, n });
  }
  if (!files.length) return 'skipped: no valid new image';
  await mkdir(DIR, { recursive: true });
  const images = [];
  for (const f of files) {
    const name = `${m.id}-${f.n}.${f.ext}`;
    await writeFile(`${DIR}/${name}`, f.buf);          // stored here = independent of the Discord message/CDN
    images.push(`discord/${name}`); hashes.add(f.h);
  }
  state.items.push({ id: m.id, title, images, published: m.timestamp, author: m.author.id });
  seen.add(m.id);
  return `published "${title}" (${images.length} image${images.length > 1 ? 's' : ''})`;
}

let msgs;
try { msgs = await fetchAll(); } catch (e) { err(e.message); process.exit(1); }
let failed = false;
for (const m of msgs) {
  try { log(m.id, await handle(m)); state.lastId = bigger(state.lastId || '0', m.id); }
  catch (e) {
    if (e.permanent) { err(`message ${m.id}: ${e.message} (skipped for good)`); state.lastId = bigger(state.lastId || '0', m.id); }
    else { err(`message ${m.id}: ${e.message} — will retry on the next run`); failed = true; break; }   // keep order: stop here
  }
}
state.items.sort((a, b) => Date.parse(b.published) - Date.parse(a.published));
state.hashes = [...hashes];
await mkdir('content', { recursive: true });
await writeFile(FILE, JSON.stringify(state, null, 2) + '\n');
log(`done: ${state.items.length} post(s) stored`);
process.exit(failed ? 1 : 0);
