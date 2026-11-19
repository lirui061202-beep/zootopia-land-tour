// 游览模型的本地静态服务器：node serve.mjs  →  http://localhost:5183/
// 项目本身是纯静态网页，任何静态服务器都能跑（比如 GitHub Pages）；这个脚本只是省得另装工具。
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 5183;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg', '.mp4': 'video/mp4' };

http.createServer((req, res) => {
  let u = decodeURIComponent((req.url || '/').split('?')[0]);
  if (u === '/tour') { res.writeHead(302, { Location: '/tour/' }); return res.end(); }
  if (u.startsWith('/tour/')) u = u.slice(5);                 // 旧地址 /tour/… 继续可用
  if (u.endsWith('/')) u += 'index.html';
  if (u === '/assets/tex/manifest.json' || u === '/assets/tex_png/manifest.json') {   // 贴图清单按目录实时生成
    const list = fs.readdirSync(path.join(ROOT, path.dirname(u))).filter((f) => f.endsWith('.png') || f.endsWith('.webp'));
    res.writeHead(200, { 'Content-Type': MIME['.json'], 'Cache-Control': 'no-store' });
    return res.end(JSON.stringify(list));
  }
  const file = path.normalize(path.join(ROOT, u));
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end('forbidden'); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  });
}).listen(PORT, '127.0.0.1', () => console.log('疯狂动物城游览模型: http://localhost:' + PORT + '/'));
