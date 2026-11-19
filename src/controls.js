// 第一人称步行（带碰撞）、自动游览、俯瞰
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { BLOCKS, PARK, WALLS, ZPD, ZOOTRON, CIRCLE, START, TOUR, FACADES, ROAD, LAND } from './layout.js';
import { clamp, resample, pointInPoly } from './util.js';

const EYE = 1.62, RADIUS = 0.45;

export function buildColliders(extra) {
  const segs = [];
  const addPoly = (poly, closed = true) => {
    for (let i = 0; i < poly.length - (closed ? 0 : 1); i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length];
      segs.push([a[0], a[1], b[0], b[1]]);
    }
  };
  Object.values(BLOCKS).forEach((p) => addPoly(p));
  addPoly(PARK);
  WALLS.forEach((w) => addPoly(w, false));
  // 立面浮雕最多凸出约 1 米：立面线本身按「加粗的线段」来挡（离线 1.15 米以内进不去），视角不会钻进雨棚和阳台里。
  // 以前是另加一条外移的碰撞线，转角处两条线接不上，人能钻到线和墙之间的夹缝里出不来。
  for (const f of FACADES) segs.push([f.a[0], f.a[1], f.b[0], f.b[1], 1.15]);
  const circles = [
    [ZPD.c[0], ZPD.c[1], ZPD.r + 0.2], [ZPD.c[0], ZPD.c[1] - ZPD.r - 0.6, 3.3],
    [ZOOTRON.c[0], ZOOTRON.c[1], ZOOTRON.r + 0.3],
    [CIRCLE.c[0], CIRCLE.c[1], 4.4], [CIRCLE.c[0], CIRCLE.c[1] + 1.25, 4.4], [CIRCLE.c[0], CIRCLE.c[1] - 1.25, 4.4],   // 椭圆形的环岛中心岛
    [-8.0, -24.5, 1.25], [-6.4, -24.8, 1.25],                                              // 长颈鹿出租车
    [33.4, -45.9, 1.5], [36.3, -45.9, 1.5], [39.2, -45.9, 1.5], [43.2, -45.7, 1.5],   // 食集小摊
    [39.0, -55.9, 1.5], [40.4, -55.7, 1.5],
    [29.5, -34.2, 1.4],                                               // 海报栏                                                // 巨型长椅
  ];
  // 街上的小物件（树、路灯、长椅、垃圾桶、栏杆……）由 props.js 给出
  if (extra) { circles.push(...(extra.circles || [])); segs.push(...(extra.segs || [])); }
  return { segs, circles };
}

// 可达网格：从主入口出发、按上面的碰撞规则能走到的所有位置（0.25 米一格）。
// 走不到的地方 —— 建筑内部、被几道碰撞围死的小空隙、园区外 —— 一律算「陷进去了」，不让进，进了就拉回来。
const CELL = 0.25, GX0 = -66, GY0 = -92, GW = 624, GH = 424;
function buildReach(col) {
  const solid = new Uint8Array(GW * GH);
  const mark = (x0, y0, x1, y1, pad, dist) => {
    const i0 = Math.max(0, Math.floor((Math.min(x0, x1) - pad - GX0) / CELL)), i1 = Math.min(GW - 1, Math.ceil((Math.max(x0, x1) + pad - GX0) / CELL));
    const j0 = Math.max(0, Math.floor((Math.min(y0, y1) - pad - GY0) / CELL)), j1 = Math.min(GH - 1, Math.ceil((Math.max(y0, y1) + pad - GY0) / CELL));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      if (dist(GX0 + (i + 0.5) * CELL, GY0 + (j + 0.5) * CELL) < pad - 0.03) solid[j * GW + i] = 1;
    }
  };
  for (const s of col.segs) {
    const ax = s[0], ay = s[1], dx = s[2] - ax, dy = s[3] - ay, l2 = dx * dx + dy * dy || 1e-9;
    mark(ax, ay, s[2], s[3], s[4] || RADIUS, (x, y) => { const t = clamp(((x - ax) * dx + (y - ay) * dy) / l2, 0, 1); return Math.hypot(x - ax - dx * t, y - ay - dy * t); });
  }
  for (const c of col.circles) mark(c[0], c[1], c[0], c[1], c[2] + RADIUS, (x, y) => Math.hypot(x - c[0], y - c[1]));
  for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) {
    if (!solid[j * GW + i] && !pointInPoly(GX0 + (i + 0.5) * CELL, GY0 + (j + 0.5) * CELL, LAND)) solid[j * GW + i] = 1;
  }
  const reach = new Uint8Array(GW * GH);
  const si = Math.floor((START.p[0] - GX0) / CELL), sj = Math.floor((START.p[1] - GY0) / CELL);
  const stack = [sj * GW + si]; reach[stack[0]] = 1;
  while (stack.length) {
    const k = stack.pop(), i = k % GW, j = (k / GW) | 0;
    if (i > 0 && !solid[k - 1] && !reach[k - 1]) { reach[k - 1] = 1; stack.push(k - 1); }
    if (i < GW - 1 && !solid[k + 1] && !reach[k + 1]) { reach[k + 1] = 1; stack.push(k + 1); }
    if (j > 0 && !solid[k - GW] && !reach[k - GW]) { reach[k - GW] = 1; stack.push(k - GW); }
    if (j < GH - 1 && !solid[k + GW] && !reach[k + GW]) { reach[k + GW] = 1; stack.push(k + GW); }
  }
  return { reach, solid };
}

