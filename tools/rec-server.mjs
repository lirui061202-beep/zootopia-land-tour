// 录像用的收帧服务：node tools/rec-server.mjs  →  POST http://localhost:5184/frame/<序号> 把一帧 JPEG 存到 rec/frames/
// 只在本机录制视频时用，和游览本身无关。
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.join(path.dirname(path.dirname(fileURLToPath(import.meta.url))), 'rec', 'frames');
fs.mkdirSync(DIR, { recursive: true });
const CORS = { 'Access-Control-Allow-Origin': 'http://localhost:5183', 'Access-Control-Allow-Methods': 'POST, GET, OPTIONS', 'Access-Control-Allow-Headers': 'content-type' };
http.createServer((req, res) => {
  if (req.method === 'OPTIONS') { res.writeHead(204, CORS); return res.end(); }
  const m = /^\/frame\/(\d+)$/.exec(req.url || '');
  if (req.method === 'POST' && m) {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => { fs.writeFileSync(path.join(DIR, 'f_' + String(m[1]).padStart(5, '0') + '.jpg'), Buffer.from(Buffer.concat(chunks).toString('latin1'), 'base64')); res.writeHead(200, CORS); res.end('ok'); });
    return;
  }
  // 调机位时的单张预览：POST /snap/<名字> 存到 rec/snap/<名字>.jpg
  const sn = /^\/snap\/([\w-]+)$/.exec(req.url || '');
  if (req.method === 'POST' && sn) {
    const chunks = [], dir = path.join(path.dirname(DIR), 'snap'); fs.mkdirSync(dir, { recursive: true });
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => { fs.writeFileSync(path.join(dir, sn[1] + '.jpg'), Buffer.from(Buffer.concat(chunks).toString('latin1'), 'base64')); res.writeHead(200, CORS); res.end('ok'); });
    return;
  }
  if (req.url === '/count') { res.writeHead(200, CORS); return res.end(String(fs.readdirSync(DIR).filter((f) => f.endsWith('.jpg')).length)); }
  res.writeHead(404, CORS); res.end();
}).listen(5184, '127.0.0.1', () => console.log('rec server on 5184 -> ' + DIR));
