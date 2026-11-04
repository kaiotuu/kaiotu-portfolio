// Login for /analytics: user + password from two Cloudflare secrets (ANALYTICS_USER, ANALYTICS_PASSWORD).
// Session = signed cookie (HttpOnly, Secure, SameSite=Strict, 12 h). Wrong logins are rate limited per IP (hashed).
const enc = new TextEncoder();
const hex = (u8) => [...u8].map((b) => b.toString(16).padStart(2, '0')).join('');
const hmac = async (key, msg) => {
  const k = await crypto.subtle.importKey('raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, enc.encode(msg)));
};
const same = (a, b) => { if (a.length !== b.length) return false; let r = 0; for (let i = 0; i < a.length; i++) r |= a[i] ^ b[i]; return r === 0; };
const FIXED = 'kaiotu-analytics-v1';
export const COOKIE = '__Host-kt_a';
export const configured = (env) => !!(env.ANALYTICS_USER && env.ANALYTICS_PASSWORD && String(env.ANALYTICS_PASSWORD).length >= 10);
const signKey = (env) => `${env.ANALYTICS_USER}\u0000${env.ANALYTICS_PASSWORD}\u0000session`;

export async function checkCreds(env, user, pass) {
  const [a, b, c, d] = await Promise.all([hmac(FIXED, String(user)), hmac(FIXED, String(env.ANALYTICS_USER)), hmac(FIXED, String(pass)), hmac(FIXED, String(env.ANALYTICS_PASSWORD))]);
  const x = same(a, b), y = same(c, d);
  return x && y;
}
export async function makeToken(env, hours = 12) {
  const exp = Date.now() + hours * 36e5;
  return `${exp}.${hex(await hmac(signKey(env), `v1.${exp}`))}`;
}
export async function verifyToken(env, token) {
  if (!token || !configured(env)) return false;
  const [exp, sig] = String(token).split('.');
  if (!/^\d{10,15}$/.test(exp || '') || !/^[a-f0-9]{64}$/.test(sig || '') || Number(exp) < Date.now()) return false;
  return same(await hmac(signKey(env), `v1.${exp}`), Uint8Array.from(sig.match(/../g).map((h) => parseInt(h, 16))));
}
export const readCookie = (request, name) => {
  const h = request.headers.get('cookie') || '';
  for (const part of h.split(';')) { const i = part.indexOf('='); if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim(); }
  return '';
};
export const sessionCookie = (token, maxAge = 12 * 3600) => `${COOKIE}=${token}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Strict`;
export const ipKey = async (env, request) => hex(await hmac(signKey(env), `ip.${request.headers.get('cf-connecting-ip') || 'x'}`)).slice(0, 24);

export const LIMIT = 5, WINDOW = 15 * 60e3;
export async function tooMany(env, key) {
  const r = await env.DB.prepare(`SELECT COUNT(*) c FROM auth_fail WHERE k=? AND ts>?`).bind(key, Date.now() - WINDOW).first();
  return (r && r.c) >= LIMIT;
}
export const addFail = (env, key) => env.DB.prepare(`INSERT INTO auth_fail(k,ts) VALUES(?,?)`).bind(key, Date.now()).run();
export const clearFails = (env, key) => env.DB.prepare(`DELETE FROM auth_fail WHERE k=?`).bind(key).run();
