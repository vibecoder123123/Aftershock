import { currentPlayer, loadGame } from './_lib.js';

export default async function handler(req, res) {
  try {
    const p = await currentPlayer(req);
    if (!p || p.banned || p.kicked) { res.statusCode = 302; res.setHeader('Location', '/'); return res.end(); }
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
