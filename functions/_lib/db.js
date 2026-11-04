// D1 helpers. The tables are created on first use, so there is no SQL to paste anywhere.
const DDL = [
  `CREATE TABLE IF NOT EXISTS sessions(sid TEXT PRIMARY KEY,vid TEXT NOT NULL,ts INTEGER NOT NULL,last INTEGER NOT NULL,dur INTEGER DEFAULT 0,scroll INTEGER DEFAULT 0,country TEXT,region TEXT,device TEXT,browser TEXT,os TEXT,lang TEXT,scr TEXT,ref TEXT,utm_s TEXT,utm_m TEXT,utm_c TEXT,nv INTEGER DEFAULT 0,n INTEGER DEFAULT 0,inter INTEGER DEFAULT 0)`,
  `CREATE INDEX IF NOT EXISTS ix_s_ts ON sessions(ts)`,
  `CREATE INDEX IF NOT EXISTS ix_s_vid ON sessions(vid)`,
  `CREATE INDEX IF NOT EXISTS ix_s_last ON sessions(last)`,
  `CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY AUTOINCREMENT,ts INTEGER NOT NULL,sid TEXT NOT NULL,vid TEXT NOT NULL,t TEXT NOT NULL,a TEXT,b TEXT,n INTEGER DEFAULT 0)`,
  `CREATE INDEX IF NOT EXISTS ix_e_ts ON events(ts)`,
  `CREATE INDEX IF NOT EXISTS ix_e_sid ON events(sid)`,
  `CREATE INDEX IF NOT EXISTS ix_e_t ON events(t,a)`,
  `CREATE TABLE IF NOT EXISTS auth_fail(k TEXT NOT NULL,ts INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS ix_a_k ON auth_fail(k,ts)`,
];
let ready = null;
export const ensure = (env) => {
  if (!env || !env.DB) return null;
  return ready || (ready = env.DB.batch(DDL.map((s) => env.DB.prepare(s))).catch((e) => { ready = null; throw e; }));
};
export const resetForTests = () => { ready = null; };
