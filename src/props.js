// 街道道具：路灯、红绿灯、长椅、垃圾桶、树、棕榈、长颈鹿出租车、路牌、市集小摊、旅鼠管道……
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { canvas, canvasTex, mulberry32, resample, pointInPoly, batchStatic } from './util.js';
import { ROAD, ROAD_HALF, CIRCLE, PARK, ZPD } from './layout.js';
import * as S from './signs.js';
import { drawArt } from './art.js';
import { placeAB, normalCanvas } from './facade.js';
import { cutWhole } from './art.js';
import { deciduous, shrub, cutMat, crossed, coreMaterial, conifer, ivyWall } from './flora.js';
import { sightCap } from './sight.js';

export const GREEN = 0x2f9e63, GOLD = 0xc9a23a;

const M = {
  green: new THREE.MeshStandardMaterial({ color: GREEN, roughness: 0.45, metalness: 0.25 }),
  gold: new THREE.MeshStandardMaterial({ color: GOLD, roughness: 0.32, metalness: 0.85 }),
  globe: new THREE.MeshStandardMaterial({ color: 0xfff6e2, roughness: 0.35, emissive: 0xffe2a8, emissiveIntensity: 0.05 }),
  dark: new THREE.MeshStandardMaterial({ color: 0x23262b, roughness: 0.6, metalness: 0.3 }),
  trunk: new THREE.MeshStandardMaterial({ color: 0x7a5a3c, roughness: 1 }),
  palmTrunk: new THREE.MeshStandardMaterial({ color: 0x9a7a52, roughness: 1 }),
  wood: new THREE.MeshStandardMaterial({ color: 0xb07a45, roughness: 0.8 }),
  white: new THREE.MeshStandardMaterial({ color: 0xf4f1e8, roughness: 0.6 }),
  glass: new THREE.MeshStandardMaterial({ color: 0x20303a, roughness: 0.08, metalness: 0.9 }),
  tire: new THREE.MeshStandardMaterial({ color: 0x1c1c1e, roughness: 0.9 }),
  chrome: new THREE.MeshStandardMaterial({ color: 0xdfe3e6, roughness: 0.15, metalness: 1 }),
};
export const PROP_MATS = M;

const T = (g, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, s = 1) => {
  const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(s, s, s));
  return g.clone().applyMatrix4(m);
};
const noIndex = (g) => { const n = g.index ? g.toNonIndexed() : g; for (const k of Object.keys(n.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) n.deleteAttribute(k); return n; };
const merge = (list) => mergeGeometries(list.map(noIndex), false);

function tubeAlong(points, r, seg = 20, rs = 8) {
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p))), seg, r, rs, false);
}

// ---------------------------------------------------------------- 路灯
function lampGeos(arms = 2) {
  const green = [], gold = [], globe = [];
  green.push(T(new THREE.CylinderGeometry(0.075, 0.1, 5.0, 12), 0, 2.9, 0));
  gold.push(T(new THREE.LatheGeometry([[0.0, 0], [0.26, 0], [0.24, 0.12], [0.15, 0.28], [0.2, 0.55], [0.3, 0.8], [0.12, 0.92], [0.11, 1.0]].map((p) => new THREE.Vector2(p[0], p[1])), 16), 0, 0, 0));
  gold.push(T(new THREE.TorusGeometry(0.11, 0.035, 8, 16), 0, 2.2, 0, Math.PI / 2));
  gold.push(T(new THREE.TorusGeometry(0.1, 0.035, 8, 16), 0, 4.1, 0, Math.PI / 2));
  // 顶端金色叶形尖饰
  gold.push(T(new THREE.LatheGeometry([[0, 0], [0.09, 0.08], [0.13, 0.25], [0.07, 0.45], [0, 0.62]].map((p) => new THREE.Vector2(p[0], p[1])), 10), 0, 5.4, 0));
  for (let i = 0; i < arms; i++) {
    const a = (i / arms) * Math.PI * 2 + (arms === 2 ? 0 : 0.5);
    const c = Math.cos(a), s = Math.sin(a);
    const lvl = arms === 3 && i === 2 ? 0.55 : 0;
    const pts = [[0, 4.6 + lvl, 0], [0.25 * c, 5.25 + lvl, 0.25 * s], [0.75 * c, 5.45 + lvl, 0.75 * s], [1.1 * c, 5.15 + lvl, 1.1 * s], [1.12 * c, 4.75 + lvl, 1.12 * s]];
    green.push(tubeAlong(pts, 0.045, 18, 8));
    // 小卷须
    green.push(tubeAlong([[0, 4.3 + lvl, 0], [0.3 * c, 4.55 + lvl, 0.3 * s], [0.45 * c, 4.35 + lvl, 0.45 * s], [0.32 * c, 4.22 + lvl, 0.32 * s]], 0.028, 10, 6));
    const shade = new THREE.LatheGeometry([[0.05, 0.3], [0.12, 0.26], [0.3, 0.06], [0.36, 0]].map((p) => new THREE.Vector2(p[0], p[1])), 18);
    green.push(T(shade, 1.12 * c, 4.42 + lvl, 1.12 * s));
    gold.push(T(new THREE.TorusGeometry(0.36, 0.028, 8, 20), 1.12 * c, 4.42 + lvl, 1.12 * s, Math.PI / 2));
    globe.push(T(new THREE.SphereGeometry(0.27, 16, 12), 1.12 * c, 4.3 + lvl, 1.12 * s));
  }
  return { green: merge(green), gold: merge(gold), globe: merge(globe) };
}

function instanced(geo, mat, list, cast = true) {
  const im = new THREE.InstancedMesh(geo, mat, list.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  list.forEach((it, i) => {
    e.set(0, it.ry || 0, 0); q.setFromEuler(e);
    m.compose(new THREE.Vector3(it.x, it.y || 0, -it.z), q, new THREE.Vector3(it.s || 1, it.sy || it.s || 1, it.s || 1));
    im.setMatrixAt(i, m);
  });
  im.castShadow = cast; im.receiveShadow = true;
  im.instanceMatrix.needsUpdate = true;
  return im;
}

// ---------------------------------------------------------------- 树
function blobGeo(seed, r = 1, detail = 2, amp = 0.28) {
  const rnd = mulberry32(seed);
  let g = new THREE.IcosahedronGeometry(r, detail);
  g.deleteAttribute('normal'); g.deleteAttribute('uv');
  g = mergeVertices(g, 1e-4);            // 合并顶点 → 平滑着色
  const p = g.attributes.position;
  const ph = [rnd() * 6, rnd() * 6, rnd() * 6];
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const n = Math.sin(x * 3.1 + ph[0]) * Math.sin(y * 2.7 + ph[1]) * Math.sin(z * 3.3 + ph[2]) + 0.5 * Math.sin(x * 6.3 + y * 5.1 + ph[2]);
    const k = 1 + n * amp;
    p.setXYZ(i, x * k, y * k * 0.86, z * k);
  }
  g.computeVertexNormals();
  // 补一份球面 uv，方便与其他几何合并
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) { uv[i * 2] = 0.5 + Math.atan2(p.getZ(i), p.getX(i)) / (Math.PI * 2); uv[i * 2 + 1] = 0.5 + p.getY(i) / (2 * r); }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  // 顶点色：底部偏暗、顶部受光偏亮，带一点随机，叶团更有层次
  const col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) { const t = p.getY(i) / (2 * r) + 0.5, n = 0.9 + rnd() * 0.2; const v = (0.5 + 0.62 * t) * n; col[i * 3] = v * (0.92 + 0.2 * t); col[i * 3 + 1] = v; col[i * 3 + 2] = v * 0.86; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

function treeGeos(seed, detail = 2) {
  const rnd = mulberry32(seed);
  const trunk = [T(new THREE.CylinderGeometry(0.11, 0.2, 3.2, 8), 0, 1.6, 0)];
  const leaves = [];
  const n = 11 + (rnd() * 4 | 0);
  for (let i = 0; i < n; i++) {
    const a = rnd() * Math.PI * 2, ring = i < 4 ? 0.35 : 1.0;
    const d = ring * (0.5 + rnd() * 1.15), h = 3.5 + rnd() * 1.4 + (1.0 - ring) * 1.3 + (1.6 - d) * 0.5, r = 0.72 + rnd() * 0.5;
    leaves.push(T(blobGeo(seed * 13 + i, r, detail, 0.22), Math.cos(a) * d, h, Math.sin(a) * d));
    if (i >= 4 && i < 8) trunk.push(tubeAlong([[0, 2.5, 0], [Math.cos(a) * d * 0.5, 3.0, Math.sin(a) * d * 0.5], [Math.cos(a) * d, h - 0.2, Math.sin(a) * d]], 0.055, 6, 6));
  }
  return { trunk: merge(trunk), leaves: merge(leaves) };
}

function palmGeos(seed, height = 7, textured = false) {
  const rnd = mulberry32(seed);
  const lean = 0.5 + rnd() * 0.6;
  const trunk = tubeAlong([[0, 0, 0], [lean * 0.15, height * 0.35, 0], [lean * 0.55, height * 0.7, 0], [lean, height, 0]], 0.17, 16, 8);
  const fronds = [];
  for (let i = 0; i < 11; i++) {
    const a = (i / 11) * Math.PI * 2 + rnd() * 0.3, len = 2.6 + rnd() * 0.9, droop = 0.9 + rnd() * 0.9;
    const g = new THREE.PlaneGeometry(textured ? 1.55 : 0.85, textured ? len * 1.25 : len, 2, 8); g.translate(0, (textured ? len * 1.25 : len) / 2, 0);
    if (textured) { const uv = g.attributes.uv; for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getY(k), uv.getX(k)); }      // 贴图里叶柄在左、叶尖在右
    const p = g.attributes.position;
    for (let k = 0; k < p.count; k++) {
      const y = p.getY(k) / (textured ? len * 1.25 : len), x = p.getX(k);
      const taper = textured ? 1 : Math.sin(Math.min(1, y * 1.1 + 0.08) * Math.PI) * 0.9 + 0.1;
      p.setXYZ(k, x * taper, y * len * 0.55 - y * y * droop * 1.4, y * len * 0.95 + Math.abs(x) * -0.35);
    }
    g.computeVertexNormals();
    fronds.push(T(g, lean, height - 0.1, 0, 0, a, 0));
  }
  return { trunk, fronds: merge(fronds) };
}

function coniferGeo() {
  const parts = [];
  for (let i = 0; i < 5; i++) parts.push(T(new THREE.ConeGeometry(1.25 - i * 0.2, 1.7, 9), 0, 1.4 + i * 1.0, 0));
  return merge(parts);
}

