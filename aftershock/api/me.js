import { currentPlayer, send } from './_lib.js';

export default async function handler(req, res) {
  const p = await currentPlayer(req);
  if (!p) return send(res, 200, { in: false });
  return send(res, 200, { in: !p.banned, banned: !!p.banned, name: p.name, owner: !!p.owner });
}
