import fs from 'node:fs';
import path from 'node:path';
import { currentPlayer } from './_lib.js';

export default async function handler(req, res) {
  const p = await currentPlayer(req);
  if (!p || p.banned) { res.statusCode = 302; res.setHeader('Location', '/'); return res.end(); }
  const html = fs.readFileSync(path.join(process.cwd(), 'game/game.html'), 'utf8');
  const me = JSON.stringify({ name: p.name, owner: !!p.owner }).replace(/</g, '\\u003c');
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.setHeader('Cache-Control', 'no-store');
  res.end(html.replace('<head>', () => `<head><script>window.AS_PLAYER=${me}</script>`));
}