// ---------------------------------------------------------------- 贴图小工具
function signTex(lines, { w = 512, h = 256, bg = '#1f4fb4', fg = '#fff', font = 'bold 60px "Microsoft YaHei","PingFang SC",sans-serif', border = null, radius = 22 } = {}) {
  return canvasTex(canvas(w, h, (g) => {
    g.fillStyle = bg; g.beginPath(); g.roundRect(0, 0, w, h, radius); g.fill();
    if (border) { g.strokeStyle = border; g.lineWidth = 10; g.beginPath(); g.roundRect(8, 8, w - 16, h - 16, radius - 6); g.stroke(); }
    g.textAlign = 'center'; g.textBaseline = 'middle';
    lines.forEach((l, i) => {
      g.font = l.font || font; g.fillStyle = l.color || fg;
      g.fillText(l.t, w / 2, l.y != null ? l.y : (h * (i + 1)) / (lines.length + 1), w - 24);
    });
  }));
}
export { signTex };

function streetSign(zh, en) {
  // 上海式路牌：蓝底白字中文 + 白底黑字英文
  const t = canvasTex(canvas(512, 190, (g) => {
    g.fillStyle = '#1b4aa8'; g.fillRect(0, 0, 512, 118);
    g.fillStyle = '#fff'; g.fillRect(0, 118, 512, 72);
    g.strokeStyle = '#fff'; g.lineWidth = 6; g.strokeRect(3, 3, 506, 184);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#fff'; g.font = 'bold 78px "Microsoft YaHei","PingFang SC",sans-serif'; g.fillText(zh, 256, 62, 480);
    g.fillStyle = '#16233d'; g.font = 'bold 40px Arial, sans-serif'; g.fillText(en, 256, 156, 490);
  }));
  const m = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.56, 0.04), [M.green, M.green, M.green, M.green,
    new THREE.MeshStandardMaterial({ map: t, roughness: 0.5 }), new THREE.MeshStandardMaterial({ map: t, roughness: 0.5 })]);
  return m;
}

function giraffeTex() {
  const rnd = mulberry32(42);
  return canvasTex(canvas(1024, 1024, (g) => {
    g.fillStyle = '#f3d9a0'; g.fillRect(0, 0, 1024, 1024);
    // Voronoi 风格的长颈鹿斑块
    const pts = [];
    for (let i = 0; i < 46; i++) pts.push([rnd() * 1024, rnd() * 1024]);
    const id = g.getImageData(0, 0, 1024, 1024), d = id.data;
    for (let y = 0; y < 1024; y++) for (let x = 0; x < 1024; x++) {
      let d1 = 1e9, d2 = 1e9;
      for (const p of pts) {
        let dx = Math.abs(x - p[0]); dx = Math.min(dx, 1024 - dx);
        let dy = Math.abs(y - p[1]); dy = Math.min(dy, 1024 - dy);
        const dd = Math.hypot(dx, dy);
        if (dd < d1) { d2 = d1; d1 = dd; } else if (dd < d2) d2 = dd;
      }
      const e = d2 - d1;
      if (e > 20) {
        const k = (y * 1024 + x) * 4, sh = Math.min(1, (e - 20) / 18);
        d[k] = 243 + (226 - 243) * sh; d[k + 1] = 217 + (140 - 217) * sh; d[k + 2] = 160 + (52 - 160) * sh;
      }
    }
    g.putImageData(id, 0, 0);
  }), { repeat: [1, 1] });
}

// ---------------------------------------------------------------- 长颈鹿出租车「谜鹿出租」
function giraffeTaxi() {
  const G = new THREE.Group();
  const skin = giraffeTex(); skin.wrapS = skin.wrapT = THREE.RepeatWrapping; skin.repeat.set(1.4, 1.8);
  const bodyMat = new THREE.MeshStandardMaterial({ map: skin, roughness: 0.38, metalness: 0.1 });
  const body = new THREE.Mesh(new RoundedBoxGeometry(2.25, 5.0, 4.3, 6, 0.45), bodyMat); body.position.y = 2.95; G.add(body);
  const skirt = new THREE.Mesh(new RoundedBoxGeometry(2.35, 0.55, 4.45, 4, 0.2), new THREE.MeshStandardMaterial({ color: 0xc2793a, roughness: 0.5 })); skirt.position.y = 0.62; G.add(skirt);
  // 上部车窗
  const win = new THREE.Mesh(new RoundedBoxGeometry(2.3, 0.95, 3.5, 4, 0.2), M.glass); win.position.set(0, 4.55, 0.1); G.add(win);
  const wf = new THREE.Mesh(new RoundedBoxGeometry(1.8, 1.0, 0.2, 3, 0.08), M.glass); wf.position.set(0, 4.55, 2.1); G.add(wf);
  const roof = new THREE.Mesh(new RoundedBoxGeometry(1.7, 0.16, 3.2, 3, 0.07), M.dark); roof.position.set(0, 5.53, 0); G.add(roof);
  // 侧面壁画：青绿地平线 + 落日 + 文字
  const mural = canvasTex(canvas(1024, 512, (g) => {
    const gr = g.createLinearGradient(0, 0, 0, 512); gr.addColorStop(0, '#f6e7a8'); gr.addColorStop(0.55, '#f2c165'); gr.addColorStop(1, '#e89a45');
    g.fillStyle = gr; g.fillRect(0, 0, 1024, 512);
    g.fillStyle = '#fbf3cf'; g.beginPath(); g.arc(600, 330, 190, Math.PI, 0); g.fill();
    g.fillStyle = '#e7b96a';
    for (let i = 0; i < 9; i++) { const x = 470 + i * 30, h = 60 + Math.abs(Math.sin(i * 1.7)) * 120; g.beginPath(); g.roundRect(x, 330 - h, 22, h, 10); g.fill(); }
    g.fillStyle = '#1f6f6a'; g.beginPath(); g.moveTo(0, 330); g.bezierCurveTo(300, 300, 700, 380, 1024, 320); g.lineTo(1024, 512); g.lineTo(0, 512); g.fill();
    g.fillStyle = '#3a2a22'; g.beginPath(); g.moveTo(0, 430); g.bezierCurveTo(350, 520, 700, 330, 1024, 400); g.lineTo(1024, 440); g.bezierCurveTo(700, 380, 350, 560, 0, 470); g.fill();
    g.fillStyle = '#fdf6df'; g.font = 'bold 64px "Microsoft YaHei",sans-serif'; g.fillText('谜鹿出租', 70, 400);
    g.font = '30px "Microsoft YaHei",sans-serif'; g.fillText('打车用谜鹿 · 出行不迷路', 70, 448);
  }));
  for (const sx of [-1, 1]) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 1.8), new THREE.MeshStandardMaterial({ map: mural, roughness: 0.4 }));
    p.position.set(sx * 1.135, 2.5, 0); p.rotation.y = sx * Math.PI / 2; G.add(p);
  }
  for (const [x, z] of [[-1.05, 1.45], [1.05, 1.45], [-1.05, -1.45], [1.05, -1.45]]) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.3, 20), M.tire); w.rotation.z = Math.PI / 2; w.position.set(x, 0.42, z); G.add(w);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.32, 16), M.chrome); hub.rotation.z = Math.PI / 2; hub.position.set(x, 0.42, z); G.add(hub);
  }
  for (const sx of [-1, 1]) {
    const l = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), M.globe); l.position.set(sx * 0.75, 1.05, 2.17); G.add(l);
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 8), new THREE.MeshStandardMaterial({ color: 0xc2793a })); ear.scale.set(0.5, 1, 1.2); ear.position.set(sx * 1.22, 4.7, 1.7); G.add(ear);
  }
  G.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
  return G;
}

// ---------------------------------------------------------------- 长椅（三种尺寸）
function benchGeo() {
  const parts = [], R = 0.024;
  for (let i = 0; i < 7; i++) {                       // 座面木条，前缘微微下弯
    const z = -0.2 + i * 0.068;
    parts.push(T(new THREE.BoxGeometry(1.8, 0.03, 0.052), 0, 0.455 - Math.max(0, z - 0.1) * 0.55, z, Math.max(0, z - 0.1) * 0.9));
  }
  // 靠背：一圈圆角边框，中间嵌广告画
  parts.push(tubeAlong([[-0.84, 0.56, -0.265], [0.84, 0.56, -0.265], [0.86, 0.6, -0.272], [0.86, 1.04, -0.35], [0.84, 1.08, -0.357], [-0.84, 1.08, -0.357], [-0.86, 1.04, -0.35], [-0.86, 0.6, -0.272], [-0.84, 0.56, -0.265]], 0.02, 40, 6));
  parts.push(T(new THREE.BoxGeometry(1.7, 0.5, 0.012), 0, 0.82, -0.312, -0.175));
  for (const x of [-0.9, 0, 0.9]) {
    const end = x !== 0;
    parts.push(tubeAlong([[x, 0, -0.33], [x, 0.3, -0.29], [x, 0.5, -0.27], [x, 1.06, -0.36], [x, 1.14, -0.4], [x, 1.13, -0.46]], R, 16, 6));      // 后腿 + 靠背立柱 + 顶端外翻
    parts.push(tubeAlong([[x, 0, 0.27], [x, 0.3, 0.26], [x, 0.43, 0.24]], R, 6, 6));                                                              // 前腿
    parts.push(tubeAlong([[x, 0.43, 0.24], [x, 0.43, -0.27]], R * 0.9, 2, 6));                                                                    // 座下横撑
    parts.push(T(new THREE.CylinderGeometry(0.05, 0.06, 0.03, 10), x, 0.015, 0.27)); parts.push(T(new THREE.CylinderGeometry(0.05, 0.06, 0.03, 10), x, 0.015, -0.33));
    if (end) {                                                                                                                                      // 扶手：弧形 + 前端小卷
      parts.push(tubeAlong([[x, 0.43, 0.24], [x, 0.6, 0.29], [x, 0.7, 0.24], [x, 0.71, 0.0], [x, 0.69, -0.29]], R, 14, 6));
      parts.push(T(new THREE.TorusGeometry(0.05, 0.016, 6, 14), x, 0.585, 0.31, 0, Math.PI / 2, 0));
    }
  }
  parts.push(tubeAlong([[-0.9, 0.2, -0.02], [0.9, 0.2, -0.02]], R * 0.8, 2, 6));
  return merge(parts);
}

