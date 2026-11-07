export default function handler(req, res) {
  res.setHeader('Set-Cookie', 'as=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0');
  res.statusCode = 302; res.setHeader('Location', '/'); res.end();
}
