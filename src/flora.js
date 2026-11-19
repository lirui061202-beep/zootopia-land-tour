// 植被：用「枝叶卡片」做树冠——每棵树几十到上百张带镂空枝叶贴图的小面片，围着一个深色内核分布，
// 比一团团圆球更接近真实的行道树；灌木、花丛、针叶树、龙舌兰同理。素材来自 artF（抠像）。
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry32 } from './util.js';
import { cutTex } from './art.js';

const strip = (g) => { const n = g.index ? g.toNonIndexed() : g; for (const k of Object.keys(n.attributes)) if (!['position', 'normal', 'uv'].includes(k)) n.deleteAttribute(k); return n; };
export const mergeAll = (list) => mergeGeometries(list.map(strip), false);

// 一批朝外的卡片：centers = [[x, y, z, size, nx, ny, nz]]，法线用「从树冠中心指向外」的方向，受光柔和
// wild：每三张里有一张完全随机朝向。全都朝外时，树冠轮廓上的卡片正好侧对镜头，看上去是一道道梳出来的细线
function cards(list, rnd, tilt = 0.6, wild = false) {
  const pos = [], nor = [], uv = [], idx = [];
  const q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), n = new THREE.Vector3(), z = new THREE.Vector3(0, 0, 1);
  list.forEach(([x, y, zz, s, nx, ny, nz], i) => {
    n.set(nx, ny, nz).normalize();
    q.setFromUnitVectors(z, n);
    const tl = wild && i % 3 === 0 ? 3.0 : tilt;
    e.set((rnd() - 0.5) * tl, (rnd() - 0.5) * tl, rnd() * Math.PI * 2);
    q.multiply(new THREE.Quaternion().setFromEuler(e));
    const b = i * 4;
    for (const [cx, cy] of [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]]) {
      v.set(cx * s, cy * s, 0).applyQuaternion(q);
      pos.push(x + v.x, y + v.y, zz + v.z);
      const m = new THREE.Vector3(nx * 0.8 + v.x * 0.25, ny * 0.8 + v.y * 0.25 + 0.25, nz * 0.8 + v.z * 0.25).normalize();
      nor.push(m.x, m.y, m.z); uv.push(cx + 0.5, cy + 0.5);
    }
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

function tube(points, r0, r1, seg = 10, rs = 7) {
  const c = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
  const g = new THREE.TubeGeometry(c, seg, 1, rs, false);
  // 沿长度收细
  const p = g.attributes.position, n = g.attributes.normal;
  for (let i = 0; i < p.count; i++) {
    const t = Math.floor(i / (rs + 1)) / seg, r = r0 + (r1 - r0) * t;
    p.setXYZ(i, p.getX(i) - n.getX(i) * (1 - r), p.getY(i) - n.getY(i) * (1 - r), p.getZ(i) - n.getZ(i) * (1 - r));
  }
  return g;
}

// 落叶行道树：树干 + 3~4 根主枝 + 深色内核 + 两种枝叶卡片
export function deciduous(seed, { height = 6.2, spread = 2.5, nCards = 110 } = {}) {
  const rnd = mulberry32(seed * 977 + 13);
  const trunkH = height * 0.42, cy = height * 0.72, ry = height * 0.3;
  const wood = [tube([[0, 0, 0], [0.05, trunkH * 0.5, 0.03], [0.02, trunkH, -0.04], [0, trunkH + 0.6, 0]], 0.2, 0.11, 10, 8)];
  wood.push(new THREE.CylinderGeometry(0.22, 0.3, 0.25, 9).translate(0, 0.12, 0));        // 根颈
  const limbs = 4 + (rnd() * 2 | 0);
  for (let i = 0; i < limbs; i++) {
    const a = (i / limbs) * Math.PI * 2 + rnd() * 0.7, d = spread * (0.45 + rnd() * 0.3), h = cy + (rnd() - 0.3) * ry * 0.8;
    wood.push(tube([[0, trunkH * 0.9, 0], [Math.cos(a) * d * 0.4, trunkH + (h - trunkH) * 0.55, Math.sin(a) * d * 0.4], [Math.cos(a) * d, h, Math.sin(a) * d]], 0.1, 0.035, 8, 6));
  }
  const A = [], B = [];
  for (let i = 0; i < nCards; i++) {
    // 椭球壳上的均匀方向，下半部分稀一些
    let dx = rnd() * 2 - 1, dy = rnd() * 2 - 1, dz = rnd() * 2 - 1;
    const l = Math.hypot(dx, dy, dz) || 1; dx /= l; dy /= l; dz /= l;
    if (dy < -0.35 && rnd() < 0.25) dy = Math.abs(dy);       // 树冠底面也要有叶子：从树下往上看时不能露出光滑的内核
    const r = i < nCards * 0.22 ? 0.45 + rnd() * 0.3 : 0.82 + rnd() * 0.26;
    const lump = 1 + 0.18 * Math.sin(dx * 4 + seed) * Math.cos(dz * 3.3 + seed * 2);
    const item = [dx * spread * r * lump, cy + dy * ry * r * lump, dz * spread * r * lump, 1.35 + rnd() * 0.75, dx, dy * 0.8 + 0.15, dz];
    (rnd() < 0.55 ? A : B).push(item);
  }
  // 内核只是垫在最里面挡一挡对穿的视线，做小一些：太大了会从叶缝里露出一个光滑的圆顶
  const core = new THREE.IcosahedronGeometry(1, 1); core.scale(spread * 0.5, ry * 0.52, spread * 0.5); core.translate(0, cy, 0);
  return { wood: mergeAll(wood), core, cardsA: cards(A, rnd, 0.6, true), cardsB: cards(B, rnd, 0.6, true) };
}

// 修剪成团的灌木 / 花丛：内核 + 一圈卡片
export function shrub(seed, { r = 0.8, h = 1.0, n = 26 } = {}) {
  const rnd = mulberry32(seed * 311 + 7), list = [];
  for (let i = 0; i < n; i++) {
    let dx = rnd() * 2 - 1, dy = rnd() * 0.9 + 0.1, dz = rnd() * 2 - 1;
    const l = Math.hypot(dx, dy, dz) || 1; dx /= l; dy /= l; dz /= l;
    const k = 0.75 + rnd() * 0.3;
    list.push([dx * r * k, h * 0.45 + dy * h * 0.55 * k, dz * r * k, 0.75 + rnd() * 0.45, dx, dy + 0.2, dz]);
  }
  const core = new THREE.IcosahedronGeometry(1, 1); core.scale(r * 0.7, h * 0.5, r * 0.7); core.translate(0, h * 0.5, 0);
  return { core, cards: cards(list, rnd, 0.9) };
}

// 一面爬满藤叶的墙：L × H 米，立在 z = 0、朝 +Z；返回 { cards, back }（back 是垫在后面的深色底）
export function ivyWall(L, H, seed = 1) {
  const rnd = mulberry32(seed * 733 + 3), list = [];
  const n = Math.round(L * H * 3.4);
  for (let i = 0; i < n; i++) list.push([rnd() * L, 0.2 + rnd() * (H + 0.5), 0.12 + rnd() * 0.3, 1.0 + rnd() * 0.8, (rnd() - 0.5) * 0.5, 0.25, 1]);
  const back = new THREE.PlaneGeometry(L, H); back.translate(L / 2, H / 2, 0.05);
  return { cards: cards(list, rnd, 0.8), back };
}

// 针叶树（柏树一类）：锥形内核 + 一层层下垂的扇形枝
export function conifer(seed, { height = 5.5, base = 1.2 } = {}) {
  const rnd = mulberry32(seed * 131 + 5), list = [];
  const tiers = 9;
  for (let t = 0; t < tiers; t++) {
    const f = t / (tiers - 1), y = 0.7 + f * (height - 1.1), r = base * (1 - f * 0.86), n = Math.max(4, Math.round(9 - f * 5));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + t * 0.7 + rnd() * 0.3;
      list.push([Math.cos(a) * r * 0.7, y, Math.sin(a) * r * 0.7, (1.5 - f * 0.8) * (0.9 + rnd() * 0.3), Math.cos(a), 0.35, Math.sin(a)]);
    }
  }
  const core = new THREE.ConeGeometry(base * 0.62, height, 9); core.translate(0, height / 2 + 0.2, 0);
  const trunk = new THREE.CylinderGeometry(0.08, 0.12, 0.9, 7).translate(0, 0.45, 0);
  return { core, trunk, cards: cards(list, rnd, 0.35) };
}