// 叶片镂空的绿色栏杆面板（一格约 1.15 米）
function leafPanelTex() {
  return canvasTex(canvas(256, 140, (g) => {
    g.clearRect(0, 0, 256, 140);
    g.fillStyle = '#2f9e63'; g.beginPath(); g.roundRect(4, 6, 248, 128, 14); g.fill();
    g.globalCompositeOperation = 'destination-out';
    const leaf = (cx, cy, len, wid, rot) => { g.save(); g.translate(cx, cy); g.rotate(rot); g.beginPath(); g.moveTo(-len / 2, 0); g.quadraticCurveTo(0, -wid, len / 2, 0); g.quadraticCurveTo(0, wid, -len / 2, 0); g.fill(); g.restore(); };
    leaf(70, 70, 96, 40, -0.5); leaf(150, 62, 110, 44, 0.35); leaf(210, 92, 64, 26, -0.9); leaf(40, 108, 46, 18, 0.6); leaf(118, 112, 50, 18, -0.2);
    g.globalCompositeOperation = 'source-over';
    g.strokeStyle = '#1f7a4a'; g.lineWidth = 6; g.beginPath(); g.roundRect(7, 9, 242, 122, 12); g.stroke();
    g.strokeStyle = '#237a4c'; g.lineWidth = 3; g.beginPath(); g.moveTo(26, 90); g.lineTo(114, 50); g.moveTo(98, 78); g.lineTo(204, 46); g.stroke();   // 叶脉
  }));
}
let _leafPanel = null;
function leafRail(len) {
  if (!_leafPanel) { _leafPanel = leafPanelTex(); _leafPanel.wrapS = THREE.RepeatWrapping; }
  const g = new THREE.Group(), n = Math.max(1, Math.round(len / 1.15)), step = len / n;
  const parts = [T(new THREE.CylinderGeometry(0.022, 0.022, len, 8), 0, 1.05, 0, 0, 0, Math.PI / 2), T(new THREE.CylinderGeometry(0.016, 0.016, len, 6), 0, 0.2, 0, 0, 0, Math.PI / 2)];
  const balls = [];
  for (let i = 0; i <= n; i++) { const x = -len / 2 + i * step; parts.push(T(new THREE.CylinderGeometry(0.028, 0.034, 1.1, 8), x, 0.55, 0)); balls.push(T(new THREE.SphereGeometry(0.05, 10, 8), x, 1.13, 0)); }
  g.add(new THREE.Mesh(merge(parts), M.green), new THREE.Mesh(merge(balls), M.gold));
  const t = _leafPanel.clone(); t.needsUpdate = true; t.repeat.set(n, 1);
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(len - 0.06, 0.74), new THREE.MeshStandardMaterial({ map: t, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.45, metalness: 0.25 }));
  panel.position.y = 0.62; g.add(panel);
  g.traverse((m) => { if (m.isMesh) m.castShadow = true; });
  return g;
}

// 人行信号灯里的动物剪影（大型有角 / 中型尖耳 / 小型圆耳），只是通用的示意图形
function pedIcon(kind, color) {
  return canvasTex(canvas(96, 96, (g) => {
    g.fillStyle = '#0c0c0c'; g.fillRect(0, 0, 96, 96);
    g.fillStyle = color; g.strokeStyle = color; g.lineCap = 'round';
    g.beginPath(); g.ellipse(48, 40, 13, 15, 0, 0, 7); g.fill();                                    // 头
    g.beginPath(); g.roundRect(37, 52, 22, 26, 8); g.fill();                                        // 身
    g.lineWidth = 7; g.beginPath(); g.moveTo(42, 76); g.lineTo(38, 92); g.moveTo(54, 76); g.lineTo(60, 92); g.stroke();
    if (kind === 0) { g.lineWidth = 5; g.beginPath(); g.moveTo(38, 30); g.quadraticCurveTo(22, 22, 26, 8); g.moveTo(58, 30); g.quadraticCurveTo(74, 22, 70, 8); g.stroke(); }
    else if (kind === 1) { g.beginPath(); g.moveTo(36, 32); g.lineTo(32, 10); g.lineTo(46, 26); g.fill(); g.beginPath(); g.moveTo(60, 32); g.lineTo(64, 10); g.lineTo(50, 26); g.fill(); }
    else { g.beginPath(); g.arc(34, 26, 9, 0, 7); g.fill(); g.beginPath(); g.arc(62, 26, 9, 0, 7); g.fill(); }
  }));
}

// ================================================================= 主入口
// 图片 → 可平铺的贴图（附带由亮度推出的法线贴图）
function tiled(img, repU, repV, size = 1024) {
  const c = canvas(size, size, (g) => g.drawImage(img, 0, 0, size, size));
  const map = new THREE.CanvasTexture(c); map.colorSpace = THREE.SRGBColorSpace; map.wrapS = map.wrapT = THREE.RepeatWrapping; map.repeat.set(repU, repV); map.anisotropy = 8;
  const normalMap = new THREE.CanvasTexture(normalCanvas(c, 2.6)); normalMap.wrapS = normalMap.wrapT = THREE.RepeatWrapping; normalMap.repeat.set(repU, repV); normalMap.anisotropy = 4;
  return { map, normalMap };
}

