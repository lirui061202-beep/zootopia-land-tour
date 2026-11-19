// 游记视频的分镜和逐帧录制。用法（在 ?debug&ultra&orig 页面的控制台里；必须带 ultra，否则会自动降画质）：
//   const R = await import('./tools/rec-shots.js'); R.setup(); R.preview(3, 0.5)   // 看第 3 个镜头的中间一帧
//   R.run()                                                                         // 逐帧渲染并发给 tools/rec-server.mjs
// 每个镜头：dur 秒；tod 一天里的时间（0 白天 → 0.5 黄昏 → 1 夜晚），可以是 [起, 止]；fov 竖直视角；
// cam / look 是若干关键点 [x 东, y 北, 高度]，镜头沿它们平滑滑过去。
export const FPS = 30;
export let W = 2560, H = 1440;                  // 按 1440p 渲染，成片再缩到需要的尺寸；竖版是 1440×2560（setup({ portrait: true })）
let portrait = false;
// 竖版：每个镜头可以带一个 p: { fov, cam, look } 覆盖横版的取景。视角 fov 是竖直方向的，
// 同样的 fov 在竖版里横向只剩三分之一宽，所以竖版一般要把 fov 放大、把镜头对准单个主体。
const pick = (s) => (portrait && s.p ? { ...s, ...s.p } : s);
export const SHOTS = [
  // 分镜的取舍（两轮逐帧验收后定的）：立面浮雕是按深度图拉起来的，贴着墙斜看会被拉长，所以立面一律正对着拍、只拍细致的部位；
  // 园区外是空地，不用高空俯拍；食集的摊位侧面和周边小件还不够细，这一版不拍。
  // 片头：从入口西侧上方降下来，镜头略仰（入口角落的红色售货亭留在画外）
  { id: 'arrive',   dur: 5, tod: 0,           fov: 40, cam: [[-53, -83, 8.5], [-51.3, -80.5, 6.9], [-49.4, -77.8, 5.2]], look: [[-31, -38, 14], [-31, -40, 13], [-31.6, -42.6, 11.5]],
    p: { fov: 62, look: [[-33, -40, 14], [-33, -42, 13], [-33.5, -44, 11.5]] } },
  // 露露精品店朝入口的那面橱窗：正对着横移，只取一层的橱窗
  // （取景上沿压在窗拱以下：几扇窗的拱顶处高清贴图有拼接缝，窗棂错位）
  { id: 'entrance', dur: 5, tod: 0,           fov: 32, cam: [[-46.2, -56, 1.9], [-44.8, -55.9, 1.9], [-43.4, -55.8, 1.9]], look: [[-46.1, -49.4, 1.78], [-44.7, -49.2, 1.78], [-43.3, -49, 1.78]],
    p: { fov: 36, cam: [[-45.5, -54.1, 2.0], [-44.8, -54.05, 2.0], [-44.1, -54.0, 2.0]], look: [[-45.5, -48.6, 2.15], [-44.8, -48.55, 2.15], [-44.1, -48.5, 2.15]] } },      // 竖版：橱窗占满画面高度，从蓝裙子横移到粉裙子（一扇橱窗宽约 3 米，竖屏一次装不下）
  // 店门和门童：正对着，取门的上半截、门头的字和门童的上半身（门童面前的讲台只是个素方盒，留在画外）
  { id: 'frufru',   dur: 5, tod: 0,           fov: [33, 31], cam: [[-28.0, -41.9, 2.6], [-28.3, -41.7, 2.7]], look: [[-34, -41.7, 3.1], [-34, -41.6, 3.15]],
    p: { fov: 44, cam: [[-24.4, -41.7, 2.4], [-25.2, -41.7, 2.6]], look: [[-34, -41.7, 3.5], [-34, -41.7, 4.0]] } },      // 竖版：退到马路对面正对店门，整扇门、门头的字、门童和二层阳台都在画面里，镜头略微上仰
  { id: 'circle',   dur: 6, tod: [0, 0.12],   fov: 58, cam: [[-21, -21, 2.0], [-21.5, -16, 2.8], [-23, -11, 3.8]], look: [[-29, -4, 7], [-29.3, -2, 9.5], [-29.6, 0.6, 13]],
    p: { fov: 72 } },
  { id: 'police',   dur: 5, tod: [0.12, 0.26], fov: 60, cam: [[-6.5, -21.6, 1.9], [-3, -22.6, 2.1], [1.2, -24.6, 2.5]], look: [[-0.6, -11, 4.2], [0.2, -9, 5], [0.8, -6, 6.8]],
    p: { fov: 76, look: [[0.2, -11, 5.2], [0.5, -9, 6], [0.8, -6, 7.6]] } },
  // 和后面烟花镜头同一个机位：同一处，从黄昏到入夜。镜头偏东一点，右边贴脸的行道树和公寓楼留在画外
  { id: 'castle',   dur: 6, tod: 0.5,         fov: [34, 28], cam: [[6.0, -20.6, 1.9], [6.6, -21.6, 2.5], [7.0, -22.4, 3.1]], look: [[14, -301, 22], [14, -301, 25], [14, -301, 28]],
    p: { fov: [32, 26], look: [[-10.4, -301, 40], [-10.4, -301, 43], [-10.4, -301, 46]] } },
  // 入夜：站在环岛南口的路中间慢慢往前、略微升高，四周没有贴脸的墙
  { id: 'nightfall', dur: 6, tod: [0.5, 1],   fov: 56, cam: [[-27.8, -28.2, 2.0], [-27.5, -26, 3.2], [-27.2, -23.8, 4.6]], look: [[-26.2, -4, 8], [-28.2, -3, 10], [-29.3, -1, 12]],
    p: { fov: 70, look: [[-28.6, -4, 9], [-29, -3, 11], [-29.4, -1, 13]] } },
  // 夜里的警局：正面推近（id 仍叫 neon——烟花的演出时钟从这个镜头的第一帧起跑）
  { id: 'neon',     dur: 5, tod: 1,           fov: 58, cam: [[4.5, -27.5, 1.9], [3.6, -25.5, 2.1], [2.8, -23.5, 2.4]], look: [[0.6, -8, 5.5], [0.7, -7, 6.2], [0.8, -6, 7]],
    p: { fov: 74, look: [[0.6, -8, 6.2], [0.7, -7, 6.8], [0.8, -6, 7.6]] } },
  { id: 'fireworks', dur: 6, tod: 1,          fov: [31, 26], cam: [[7, -22, 1.9], [7.3, -23.0, 2.5]], look: [[-10.4, -301, 62], [-10.4, -301, 74]],
    p: { fov: [36, 30], look: [[-10.4, -301, 70], [-10.4, -301, 80]] } },
  // 终场：街面起步升到三层楼高，镜头偏东一点、视角收窄：右边公寓楼的墙角（斜看会露出拉伸的侧面）留在画外，城堡也大一些
  { id: 'finale',   dur: 7, tod: 1,           fov: [40, 34], cam: [[6.8, -27.5, 2.2], [6.7, -26.2, 5.2], [6.5, -24.5, 8.6]], look: [[24, -301, 34], [24, -301, 48], [24, -301, 60]],
    p: { fov: [44, 36], look: [[-10.4, -301, 50], [-10.4, -301, 64], [-10.4, -301, 76]] } },
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
export function setup(opts = {}) {
  const t = T();
  portrait = !!opts.portrait; W = portrait ? 1440 : 2560; H = portrait ? 2560 : 1440;
  window.__cine = true; t.walker.mode = 'cine';
  lock();
  const cues = t.fw.show.cues; finaleAt = (cues.find((c) => c.type === 'glitter' && c.t > 150) || { t: 200 }).t;
  return { total: TOTAL, seconds: TOTAL / FPS, finaleAt, portrait, W, H };
}
// 第 i 帧的状态：在哪个镜头、镜头内的进度
export function at(i) {
  let n = 0;
  for (let k = 0; k < SHOTS.length; k++) { const len = Math.round(SHOTS[k].dur * FPS); if (i < n + len) return { k, shot: pick(SHOTS[k]), u: (i - n) / Math.max(1, len - 1), first: i === n }; n += len; }
  return { k: SHOTS.length - 1, shot: pick(SHOTS[SHOTS.length - 1]), u: 1, first: false };
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
  // 烟花：正式录制时演出时钟从「neon」第一帧起跑，预览时把时钟拨到同一时刻（下面还要空跑 3 秒）
  const nk = SHOTS.findIndex((s) => s.id === 'neon');
  if (k >= nk) { let m = 0; for (let j = 0; j < nk; j++) m += Math.round(SHOTS[j].dur * FPS); const t = T(); t.fw.clock = Math.max(0, finaleAt - 0.5 + (i - m) / FPS - 3); t.fw.cue = t.fw.show.cues.findIndex((q) => q.t >= t.fw.clock); t.fw.level = 1; }
  for (let j = 0; j < (SHOTS[k].tod === 1 || Array.isArray(SHOTS[k].tod) ? 90 : 2); j++) T().step(1 / FPS);
  T().render();
  return SHOTS[k].id + ' frame ' + i;
}
// 把当前画面存成 rec/snap/<name>.jpg（调机位时用，不占帧序号）
export async function snap(name) {
  const res = await fetch('http://localhost:5184/snap/' + name, { method: 'POST', body: T().renderer.domElement.toDataURL('image/jpeg', 0.92).slice(23) });
  return res.ok ? name : 'failed ' + res.status;
}
// 预览并存图：snaps([[k, u], …], 前缀)
export async function snaps(list, prefix = 's') {
  const out = [];
  for (const [k, u] of list) { preview(k, u); preview(k, u); out.push(await snap(prefix + '_' + String(k).padStart(2, '0') + '_' + SHOTS[k].id + '_' + Math.round(u * 100))); }
  return out;
}
// 自由机位试拍：views([[名字, [x,y,h], [lx,ly,lh], fov, tod, 烟花秒数(可省)], …]) → rec/snap/<名字>.jpg
export async function views(list) {
  const t = T(), out = [];
  for (const [name, c, l, fov = 55, tod = 0, fwAt = null] of list) {
    t.camera.position.set(c[0], c[2], -c[1]); t.camera.lookAt(l[0], l[2], -l[1]); t.camera.fov = fov; t.camera.updateProjectionMatrix(); t.fw.fov = fov;
    t.env.target = tod; t.env.apply(tod); lastTod = tod;
    if (fwAt != null) { t.fw.clock = finaleAt - 0.5 + fwAt - 3; t.fw.cue = t.fw.show.cues.findIndex((q) => q.t >= t.fw.clock); t.fw.level = 1; }
    for (let j = 0; j < (tod > 0.6 ? 90 : 3); j++) t.step(1 / FPS);
    lock(); t.render(); t.render();
    out.push(await snap(name));
  }
  return out;
}
export const state = { done: 0, running: false, error: null, ms: 0, stop: false };
export async function run(from = 0, to = TOTAL) {
  const t = T(), canvas = t.renderer.domElement;
  state.running = true; state.error = null; lastTod = -1;
  if (from === 0) { t.fw.level = 0; t.fw.clock = 0; t.fw.cue = 0; }      // 预览过夜景的话，烟花还亮着：从头录时先清掉
  apply({ ...at(from), first: true }); t.step(0); t.render(); t.render();          // 先空画两帧，免得第一帧是黑的
  const t0 = performance.now();
  try {
    for (let i = from; i < to; i++) {
      lock(); apply(at(i));
      t.step(1 / FPS); t.render();
      // toDataURL 是同步的：页面在后台标签里时 toBlob 的回调会被浏览器拖到每秒一次
      const res = await fetch('http://localhost:5184/frame/' + i + (portrait ? '?d=v' : ''), {      // 竖版的帧存到 rec/frames_v
       method: 'POST', body: canvas.toDataURL('image/jpeg', 0.98).slice(23) });
      if (state.stop) break;
      if (!res.ok) throw new Error('save failed ' + res.status);
      state.done = i + 1; state.ms = (performance.now() - t0) / (i + 1 - from);
    }
  } catch (e) { state.error = String(e && e.message || e); }
  state.running = false;
  return state;
}