// 树冠 / 灌木的内核材质：原来是平涂的深绿，从枝叶卡片的缝里露出来像一团墨。
// 铺上枝叶纹理（和卡片同一种叶子），颜色压暗一些当作背光的里层叶子。第一次调用时传入纹理图，之后按颜色取缓存。
let _foliage = null; const _cores = {};
export function coreMaterial(img = null, color = 0x5f7d52) {
  if (img && !_foliage) {
    const c = document.createElement('canvas'); c.width = c.height = 512; c.getContext('2d').drawImage(img, 0, 0, 512, 512);
    _foliage = new THREE.CanvasTexture(c); _foliage.colorSpace = THREE.SRGBColorSpace; _foliage.wrapS = _foliage.wrapT = THREE.RepeatWrapping; _foliage.repeat.set(4, 3); _foliage.anisotropy = 4;
  }
  if (!_cores[color]) _cores[color] = new THREE.MeshStandardMaterial(_foliage ? { color, map: _foliage, roughness: 1 } : { color: new THREE.Color(color).multiplyScalar(0.45), roughness: 1 });
  return _cores[color];
}

// 抠像材质（带镂空）；没有素材时返回 null
export function cutMat(key, { color = 0xffffff, rough = 0.82 } = {}) {
  const c = cutTex(key); if (!c) return null;
  return new THREE.MeshStandardMaterial({ map: c.tex, color, alphaTest: 0.42, roughness: rough, side: THREE.DoubleSide });
}

// 单张直立的抠像（龙舌兰、花簇等小景）：两片十字交叉
export function crossed(size, aspect = 1) {
  const w = size * Math.min(1, aspect) * (aspect >= 1 ? 1 : 1), h = size / Math.max(1, aspect) * (aspect >= 1 ? 1 : 1);
  const a = new THREE.PlaneGeometry(aspect >= 1 ? size : size * aspect, aspect >= 1 ? size / aspect : size); a.translate(0, (aspect >= 1 ? size / aspect : size) / 2, 0);
  const b = a.clone(); b.rotateY(Math.PI / 2);
  const g = mergeAll([a, b]);
  const n = g.attributes.normal; for (let i = 0; i < n.count; i++) n.setXYZ(i, n.getX(i) * 0.4, 0.9, n.getZ(i) * 0.4);
  return g;
}
