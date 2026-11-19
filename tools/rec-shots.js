// 游记视频的分镜和逐帧录制。用法（在 ?debug&high 页面的控制台里）：
//   const R = await import('./tools/rec-shots.js'); R.setup(); R.preview(3, 0.5)   // 看第 3 个镜头的中间一帧
//   R.run()                                                                         // 逐帧渲染并发给 tools/rec-server.mjs
// 每个镜头：dur 秒；tod 一天里的时间（0 白天 → 0.5 黄昏 → 1 夜晚），可以是 [起, 止]；fov 竖直视角；
// cam / look 是若干关键点 [x 东, y 北, 高度]，镜头沿它们平滑滑过去。
export const FPS = 30, W = 2560, H = 1440;      // 按 1440p 渲染，成片再缩到需要的尺寸
export const SHOTS = [
  { id: 'aerial',   dur: 5, tod: 0,           fov: 50, cam: [[-104, -132, 66], [-80, -108, 40], [-62, -90, 24]], look: [[-24, -22, 10], [-26, -28, 8], [-29, -38, 5]] },
  { id: 'entrance', dur: 5, tod: 0,           fov: 60, cam: [[-46.2, -73.2, 1.9], [-39.4, -62.4, 1.9], [-33.6, -53.8, 2.0], [-29.4, -45.5, 2.0]], look: [[-39, -62, 3.0], [-30, -47, 3.6], [-27.6, -31, 4.4], [-27.6, -15, 7]] },
  { id: 'frufru',   dur: 4, tod: 0,           fov: 52, cam: [[-27.9, -47.5, 2.2], [-27.6, -38.5, 2.3], [-27.7, -29.5, 2.5]], look: [[-34, -45, 3.2], [-34, -37.5, 3.6], [-34, -27, 4.2]] },
  { id: 'circle',   dur: 5, tod: [0, 0.14],   fov: 58, cam: [[-21.5, -27.5, 2.1], [-16.2, -22.5, 2.6], [-13.5, -14.5, 3.4], [-15.5, -8, 4.2]], look: [[-28.5, -6, 7], [-29, -3, 9.5], [-29.6, 0.6, 12], [-29.6, 0.6, 14.5]] },
  { id: 'police',   dur: 4, tod: [0.14, 0.32], fov: 62, cam: [[-13.5, -20.8, 1.8], [-10.5, -21.6, 1.9], [-4, -22.2, 2.2], [1.8, -24.8, 2.6]], look: [[-7.2, -24.8, 1.4], [-6.6, -24.9, 1.6], [0.2, -10, 4.5], [0.8, -6, 7]] },
  { id: 'market',   dur: 5, tod: [0.32, 0.5], fov: 56, cam: [[25.5, -49.6, 1.9], [33.5, -50.4, 1.9], [41.5, -50.2, 2.1], [45.5, -50.6, 2.3]], look: [[34, -46, 2.4], [38.5, -46, 2.5], [41.5, -47, 2.2], [40, -56.2, 1.5]] },
  { id: 'castle',   dur: 5, tod: 0.5,         fov: [40, 31], cam: [[6.0, -20.6, 1.9], [6.6, -21.6, 2.5], [7.0, -22.4, 3.1]], look: [[-10.4, -301, 24], [-10.4, -301, 28], [-10.4, -301, 32]] },   // 和后面烟花镜头同一个机位：同一处，从黄昏到入夜
  { id: 'nightfall', dur: 6, tod: [0.5, 1],   fov: 56, cam: [[-24.5, -30, 2.2], [-22.5, -35.5, 8], [-20.5, -43, 17]], look: [[-28, -6, 9], [-27, -3, 11], [-25, 0, 13]] },
  { id: 'neon',     dur: 4, tod: 1,           fov: 58, cam: [[-30.8, -52.5, 2.0], [-28.2, -44, 2.1], [-27.6, -35.5, 2.3]], look: [[-29.5, -42, 3.6], [-28.5, -28, 5], [-28.6, -8, 10]] },
  { id: 'fireworks', dur: 6, tod: 1,          fov: [31, 26], cam: [[7, -22, 1.9], [7.3, -23.0, 2.5]], look: [[-10.4, -301, 62], [-10.4, -301, 74]] },
  { id: 'finale',   dur: 7, tod: 1,           fov: [60, 46], cam: [[-15, -13, 17], [-12.5, -10, 31], [-10.6, -6, 50]], look: [[-10.4, -150, 3], [-10.4, -230, 30], [-10.4, -301, 68]] },
];
export const TOTAL = SHOTS.reduce((n, s) => n + Math.round(s.dur * FPS), 0);