export function buildProps(scene, env, { blocks, facInfo, sheets = {}, tex = {} }) {
  // 树皮：行道树与棕榈的树干
  if (tex.bark) {
    const b = tiled(tex.bark, 2, 3, 512);
    for (const k of ['trunk', 'palmTrunk']) { M[k].map = b.map; M[k].normalMap = b.normalMap; M[k].color.set(k === 'trunk' ? 0xc8b8a4 : 0xe2d2b8); M[k].needsUpdate = true; }
  }
  const G = new THREE.Group(); G.name = 'props';
  const nightFns = [];
  // 步行碰撞用的小物件占位：圆 [x, y, 半径]，线段 [ax, ay, bx, by, 半径 + 人的半径 0.45]（y 朝北）
  const solid = { circles: [], segs: [] };
  const solidBar = (x, y, ry, half, r) => { const c = Math.cos(ry) * half, s = Math.sin(ry) * half; solid.segs.push([x - c, y - s, x + c, y + s, r + 0.45]); };
  const { pts, tan } = resample(ROAD, 1);
  const side = (i, off) => { const nx = -tan[i][1], ny = tan[i][0]; return [pts[i][0] + nx * off, pts[i][1] + ny * off, Math.atan2(tan[i][1], tan[i][0])]; };
  const inBlock = (x, y, pad = 0.8) => {
    for (const poly of blocks) if (pointInPoly(x, y, poly)) return true;
    if (Math.hypot(x - ZPD.c[0], y - ZPD.c[1]) < ZPD.r + pad) return true;
    return false;
  };

  // ---- 路灯：沿大马路两侧交错布置
  const lamps2 = [], lamps3 = [];
  for (let i = 8; i < pts.length - 6; i += 13) {
    const sgn = ((i / 13) | 0) % 2 ? 1 : -1;
    const [x, y, a] = side(i, sgn * (ROAD_HALF + 1.0));
    if (inBlock(x, y, 1.2) || pointInPoly(x, y, PARK)) continue;
    (((i / 13) | 0) % 3 === 0 ? lamps3 : lamps2).push({ x, z: y, ry: a });
  }
  // 环岛、警局前、车站前补几盏
  [[-33.5, -8.5], [-16.5, -3.2], [-9, -9], [10.5, -9.5], [22.6, -27.6], [-40, -10]].forEach(([x, y], i) => lamps3.push({ x, z: y, ry: i }));
  const lg2 = lampGeos(2), lg3 = lampGeos(3);
  for (const [lg, list] of [[lg2, lamps2], [lg3, lamps3]]) {
    G.add(instanced(lg.green, M.green, list), instanced(lg.gold, M.gold, list), instanced(lg.globe, M.globe, list, false));
  }
  const allLamps = lamps2.concat(lamps3);
  // 夜间：灯下光斑（贴地加色）+ 少量真实点光源
  const poolTex = canvasTex(canvas(128, 128, (g) => {
    const gr = g.createRadialGradient(64, 64, 2, 64, 64, 64); gr.addColorStop(0, 'rgba(255,226,170,.85)'); gr.addColorStop(0.45, 'rgba(255,200,120,.3)'); gr.addColorStop(1, 'rgba(255,190,110,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  }));
  const poolMat = new THREE.MeshBasicMaterial({ map: poolTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0, polygonOffset: true, polygonOffsetFactor: -4 });
  const poolGeo = new THREE.PlaneGeometry(11, 11); poolGeo.rotateX(-Math.PI / 2);
  const pools = instanced(poolGeo, poolMat, allLamps.map((l) => ({ x: l.x, z: l.z, y: 0.06 })), false);
  pools.receiveShadow = false; pools.renderOrder = 2; G.add(pools);
  const signMats0 = [];      // 小摊招牌等的发光材质
  const pointLights = [];
  allLamps.filter((_, i) => i % 3 === 0).slice(0, 9).forEach((l) => {
    const pl = new THREE.PointLight(0xffd9a0, 0, 22, 1.6); pl.position.set(l.x, 4.4, -l.z); G.add(pl); pointLights.push(pl);
  });
  nightFns.push((e) => {
    M.globe.emissiveIntensity = 0.05 + e * 1.25;
    poolMat.opacity = e * 0.55;
    for (const p of pointLights) p.intensity = e * 22;
  });

  // ---- 行道树（绿色树笼）、针叶树、棕榈
  const fol = tex.foliage ? tiled(tex.foliage, 3, 2) : null;
  const leafMats = (fol ? [0xf4ffe8, 0xe2f6d8, 0xffffe0] : [0x6cc050, 0x5cb04a, 0x8fca58]).map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.9, vertexColors: true, map: fol ? fol.map : null, normalMap: fol ? fol.normalMap : null, normalScale: new THREE.Vector2(1.2, 1.2) }));
  const treeSets = [treeGeos(1), treeGeos(2), treeGeos(3)];
  const treeLists = [[], [], []];
  const rnd = mulberry32(99);
  for (let i = 15; i < pts.length - 10; i += 13) {
    const sgn = ((i / 13) | 0) % 2 ? -1 : 1;
    const [x, y] = side(i, sgn * (ROAD_HALF + 1.15));
    if (inBlock(x, y, 3.2) || pointInPoly(x, y, PARK) || Math.hypot(x - CIRCLE.c[0], y - CIRCLE.c[1]) < CIRCLE.rOut * (CIRCLE.sy || 1) + 0.5) continue;
    treeLists[i % 3].push({ x, z: y, ry: rnd() * 6, s: 0.8 + rnd() * 0.25 });
  }
  // 入口左手边、露露精品店西侧露出来的一段街区后墙：种三棵树挡一挡（实景里这类后场墙面也是靠绿化遮的）
  [[-60.5, -52.2, 1.2], [-57.4, -51.8, 1.32], [-54.4, -51.4, 1.15]].forEach(([x, y, s], i) => treeLists[i % 3].push({ x, z: y, ry: i * 2.1, s }));
  // 绿地里的树（遮挡矿山车一侧）
  let tries = 0, placed = 0;
  while (placed < 34 && tries++ < 800) {
    const x = -5 + rnd() * 62, y = -66 + rnd() * 27;
    if (!pointInPoly(x, y, PARK)) continue;
    const s = 1.0 + rnd() * 0.7;
    if (sightCap(x, y, 2.7 * s) < 7 * s) continue;                 // 留出望向城堡的视线（见 sight.js）
    treeLists[placed % 3].push({ x, z: y, y: 0.55, ry: rnd() * 6, s }); placed++;
  }
  // 园区外围：南侧、东通道两侧、入口两侧的树墙
  const ring = [];
  for (let x = -70; x <= 100; x += 5.5) { ring.push([x + rnd() * 3, -74 - rnd() * 14 - (x > -62 && x < -12 ? 18 : 0)]); ring.push([x + rnd() * 3, -96 - rnd() * 12]); }
  for (let y = -95; y <= -30; y += 5) { ring.push([92 + rnd() * 10, y]); ring.push([-68 - rnd() * 8, y]); }
  for (let y = -80; y <= -56; y += 4.5) ring.push([60 - rnd() * 6 + (y + 56) * 0.25, y]);
  // 外围的树离得远，用低面数版本
  const farSets = [treeGeos(4, 1), treeGeos(5, 1)], farLists = [[], []];
  ring.forEach(([x, y], i) => { const s = 1.3 + rnd() * 0.9; if (!inBlock(x, y, 2) && sightCap(x, y, 2.4 * s) >= 6 * s) farLists[i % 2].push({ x, z: y, ry: rnd() * 6, s }); });
  const leafA = cutMat('leafA'), leafB = cutMat('leafB');
  if (leafA && leafB) {
    // 枝叶卡片树：树干 + 主枝 + 深色内核 + 两种枝叶卡片，三种树形
    const coreMat = coreMaterial(tex.foliage);
    const kinds = [deciduous(1), deciduous(2, { height: 6.9, spread: 2.9, nCards: 130 }), deciduous(3, { height: 5.5, spread: 2.2, nCards: 95 })];
    const lists = [treeLists[0].slice(), treeLists[1].slice(), treeLists[2].slice()];
    farLists.flat().forEach((t, i) => lists[i % 3].push({ ...t, s: t.s * 0.82 }));
    kinds.forEach((k, i) => {
      G.add(instanced(k.wood, M.trunk, lists[i]), instanced(k.core, coreMat, lists[i]), instanced(k.cardsA, i === 1 ? leafB : leafA, lists[i]), instanced(k.cardsB, i === 1 ? leafA : leafB, lists[i]));
    });
  } else {
    farSets.forEach((ts, k) => { G.add(instanced(ts.trunk, M.trunk, farLists[k], false), instanced(ts.leaves, leafMats[k], farLists[k])); });
    treeSets.forEach((ts, k) => { G.add(instanced(ts.trunk, M.trunk, treeLists[k]), instanced(ts.leaves, leafMats[k], treeLists[k])); });
  }
  // 树笼
  const cage = merge([T(new THREE.CylinderGeometry(0.42, 0.42, 1.25, 12, 1, true), 0, 0.63, 0), T(new THREE.TorusGeometry(0.42, 0.03, 6, 16), 0, 1.25, 0, Math.PI / 2), T(new THREE.CylinderGeometry(0.62, 0.62, 0.04, 20), 0, 0.02, 0)]);
  const cageMat = new THREE.MeshStandardMaterial({ color: 0x1f7a4a, roughness: 0.5, metalness: 0.3, side: THREE.DoubleSide, alphaTest: 0.5, map: canvasTex(canvas(64, 64, (g) => { g.clearRect(0, 0, 64, 64); g.fillStyle = '#fff'; for (let i = 0; i < 8; i++) g.fillRect(i * 8, 0, 3, 64); g.fillRect(0, 0, 64, 4); g.fillRect(0, 60, 64, 4); g.fillRect(0, 30, 64, 3); }), { repeat: [3, 1] }) });
  cageMat.map.wrapS = THREE.RepeatWrapping;
  const cages = treeLists.flat().filter((t) => !t.y && t.s < 1.1);
  G.add(instanced(cage, cageMat, cages.map((t) => ({ x: t.x, z: t.z }))));
  // 行道树脚下的锈橙色圆形树池
  const pitGeo = new THREE.CircleGeometry(0.85, 28); pitGeo.rotateX(-Math.PI / 2);
  const pits = instanced(pitGeo, new THREE.MeshStandardMaterial({ color: 0xb5562c, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -2 }), cages.map((t) => ({ x: t.x, z: t.z, y: 0.022 })), false);
  G.add(pits);

  // 棕榈（撒哈拉广场的暗示）：车站旁、环岛中心、警局两侧
  let frondTex = null;
  if (tex.frond) { frondTex = new THREE.CanvasTexture(cutWhole(tex.frond, true)); frondTex.colorSpace = THREE.SRGBColorSpace; frondTex.anisotropy = 8; }
  const palmMat = new THREE.MeshStandardMaterial({ color: frondTex ? 0xffffff : 0x4f9a3a, map: frondTex, alphaTest: frondTex ? 0.4 : 0, roughness: 0.75, side: THREE.DoubleSide });
  [[-43.5, -11.5, 8.5, 1], [-11.5, -4.4, 7, 3], [11.0, -10.8, 8, 4], [22.6, -11.6, 6, 5], [58, -41, 7.5, 6], [-52, -62, 8, 7]].forEach(([x, y, h, s]) => {
    solid.circles.push([x, y, 0.2]);
    const pg = palmGeos(s, h, !!frondTex);
    const t = new THREE.Mesh(pg.trunk, M.palmTrunk), f = new THREE.Mesh(pg.fronds, palmMat);
    const g = new THREE.Group(); g.add(t, f); g.position.set(x, x === CIRCLE.c[0] ? 0.55 : 0, -y); g.rotation.y = s * 1.7;
    g.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } }); G.add(g);
  });

  // 环岛中心岛：花丛 + 红色小消防栓
  const flowerMat = [0xe84a6f, 0xf2b12e, 0xb05ad0].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.9 }));
  const flowersM = cutMat('flowers'), camelliaM = cutMat('camellia'), agaveM = cutMat('agave');
  const shrubCore = coreMaterial(tex.foliage, 0x6f9460);
  if (flowersM) {
    const fl = shrub(5, { r: 0.62, h: 0.7, n: 20 }), list = [];
    for (let i = 0; i < 26; i++) { const a = (i / 26) * Math.PI * 2, r = 1.5 + (i % 3) * 0.85; list.push({ x: CIRCLE.c[0] + Math.cos(a) * r, z: CIRCLE.c[1] + Math.sin(a) * r, y: 0.5, s: 0.85 + (i % 4) * 0.12, ry: i * 1.3 }); }
    G.add(instanced(fl.core, shrubCore, list), instanced(fl.cards, flowersM, list));
  } else {
    for (let i = 0; i < 22; i++) {
      const a = (i / 22) * Math.PI * 2, r = 2.3 + (i % 3) * 0.55;
      const b = new THREE.Mesh(blobGeo(200 + i, 0.5, 1, 0.2), i % 2 ? flowerMat[i % 3] : leafMats[i % 3]);
      b.position.set(CIRCLE.c[0] + Math.cos(a) * r, 0.8, -(CIRCLE.c[1] + Math.sin(a) * r)); b.castShadow = true; G.add(b);
    }
  }
  if (camelliaM) {             // 红花茶梅一类的灌木：种在建筑转角和入口两侧
    const cm = shrub(9, { r: 0.85, h: 1.35, n: 30 });
    const list = [[-35.2, -49.4], [-42.4, -15.0], [-43.2, -7.8], [-9.4, -26.9], [23.4, -24.7], [-53.0, -66.5], [-39.5, -74.5], [57.0, -42.5], [63.6, -45.6], [-36.9, -4.2]].map(([x, y], i) => ({ x, z: y, s: 0.9 + (i % 3) * 0.14, ry: i * 2.1 }));
    G.add(instanced(cm.core, shrubCore, list), instanced(cm.cards, camelliaM, list));
  }
  // 公寓群背面朝绿地的一段后墙没有立面，是一面 7 米高的素墙（从警局前望向城堡时正好在画面右侧）：贴墙种一排柏树遮住
  {
    const cm = cutMat('conifer');
    if (cm) {
      const cf = conifer(7, { height: 6.6, base: 1.25 }), list = [];
      const a = [-8.2, -45.8], b = [-4.4, -60.2], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      for (let d = 1.1; d < L - 0.4; d += 1.85) {
        const t = d / L, x = a[0] + (b[0] - a[0]) * t + 1.25, y = a[1] + (b[1] - a[1]) * t + 0.33, k = (list.length * 0.37) % 1;
        list.push({ x, z: y, y: pointInPoly(x, y, PARK) ? 0.58 : 0, s: 0.95 + k * 0.3, ry: list.length * 1.9 });
      }
      G.add(instanced(cf.core, new THREE.MeshStandardMaterial({ color: 0x1f4a2c, roughness: 1 }), list), instanced(cf.trunk, M.trunk, list), instanced(cf.cards, cm, list));
      // 柏树之间和树尖上方还是会露出墙面和平直的屋檐线：整面墙再爬满藤叶，叶子略高出檐口
      const lm = cutMat('leafA');
      if (lm) {
        const iv = ivyWall(L, 7.7, 5);
        for (const [geo, mat] of [[iv.back, coreMaterial(null, 0x4f6a45)], [iv.cards, lm]]) { const m = new THREE.Mesh(geo, mat); placeAB(m, b, a); m.castShadow = m.receiveShadow = true; G.add(m); }
      }
    }
  }
  if (agaveM) {                // 龙舌兰：警局砂岩脚下、绿地的岩石路缘
    const ag = crossed(1.15, 1.25);
    const list = [[10.4, -11.2], [-9.4, -7.2], [13.2, -10.6], [-11.6, -3.2], [2.4, -41.2], [12.2, -44.6], [30, -52.2], [44, -57.6]].map(([x, y], i) => ({ x, z: y, y: [4, 5, 6, 7].includes(i) ? 0.58 : 0, s: 0.85 + (i % 3) * 0.2, ry: i * 0.9 }));
    G.add(instanced(ag, agaveM, list));
  }
  const hyd = new THREE.Group();
  const red = new THREE.MeshStandardMaterial({ color: 0xd43a2f, roughness: 0.4, metalness: 0.2 });
  hyd.add(new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 0.55, 12), red));
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), red); cap.position.y = 0.27; hyd.add(cap);
  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.38, 8), red); arm.rotation.z = Math.PI / 2; arm.position.y = 0.1; hyd.add(arm);
  hyd.position.set(-35.6, 0.28, 17.5); hyd.traverse((m) => { if (m.isMesh) m.castShadow = true; }); G.add(hyd);

  // ---- 长颈鹿出租车：停在环岛东南侧（公寓群北立面前）
  let taxi;
  if (sheets.taxi) {
    // 侧立面生成图 + 深度图：按车身轮廓拉出车宽，两侧都有浮雕；车头车尾补上玻璃、车灯、车轮
    const L = 3.3, Wd = 2.1, ts = sheets.taxi;
    const side = ts.piece({ auto: true, width: L, depth: Wd, reliefScale: 0.22, cell: 0.035, taper: false });
    const Ht = side.userData.height;
    if (ts.depth) { const other = side.children[side.children.length - 1].clone(); other.scale.z = -1; other.position.z = -Wd; side.add(other); }     // 另一侧的浮雕
    side.position.set(-L / 2, 0, Wd / 2);
    taxi = new THREE.Group(); taxi.add(side);
    // 车头、车尾也刷成长颈鹿斑纹（侧立面图只管两侧）
    const skin = giraffeTex(); skin.wrapS = skin.wrapT = THREE.RepeatWrapping; skin.repeat.set(0.75, 1.7);
    const skinMat = new THREE.MeshStandardMaterial({ map: skin, roughness: 0.38, metalness: 0.1 });
    for (const sx of [1, -1]) {
      const panel = new THREE.Mesh(new RoundedBoxGeometry(0.06, Ht * 0.955 - 0.5, Wd * 0.985, 3, 0.03), [skinMat, skinMat, skinMat, skinMat, skinMat, skinMat]);
      panel.position.set(sx * (L / 2 - 0.005), (Ht * 0.955 + 0.5) / 2, 0); taxi.add(panel);
    }
    const glassF = new THREE.Mesh(new RoundedBoxGeometry(0.12, Ht * 0.15, Wd * 0.78, 3, 0.05), M.glass); glassF.position.set(L / 2 + 0.03, Ht * 0.845, 0); taxi.add(glassF);
    const glassR = glassF.clone(); glassR.position.x = -L / 2 - 0.03; taxi.add(glassR);
    const bumperM = new THREE.MeshStandardMaterial({ color: 0xb86a2e, roughness: 0.45 });
    for (const sx of [1, -1]) {
      const bump = new THREE.Mesh(new RoundedBoxGeometry(0.22, 0.3, Wd * 0.96, 3, 0.08), bumperM); bump.position.set(sx * (L / 2 + 0.03), 0.42, 0); taxi.add(bump);
      for (const sz of [1, -1]) {
        const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 10), sx > 0 ? M.globe : new THREE.MeshStandardMaterial({ color: 0xd43a2f, roughness: 0.3, emissive: 0xff2010, emissiveIntensity: 0.3 })); lamp.scale.x = 0.5; lamp.position.set(sx * (L / 2 + 0.06), 0.95, sz * Wd * 0.32); taxi.add(lamp);
      }
    }
    for (const fx of [0.27, -0.27]) for (const sz of [1, -1]) {              // 车轮只从正面 / 斜侧面能看到的那部分厚度
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.34, 20), M.tire); wheel.rotation.x = Math.PI / 2; wheel.position.set(fx * L, 0.4, sz * (Wd / 2 - 0.2)); taxi.add(wheel);
    }
    // 壁画上的车行名（实景文字）
    for (const sz of [1, -1]) {
      const t = S.letters('谜鹿出租', '打车用谜鹿 · 出行不迷路', { w: 1.12, style: 'cream', enFont: '"Microsoft YaHei", sans-serif', enRatio: 0.3, night: 0.5 });
      t.position.set(-sz * L * 0.235, Ht * 0.455, sz * (Wd / 2 + 0.22 * 1.05 + 0.03)); if (sz < 0) t.rotation.y = Math.PI; taxi.add(t); signMats0.push(...t.userData.lit);
    }
    taxi.traverse((mm) => { if (mm.isMesh && !mm.material.transparent) { mm.castShadow = true; mm.receiveShadow = true; } });
    taxi.position.set(-7.2, 0, 24.6); taxi.rotation.y = 2.95;       // 航拍里它停在公寓群北侧的路边
  } else { taxi = giraffeTaxi(); taxi.position.set(-7.2, 0, 24.6); taxi.rotation.y = -1.76; }
  G.add(taxi);

  // ---- 长椅（巨 / 常规 / 迷你）+ 垃圾桶
  const bg = benchGeo();
  const benches = [], bins = [];
  // 位置依据实地漫游视频（2024～2026 年的六段），不再沿路按间距摆：
  // ① 食集对面、绿地北缘的矮墙前一排，自西向东：中、小、中、小、巨型（冰川镇时尚奥莱）、中、中，都面向马路；
  // ② 环岛岛内北部的一小块铺地：一中一小；③ 环岛东南沿：一张中号。
  // 甜品店旁原来放的巨型长椅在任何画面里都找不到，已删。坐标是由画面换算的，误差约 2～3 米。
  benches.push({ x: 34.4, z: -53.9, ry: 2.44, s: 1 });
  benches.push({ x: 39.6, z: -55.8, ry: 2.94, s: 2.6 });          // 巨型长椅（下标 1 → 靠背是「时尚奥莱」那幅）
  benches.push({ x: 36.3, z: -55.2, ry: 2.75, s: 1 });
  benches.push({ x: 43.4, z: -56.7, ry: 3.49, s: 1 });
  benches.push({ x: 45.3, z: -56.0, ry: 3.49, s: 1 });
  benches.push({ x: 35.3, z: -54.75, ry: 2.44, s: 0.32 });
  benches.push({ x: 37.4, z: -55.8, ry: 2.75, s: 0.32 });
  benches.push({ x: -26.9, z: -12.4, y: 0.56, ry: -0.78, s: 1 });   // 岛内铺地
  benches.push({ x: -25.4, z: -11.7, y: 0.56, ry: -0.78, s: 0.32 });
  benches.push({ x: -24.3, z: -19.3, y: 0.56, ry: 1.19, s: 1 });  // 环岛东南沿
  bins.push({ x: 33.5, z: -53.1, ry: -0.7 }, { x: -26.5, z: -20.5, y: 0.56, ry: 0 }, { x: -23.3, z: -18.5, y: 0.56, ry: -1.95 });
  G.add(instanced(bg, M.green, benches));
  // 长椅靠背上的戏仿广告（FLOATZEN / 冰川镇时尚奥莱 / 狮凯奇）
  const signMats = [];
  benches.forEach((b, i) => {
    const g = new THREE.Group(); g.position.set(b.x, b.y || 0, -b.z); g.rotation.y = b.ry || 0; g.scale.setScalar(b.s || 1);
    for (const sgn of [1, -1]) {
      const ad = S.benchAd(["floatzen", "outlet", "lion"][(i + (sgn > 0 ? 0 : 1)) % 3]);
      ad.scale.setScalar(1.09); ad.position.set(0, 0.82, sgn > 0 ? -0.296 : -0.328); ad.rotation.x = sgn > 0 ? -0.175 : 0.175; if (sgn < 0) ad.rotation.y = Math.PI;
      g.add(ad); signMats.push(...ad.userData.lit);
    }
    G.add(g);
  });
  // 蓝色木板海报栏（夜行弄堂口）
  const kiosk = S.posterKiosk(); kiosk.position.set(29.5, 0, 34.2); kiosk.rotation.y = 0.55; G.add(kiosk); signMats.push(...kiosk.userData.lit);
  nightFns.push((e) => { for (const m of signMats.concat(signMats0)) { const [d, n] = m.userData.lit || [0, 1]; m.emissiveIntensity = d + (n - d) * e; } });
  // 巨椅下停着的迷你小车
  [[0x9fd0ea, -37.9, -11.6], [0xf1e6c8, -37.0, -10.6]].forEach(([c, x, y]) => {
    const car = new THREE.Group();
    const b = new THREE.Mesh(new RoundedBoxGeometry(0.42, 0.2, 0.75, 3, 0.09), new THREE.MeshStandardMaterial({ color: c, roughness: 0.3, metalness: 0.2 })); b.position.y = 0.17; car.add(b);
    const top = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), M.glass); top.position.y = 0.25; top.scale.set(0.95, 0.9, 1.3); car.add(top);
    for (const [wx, wz] of [[-0.2, 0.22], [0.2, 0.22], [-0.2, -0.22], [0.2, -0.22]]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.06, 10), M.tire); w.rotation.z = Math.PI / 2; w.position.set(wx, 0.08, wz); car.add(w); }
    car.position.set(x, 0, -y); car.rotation.y = 0.9; car.traverse((m) => { if (m.isMesh) m.castShadow = true; }); G.add(car);
  });
  // 双联垃圾桶：圆拱顶、投口、金色腰线，中间立柱上有分类牌
  const binParts = [], binDark = [], binGold = [];
  for (const sx of [-0.31, 0.31]) {
    binParts.push(T(new RoundedBoxGeometry(0.52, 0.8, 0.46, 3, 0.07), sx, 0.47, 0));
    binParts.push(T(new THREE.CylinderGeometry(0.26, 0.26, 0.46, 16, 1, false, 0, Math.PI), sx, 0.86, 0, Math.PI / 2, 0, Math.PI / 2));
    binParts.push(T(new THREE.BoxGeometry(0.44, 0.07, 0.4), sx, 0.035, 0));
    binDark.push(T(new THREE.BoxGeometry(0.32, 0.13, 0.02), sx, 0.83, 0.235)); binDark.push(T(new THREE.BoxGeometry(0.32, 0.13, 0.02), sx, 0.83, -0.235));
    binGold.push(T(new THREE.BoxGeometry(0.53, 0.035, 0.47), sx, 0.62, 0));
  }
  binParts.push(T(new THREE.CylinderGeometry(0.025, 0.025, 1.45, 8), 0, 0.72, 0)); binParts.push(T(new RoundedBoxGeometry(0.36, 0.22, 0.03, 2, 0.01), 0, 1.5, 0));
  binGold.push(T(new THREE.SphereGeometry(0.04, 8, 6), 0, 1.64, 0));
  const binMat = new THREE.MeshStandardMaterial({ color: 0x237a4c, roughness: 0.45, metalness: 0.25 });
  G.add(instanced(merge(binParts), binMat, bins), instanced(merge(binDark), M.dark, bins, false), instanced(merge(binGold), M.gold, bins, false));

  // ---- 入口处的红绿灯臂 + 路牌 + 三种高度的人行信号灯
  const mast = new THREE.Group();
  mast.add(new THREE.Mesh(merge([T(new THREE.CylinderGeometry(0.1, 0.13, 6.2, 12), 0, 3.1, 0), tubeAlong([[0, 5.6, 0], [0.6, 6.4, 0], [2.2, 6.6, 0], [4.6, 6.3, 0]], 0.07, 16, 8), tubeAlong([[0, 4.6, 0], [0.5, 5.0, 0], [0.8, 4.7, 0], [0.55, 4.45, 0]], 0.04, 10, 6)]), M.green));
  mast.add(new THREE.Mesh(T(new THREE.LatheGeometry([[0, 0], [0.3, 0], [0.26, 0.15], [0.17, 0.4], [0.24, 0.8], [0.13, 1.0]].map((p) => new THREE.Vector2(p[0], p[1])), 16), 0, 0, 0), M.gold));
  const sig = new THREE.Mesh(new RoundedBoxGeometry(1.5, 0.52, 0.36, 3, 0.12), M.dark); sig.position.set(3.6, 6.0, 0); mast.add(sig);
  const lampMats = [0xff3b30, 0xffc21a, 0x2fe06a].map((c) => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.4, roughness: 0.3 }));
  lampMats.forEach((lm, i) => { const l = new THREE.Mesh(new THREE.CircleGeometry(0.17, 18), lm); l.position.set(3.12 + i * 0.48, 6.0, 0.19); mast.add(l); const l2 = l.clone(); l2.rotation.y = Math.PI; l2.position.z = -0.19; mast.add(l2); });
  const s1 = streetSign('大马路', 'MANE STREET'); s1.position.set(1.0, 4.9, 0); mast.add(s1);
  mast.position.set(-41.2, 0, 66.3); mast.rotation.y = 2.2; mast.traverse((m) => { if (m.isMesh) m.castShadow = true; }); G.add(mast);
  nightFns.push((e) => lampMats.forEach((m, i) => { m.emissiveIntensity = (i === 2 ? 1 : 0.15) * (0.6 + e * 1.6); }));

  const pedMats = [0, 1, 2].map((k) => ['#ff4030', '#2fe06a'].map((c, j) => { const t = pedIcon(k, j ? c : c); return new THREE.MeshStandardMaterial({ map: t, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: j ? 1.1 : 0.25, roughness: 0.4 }); }));
  const pedPole = (x, y, ry, zh, en) => {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(merge([T(new THREE.CylinderGeometry(0.06, 0.08, 3.6, 10), 0, 1.8, 0)]), M.green));
    g.add(new THREE.Mesh(T(new THREE.LatheGeometry([[0, 0], [0.2, 0], [0.12, 0.3], [0.16, 0.6], [0.08, 0.75]].map((p) => new THREE.Vector2(p[0], p[1])), 12), 0, 0, 0), M.gold));
    [[3.0, 0.5], [1.5, 0.36], [0.32, 0.2]].forEach(([h, s], i) => {       // 大型 / 中型 / 啮齿类高度
      const box = new THREE.Mesh(new RoundedBoxGeometry(s, s * 1.5, 0.22, 2, 0.05), M.dark); box.position.set(i === 2 ? 0.22 : 0, h, 0.12); g.add(box);
      const r = new THREE.Mesh(new THREE.PlaneGeometry(s * 0.62, s * 0.62), pedMats[i][0]); r.position.set(box.position.x, h + s * 0.36, 0.235); g.add(r);
      const gr = new THREE.Mesh(new THREE.PlaneGeometry(s * 0.62, s * 0.62), pedMats[i][1]); gr.position.set(box.position.x, h - s * 0.36, 0.235); g.add(gr);
    });
    if (zh) { const s = streetSign(zh, en); s.position.set(0.85, 3.3, 0); g.add(s); }
    g.position.set(x, 0, -y); g.rotation.y = ry; g.traverse((m) => { if (m.isMesh) m.castShadow = true; }); G.add(g);
    solid.circles.push([x, y, 0.16]);
  };
  pedPole(-31.0, -28.6, 0.6, '追尾环岛', 'TAIL CHASE CIRCLE');
  pedPole(-12.8, -25.3, -2.2, '大马路', 'MANE STREET');
  pedPole(33.8, -29.6, 0.2, '夜行弄堂', 'NOCTURNAL ALLEY');
  pedPole(7.5, -14.5, -0.8, null);
  pedPole(52.5, -45.0, 2.6, '大马路', 'MANE STREET');

  // ---- 交通标志
  const roundSign = (x, y, ry, zh, en, color = '#d6202a') => {
    const t = canvasTex(canvas(256, 256, (g) => {
      g.clearRect(0, 0, 256, 256);
      g.fillStyle = '#fff'; g.beginPath(); g.arc(128, 128, 122, 0, 7); g.fill();
      g.strokeStyle = color; g.lineWidth = 20; g.beginPath(); g.arc(128, 128, 108, 0, 7); g.stroke();
      g.beginPath(); g.moveTo(52, 52); g.lineTo(204, 204); g.stroke();
      g.fillStyle = '#333'; g.beginPath(); g.moveTo(70, 150); g.bezierCurveTo(100, 80, 170, 80, 190, 120); g.bezierCurveTo(160, 110, 120, 120, 100, 165); g.fill();   // 号角形
      g.fillStyle = color; g.font = 'bold 22px "Microsoft YaHei",sans-serif'; g.textAlign = 'center'; g.fillText(zh, 128, 212); g.font = 'bold 13px Arial'; g.fillText(en, 128, 230);
    }));
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 3, 8), M.green)).position.y = 1.5;
    const d = new THREE.Mesh(new THREE.CircleGeometry(0.42, 28), new THREE.MeshStandardMaterial({ map: t, transparent: true, roughness: 0.5, side: THREE.DoubleSide })); d.position.set(0, 2.75, 0.07); g.add(d);
    g.position.set(x, 0, -y); g.rotation.y = ry; g.traverse((m) => { if (m.isMesh) m.castShadow = true; }); G.add(g);
  };
  // 实景里的几种交通标志（文字照实景，图形为抽象示意）
  const tsign = (kind, zh, en, x, y, ry) => { const t = S.trafficSign(kind, zh, en); t.position.set(x, 0, -y); t.rotation.y = ry; G.add(t); solid.circles.push([x, y, 0.08]); };
  tsign("ban", "禁止鸣笛", "MIND YOUR HORNS", -23.6, -46.4, -0.93);
  tsign("ban", "禁止鸣笛", "MIND YOUR HORNS", 30.5, -46.4, -Math.PI / 2);
  tsign("merge", "哺乳动物并道", "MERGING MAMMALS", -30.6, -26.4, 0);
  tsign("slow", "慢：幼兽活动", "SLOW: CUBS AT PLAY", 13.4, -37.6, 0.785);
  tsign("slow", "慢：幼兽活动", "SLOW: CUBS AT PLAY", -43.9, -61.1, -0.615);

  // ---- 动物城食集：四个小摊（东段，东街区南面）。立面由生成图 + 深度图拉成带浮雕的小体块
  const stallDefs = [
    // 实地视频：四个摊位沿路北侧一字排开，售卖面都朝南（朝马路），背后是冰屋的蓝色排队栏杆。
    // 自西向东：树懒冰沙、霍普斯爆米花、大象甜品店爪爪冰棍、咩花糖；冰棍摊东头立着巨型爪爪冰棍。
    { p: [33.4, -45.9], name: 'SLOTHFUL SLURPS', sub: '饮品', style: 'cream' },
    { p: [36.3, -45.9], name: 'HOPPS FAMILY FARM', sub: '爆米花', style: 'dark' },
    { p: [43.2, -45.7], name: 'COTTONBALL CANDY', sub: '咩花糖', style: 'purple', signW: 1.12, signDy: -0.27 },   // 字放进推车顶上那块椭圆招牌里
    { p: [39.2, -45.9], name: "JUMBEAUX'S", sub: '爪爪冰棍 PAWPSICLES', style: 'cream' },
  ];
  const ms = sheets.market;
  const runs = [];
  if (ms) { let c = 0; while (c < ms.cols) { while (c < ms.cols && ms.top[c] < 0.06) c++; const a = c; while (c < ms.cols && ms.top[c] >= 0.06) c++; if (c - a > 12) runs.push([a / ms.cols, c / ms.cols]); } }
  stallDefs.forEach((s, i) => {
    const W = 2.6;
    if (ms && runs[i]) {
      const piece = ms.piece({ u0: runs[i][0], u1: runs[i][1], width: W, depth: 1.5, reliefScale: 0.4, cell: 0.03, taper: false, skin: 'house' });
      if (ms.depth) { const back = piece.children[piece.children.length - 1].clone(); back.scale.z = -1; back.position.z = -1.5; piece.add(back); }      // 背面也有浮雕
      if (s.n) placeAB(piece, [s.p[0] + W / 2, s.p[1] + 0.75], [s.p[0] - W / 2, s.p[1] + 0.75]);    // 后排正面朝北
      else placeAB(piece, [s.p[0] - W / 2, s.p[1] - 0.75], [s.p[0] + W / 2, s.p[1] - 0.75]);        // 前排正面朝南（朝向大马路）
      piece.rotation.y += (i - 1.5) * 0.03;
      G.add(piece);
      // 摊位顶上的招牌（官方英文名 + 中文品类）
      const H = piece.userData.H, top = piece.userData.height / H;
      const v = top * 0.885;
      // 招牌的宽度和位置按「招牌上沿那个高度处」摊位轮廓的实际宽度来定：
      // 有的摊位（咩花糖的推车）顶部比底座窄，按整摊宽度居中放字，字会伸到轮廓外面、悬在半空
      let ca = Math.floor(runs[i][0] * ms.cols), cb = Math.ceil(runs[i][1] * ms.cols) - 1;
      const vTop = v + 0.3 / H;
      while (ca < cb && ms.top[ca] < vTop) ca++;
      while (cb > ca && ms.top[cb] < vTop) cb--;
      const ua = ca / ms.cols, ub = (cb + 1) / ms.cols, uSpan = runs[i][1] - runs[i][0];
      const sw = s.signW || Math.max(0.8, Math.min(1.55, ((ub - ua) / uSpan) * W * 0.88)), uc = (ua + ub) / 2;
      const sign = S.letters(s.name, s.sub, { w: sw, style: s.style, zhFont: 'Arial, "Microsoft YaHei", sans-serif', enFont: '"Microsoft YaHei", Arial, sans-serif', enRatio: 0.34, night: 0.8 });
      const sv = v + (s.signDy || 0) / H;
      sign.position.set(((uc - runs[i][0]) / uSpan) * W, sv * H, ms.reliefMaxZ(uc - 0.02, uc + 0.02, sv - 0.03, sv + 0.03) * 0.4 + 0.05);
      piece.add(sign); signMats0.push(...sign.userData.lit);
    } else {
      const g = new THREE.Group();
      const base = new THREE.Mesh(new RoundedBoxGeometry(2.6, 1.05, 1.5, 3, 0.08), M.wood); base.position.y = 0.53; g.add(base);
      const roof = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.1, 1.9), M.green); roof.position.y = 2.7; g.add(roof);
      for (const x of [-1.2, 1.2]) for (const z of [-0.65, 0.65]) { const q = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.6, 6), M.green); q.position.set(x, 1.9, z); g.add(q); }
      g.position.set(s.p[0], 0, -s.p[1]); g.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } }); G.add(g);
    }
  });
  // 食集周边：绿色市集伞、木箱、木桶、插着大号爪爪冰棍的展示石
  {
    const mk = new THREE.Group();
    const umbT = canvasTex(canvas(256, 32, (g) => { for (let k = 0; k < 16; k++) { g.fillStyle = k % 2 ? '#2f8f5a' : '#3fae6e'; g.fillRect(k * 16, 0, 16, 32); } }));
    const umbM = new THREE.MeshStandardMaterial({ map: umbT, roughness: 0.85, side: THREE.DoubleSide });
    for (const [x, y, h] of [[34.9, -54.4, 3.1], [36.9, -55.6, 3.2], [42.6, -56.5, 3.1], [44.4, -56.2, 3.2], [46.2, -55.4, 3.1], [33.4, -45.3, 3.2], [39.2, -45.3, 3.2]]) {
      const top = new THREE.Mesh(new THREE.ConeGeometry(1.15, 0.5, 14, 1, true), umbM); top.position.set(x, h, -y); mk.add(top);
      const rim = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.15, 0.14, 14, 1, true), umbM); rim.position.set(x, h - 0.32, -y); mk.add(rim);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, h, 8), M.wood); pole.position.set(x, h / 2, -y); mk.add(pole);
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.32, 0.12, 14), M.dark); base.position.set(x, 0.06, -y); mk.add(base);
    }
    const crate = (x, y, yy, ry, s = 1) => { const c = new THREE.Mesh(new THREE.BoxGeometry(0.62 * s, 0.4 * s, 0.46 * s), M.wood); c.position.set(x, yy, -y); c.rotation.y = ry; mk.add(c); for (const dz of [-0.1, 0.1]) { const sl = new THREE.Mesh(new THREE.BoxGeometry(0.64 * s, 0.05 * s, 0.03), M.trunk); sl.position.set(x, yy + dz * s, -y + 0.235 * s); sl.rotation.y = ry; mk.add(sl); } };
    crate(34.85, -46.9, 0.2, 0.3); crate(34.9, -46.9, 0.6, -0.2, 0.9); crate(36.4, -47.25, 0.2, 1.2); crate(31.8, -46.0, 0.2, 0.1); crate(31.9, -46.05, 0.6, 0.5, 0.85); crate(37.9, -47.2, 0.2, -0.4);
    for (const [x, y] of [[45.0, -45.4], [31.6, -44.8]]) { const b = new THREE.Mesh(new THREE.LatheGeometry([[0.22, 0], [0.3, 0.3], [0.31, 0.45], [0.22, 0.75], [0, 0.75]].map((q) => new THREE.Vector2(q[0], q[1])), 14), M.wood); b.position.set(x, 0, -y); mk.add(b); for (const hh of [0.18, 0.58]) { const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.29, 0.015, 6, 18), M.dark); hoop.rotation.x = Math.PI / 2; hoop.position.set(x, hh, -y); mk.add(hoop); } }
    // 展示石 + 三根大号爪形冰棍
    const stone = new THREE.Mesh(blobGeo(55, 0.7, 2, 0.18), new THREE.MeshStandardMaterial({ color: 0xd3a36a, roughness: 0.95 })); stone.scale.set(1.3, 0.75, 1.0); stone.position.set(41.2, 0.35, 46.5); mk.add(stone);
    const lolly = new THREE.MeshStandardMaterial({ color: 0xd8262f, roughness: 0.25, emissive: 0x300608, emissiveIntensity: 0.4 });
    [[-0.45, 0.2], [0, -0.1], [0.45, 0.25]].forEach(([dx, tilt], i) => {
      const g = new THREE.Group();
      const stick = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.55, 0.025), M.wood); stick.position.y = 0.2; g.add(stick);
      const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.09, 18), lolly); pad.rotation.x = Math.PI / 2; pad.scale.y = 1; pad.position.y = 0.6; g.add(pad);
      for (const [tx, ty] of [[-0.19, 0.82], [-0.07, 0.9], [0.07, 0.9], [0.19, 0.82]]) { const toe = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.09, 12), lolly); toe.rotation.x = Math.PI / 2; toe.position.set(tx, ty, 0); g.add(toe); }
      g.position.set(41.2 + dx * 0.8, 0.62, 46.5); g.rotation.z = tilt * 0.6; g.rotation.y = 0; mk.add(g);
    });
    mk.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
    G.add(mk);
  }
  // 多种高度的饮水台（银行墙边）与斑马纹花箱（入口）
  {
    const fg = new THREE.Group();
    [[0.42, -0.55], [0.82, 0], [1.35, 0.6]].forEach(([h, dx]) => {
      const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.13, h, 12), M.green); ped.position.set(dx, h / 2, 0); fg.add(ped);
      const bowl = new THREE.Mesh(new THREE.LatheGeometry([[0, 0], [0.2, 0.02], [0.26, 0.1], [0.24, 0.13], [0.18, 0.06], [0, 0.05]].map((q) => new THREE.Vector2(q[0], q[1])), 16), M.gold); bowl.position.set(dx, h, 0); fg.add(bowl);
      const spout = new THREE.Mesh(tubeAlong([[dx - 0.14, h + 0.08, 0], [dx - 0.12, h + 0.2, 0], [dx - 0.02, h + 0.2, 0]], 0.014, 8, 6), M.chrome); fg.add(spout);
    });
    fg.position.set(-45.7, 0, 12.4); fg.rotation.y = Math.PI / 2; fg.traverse((m) => { if (m.isMesh) m.castShadow = true; }); G.add(fg);
    const zebra = canvasTex(canvas(256, 128, (g) => { g.fillStyle = '#f4f1e8'; g.fillRect(0, 0, 256, 128); g.fillStyle = '#1c1c1e'; for (let i = 0; i < 9; i++) { g.beginPath(); g.moveTo(i * 30 + 4, 0); g.bezierCurveTo(i * 30 + 26, 40, i * 30 - 8, 86, i * 30 + 12, 128); g.lineTo(i * 30 + 26, 128); g.bezierCurveTo(i * 30 + 6, 90, i * 30 + 40, 44, i * 30 + 18, 0); g.fill(); } }));
    const box = new THREE.Mesh(new RoundedBoxGeometry(2.4, 0.7, 0.8, 3, 0.06), new THREE.MeshStandardMaterial({ map: zebra, roughness: 0.5 })); box.position.set(-37.2, 0.35, 52.4); box.rotation.y = 0.9; box.castShadow = true; G.add(box);
    if (camelliaM) { const cm2 = shrub(21, { r: 0.55, h: 0.9, n: 22 }); const l2 = [[-37.9, -51.5], [-37.2, -52.4], [-36.5, -53.3]].map(([x, y], i) => ({ x, z: y, y: 0.6, s: 0.9, ry: i })); G.add(instanced(cm2.core, shrubCore, l2), instanced(cm2.cards, camelliaM, l2)); }
  }

  // 「THE BIG DONUT」大甜甜圈道具
  const donut = new THREE.Group();
  const dn = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.42, 16, 32), new THREE.MeshStandardMaterial({ color: 0xc98a4b, roughness: 0.7 })); donut.add(dn);
  const ic = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.44, 16, 32, Math.PI * 2), new THREE.MeshStandardMaterial({ color: 0x5a2f1c, roughness: 0.35 })); ic.scale.set(1, 1, 0.62); ic.position.z = 0.16; donut.add(ic);
  donut.position.set(54.2, 1.6, 40.6); donut.rotation.y = 2.5; donut.traverse((m) => { if (m.isMesh) m.castShadow = true; }); G.add(donut);
  const dpost = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 1.0, 8), M.green); dpost.position.set(54.2, 0.5, 40.6); G.add(dpost);

  // ---- 排队区：蓝、紫、绿的叶片形矮顶棚 + 青绿色立柱 + 绿色栏杆（博物馆砖墙与警局之间）
  const qG = new THREE.Group();
  const canMat = [0x3f7fd0, 0x7a52c0, 0x58b06a, 0x2f9fc8].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.55, side: THREE.DoubleSide }));
  const teal = new THREE.MeshStandardMaterial({ color: 0x2aa3a0, roughness: 0.4, metalness: 0.2 });
  const leafGeo = (len, wid, seed) => {
    const g = new THREE.PlaneGeometry(len, wid, 28, 10); g.rotateX(-Math.PI / 2);
    const q = g.attributes.position;
    for (let i = 0; i < q.count; i++) {
      const t = q.getX(i) / len + 0.5, s = q.getZ(i) / (wid / 2);                    // t 0..1 沿叶长，s -1..1 横向
      const half = Math.pow(Math.sin(Math.PI * Math.min(1, t * 0.96 + 0.02)), 0.75) * (wid / 2);
      q.setZ(i, s * half);
      q.setY(i, Math.sin(t * Math.PI) * 0.45 - Math.abs(s) * half * 0.28 + Math.sin(t * 9 + seed) * 0.05 + (1 - Math.abs(s)) * 0.08);   // 中脉隆起、两侧下垂
    }
    g.computeVertexNormals();
    return g;
  };
  const leaves = [[17.6, -13.0, 0.1, 3.3], [14.8, -16.6, -0.25, 3.0], [20.2, -17.2, 0.3, 3.5], [17.2, -20.6, -0.1, 3.1], [20.6, -22.6, 0.2, 3.4], [14.6, -23.6, 0.35, 3.0]];
  leaves.forEach(([x, y, ry, h], i) => {
    const m = new THREE.Mesh(leafGeo(8.4, 3.6, i), canMat[i % 4]); m.position.set(x, h, -y); m.rotation.y = ry; m.castShadow = true; m.receiveShadow = true; qG.add(m);
    const vein = new THREE.Mesh(tubeAlong([[-4.1, 0.05, 0], [-2, 0.5, 0], [0, 0.6, 0], [2, 0.5, 0], [4.1, 0.05, 0]], 0.05, 16, 6), teal); vein.position.copy(m.position); vein.rotation.y = ry; qG.add(vein);
    for (const dx of [-3.1, 0, 3.1]) {
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, h + 0.3, 8), teal);
      col.position.set(x + Math.cos(ry) * dx, (h + 0.3) / 2, -y - Math.sin(ry) * dx); col.castShadow = true; qG.add(col);
      solid.circles.push([x + Math.cos(ry) * dx, y + Math.sin(ry) * dx, 0.1]);
    }
  });
  for (let r = 0; r < 4; r++) {
    const y0 = -12.6 - r * 3.6;         // 排队区在入口墙以南（卫星图：y −10.5～−30）
    const rail = leafRail(9.2); rail.position.set(17.6, 0, -y0); qG.add(rail);
    solidBar(17.6, y0, 0, 4.6, 0.04);
  }
  G.add(qG);

  // ---- 旅鼠超级管道：琥珀色透明管，从露露精品店一排挂到银行
  // 不用 transmission（折射）：只要有一个折射材质在视野里，three.js 就会把整个场景多画一遍给它当背景，
  // 入口一带正对着这根管子，帧时间直接翻倍。改成普通半透明 + 清漆高光，观感接近。
  const tubeMat = new THREE.MeshPhysicalMaterial({ color: 0xf2b54a, roughness: 0.08, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.06, transparent: true, opacity: 0.46, depthWrite: false, emissive: 0xf0a030, emissiveIntensity: 0.05 });
  const tubePath = [[-31.9, 4.2, 30], [-31.8, 4.6, 26.5], [-32.6, 5.0, 23.6], [-35.8, 5.3, 20.1], [-39.8, 5.0, 15.7], [-44.5, 4.6, 15.3], [-46.2, 4.4, 14.8], [-46.2, 3.6, 12], [-46.4, 2.2, 10.5], [-46.4, 0.5, 10.3]];   // 挂在浮雕外侧
  const tube = new THREE.Mesh(tubeAlong(tubePath, 0.16, 90, 12), tubeMat); tube.castShadow = false; G.add(tube);
  const collars = [];
  const cc = new THREE.CatmullRomCurve3(tubePath.map((p) => new THREE.Vector3(...p)));
  for (let i = 0; i <= 12; i++) { const p = cc.getPointAt(i / 12), t = cc.getTangentAt(i / 12); const g = new THREE.TorusGeometry(0.19, 0.04, 8, 14); const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), t); g.applyQuaternion(q); g.translate(p.x, p.y, p.z); collars.push(g); }
  G.add(new THREE.Mesh(merge(collars), M.green));
  nightFns.push((e) => { tubeMat.emissiveIntensity = 0.05 + e * 0.9; });

  // ---- 井盖
  const manhole = canvasTex(canvas(256, 256, (g) => {
    g.clearRect(0, 0, 256, 256);
    g.fillStyle = '#b08a3a'; g.beginPath(); g.arc(128, 128, 124, 0, 7); g.fill();
    g.strokeStyle = '#7a5c22'; g.lineWidth = 6; for (const r of [116, 84, 40]) { g.beginPath(); g.arc(128, 128, r, 0, 7); g.stroke(); }
    g.fillStyle = '#5c4418'; g.font = 'bold 17px Arial'; g.textAlign = 'center';
    const txt = 'ZOOTOPIA PUBLIC WORKS · 动物城工程 · ';
    for (let i = 0; i < txt.length; i++) { g.save(); g.translate(128, 128); g.rotate((i / txt.length) * Math.PI * 2); g.fillText(txt[i], 0, -94); g.restore(); }
    for (let i = 0; i < 9; i++) g.fillRect(96 + (i % 3) * 26, 100 + ((i / 3) | 0) * 22, 14, 10);
  }));
  const mhMat = new THREE.MeshStandardMaterial({ map: manhole, transparent: true, roughness: 0.4, metalness: 0.7, polygonOffset: true, polygonOffsetFactor: -3 });
  [[-30, -33], [-4, -23.6], [30, -49.8]].forEach(([x, y]) => { const m = new THREE.Mesh(new THREE.CircleGeometry(0.45, 28), mhMat); m.rotation.x = -Math.PI / 2; m.position.set(x, 0.05, -y); m.receiveShadow = true; G.add(m); });

  // ---- 主入口东侧、靠石墙的红色圆角小售卖车（视频和航拍里都有；卖什么没看清）
  {
    const kc = new THREE.Group(), red = new THREE.MeshStandardMaterial({ color: 0xc8322c, roughness: 0.45 });
    const body = new THREE.Mesh(new RoundedBoxGeometry(2.2, 1.15, 1.3, 4, 0.22), red); body.position.y = 0.72; kc.add(body);
    const top = new THREE.Mesh(new RoundedBoxGeometry(2.5, 0.22, 1.6, 4, 0.1), red); top.position.y = 2.35; kc.add(top);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.1, 6), M.dark); p.position.set(sx * 1.0, 1.8, sz * 0.55); kc.add(p); }
    for (const sx of [-0.7, 0.7]) { const wh = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.12, 14), M.tire); wh.rotation.x = Math.PI / 2; wh.position.set(sx, 0.22, 0.6); kc.add(wh); }
    kc.position.set(-36, 0, 71.5); kc.rotation.y = 0.95; kc.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } }); G.add(kc);
    solid.circles.push([-36, -71.5, 1.3]);
  }

  // ---- 入口迎宾牌（文字牌，不含官方标志图形）
  const wel = new THREE.Group();
  const board = new THREE.Mesh(new RoundedBoxGeometry(3.4, 1.3, 0.14, 3, 0.06), [M.green, M.green, M.green, M.green,
    new THREE.MeshStandardMaterial({ map: signTex([{ t: '疯狂动物城', font: 'bold 118px "Microsoft YaHei",sans-serif', color: '#ffe9a8' }, { t: 'ZOOTOPIA · MANE STREET', font: 'bold 44px Arial', color: '#fff' }], { w: 768, h: 300, bg: '#1d6d48', border: '#c9a23a' }), roughness: 0.5 }), M.green]);
  board.position.y = 2.6; wel.add(board);
  for (const x of [-1.5, 1.5]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 2.6, 8), M.green); p.position.set(x, 1.3, 0); wel.add(p); }
  wel.position.set(-53.2, 0, 74.5); wel.rotation.y = 0.75; wel.traverse((m) => { if (m.isMesh) m.castShadow = true; }); G.add(wel);

  // ---- 路灯上的紫色演唱会道旗
  const bannerTex = canvasTex(canvas(160, 400, (g) => {
    const gr = g.createLinearGradient(0, 0, 0, 400); gr.addColorStop(0, "#5a1f9c"); gr.addColorStop(1, "#c8339a"); g.fillStyle = gr; g.fillRect(0, 0, 160, 400);
    if (!drawArt(g, "concert", 0, 122, 160, 196, 0.45)) { g.fillStyle = "rgba(255,255,255,.16)"; for (let i = 0; i < 5; i++) { g.beginPath(); g.moveTo(80, 120); g.lineTo(i * 40, 400); g.lineTo(i * 40 + 22, 400); g.fill(); } }
    g.fillStyle = "#fff"; g.textAlign = "center"; g.font = "bold 30px \"Microsoft YaHei\",sans-serif"; g.fillText("疯狂动物城", 80, 50); g.font = "bold 22px Arial"; g.fillText("ZOOTOPIA", 80, 82); g.fillText("CONCERT", 80, 108);
    g.font = "bold 34px Arial"; g.fillStyle = "#ffe35c"; g.fillText("GAZELLE", 80, 350); g.font = "bold 22px \"Microsoft YaHei\",sans-serif"; g.fillStyle = "#fff"; g.fillText("全城疯唱派对", 80, 382);
  }));
  const bannerGeo = new THREE.BoxGeometry(0.62, 1.55, 0.03); bannerGeo.translate(0.5, 3.35, 0);     // 用薄盒，两面文字都是正的
  const banners = instanced(bannerGeo, new THREE.MeshStandardMaterial({ map: bannerTex, roughness: 0.7 }), lamps2.map((l) => ({ x: l.x, z: l.z, ry: l.ry + Math.PI / 2 })));
  G.add(banners);

  // ---- 大象甜品店左侧的巨型高脚凳（大象尺寸）
  const seatMat = new THREE.MeshStandardMaterial({ color: 0xc8283c, roughness: 0.35 });
  [[-32.5, -22.7], [-33.4, -21.85], [-34.25, -21.0]].forEach(([x, y]) => {     // 靠甜品店左侧，不挡正门
    const st = new THREE.Group();
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.16, 1.9, 12), M.chrome); stem.position.y = 0.95; st.add(stem);
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.62, 0.08, 20), M.chrome); foot.position.y = 0.04; st.add(foot);
    const seat = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.66, 0.3, 24), seatMat); seat.position.y = 2.0; st.add(seat);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.05, 8, 24), M.chrome); rim.rotation.x = Math.PI / 2; rim.position.y = 1.86; st.add(rim);
    st.position.set(x, 0, -y); st.scale.setScalar(0.8); st.traverse((m) => { if (m.isMesh) m.castShadow = true; }); G.add(st);
    solid.circles.push([x, y, 0.5]);
  });

  // ---- 动物城站门前：条纹遮阳伞 + 绿色咖啡桌椅
  const umbTex = canvasTex(canvas(256, 32, (g) => { for (let k = 0; k < 16; k++) { g.fillStyle = k % 2 ? "#f3ecd2" : "#3f9a63"; g.fillRect(k * 16, 0, 16, 32); } }));
  const umbMat = new THREE.MeshStandardMaterial({ map: umbTex, roughness: 0.8, side: THREE.DoubleSide });
  // 位置取自航拍：车站 / 甜品店前一组四把（带桌椅），另有几把单独的伞（食集东侧、警局东南路口、东通道）
  [[-42.2, -7.2], [-39.9, -9.2], [-36.9, -9.0], [-38.3, -12.6], [-41.0, -11.4], [46.6, -46.6, 1], [15.8, -28.5, 1], [73.5, -63.1, 1], [78.4, -71.8, 1], [81.6, -81.0, 1], [-12.4, -3.8, 1], [-24.6, -6.0, 1], [-14.0, -19.4, 1], [-30.9, -53.6, 1], [-31.3, -57.0, 1]].forEach(([x, y, bare]) => {
    const u = new THREE.Group();
    const top = new THREE.Mesh(new THREE.ConeGeometry(1.45, 0.55, 16, 1, true), umbMat); top.position.y = 2.55; u.add(top);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 2.6, 6), M.dark); pole.position.y = 1.3; u.add(pole);
    if (!bare) { const table = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.04, 20), M.green); table.position.y = 0.74; u.add(table); }
    for (let k = 0; k < (bare ? 0 : 3); k++) { const a = k * 2.1; const ch = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.17, 0.46, 12), M.green); ch.position.set(Math.cos(a) * 0.8, 0.23, Math.sin(a) * 0.8); u.add(ch); }
    u.position.set(x, 0, -y); u.traverse((m) => { if (m.isMesh) m.castShadow = true; }); G.add(u);
    solid.circles.push([x, y, bare ? 0.1 : 0.95]);
  });

  // ---- 露露精品店门口的木质金饰迎宾台
  const pod = new THREE.Group();
  const pb = new THREE.Mesh(new RoundedBoxGeometry(1.1, 1.25, 0.7, 3, 0.06), M.wood); pb.position.y = 0.63; pod.add(pb);
  const pt = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.06, 0.85), M.gold); pt.position.y = 1.28; pod.add(pt);
  const pm = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.04, 20), M.gold); pm.rotation.z = Math.PI / 2; pm.position.set(0.56, 0.75, 0); pod.add(pm);
  pod.position.set(-31.6, 0, 40.4); pod.traverse((m) => { if (m.isMesh) m.castShadow = true; }); G.add(pod);

  // ---- 碰撞占位：路灯、行道树（带树笼）、长椅、垃圾桶、红绿灯杆、迎宾牌、迎宾台
  for (const l of allLamps) solid.circles.push([l.x, l.z, 0.16]);
  for (const t of treeLists.flat()) if (!t.y) solid.circles.push([t.x, t.z, t.s < 1.1 ? 0.42 : 0.22]);
  for (const b of benches) if ((b.s || 1) < 2 && (b.s || 1) > 0.5) solidBar(b.x, b.z, b.ry || 0, 0.75 * (b.s || 1), 0.3);
  for (const b of bins) solidBar(b.x, b.z, b.ry || 0, 0.31, 0.27);
  solid.circles.push([-41.2, -66.3, 0.22]);            // 红绿灯杆
  solidBar(-53.2, -74.5, 0.75, 1.5, 0.1);              // 入口迎宾牌
  solid.circles.push([-31.6, -40.4, 0.6]);             // 露露精品店门口的迎宾台
  G.userData.solid = solid;

  G.userData.batched = batchStatic(G);                 // 同材质的小零件合批，省绘制调用
  scene.add(G);
  env.onChange((e) => nightFns.forEach((f) => f(e)));
  return G;
}

export { blobGeo, coniferGeo, tubeAlong, merge, T, instanced };
