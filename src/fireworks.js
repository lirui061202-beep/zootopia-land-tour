// 夜晚的远景烟花：参照上海迪士尼城堡夜间烟花秀（「奇梦之光幻影秀」），在城堡方向的夜空按编排表循环演出。
// 依据（公开报道 + 整场演出视频的抽帧）：
//   · 城堡在园区正南约 313 米（OSM），从疯狂动物城看到的是城堡背面，塔尖约在地平线上 11°；
//   · 以彗星和小型礼花为主，不是大礼花弹；炸点在城堡高度的 1.2～2 倍（约 75～130 米）；
//   · 大部分时间只有白 / 金色，带一点蓝白；红、绿牡丹只在终场出现；几乎每一下都左右对称；
//   · 终场是一大片白金闪烁礼花 + 成对红牡丹 + 塔尖上的绿色，最后一排细白彗星收尾；
//   · 城堡后面有五六道白色探照光束，偶尔有蓝色激光扇面，烟被灯光染亮。
// 与实景的出入：真实演出前十几分钟每 20～60 秒才有一下，这里压缩成约 5 分钟一轮、前段每 9～30 秒一下（留出空拍），循环播放。
// 未采用：环形、心形、十字分裂、锦冠等花型 —— 视频里没有看到，不确定就不放。
//
// 实现：一个粒子池（THREE.Points + 加色混合）负责所有火花；演出由一张按时间排好的 cue 表驱动：
//   comet 拖尾的彗星（竖直或斜飞，到顶熄灭）  shell 升空后炸开的小礼花  mine 城堡屋脊上的一蓬  laser 蓝色激光扇面
// 位置用「相对城堡的横向偏移 lat」表示，成对出现。爆响按距离延迟约 1 秒传来（Web Audio 合成，无素材）。
import * as THREE from 'three';

const MAX = 16000;

// 城堡相对园区原点的位置（世界坐标：+X 朝东，+Z 朝南）。OSM way 494348161：31.1457459 N, 121.6553186 E
export const CASTLE = { x: -10.4, z: 313.1, h: 62 };
const HORIZ = Math.hypot(CASTLE.x, CASTLE.z) || 1;
export const DIR = { x: CASTLE.x / HORIZ, z: CASTLE.z / HORIZ };          // 从园区看向城堡
const LAT = { x: -DIR.z, z: DIR.x };                                // 城堡的「左右」方向（垂直于视线）
export const at = (lat, back = 0) => [CASTLE.x + LAT.x * lat + DIR.x * back, CASTLE.z + LAT.z * lat + DIR.z * back];

const C = {
  gold: [1.0, 0.74, 0.3], white: [1.0, 0.95, 0.86], ice: [0.72, 0.86, 1.0], blue: [0.3, 0.55, 1.0],
  red: [1.0, 0.16, 0.14], green: [0.3, 1.0, 0.42], dim: [0.9, 0.5, 0.16],
};

const VS = /* glsl */`
attribute vec4 aColor;     // rgb + 透明度
attribute float aSize;
uniform float uScale;
varying vec4 vColor;
void main(){
  vColor = aColor;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = clamp(aSize * uScale / max(1.0, -mv.z), 2.2, 56.0);
  gl_Position = projectionMatrix * mv;
}`;
const FS = /* glsl */`
precision highp float;
varying vec4 vColor;
void main(){
  vec2 q = gl_PointCoord - 0.5;
  float d = length(q);
  float core = smoothstep(0.5, 0.0, d);
  float a = core * core * vColor.a;
  if (a < 0.003) discard;
  gl_FragColor = vec4(vColor.rgb * (0.8 + 2.6 * core * core), a);      // 中心更亮，交给泛光去晕开
}`;

