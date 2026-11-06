import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { currentPlayer } from './_lib.js';

const here = path.dirname(fileURLToPath(import.meta.url));

function loadGame() {
  const places = [
    fileURLToPath(new URL('../game/game.html', import.meta.url)),
    path.join(here, '..', 'game', 'game.html'),
    path.join(process.cwd(), 'game', 'game.html'),
    path.join(process.cwd(), 'aftershock', 'game', 'game.html'),
  ];
  for (const f of places) if (fs.existsSync(f)) return fs.readFileSync(f, 'utf8');
  throw new Error('game.html not found. Looked in: ' + places.join(' , '));
}

export default async function handler(req, res) {
  try {
    const p = await currentPlayer(req);
    if (!p || p.banned) { res.statusCode = 302; res.setHeader('Location', '/'); return res.end(); }
    const html = loadGame();
    const me = JSON.stringify({ name: p.name, owner: !!p.owner }).replace(/</g, '\\u003c');
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.setHeader('Cache-Control', 'no-store');
    res.end(html.replace('<head>', () => `<head><script>window.AS_PLAYER=${me}</script>`));
  } catch (err) {
    res.statusCode = 500; res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.end('AFTERSHOCK server error: ' + err.message);
  }
}