export class Walker {
  constructor(camera, dom, colliders) {
    this.camera = camera; this.dom = dom; this.col = colliders;
    this.pos = new THREE.Vector2(START.p[0], START.p[1]);
    this.yaw = START.yaw; this.pitch = 0;
    this.keys = new Set();
    this.mode = 'walk';            // walk | tour | orbit
    this.bob = 0; this.vel = new THREE.Vector2();
    this.locked = false;
    this.onMode = () => {};
    this.camera.rotation.order = 'YXZ';

    this.orbit = new OrbitControls(camera, dom);
    this.orbit.enabled = false; this.orbit.target.set(2, 4, 30);
    this.orbit.maxPolarAngle = Math.PI * 0.47; this.orbit.minDistance = 25; this.orbit.maxDistance = 260;
    this.orbit.enableDamping = true;

    this.tourPath = resample(TOUR, 0.5);
    this.grid = buildReach(colliders);
    this._safe = resample(ROAD, 1).pts.filter((q) => this.grid.reach[this._cell(q[0], q[1])] === 1);
    if (!this._safe.length) this._safe = [START.p];
    this._bad = 0;
    this.tourS = 0;

    addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      if (this.mode === 'tour' && ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) this.setMode('walk');
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
    document.addEventListener('pointerlockchange', () => { this.locked = document.pointerLockElement === dom; document.body.classList.toggle('walking', this.locked); });
    let drag = false;
    dom.addEventListener('mousedown', (e) => { if (this.mode !== 'orbit' && !this.locked && e.button === 0) drag = true; });
    addEventListener('mouseup', () => { drag = false; });
    addEventListener('mousemove', (e) => {
      if (this.mode === 'orbit') return;
      if (this.locked || drag) {
        const k = this.locked ? 0.0022 : 0.0045;
        this.yaw += e.movementX * k; this.pitch = clamp(this.pitch - e.movementY * k, -1.25, 1.35);
      }
    });
  }

  lock() {
    if (this.mode === 'orbit' || this.locked) return;
    try { const p = this.dom.requestPointerLock?.(); p?.catch?.(() => {}); } catch (e) { /* 不支持指针锁定时可按住鼠标拖动环视 */ }
  }

  setMode(m) {
    if (m === this.mode) return;
    if (m === 'orbit') {
      document.exitPointerLock?.();
      this.orbit.enabled = true;
      this.camera.position.set(this.pos.x - 60, 95, -this.pos.y + 110);
      this.orbit.target.set(2, 4, 30); this.orbit.update();
    } else {
      this.orbit.enabled = false;
      if (m === 'tour') {         // 从离当前位置最近的路线点开始
        let best = 0, bd = 1e9;
        this.tourPath.pts.forEach((p, i) => { const d = Math.hypot(p[0] - this.pos.x, p[1] - this.pos.y); if (d < bd) { bd = d; best = i; } });
        this.tourS = best >= this.tourPath.pts.length - 4 ? 0 : best;
      }
    }
    this.mode = m; this.onMode(m);
  }

  _cell(x, y) {
    const i = Math.floor((x - GX0) / CELL), j = Math.floor((y - GY0) / CELL);
    return i < 0 || j < 0 || i >= GW || j >= GH ? -1 : j * GW + i;
  }

