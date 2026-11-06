import { db, OWNER, hash, newKey, same, ownerPassword, configured, inviteCode, send, readBody, setSession } from './_lib.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'Not allowed.' });
  if (!configured()) return send(res, 500, { error: 'The server is not set up yet.' });
  const b = await readBody(req);
  const name = String(b.name || '').trim(), lower = name.toLowerCase();
  if (!/^[A-Za-z0-9_]{3,16}$/.test(name)) return send(res, 400, { error: 'Use 3 to 16 letters, numbers or underscores.' });
  const existing = await db.get('player:' + lower);

  if (lower === OWNER) {
    if (!same(b.password || '', ownerPassword())) return send(res, 403, { error: 'That username is reserved.', needPassword: true });
    const key = newKey();
    await db.set('player:' + lower, { name: 'Honk', lower, hash: hash(key), banned: false, created: existing ? existing.created : Date.now(), owner: true });
    setSession(res, lower, key);
    return send(res, 200, { name: 'Honk' });
  }

  if (existing) {
    if (!b.key) return send(res, 409, { error: 'That username is taken. If it is yours, use your login key.', taken: true });
    if (!same(existing.hash, hash(String(b.key).trim().toUpperCase()))) return send(res, 403, { error: 'Wrong login key.' });
    if (existing.banned) return send(res, 403, { error: 'This account is banned.', banned: true });
    setSession(res, lower, String(b.key).trim().toUpperCase());
    return send(res, 200, { name: existing.name });
  }

  const code = await inviteCode();
  if (!code || !same(String(b.invite || '').trim().toLowerCase(), code.trim().toLowerCase())) return send(res, 403, { error: 'Wrong invite code.' });
  const key = newKey();
  const ok = await db.add('player:' + lower, { name, lower, hash: hash(key), banned: false, created: Date.now() });
  if (!ok) return send(res, 409, { error: 'That username was just taken.', taken: true });
  setSession(res, lower, key);
  return send(res, 200, { name, key });
}
