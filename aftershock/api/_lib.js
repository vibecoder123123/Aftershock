// Shared server code. Files starting with _ are not public routes.
import crypto from 'node:crypto';

const REDIS_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const SQL_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL;

// No database? Player data can live in one file in a private GitHub repo.
const GH_REPO = process.env.GITHUB_REPO, GH_TOKEN = process.env.GITHUB_TOKEN;
const GH_API = process.env.GITHUB_API_URL || 'https://api.github.com';
const GH_FILE = `${GH_API}/repos/${GH_REPO}/contents/players.json`;
const ghHead = { Authorization: `Bearer ${GH_TOKEN}`, Accept: 'application/vnd.github+json', 'User-Agent': 'aftershock' };
let ghCache = null;
async function ghRead() {
  const r = await fetch(GH_FILE, { headers: { ...ghHead, ...(ghCache ? { 'If-None-Match': ghCache.etag } : {}) } });
  if (r.status === 304) return ghCache;
  if (r.status === 404) return { data: {}, sha: undefined, etag: '' };
  if (!r.ok) throw new Error(`GitHub storage error ${r.status}`);
  const j = await r.json();
  ghCache = { data: JSON.parse(Buffer.from(j.content, 'base64').toString('utf8') || '{}'), sha: j.sha, etag: r.headers.get('etag') || '' };
  return ghCache;
}
/** Changes the file safely: GitHub refuses the save if someone else saved first, so we retry. */
async function ghChange(fn) {
  for (let i = 0; i < 8; i++) {
    const cur = await ghRead(), data = structuredClone(cur.data), result = fn(data);
    if (result === false) return false;
    const r = await fetch(GH_FILE, {
      method: 'PUT', headers: { ...ghHead, 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'update players', content: Buffer.from(JSON.stringify(data)).toString('base64'), ...(cur.sha ? { sha: cur.sha } : {}) }),
    });
    if (r.ok) { ghCache = null; return true; }
    if (r.status !== 409 && r.status !== 422) throw new Error(`GitHub storage error ${r.status}`);
    ghCache = null; await new Promise(w => setTimeout(w, 80 + Math.random() * 220));
  }
  throw new Error('GitHub storage is busy');
}

async function redis(...cmd) {
  const r = await fetch(REDIS_URL, { method: 'POST', headers: { Authorization: `Bearer ${REDIS_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify(cmd) });
  const j = await r.json();
  if (j.error) throw new Error(j.error);
  return j.result;
}

let pool, ready;
async function sql(q, args) {
  if (!pool) {
    const { default: pg } = await import('pg');
    pool = new pg.Pool({ connectionString: SQL_URL, max: 2, ssl: /localhost|127\.0\.0\.1/.test(SQL_URL) ? false : { rejectUnauthorized: false } });
  }
  if (!ready) ready = pool.query('create table if not exists aftershock_kv (k text primary key, v jsonb not null)');
  await ready;
  return pool.query(q, args);
}

export const db = {
  async get(k) {
    if (GH_REPO) { const v = (await ghRead()).data[k]; return v === undefined ? null : v; }
    if (REDIS_URL) { const v = await redis('GET', k); return v === null ? null : JSON.parse(v); }
    const r = await sql('select v from aftershock_kv where k=$1', [k]); return r.rows[0] ? r.rows[0].v : null;
  },
  async set(k, v) {
    if (GH_REPO) return ghChange(d => { d[k] = v; });
    if (REDIS_URL) return redis('SET', k, JSON.stringify(v));
    return sql('insert into aftershock_kv(k,v) values($1,$2) on conflict(k) do update set v=$2', [k, JSON.stringify(v)]);
  },
  /** Saves only if the key is free. This is what stops duplicate usernames. */
  async add(k, v) {
    if (GH_REPO) return ghChange(d => { if (d[k] !== undefined) return false; d[k] = v; });
    if (REDIS_URL) return (await redis('SET', k, JSON.stringify(v), 'NX')) === 'OK';
    return (await sql('insert into aftershock_kv(k,v) values($1,$2) on conflict(k) do nothing', [k, JSON.stringify(v)])).rowCount === 1;
  },
  async del(k) {
    if (GH_REPO) return ghChange(d => { delete d[k]; });
    if (REDIS_URL) return redis('DEL', k);
    return sql('delete from aftershock_kv where k=$1', [k]);
  },
  async list(prefix) {
    if (GH_REPO) { const d = (await ghRead()).data; return Object.keys(d).filter(k => k.startsWith(prefix)).map(k => d[k]); }
    if (REDIS_URL) {
      const keys = []; let cur = '0';
      do { const [c, ks] = await redis('SCAN', cur, 'MATCH', prefix + '*', 'COUNT', 200); cur = c; keys.push(...ks); } while (cur !== '0');
      if (!keys.length) return [];
      return (await redis('MGET', ...keys)).filter(Boolean).map(v => JSON.parse(v));
    }
    return (await sql('select v from aftershock_kv where k like $1', [prefix + '%'])).rows.map(r => r.v);
  },
};

export const OWNER = 'honk';
export const hash = s => crypto.createHash('sha256').update(String(s)).digest('hex');
export const newKey = () => crypto.randomBytes(6).toString('hex').toUpperCase();
export function same(a, b) {
  const x = Buffer.from(hash(a)), y = Buffer.from(hash(b));
  return crypto.timingSafeEqual(x, y);
}
export const ownerPassword = () => process.env.ADMIN_PASSWORD || '';
export function configured() { return !!((GH_REPO && GH_TOKEN) || (REDIS_URL && REDIS_TOKEN) || SQL_URL) && !!ownerPassword(); }

export async function inviteCode() {
  return (await db.get('setting:invite')) || process.env.INVITE_CODE || '';
}
export function send(res, status, body) {
  res.statusCode = status; res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}
export async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  let raw = ''; for await (const c of req) { raw += c; if (raw.length > 5000) break; }
  try { return JSON.parse(raw || '{}'); } catch { return {}; }
}
export function setSession(res, lower, key) {
  res.setHeader('Set-Cookie', `as=${encodeURIComponent(lower + '.' + key)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=31536000`);
}
export async function currentPlayer(req) {
  const m = /(?:^|;\s*)as=([^;]+)/.exec(req.headers.cookie || ''); if (!m) return null;
  const [lower, key] = decodeURIComponent(m[1]).split('.'); if (!lower || !key) return null;
  const p = await db.get('player:' + lower);
  if (!p || !same(p.hash, hash(key))) return null;
  return p;
}
