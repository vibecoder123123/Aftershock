import { currentPlayer, markSeen, send, db, gameVersion } from './_lib.js';

export default async function handler(req, res) {
  const p = await currentPlayer(req);
  if (!p) return send(res, 200, { in: false });
  if (p.kicked) return send(res, 200, { in: false, kicked: true });
  const u = new URL(req.url || '/', 'http://x');
  if (u.searchParams.get('ping') === '1') {
    const st = { ch: +u.searchParams.get('ch') || 0, score: +u.searchParams.get('score') || 0, dt: +u.searchParams.get('dt') || 0 };
    await markSeen(p.lower, st).catch(() => {});
  }
  const announce = await db.get('setting:announce').catch(() => null);
  return send(res, 200, { in: !p.banned, banned: !!p.banned, name: p.name, owner: !!p.owner, announce, ver: gameVersion() });
}
