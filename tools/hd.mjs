// High-resolution pass for facade sheets.
//   node tools/hd.mjs prep      crop every building out of its sheet (padded to 2:3) into assets/hd/
//   node tools/hd.mjs gen [n]   re-render each crop at higher resolution with Codex (n parallel jobs, default 6)
//   node tools/hd.mjs compose   paste the re-rendered crops back into an upscaled copy of the sheet -> assets/tex/<sheet>.png
// The original low-resolution sheets are kept in assets/lo/ (night and depth maps were made from them and stay valid,
// because the HD sheet keeps exactly the same layout).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const TEX = path.join(ROOT, 'assets', 'tex'), LO = path.join(ROOT, 'assets', 'lo'), HD = path.join(ROOT, 'assets', 'hd');
const KEY = '0xFF00FF';

// sheet -> { S: output scale, crops: [[u0, u1, topV?]] }   (u = fraction of sheet width, topV = how much of the height the building uses)
const JOBS = {
  antler: { S: 1.5, crops: [[0, 0.29], [0.285, 0.645], [0.638, 1]] },
  giraffe: { S: 1.5, crops: [[0, 0.417], [0.405, 0.56], [0.53, 1]] },
  apts: { S: 1.5, crops: [[0, 0.247], [0.24, 0.755]] },
  parkapts: { S: 1.5, crops: [[0, 0.352], [0.348, 0.603], [0.598, 1]] },
  igloo: { S: 2, crops: [[0, 0.252, 0.66], [0.248, 0.502, 0.64], [0.498, 0.762, 0.7], [0.757, 1]] },
  ktv: { S: 1.5, crops: [[0, 0.362], [0.358, 0.662], [0.658, 1]] },
  bank: { S: 1.5, crops: [[0, 0.342], [0.338, 0.61], [0.605, 1]] },
  museum: { S: 1.5, crops: [[0, 0.31, 0.78], [0.305, 0.695], [0.69, 1, 0.78]] },
  cityhall: { S: 1.5, crops: [[0.155, 0.395], [0.39, 0.61], [0.605, 0.845]] },
  fruside: { S: 2, crops: [[0, 0.335, 0.82], [0.33, 0.668, 0.82], [0.663, 1, 0.82]] },
  // single-building sheets, tiled with generous overlaps (seams are feathered)
  frufru: { S: 1.75, tiles: true, crops: [[0, 0.54, 1, 0.46], [0.46, 1, 1, 0.46], [0, 0.54, 0.54, 0], [0.46, 1, 0.54, 0]] },
  tundra: { S: 1.5, tiles: true, crops: [[0.17, 0.83, 1, 0.47], [0.17, 0.83, 0.53, 0]] },
  cafe: { S: 1.75, crops: [[0, 0.36, 0.82], [0.32, 0.68, 0.82], [0.64, 1, 0.82]] },
  station: { S: 1.5, crops: [[0, 0.36], [0.32, 0.68], [0.64, 1]] },
  frurow: { S: 1.5, crops: [[0, 0.365], [0.335, 0.675], [0.645, 1]] },
  restroom: { S: 1.75, crops: [[0, 0.36, 0.66], [0.32, 0.68, 0.66], [0.64, 1, 0.66]] },
  zpd: { S: 1.5, crops: [[0, 0.36], [0.32, 0.68], [0.64, 1]] },
  // free-standing towers: one crop per tower, found automatically from the background gaps
  skylineA: { S: 1.75, auto: true },
  skylineB: { S: 1.75, auto: true },
};

const size = (f) => { const b = fs.readFileSync(f); return [b.readUInt32BE(16), b.readUInt32BE(20)]; };
const ff = (args) => execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...args], { stdio: ['ignore', 'inherit', 'inherit'] });
const even = (n) => Math.round(n);

// columns that contain anything but background -> one [u0, u1, vTop] crop per separate object
function objectRuns(src, W, H) {
  const r = spawnSync('ffmpeg', ['-loglevel', 'error', '-i', src, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { maxBuffer: W * H * 3 + 1024 });
  const d = r.stdout; if (!d || d.length < W * H * 3) throw new Error('could not read pixels of ' + src);
  const key = (i) => d[i] > 150 && d[i + 2] > 150 && d[i + 1] < 125 && Math.abs(d[i] - d[i + 2]) < 90;
  const top = new Int32Array(W).fill(H);
  for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) if (!key((y * W + x) * 3)) { top[x] = y; break; }
  const runs = []; let x = 0;
  while (x < W) {
    while (x < W && top[x] > H - 12) x++;
    const a = x; let best = H;
    while (x < W && top[x] <= H - 12) { best = Math.min(best, top[x]); x++; }
    if (x - a > 20) runs.push([Math.max(0, a - 8) / W, Math.min(W, x + 8) / W, Math.min(1, (H - best) / H + 0.01)]);
  }
  return runs;
}

