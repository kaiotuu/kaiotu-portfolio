// A tiny stand-in for Cloudflare D1 built on Node's sqlite, only used by the local tests (npm run analytics:test).
import { DatabaseSync } from 'node:sqlite';
export function makeD1() {
  const db = new DatabaseSync(':memory:');
  const clean = (a) => a.map((v) => (v === undefined ? null : v));
  const stmt = (sql, args = []) => ({
    sql, args,
    bind(...a) { return stmt(sql, clean(a)); },
    async all() { return { results: db.prepare(sql).all(...args), success: true }; },
    async first() { return db.prepare(sql).get(...args) || null; },
    async run() { const r = db.prepare(sql).run(...args); return { success: true, meta: { changes: r.changes } }; },
  });
  return {
    raw: db,
    prepare: (sql) => stmt(sql),
    async batch(list) { const out = []; db.exec('BEGIN'); try { for (const s of list) out.push(await s.run()); db.exec('COMMIT'); } catch (e) { db.exec('ROLLBACK'); throw e; } return out; },
  };
}