  // 这个点是不是「陷进去了」：从入口走不到的地方（建筑 / 绿地内部、碰撞围死的空隙、园区外）。
  // 贴着墙站时人所在的格子可能刚好算实心，所以相邻一圈里有可达格子就不算。
  blocked(x, y) {
    const i = Math.floor((x - GX0) / CELL), j = Math.floor((y - GY0) / CELL), R = this.grid.reach;
    for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) {
      const u = i + a, v = j + b;
      if (u >= 0 && v >= 0 && u < GW && v < GH && R[v * GW + u]) return false;
    }
    return true;
  }

  // 离 (x, y) 最近的、肯定能站人的位置（大马路中线上的点）
  nearestSafe(x, y) {
    let best = this._safe[0], bd = 1e9;
    for (const q of this._safe) { const d = (q[0] - x) * (q[0] - x) + (q[1] - y) * (q[1] - y); if (d < bd) { bd = d; best = q; } }
    return best;
  }

  // 脱困：回到最近的大马路上
  rescue() { const q = this.nearestSafe(this.pos.x, this.pos.y); this.pos.set(q[0], q[1]); this.vel.set(0, 0); this._bad = 0; if (this.mode !== 'walk') this.setMode('walk'); }

  teleport(x, y) {
    if (this.blocked(x, y)) { const q = this.nearestSafe(x, y); x = q[0]; y = q[1]; }      // 点到建筑上时落在最近的路面
    this.pos.set(x, y); this.vel.set(0, 0); this._collide();
    if (this.blocked(this.pos.x, this.pos.y)) this.rescue();
    if (this.mode === 'orbit') this.setMode('walk');
  }

  _collide() {
    const p = this.pos;
    for (let it = 0; it < 3; it++) {
      for (const s of this.col.segs) {
        const ax = s[0], ay = s[1], bx = s[2], by = s[3];
        const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1e-9;
        const t = clamp(((p.x - ax) * dx + (p.y - ay) * dy) / l2, 0, 1);
        const cx = ax + dx * t, cy = ay + dy * t;
        let ex = p.x - cx, ey = p.y - cy; const d = Math.hypot(ex, ey);
        const R = s[4] || RADIUS;
        if (d < R) {
          if (d < 1e-6) { ex = -dy; ey = dx; const l = Math.hypot(ex, ey); ex /= l; ey /= l; } else { ex /= d; ey /= d; }
          p.x = cx + ex * R; p.y = cy + ey * R;
        }
      }
      for (const c of this.col.circles) {
        let ex = p.x - c[0], ey = p.y - c[1]; const d = Math.hypot(ex, ey), R = c[2] + RADIUS;
        if (d < R) { if (d < 1e-6) { ex = 1; ey = 0; } else { ex /= d; ey /= d; } p.x = c[0] + ex * R; p.y = c[1] + ey * R; }
      }
    }
  }

  update(dt) {
    if (this.mode === 'orbit') { this.orbit.update(); return; }
    let moving = 0;
    if (this.mode === 'tour') {
      const P = this.tourPath;
      this.tourS += dt * 2.3 / 0.5;
      if (this.tourS >= P.pts.length - 1) { this.tourS = P.pts.length - 1; this.setMode('walk'); }
      const i = Math.min(P.pts.length - 2, Math.floor(this.tourS)), f = this.tourS - i;
      this.pos.set(P.pts[i][0] + (P.pts[i + 1][0] - P.pts[i][0]) * f, P.pts[i][1] + (P.pts[i + 1][1] - P.pts[i][1]) * f);
      const j = Math.min(P.pts.length - 1, i + 8);
      const want = Math.atan2(P.pts[j][0] - P.pts[i][0], P.pts[j][1] - P.pts[i][1]) + Math.sin(this.tourS * 0.045) * 0.5;
      let d = want - this.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
      this.yaw += d * Math.min(1, dt * 1.6);
      this.pitch += (0.1 + Math.sin(this.tourS * 0.03) * 0.08 - this.pitch) * Math.min(1, dt * 1.5);
      moving = 0.7;
    } else {
      const k = this.keys;
      const f = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
      const r = (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0);
      if (k.has('ArrowLeft')) this.yaw -= dt * 1.8;
      if (k.has('ArrowRight')) this.yaw += dt * 1.8;
      const sp = k.has('ShiftLeft') || k.has('ShiftRight') ? 7.5 : 3.4;
      const s = Math.sin(this.yaw), c = Math.cos(this.yaw);
      let vx = (s * f + c * r), vy = (c * f - s * r);
      const l = Math.hypot(vx, vy); if (l > 1) { vx /= l; vy /= l; }
      this.vel.x += (vx * sp - this.vel.x) * Math.min(1, dt * 10);
      this.vel.y += (vy * sp - this.vel.y) * Math.min(1, dt * 10);
      // 一帧的位移切成不超过 0.2 米的小步（卡顿时一帧走得远，整步算会穿过转角）；
      // 哪一小步会把人带进「走不到的地方」，那一小步就不走
      const mx = this.vel.x * dt, my = this.vel.y * dt, n = Math.max(1, Math.ceil(Math.hypot(mx, my) / 0.2));
      for (let i = 0; i < n; i++) {
        const ox = this.pos.x, oy = this.pos.y;
        this.pos.x += mx / n; this.pos.y += my / n;
        this._collide();
        if (this.blocked(this.pos.x, this.pos.y) && !this.blocked(ox, oy)) { this.pos.set(ox, oy); this.vel.set(0, 0); break; }
      }
      // 保险：万一已经在里面了（比如旧存档位置），停留超过 0.3 秒就拉回最近的路面
      if (this.blocked(this.pos.x, this.pos.y)) { this._bad += dt; if (this._bad > 0.3) this.rescue(); } else this._bad = 0;
      moving = Math.min(1, this.vel.length() / 3.4);
    }
    this.bob += dt * moving * 9;
    const bobY = Math.sin(this.bob) * 0.035 * moving;
    this.camera.position.set(this.pos.x, EYE + bobY, -this.pos.y);
    this.camera.rotation.set(this.pitch, -this.yaw, 0);
  }
}
