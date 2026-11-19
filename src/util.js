import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// OSM 平面坐标 (x 东, y 北) → three.js 世界坐标 (X 东, Y 上, Z 南)
export const P = (x, y, h = 0) => new THREE.Vector3(x, h, -y);
export const V2 = (x, y) => new THREE.Vector2(x, y);

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const lerp = (a, b, t) => a + (b - a) * t;
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const smooth = (t) => t * t * (3 - 2 * t);

export function canvas(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  if (draw) draw(g, w, h);
  return c;
}

export function canvasTex(c, { repeat, srgb = true, aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = aniso;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  return t;
}

// 折线工具 -------------------------------------------------------------
export function polyLength(pts) {
  let L = 0;
  for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return L;
}

// Catmull-Rom 重采样，返回 {pts:[[x,y]...], tan:[[tx,ty]...]}
export function resample(pts, step = 1) {
  const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(p[0], 0, p[1])), false, 'centripetal');
  const n = Math.max(2, Math.round(curve.getLength() / step));
  const out = [], tan = [];
  for (let i = 0; i <= n; i++) {
    const p = curve.getPointAt(i / n), t = curve.getTangentAt(i / n);
    out.push([p.x, p.z]); tan.push([t.x, t.z]);
  }
  return { pts: out, tan };
}

// 由中心线生成带状网格（平面坐标），uv.x 横向 0..1，uv.y 沿长度（米/uvScale）
export function ribbon(center, halfW, { y = 0.02, uvScale = 4, step = 1 } = {}) {
  const { pts, tan } = resample(center, step);
  const pos = [], uv = [], idx = [];
  let d = 0;
  for (let i = 0; i < pts.length; i++) {
    if (i) d += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    const nx = -tan[i][1], ny = tan[i][0];
    const w = typeof halfW === 'function' ? halfW(i / (pts.length - 1)) : halfW;
    pos.push(pts[i][0] + nx * w, y, -(pts[i][1] + ny * w), pts[i][0] - nx * w, y, -(pts[i][1] - ny * w));
    uv.push(0, d / uvScale, 1, d / uvScale);
    if (i) { const a = (i - 1) * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// 平面多边形 → 水平面片（朝上），世界平铺 uv
export function polyFlat(poly, y = 0, uvScale = 4) {
  const shape = new THREE.Shape(poly.map((p) => new THREE.Vector2(p[0], p[1])));
  const g = new THREE.ShapeGeometry(shape);
  const pos = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), yy = pos.getY(i);
    pos.setXYZ(i, x, y, -yy);
    uv.setXY(i, x / uvScale, yy / uvScale);
  }
  // ShapeGeometry 面朝 +Z，翻到 XZ 平面后朝 +Y 需要翻转绕序
  const idx = g.index.array;
  for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; }
  g.computeVertexNormals();
  return g;
}

// 平面多边形 → 竖直拉伸体（底 y0，顶 y1）
export function polyPrism(poly, y0, y1) {
  const shape = new THREE.Shape(poly.map((p) => new THREE.Vector2(p[0], p[1])));
  const g = new THREE.ExtrudeGeometry(shape, { depth: y1 - y0, bevelEnabled: false });
  g.rotateX(-Math.PI / 2);          // (x, y, z) → (x, z, -y) ：平面 y → 世界 -Z，拉伸方向 → +Y
  g.translate(0, y0, 0);
  return g;
}

export function shoelace(poly) {
  let a = 0;
  for (let i = 0; i < poly.length; i++) { const p = poly[i], q = poly[(i + 1) % poly.length]; a += p[0] * q[1] - q[0] * p[1]; }
  return a / 2;
}

export function pointInPoly(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// 静态合批：把 root 下面「同一材质、建好之后不会再动」的小网格烘焙到 root 的坐标系里，合成一个网格。
// 每个网格是一次绘制调用，路牌杆、桌椅、栏杆柱这类零件有几百个，合起来能省掉一大半调用。
// 不合的：实例化网格、多材质、半透明（要按远近排序）、镜像过的（面朝向会反）、顶点很多的大件（保留视锥剔除）、
// 当前不可见的、标了 userData.dyn 的（之后还要转动 / 显隐）。
export function batchStatic(root, { maxVerts = 6000 } = {}) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const groups = new Map();
  root.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh || o.children.length || Array.isArray(o.material)) return;
    const mat = o.material, g = o.geometry;
    if (!mat || mat.transparent || !g.attributes.position || g.attributes.position.count > maxVerts) return;
    if (g.morphAttributes && Object.keys(g.morphAttributes).length) return;
    for (let p = o; p; p = p.parent) { if (!p.visible || p.userData.dyn) return; if (p === root) break; }
    if (o.matrixWorld.determinant() < 0) return;
    const key = [mat.uuid, Object.keys(g.attributes).sort().join(','), o.castShadow ? 1 : 0, o.receiveShadow ? 1 : 0, o.renderOrder, o.customDepthMaterial ? o.customDepthMaterial.uuid : ''].join('|');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(o);
  });
  let saved = 0;
  const m4 = new THREE.Matrix4();
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    const geos = list.map((o) => { const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone(); g.applyMatrix4(m4.multiplyMatrices(inv, o.matrixWorld)); return g; });
    let merged = null;
    try { merged = mergeGeometries(geos, false); } catch (e) { merged = null; }
    if (!merged) continue;                                  // 属性对不上（比如 uv 维数不同）就原样留着
    const first = list[0], mesh = new THREE.Mesh(merged, first.material);
    mesh.castShadow = first.castShadow; mesh.receiveShadow = first.receiveShadow; mesh.renderOrder = first.renderOrder;
    if (first.customDepthMaterial) mesh.customDepthMaterial = first.customDepthMaterial;
    for (const o of list) o.parent.remove(o);
    root.add(mesh); saved += list.length - 1;
  }
  return saved;
}

export function shadow(o, cast = true, receive = true) {
  o.traverse((m) => { if (m.isMesh) { m.castShadow = cast; m.receiveShadow = receive; } });
  return o;
}
