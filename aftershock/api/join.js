import { db, OWNER, same, ownerPassword, configured, inviteCode, send, readBody, setSession, checkPass, newPass } from './_lib.js';

const wait = ms => new Promise(r => setTimeout(r, ms));

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'Not allowed.' });
  if (!configured()) return send(res, 500, { error: 'The server is not set up yet.' });
  const b = await readBody(req);
  const name = String(b.name || '').trim(), lower = name.toLowerCase(), pw = String(b.password || '');
  if (!/^[A-Za-z0-9_]{3,16}$/.test(name)) return send(res, 400, { error: 'Player tags use 3 to 16 letters, numbers or underscores.' });
  const existing = await db.get('player:' + lower);

  if (lower === OWNER) {
    if (!same(pw, ownerPassword())) { await wait(700); return send(res, 403, { error: b.mode === 'create' ? 'That tag is reserved.' : 'Wrong password.' }); }
    const p = { ...(existing || {}), name: 'Honk', lower, banned: false, created: existing ? existing.created : Date.now(), owner: true };
    await db.set('player:' + lower, p);
    setSession(res, p);
    return send(res, 200, { name: 'Honk' });
  }

  if (b.mode !== 'create') {
    if (!existing) { await wait(500); return send(res, 404, { error: 'No account with that tag. Create one instead?', noAccount: true }); }
    if (!checkPass(existing, pw)) { await wait(700); return send(res, 403, { error: 'Wrong password.' }); }
    if (existing.banned) return send(res, 403, { error: 'This account is banned.', banned: true });
    setSession(res, existing);
    return send(res, 200, { name: existing.name });
  }

  if (existing) return send(res, 409, { error: 'That tag is taken. Pick another, or sign in if it is yours.', taken: true });
  if (pw.length < 4 || pw.length > 64) return send(res, 400, { error: 'Pick a password with at least 4 characters.' });
  const code = await inviteCode();
  if (!code || !same(String(b.invite || '').trim().toLowerCase(), code.trim().toLowerCase())) { await wait(500); return send(res, 403, { error: 'Wrong invite code.' }); }
  const p = { name, lower, ...newPass(pw), banned: false, created: Date.now() };
  if (!(await db.add('player:' + lower, p))) return send(res, 409, { error: 'That tag was just taken.', taken: true });
  setSession(res, p);
  return send(res, 200, { name });
}
