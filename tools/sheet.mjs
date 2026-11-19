// 把 rec/snap 里名字匹配某个正则（从开头匹配）的试拍图拼成一张预览（调机位时用）：node tools/sheet.mjs <前缀> [列数] [长边像素]
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SNAP = path.join(path.dirname(path.dirname(fileURLToPath(import.meta.url))), 'rec', 'snap');
const [prefix, cols = '3', max = '1900'] = process.argv.slice(2);
const files = fs.readdirSync(SNAP).filter((f) => new RegExp('^' + prefix).test(f) && f.endsWith('.jpg') && !f.startsWith('_')).sort((a, b) => fs.statSync(path.join(SNAP, a)).mtimeMs - fs.statSync(path.join(SNAP, b)).mtimeMs);
if (!files.length) { console.error('没有匹配的图'); process.exit(1); }
const out = path.join(SNAP, '_' + prefix.split('').filter((ch) => /[a-z0-9_-]/i.test(ch)).join('') + '.jpg');
console.log(execFileSync('node', ['C:/cc/复用库/tools/peek.mjs', out, ...files.map((f) => path.join(SNAP, f)), '--cols', cols, '--max', max], { encoding: 'utf8' }).split('\n').filter((l) => l.includes('格')).map((l) => l.trim().replace(/^第(\d)行第(\d)格：/, '$1-$2 ')).join(' | '));
console.log(out);
