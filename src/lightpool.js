// 点光源池。
// 前向渲染里，场景中每多一盏点光源，所有受光材质的每个像素都要多算一遍光照；园区里路灯、警局、
// 霓虹等加起来有十几盏，实测占每帧三到四成的时间，白天亮度为 0 时也照算不误。
// 这里把那些灯全部从渲染里摘掉（visible = false，亮度照旧由各自的夜景逻辑驱动），
// 换成固定 K 盏「槽位灯」：每帧挑出离镜头最近、此刻真正起作用的 K 个光源，把位置 / 颜色 / 亮度抄到槽位上。
// 白天槽位整体关掉（0 盏），夜里恒定 K 盏 —— 一共只有两套着色器，加载时都预热好，切换时不会现编译。
import * as THREE from 'three';

const _p = new THREE.Vector3();

export class LightPool {
  constructor(scene, K = 6) {
    this.sources = [];
    scene.updateMatrixWorld(true);
    scene.traverse((o) => {
      if (!o.isPointLight) return;
      o.visible = false;
      this.sources.push({ light: o, pos: o.getWorldPosition(new THREE.Vector3()), lvl: 0, slot: -1, w: 0, f: 0 });
    });
    this.slots = [];
    for (let i = 0; i < K; i++) {
      const l = new THREE.PointLight(0xffffff, 0, 20, 1.5);
      l.visible = false; scene.add(l);
      this.slots.push({ light: l, src: null });
    }
    this.on = false; this.force = false;
  }

  // 预热用：强制把槽位打开 / 关上，让两套着色器都编译一遍
  setForce(on) { this.force = on; for (const s of this.slots) s.light.visible = on; this.on = on; }

  update(camera, dt, night) {
    const on = this.force || night > 0.01;
    if (on !== this.on) { this.on = on; for (const s of this.slots) s.light.visible = on; }
    if (!on) return;
    const K = this.slots.length, S = this.sources;
    // 每个光源的「此刻有多要紧」：超出照射范围 15 米后开始淡出，再远 40 米完全不算
    for (const s of S) {
      const L = s.light, d = _p.copy(s.pos).sub(camera.position).length();
      const R = L.distance || 30;
      s.f = L.intensity > 0 ? Math.min(1, Math.max(0, 1 - (d - R - 15) / 40)) : 0;
      s.w = s.f > 0 ? s.f * 1000 - d : -1e9;
    }
    // 选出最要紧的 K 个
    const order = S.slice().sort((a, b) => b.w - a.w);
    const want = new Set();
    for (let i = 0; i < order.length && want.size < K; i++) if (order[i].f > 0) want.add(order[i]);
    const rate = dt > 0 ? Math.min(1, dt * 3.5) : 1;       // 约 0.3 秒淡入淡出；dt = 0（调试取景）时直接到位
    // 不再需要的：淡出后让出槽位
    for (const s of S) {
      if (s.slot < 0 || want.has(s)) continue;
      s.lvl -= rate; if (s.lvl <= 0) { s.lvl = 0; this.slots[s.slot].src = null; s.slot = -1; }
    }
    // 新需要的：找空槽位，淡入
    for (const s of want) {
      if (s.slot < 0) {
        const k = this.slots.findIndex((q) => !q.src);
        if (k < 0) continue;                               // 槽位还没让出来，下一帧再说
        this.slots[k].src = s; s.slot = k; s.lvl = 0;
      }
      s.lvl = Math.min(1, s.lvl + rate);
    }
    for (const q of this.slots) {
      const l = q.light, s = q.src;
      if (!s) { l.intensity = 0; continue; }
      const L = s.light;
      l.position.copy(s.pos); l.color.copy(L.color); l.distance = L.distance; l.decay = L.decay;
      l.intensity = L.intensity * s.f * s.lvl;
    }
  }
}