const T = () => window.T;
const lerp = (a, b, t) => a + (b - a) * t;
const ease = (t) => lerp(t, t * t * (3 - 2 * t), 0.6);          // 起止略缓
// Catmull-Rom 样条：u 0..1 走完所有关键点
function spline(keys, u) {
  if (keys.length === 1) return keys[0];
  const n = keys.length - 1, f = Math.min(n - 1e-6, Math.max(0, u * n)), i = Math.floor(f), t = f - i;
  const p0 = keys[Math.max(0, i - 1)], p1 = keys[i], p2 = keys[i + 1], p3 = keys[Math.min(n, i + 2)];
  return [0, 1, 2].map((k) => 0.5 * ((2 * p1[k]) + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t * t + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t * t * t));
}
const range = (v, t) => (Array.isArray(v) ? lerp(v[0], v[1], t) : v);

let lastTod = -1, finaleAt = 0;
// 把渲染尺寸锁在 W×H。页面的 resize 处理会把画布改回窗口大小（标签页被切到前台、面板被拖动时都会触发），
// 所以先在捕获阶段拦掉 resize 事件，录每一帧前再核对一次画布尺寸。
let locked = false;
function lock() {
  const t = T();
  if (!locked) { window.addEventListener('resize', (e) => e.stopImmediatePropagation(), true); locked = true; }
  if (t.renderer.domElement.width !== W || t.renderer.domElement.height !== H) {
    t.renderer.setPixelRatio(1); t.renderer.setSize(W, H, false); t.composer.setPixelRatio(1); t.composer.setSize(W, H);
  }
  t.camera.aspect = W / H; t.camera.updateProjectionMatrix();
}
export function setup() {
  const t = T();
  window.__cine = true; t.walker.mode = 'cine';
  lock();
  const cues = t.fw.show.cues; finaleAt = (cues.find((c) => c.type === 'glitter' && c.t > 150) || { t: 200 }).t;
  return { total: TOTAL, seconds: TOTAL / FPS, finaleAt };
}
// 第 i 帧的状态：在哪个镜头、镜头内的进度
export function at(i) {
  let n = 0;
  for (let k = 0; k < SHOTS.length; k++) { const len = Math.round(SHOTS[k].dur * FPS); if (i < n + len) return { k, shot: SHOTS[k], u: (i - n) / Math.max(1, len - 1), first: i === n }; n += len; }
  return { k: SHOTS.length - 1, shot: SHOTS[SHOTS.length - 1], u: 1, first: false };
}
function apply(st) {
  const t = T(), s = st.shot, u = ease(st.u);
  const c = spline(s.cam, u), l = spline(s.look, u);
  t.camera.position.set(c[0], c[2], -c[1]); t.camera.lookAt(l[0], l[2], -l[1]);
  t.camera.fov = range(s.fov, u); t.camera.updateProjectionMatrix(); t.fw.fov = t.camera.fov;
  const tod = range(s.tod, st.u);
  if (Math.abs(tod - lastTod) > 1e-4) { t.env.target = tod; t.env.apply(tod); lastTod = tod; }
  if (st.first) {
    // 烟花的演出时钟：入夜后先来几下点缀，「fireworks」镜头开始时正好进入终场
    // 烟花终场从「neon」镜头一开始就起跑：切到看城堡的镜头时，天上已经有烟花在炸
    if (s.id === 'neon') { t.fw.clock = finaleAt - 0.5; t.fw.cue = t.fw.show.cues.findIndex((q) => q.t >= t.fw.clock); t.fw.level = 1; }
  }
}
// 看某个镜头里的一帧（k 镜头序号，u 0..1）
export function preview(k, u = 0.5) {
  let n = 0; for (let j = 0; j < k; j++) n += Math.round(SHOTS[j].dur * FPS);
  const i = n + Math.round(u * (Math.round(SHOTS[k].dur * FPS) - 1));
  const st = at(i); apply({ ...st, first: true });
  for (let j = 0; j < (SHOTS[k].tod === 1 || Array.isArray(SHOTS[k].tod) ? 90 : 2); j++) T().step(1 / FPS);
  T().render();
  return SHOTS[k].id + ' frame ' + i;
}
export const state = { done: 0, running: false, error: null, ms: 0, stop: false };
export async function run(from = 0, to = TOTAL) {
  const t = T(), canvas = t.renderer.domElement;
  state.running = true; state.error = null; lastTod = -1;
  apply({ ...at(from), first: true }); t.step(0); t.render(); t.render();          // 先空画两帧，免得第一帧是黑的
  const t0 = performance.now();
  try {
    for (let i = from; i < to; i++) {
      lock(); apply(at(i));
      t.step(1 / FPS); t.render();
      // toDataURL 是同步的：页面在后台标签里时 toBlob 的回调会被浏览器拖到每秒一次
      const res = await fetch('http://localhost:5184/frame/' + i, { method: 'POST', body: canvas.toDataURL('image/jpeg', 0.98).slice(23) });
      if (state.stop) break;
      if (!res.ok) throw new Error('save failed ' + res.status);
      state.done = i + 1; state.ms = (performance.now() - t0) / (i + 1 - from);
    }
  } catch (e) { state.error = String(e && e.message || e); }
  state.running = false;
  return state;
}
