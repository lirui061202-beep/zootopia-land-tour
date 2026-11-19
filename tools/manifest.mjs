// 生成 assets/tex/manifest.json（贴图清单）。用 tour/serve.mjs 启动时会实时生成，不需要这一步；
// 只有改用别的静态服务器（比如上一级的 server.js）时才需要先跑：node tour/tools/manifest.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const dir = path.join(path.dirname(path.dirname(fileURLToPath(import.meta.url))), 'assets', 'tex');
const list = fs.readdirSync(dir).filter((f) => f.endsWith('.png') || f.endsWith('.webp'));
fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(list));
console.log(list.length + ' textures');