function plan(sheet) {
  const src = fs.existsSync(path.join(LO, sheet + '.png')) ? path.join(LO, sheet + '.png') : path.join(TEX, sheet + '.png');
  const [W, H] = size(src);
  // crop = [u0, u1, vTop = 1, vBot = 0]: a column range, optionally only a band of the height (v measured from the bottom)
  const crops = JOBS[sheet].auto ? objectRuns(src, W, H) : JOBS[sheet].crops;
  return crops.map(([u0, u1, vTop = 1, vBot = 0], i) => {
    const x = Math.round(u0 * W), w = Math.round(u1 * W) - x;
    const yb = Math.round((1 - vBot) * H);                                  // bottom row of the wanted region (exclusive)
    const h = Math.min(yb, Math.ceil((vTop - vBot) * H) + (vTop < 1 && vBot === 0 ? 16 : 0)), y = yb - h;
    // pad to 2:3 portrait: side margins if the crop is narrow, top margin if it is wide
    const PW = Math.max(w, Math.ceil((h * 2) / 3)), PH = Math.max(h, Math.ceil(PW * 1.5));
    // widen the crop into the neighbouring facade instead of padding with background, so a wall cut mid-way
    // is not mistaken for a building edge; background is only added where the sheet itself runs out
    const left = Math.max(0, Math.min(Math.max(0, W - PW), x - Math.floor((PW - w) / 2))), CW = Math.min(PW, W);
    const tiled = vBot > 0 || JOBS[sheet].tiles;                             // band crops also take the real rows above them
    const top = tiled ? Math.max(0, yb - PH) : y, CH = yb - top;
    const padX = x - left, padTop = PH - h, padMag = PH - CH;
    return { sheet, i, src, W, H, x, y, w, h, PW, PH, padX, padTop, padMag, left, top, CW, CH, vTop, vBot, in: path.join(HD, `${sheet}_${i}.png`), out: path.join(HD, `${sheet}_${i}_hd.png`) };
  });
}

const cmd = process.argv[2];
fs.mkdirSync(HD, { recursive: true }); fs.mkdirSync(LO, { recursive: true });
const only = process.argv.slice(3).filter((a) => JOBS[a]);
const sheets = only.length ? only : Object.keys(JOBS);

if (cmd === 'prep') {
  for (const s of sheets) for (const c of plan(s)) {
    ff(['-i', c.src, '-vf', `crop=${c.CW}:${c.CH}:${c.left}:${c.top},pad=${c.PW}:${c.PH}:0:${c.padMag}:color=${KEY}`, c.in]);
    console.log(`${s}_${c.i}: crop ${c.w}x${c.h} -> ${c.PW}x${c.PH}  (native scale ${(Math.min(1024 / c.PW, 1536 / c.PH)).toFixed(2)}x)`);
  }
} else if (cmd === 'gen') {
  const par = Number(process.argv.find((a) => /^\d+$/.test(a))) || 6;
  const todo = sheets.flatMap(plan).filter((c) => !fs.existsSync(c.out));
  console.log(`${todo.length} crops to render, ${par} at a time`);
  let k = 0, done = 0;
  await new Promise((resolve) => {
    const next = () => {
      if (k >= todo.length) { if (done === todo.length) resolve(); return; }
      const c = todo[k++];
      const p = spawn('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(ROOT, 'tools', 'hd.ps1'), '-In', path.relative(ROOT, c.in), '-Out', path.relative(ROOT, c.out)], { stdio: ['ignore', 'pipe', 'pipe'] });
      let o = ''; p.stdout.on('data', (d) => { o += d; });
      p.on('close', () => { done++; console.log((o.match(/^(OK|FAILED).*$/m) || ['?? ' + path.basename(c.out)])[0].trim()); if (done === todo.length) resolve(); else next(); });
    };
    if (!todo.length) resolve();
    for (let i = 0; i < Math.min(par, todo.length); i++) next();
  });
} else if (cmd === 'compose') {
  for (const s of sheets) {
    const cs = plan(s), S = JOBS[s].S, have = cs.filter((c) => fs.existsSync(c.out));
    if (!have.length) { console.log(`${s}: no HD crops yet, skipped`); continue; }
    const lo = path.join(LO, s + '.png');
    if (!fs.existsSync(lo)) fs.copyFileSync(path.join(TEX, s + '.png'), lo);          // keep the original
    const { W, H } = cs[0], OW = even(W * S), OH = even(H * S);
    const inputs = ['-i', lo]; let fc = `[0:v]scale=${OW}:${OH}:flags=lanczos[b0]`;
    have.forEach((c, n) => {
      inputs.push('-i', c.out);
      const sw = even(c.PW * S), sh = even(c.PH * S), cw = even(c.w * S), ch = even(c.h * S);
      // feather every edge that is not a sheet edge: neighbouring crops overlap a little, so seams cross-fade
      // (this also hides the anti-aliased rim where a crop met its padding)
      const F = 28, terms = [];
      if (c.x > 0) terms.push(`X/${F}`);
      if (c.x + c.w < W) terms.push(`(W-1-X)/${F}`);
      if (c.y > 0 && (JOBS[c.sheet].tiles || c.vBot > 0 || c.vTop < 1)) terms.push(`Y/${F}`);
      if (c.y + c.h < H) terms.push(`(H-1-Y)/${F}`);
      const amin = terms.reduce((a, t) => (a ? `min(${a}\,${t})` : t), '');
      const fade = terms.length ? `,format=rgba,geq=r='r(X\,Y)':g='g(X\,Y)':b='b(X\,Y)':a='255*clip(${amin}\,0\,1)'` : '';
      fc += `;[${n + 1}:v]scale=${sw}:${sh}:flags=lanczos,crop=${cw}:${ch}:${even(c.padX * S)}:${even(c.padTop * S)}${fade}[c${n}];[b${n}][c${n}]overlay=${even(c.x * S)}:${even(c.y * S)}[b${n + 1}]`;
    });
    ff([...inputs, '-filter_complex', fc, '-map', `[b${have.length}]`, '-frames:v', '1', path.join(TEX, s + '.png')]);
    console.log(`${s}: ${have.length}/${cs.length} crops -> ${OW}x${OH}`);
  }
} else {
  console.log('usage: node tools/hd.mjs prep|gen [n]|compose [sheet ...]');
}
