// 成片验收用的抽帧：从 rec/zootopia-diary-1440p.mp4 里每个镜头取两帧（外加片头字、片尾字各一帧），
// 每帧另切成 2×2 四块原尺寸小图，方便逐块细看。输出到 rec/<目录名>/，并用 peek 拼一张总览。
// 用法：node tools/rec-qa.mjs [目录名，默认 qa]
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const REC = path.join(path.dirname(path.dirname(fileURLToPath(import.meta.url))), 'rec');
const { SHOTS } = await import('./rec-shots.js');
const OUT = path.join(REC, process.argv[2] || 'qa');
fs.mkdirSync(OUT, { recursive: true });
const ff = (args) => execFileSync('ffmpeg', ['-v', 'error', '-y', ...args], { stdio: 'inherit' });
const src = path.join(REC, 'zootopia-diary-1440p.mp4');

const picks = [];
let t = 0;
SHOTS.forEach((s, k) => {
  const n = String(k).padStart(2, '0');
  if (k === 0) picks.push([n + '_' + s.id + '_title', t + 2.6]);
  picks.push([n + '_' + s.id + '_a', t + s.dur * 0.3], [n + '_' + s.id + '_b', t + s.dur * 0.78]);
  t += s.dur;
});
picks.push(['99_endcard', t - 2.4]);

const full = [];
for (const [name, at] of picks) {
  const f = path.join(OUT, name + '.jpg');
  ff(['-ss', at.toFixed(3), '-i', src, '-frames:v', '1', '-q:v', '2', f]);
  full.push(f);
  [['q1', 0, 0], ['q2', 1280, 0], ['q3', 0, 720], ['q4', 1280, 720]].forEach(([q, x, y]) => ff(['-i', f, '-vf', `crop=1280:720:${x}:${y}`, '-q:v', '2', path.join(OUT, name + '_' + q + '.jpg')]));
  console.log(name + '  t=' + at.toFixed(2) + 's');
}
for (let i = 0, p = 1; i < full.length; i += 12, p++) {
  execFileSync('node', ['C:/cc/复用库/tools/peek.mjs', path.join(OUT, '_sheet' + p + '.jpg'), ...full.slice(i, i + 12), '--cols', '3', '--max', '1900'], { stdio: 'ignore' });
}
console.log('-> ' + OUT);
