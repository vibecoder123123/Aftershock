import { db, OWNER, same, ownerPassword, configured, inviteCode, send, readBody } from './_lib.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'Not allowed.' });
  if (!configured()) return send(res, 500, { error: 'The server is not set up yet.' });
  const b = await readBody(req);
  if (!same(b.password || '', ownerPassword())) { await new Promise(r => setTimeout(r, 700)); return send(res, 403, { error: 'Wrong password.' }); }
  const key = 'player:' + String(b.name || '').toLowerCase();
  if (['ban', 'unban', 'remove'].includes(b.action)) {
    if (String(b.name || '').toLowerCase() === OWNER) return send(res, 400, { error: 'You cannot ban yourself.' });
    const p = await db.get(key); if (!p) return send(res, 404, { error: 'Player not found.' });
    if (b.action === 'remove') await db.del(key); else await db.set(key, { ...p, banned: b.action === 'ban' });
  }
  if (b.action === 'invite') {
    const code = String(b.code || '').trim();
    if (code.length < 3 || code.length > 40) return send(res, 400, { error: 'Use 3 to 40 characters.' });
    await db.set('setting:invite', code);
  }
  const players = (await db.list('player:')).map(p => ({ name: p.name, banned: !!p.banned, created: p.created, owner: !!p.owner })).sort((x, y) => x.created - y.created);
  return send(res, 200, { players, invite: await inviteCode() });
}