// 光束 / 光晕共用的加色材质：沿长度方向渐隐，两侧柔边
const beamMat = (fall) => new THREE.ShaderMaterial({
  uniforms: { uColor: { value: new THREE.Color(1, 1, 1) }, uAmt: { value: 0 }, uFall: { value: fall } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: 'uniform vec3 uColor; uniform float uAmt; uniform float uFall; varying vec2 vUv; void main(){ float side = 1.0 - abs(vUv.x - 0.5) * 2.0; float a = max(0.0, side) * max(0.0, side) * pow(clamp(1.0 - vUv.y, 0.0001, 1.0), uFall) * uAmt; gl_FragColor = vec4(uColor * a, a); }',
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
});

// ------------------------------------------------------------------ 演出编排
// 返回 { cues: 按 t 排序的 cue 列表, length: 整轮秒数 }
function buildShow() {
  const cues = [];
  let seed = 20210408; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const add = (t, k, o) => cues.push({ t, k, ...o });
  const pair = (t, k, o) => { add(t, k, o); add(t, k, { ...o, lat: -o.lat, ang: o.ang === undefined ? undefined : -o.ang }); };
  let t = 2;

  // ---- 第一部分：白 / 金色的单下点缀，四种样式轮着来
  const accents = [
    (t0, i) => { for (const lat of [-7, 0, 7]) add(t0 + Math.abs(lat) * 0.02, 'comet', { lat, ang: 0, h: 100 + (lat ? 0 : 10), c: i % 2 ? C.gold : C.white }); },   // 塔尖上三道竖直彗星
    (t0, i) => { pair(t0, 'comet', { lat: 8, ang: 45, h: 62, c: C.white }); if (i % 2) pair(t0 + 0.5, 'comet', { lat: 8, ang: 28, h: 80, c: C.gold }); },          // 一对 45° 的 V 字彗星
    (t0, i) => { pair(t0, 'shell', { lat: 50, h: 86 + (i % 3) * 6, r: 15, type: i % 2 ? 'glitter' : 'peony', c: i % 2 ? C.white : C.gold, c2: C.white, back: 30 }); },   // 塔尖两侧一对小礼花
    (t0) => { for (const lat of [16, 30, 44]) pair(t0 + lat * 0.012, 'mine', { lat, h: 20, c: C.ice, n: 26 }); },                                                    // 屋脊上一排蓝白色小蓬
  ];
  for (let i = 0; i < 15; i++) {
    accents[i % 4](t, i);
    if (i === 5 || i === 11) add(t + 2.5, 'shell', { lat: 0, h: 118, r: 26, type: 'willow', c: C.gold, back: 40 });        // 偶尔一发金色垂柳
    if (i === 3 || i === 9) add(t + 1, 'laser', { dur: 9 });                                                              // 蓝色激光扇面
    // 稀疏：两下之间隔 9～19 秒不等，每隔几下再空一长拍，天上大部分时间只有探照灯和被灯光打亮的城堡
    t += 9 + rnd() * 10 + (i % 4 === 3 ? 8 + rnd() * 6 : 0);
  }
  // ---- 第二部分：城堡背后一把十道白色彗星的扇面，接两道竖直彗星
  t += 2;
  for (let k = 0; k < 2; k++) {
    for (let i = 0; i < 10; i++) add(t + i * 0.07, 'comet', { lat: (i - 4.5) * 2, ang: (i - 4.5) * 10, h: 96, c: C.white, back: 25 });
    t += 5;
  }
  pair(t, 'comet', { lat: 10, ang: 0, h: 112, c: C.gold });
  add(t + 0.5, 'laser', { dur: 7 });
  t += 6;
  // ---- 第三部分：终场，每秒三到五发
  const f0 = t;
  for (let i = 0; i < 30; i++) {                               // 一大片白金闪烁礼花
    const lat = 12 + ((i * 37) % 92), h = 100 + ((i * 53) % 32);
    pair(f0 + i * 0.95 + rnd() * 0.3, 'shell', { lat, h, r: 21 + (i % 3) * 4, type: 'glitter', c: i % 3 ? C.white : C.gold, c2: C.gold, back: 20 + (i * 17) % 80 });
  }
  for (let i = 0; i < 7; i++) pair(f0 + 4 + i * 3.6, 'shell', { lat: 34 + (i % 3) * 22, h: 104 + (i % 2) * 14, r: 24, type: 'peony', c: C.red, c2: C.gold, back: 40 });      // 成对的红牡丹
  for (let i = 0; i < 5; i++) add(f0 + 7 + i * 4.6, 'shell', { lat: 0, h: 122 + (i % 2) * 8, r: 26, type: 'peony', c: C.green, c2: C.white, back: 50 });                    // 塔尖上的绿色
  for (let i = 0; i < 6; i++) pair(f0 + 10 + i * 3.0, 'shell', { lat: 70 + (i % 2) * 22, h: 96 + i * 4, r: 22, type: 'willow', c: C.gold, back: 60 });
  for (let i = 0; i < 9; i++) for (const lat of [14, 28, 42]) pair(f0 + 3 + i * 3.1 + lat * 0.01, 'mine', { lat, h: 22, c: i % 2 ? C.ice : C.white, n: 20 });
  add(f0 + 12, 'laser', { dur: 14 });
  t = f0 + 30;
  // ---- 收尾：一排细白彗星像帘子一样升起，三波
  for (let k = 0; k < 3; k++) {
    for (let i = 0; i < 17; i++) add(t + k * 2.2 + Math.abs(i - 8) * 0.03, 'comet', { lat: (i - 8) * 8.5, ang: 0, h: 84 + k * 10 - Math.abs(i - 8) * 1.5, c: C.white, thin: true, back: 20 });
  }
  t += 8;
  t += 14;                                                      // 暗场片刻再循环
  for (const c of cues) c.jit = (rnd() - 0.5) * 0.1;            // 成对的两发也别分毫不差
  cues.sort((a, b) => a.t - b.t);
  return { cues, length: t };
}

export class Fireworks {
  constructor(scene, env, renderer) {
    this.env = env; this.renderer = renderer;
    this.enabled = true; this.level = 0;
    this.pos = new Float32Array(MAX * 3); this.vel = new Float32Array(MAX * 3);
    this.col = new Float32Array(MAX * 4); this.base = new Float32Array(MAX * 6);     // 起始色 + 结束色
    this.size = new Float32Array(MAX); this.size0 = new Float32Array(MAX);
    this.life = new Float32Array(MAX); this.maxLife = new Float32Array(MAX);
    this.drag = new Float32Array(MAX); this.grav = new Float32Array(MAX);
    this.flag = new Uint8Array(MAX);            // 1 闪烁  2 撒尾迹  4 长尾（垂柳）  5 彗星尾（最密）
    this.trailT = new Float32Array(MAX);
    this.head = 0;
    this.shells = [];                           // 升空中的弹
    this.booms = [];                            // 待播放的爆响 { t, big }
    this.show = buildShow(); this.clock = 0; this.cue = 0;
    this.smoke = 0;                             // 被灯光染亮的烟：每炸一发涨一点，慢慢散
    this.laser = 0; this.laserT = 0;
    this.roofAt = null;                         // (lat) => 城堡该处的屋顶高度，远景模块建好城堡后填进来

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(CASTLE.x, 100, CASTLE.z), 600);
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VS, fragmentShader: FS, uniforms: { uScale: { value: 800 } },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false; this.points.renderOrder = 5; this.points.visible = false;
    scene.add(this.points);

    // 探照光束（白，6 道，从城堡后面扇开慢慢摆）和激光扇面（蓝，7 道细线，只在 laser cue 时亮）
    this.sky = new THREE.Group(); this.sky.visible = false; scene.add(this.sky);
    const bg = new THREE.PlaneGeometry(1, 1); bg.translate(0, 0.5, 0);          // 底边在原点，沿 +Y 伸出去
    const face = Math.atan2(-DIR.x, -DIR.z);                                     // 让面片正对园区
    const mk = (lat, y, back, fall) => {
      const piv = new THREE.Group(); piv.rotation.y = face; const [x, z] = at(lat, back); piv.position.set(x, y, z);
      const m = new THREE.Mesh(bg, beamMat(fall)); m.frustumCulled = false; m.renderOrder = 4; piv.add(m); this.sky.add(piv);
      return m;
    };
    this.beams = []; for (let i = 0; i < 6; i++) this.beams.push({ mesh: mk((i - 2.5) * 14, 30, 30, 1.5), side: i < 3 ? -1 : 1, k: i, phase: i * 1.7 });
    this.lasers = []; for (let i = 0; i < 7; i++) this.lasers.push({ mesh: mk(0, CASTLE.h - 8, 0, 0.7), k: i });
    // 城堡方向地平线上的一团光：灯光打在烟上的亮
    this.glow = mk(0, 0, 10, 2.2); this.glow.scale.set(380, 150, 1); this.glow.renderOrder = 3;

    // 炸开时映在场景上的一点同色闪光
    this.flash = new THREE.HemisphereLight(0xffffff, 0x000000, 0);
    scene.add(this.flash);
    this.flashAmt = 0; this.flashCol = new THREE.Color(1, 1, 1);
    this.audio = null;
  }

  // 第一次用户操作之后才能出声
  initAudio() {
    if (this.audio) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
      const ctx = new AC();
      const len = ctx.sampleRate * 2, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      const master = ctx.createGain(); master.gain.value = 0.4; master.connect(ctx.destination);
      this.audio = { ctx, buf, master };
    } catch (e) { this.audio = null; }
  }

  _boom(big) {
    const a = this.audio; if (!a || a.ctx.state !== 'running') return;
    const t = a.ctx.currentTime;
    const src = a.ctx.createBufferSource(); src.buffer = a.buf; src.playbackRate.value = 0.5 + Math.random() * 0.4;
    const lp = a.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(big ? 240 : 380, t); lp.frequency.exponentialRampToValueAtTime(60, t + 1.1);
    const g = a.ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(big ? 0.45 : 0.22, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + (big ? 1.4 : 0.8));
    src.connect(lp); lp.connect(g); g.connect(a.master); src.start(t, Math.random()); src.stop(t + 1.6);
  }

  _spawn(x, y, z, vx, vy, vz, c0, c1, size, life, drag, grav, flag = 0) {
    const i = this.head; this.head = (this.head + 1) % MAX;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.base.set(c0, i * 6); this.base.set(c1, i * 6 + 3);
    this.size0[i] = size; this.life[i] = life; this.maxLife[i] = life; this.drag[i] = drag; this.grav[i] = grav; this.flag[i] = flag; this.trailT[i] = 0;
  }

  // ---- 执行一个 cue
  _fire(q) {
    const [x, z] = at(q.lat || 0, q.back || 0);
    if (q.k === 'shell') {
      const T = 1.2 + Math.random() * 0.3;
      this.shells.push({ x, y: 8, z, vy: (q.h - 8) / T, t: T, q });       // 从城堡背后的地面升空，上半程才越过屋顶露出来
    } else if (q.k === 'comet') {
      // 从城堡屋顶打出去的一颗亮星，拖着尾巴，到顶点熄灭。h 是离地的顶点高度，ang 是朝外侧倾斜的角度
      const y0 = this._roof(q.lat), a = (q.ang || 0) * Math.PI / 180, g = 16, vy = Math.sqrt(2 * g * Math.max(8, q.h - y0)), vh = vy * Math.tan(a), T = vy / g;
      this._spawn(x, y0, z, LAT.x * vh, vy, LAT.z * vh, q.c, C.white, q.thin ? 2.8 : 3.8, T * 0.97, 0, g, 5);
    } else if (q.k === 'mine') {
      const n = q.n || 24, g = 13, y0 = this._roof(q.lat);
      for (let i = 0; i < n; i++) {
        const a = (Math.random() - 0.5) * 1.0, b = (Math.random() - 0.5) * 0.6, v = Math.sqrt(2 * g * q.h) * (0.5 + Math.random() * 0.55);
        this._spawn(x, y0, z, (LAT.x * Math.sin(a) + DIR.x * Math.sin(b)) * v, Math.cos(a) * v, (LAT.z * Math.sin(a) + DIR.z * Math.sin(b)) * v, q.c, C.white, 2.2, 0.9 + Math.random() * 0.6, 0.4, g);
      }
      this.smoke = Math.min(1, this.smoke + 0.03);
    } else if (q.k === 'laser') {
      this.laserT = q.dur;
    }
  }

  // 发射点的高度：城堡范围内取那一处的屋顶 / 塔顶（由远景模块给出轮廓），城堡两侧之外从地面打
  _roof(lat = 0) {
    if (!this.roofAt) return CASTLE.h * 0.55;
    const r = this.roofAt(lat);
    return r > 5 ? Math.min(r, CASTLE.h * 0.9) + 0.5 : 3;
  }

  _burst(s) {
    const q = s.q, type = q.type || 'peony', R = (q.r || 16) * (0.92 + Math.random() * 0.16), big = R > 20;
    const c0 = q.c, c1 = q.c2 || q.c;
    const drag = 1.6, v0 = R * drag * 1.08, k = R / 18;             // k：按半径调粒子数
    const dir = (out) => { let x, y, z, l; do { x = Math.random() * 2 - 1; y = Math.random() * 2 - 1; z = Math.random() * 2 - 1; l = x * x + y * y + z * z; } while (l > 1 || l < 0.02); l = Math.sqrt(l); out[0] = x / l; out[1] = y / l; out[2] = z / l; };
    const d = [0, 0, 0];
    if (type === 'peony') {                                         // 牡丹：整齐的小球，外圈一色、芯一色
      const n = Math.round(130 * k);
      for (let i = 0; i < n; i++) { dir(d); const inner = i % 4 === 0, v = v0 * (inner ? 0.5 : 0.94 + Math.random() * 0.1); this._spawn(s.x, s.y, s.z, d[0] * v, d[1] * v, d[2] * v, inner ? c1 : c0, inner ? c1 : c0, 2.4, 1.6 + Math.random() * 0.6, drag, 8); }
    } else if (type === 'glitter') {                                // 白金闪烁：炸开后一粒粒忽明忽暗，慢慢往下飘
      const n = Math.round(150 * k);
      for (let i = 0; i < n; i++) { dir(d); const v = v0 * (0.45 + Math.random() * 0.6); this._spawn(s.x, s.y, s.z, d[0] * v, d[1] * v, d[2] * v, c0, c1, 2.2, 2.4 + Math.random() * 1.3, 1.8, 7, 1); }
    } else if (type === 'willow') {                                 // 金色垂柳：拖着长尾垂落
      const n = Math.round(60 * k);
      for (let i = 0; i < n; i++) { dir(d); const v = v0 * (0.7 + Math.random() * 0.25); this._spawn(s.x, s.y, s.z, d[0] * v, d[1] * v + 5, d[2] * v, C.gold, C.dim, 2.2, 3.2 + Math.random() * 0.9, 1.15, 13, 4); }
    }
    this._spawn(s.x, s.y, s.z, 0, 0, 0, [1, 1, 1], c0, big ? 26 : 18, 0.2, 0, 0);          // 炸点的一团亮光
    this.flashCol.setRGB(c0[0], c0[1], c0[2]); this.flashAmt = Math.min(1, this.flashAmt + (big ? 0.45 : 0.25));
    this.smoke = Math.min(1, this.smoke + (big ? 0.07 : 0.04));
    this.booms.push({ t: Math.hypot(s.x, s.y, s.z) / 340, big });                           // 声音按约 340 米/秒传过来
  }

  toggle() { this.enabled = !this.enabled; return this.enabled; }

  update(dt, time) {
    // 只在夜里放：入夜渐起，天亮渐停
    const want = this.enabled && this.env.night > 0.72 ? 1 : 0;
    this.level += (want - this.level) * Math.min(1, dt * 0.8);
    const lit = this.level > 0.02;
    if (lit && want && dt > 0) {
      // 演出时钟：走到哪个 cue 就打哪个，整轮放完后循环
      this.clock += dt;
      const S = this.show;
      while (this.cue < S.cues.length && S.cues[this.cue].t + S.cues[this.cue].jit <= this.clock) this._fire(S.cues[this.cue++]);
      if (this.clock >= S.length) { this.clock = 0; this.cue = 0; }
    }
    // 升空（礼花弹上升时只有一点暗尾）
    for (let k = this.shells.length - 1; k >= 0; k--) {
      const s = this.shells[k];
      s.t -= dt; s.y += s.vy * dt;
      if (dt > 0) this._spawn(s.x, s.y, s.z, (Math.random() - 0.5) * 2, -5, (Math.random() - 0.5) * 2, [0.9, 0.7, 0.4], [0.6, 0.3, 0.1], 1.2, 0.35, 0.5, 4);
      if (s.t <= 0) { this._burst(s); this.shells.splice(k, 1); }
    }
    // 粒子
    let alive = 0;
    const { pos, vel, col, base, size, size0, life, maxLife, drag, grav, flag, trailT } = this;
    for (let i = 0; i < MAX; i++) {
      if (life[i] <= 0) { if (size[i] !== 0) { size[i] = 0; col[i * 4 + 3] = 0; } continue; }
      life[i] -= dt; alive++;
      const k = Math.exp(-drag[i] * dt), j = i * 3;
      vel[j] *= k; vel[j + 1] = vel[j + 1] * k - grav[i] * dt; vel[j + 2] *= k;
      pos[j] += vel[j] * dt; pos[j + 1] += vel[j + 1] * dt; pos[j + 2] += vel[j + 2] * dt;
      const f = Math.max(0, life[i] / maxLife[i]), m = 1 - f, b = i * 6, c = i * 4;
      col[c] = base[b] * f + base[b + 3] * m; col[c + 1] = base[b + 1] * f + base[b + 4] * m; col[c + 2] = base[b + 2] * f + base[b + 5] * m;
      let a = Math.min(1, f * 2.2) * this.level;
      const fl = flag[i];
      if (fl === 1) a *= m > 0.2 ? (Math.sin(time * 38 + i * 12.9898) > 0.2 ? 1 : 0.08) : 1;
      col[c + 3] = a; size[i] = size0[i] * (0.55 + 0.45 * f);
      if (fl === 2 || fl >= 4) {                 // 撒尾迹（4 = 更长的尾，5 = 彗星：又密又长，连成一条线）
        trailT[i] -= dt;
        if (trailT[i] <= 0 && f > 0.1) {
          trailT[i] = fl === 5 ? 0.02 : fl === 4 ? 0.045 : 0.07;
          this._spawn(pos[j], pos[j + 1], pos[j + 2], 0, -1.5, 0, [col[c] * 0.8, col[c + 1] * 0.8, col[c + 2] * 0.8], [col[c] * 0.3, col[c + 1] * 0.2, col[c + 2] * 0.1], size0[i] * (fl === 5 ? 0.7 : 0.55), fl === 5 ? 1.0 : fl === 4 ? 0.8 : 0.5, 0, 3);
        }
      }
    }
    this.points.visible = alive > 0;
    if (alive > 0) {
      const g = this.points.geometry;
      g.attributes.position.needsUpdate = true; g.attributes.aColor.needsUpdate = true; g.attributes.aSize.needsUpdate = true;
      const h = this.renderer.getDrawingBufferSize(_s).y;
      this.mat.uniforms.uScale.value = 1.35 * h / (2 * Math.tan(((this.fov || 60) * Math.PI) / 360));
    }
    // 探照光束、激光扇面、烟的光晕
    this.sky.visible = lit;
    this.smoke = Math.max(0, this.smoke - dt * 0.06);
    this.laserT = Math.max(0, this.laserT - dt);
    this.laser += ((this.laserT > 0 ? 1 : 0) - this.laser) * Math.min(1, dt * 1.5);
    if (lit) {
      for (const b of this.beams) {
        // 左三道右三道镜像着来回摆
        const lean = b.side * (0.2 + 0.17 * (b.k % 3) + Math.sin(time * 0.3 + b.phase) * 0.3), m = b.mesh;
        m.rotation.z = -lean; m.scale.set(11, 300, 1);
        m.material.uniforms.uAmt.value = 0.13 * this.level * (0.75 + 0.25 * Math.sin(time * 0.8 + b.phase * 2));
        m.material.uniforms.uColor.value.setRGB(0.92, 0.95, 1.0);
      }
      for (const l of this.lasers) {
        const m = l.mesh, sweep = Math.sin(time * 0.55) * 0.25;
        m.rotation.z = -((l.k - 3) * 0.2 + sweep * (l.k - 3) * 0.3); m.scale.set(2.2, 260, 1);
        m.material.uniforms.uAmt.value = 0.3 * this.laser * this.level;
        m.material.uniforms.uColor.value.setRGB(0.25, 0.5, 1.0);
      }
      this.glow.material.uniforms.uAmt.value = this.level * (0.1 + this.smoke * 0.4 + this.laser * 0.06) + this.flashAmt * 0.15;
      this.glow.material.uniforms.uColor.value.setRGB(0.75, 0.8, 1.0).lerp(this.flashCol, Math.min(1, this.flashAmt));
    }
    // 闪光与爆响
    this.flashAmt = Math.max(0, this.flashAmt - dt * 2.6);
    this.flash.intensity = this.flashAmt * 0.22 * this.level; this.flash.color.copy(this.flashCol);
    for (let k = this.booms.length - 1; k >= 0; k--) { const b = this.booms[k]; b.t -= dt; if (b.t <= 0) { if (this.level > 0.3) this._boom(b.big); this.booms.splice(k, 1); } }
  }
}
const _s = new THREE.Vector2();
