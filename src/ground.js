// 地面：石板人行道、沥青大马路、环岛、斑马纹人行横道、绿地花坛
import * as THREE from 'three';
import { canvas, canvasTex, ribbon, polyFlat, polyPrism, mulberry32, resample } from './util.js';
import { ROAD, ROAD_HALF, CIRCLE, PARK, ZPD, SPUR, MEDIAN } from './layout.js';
import { normalCanvas } from './facade.js';

const nrm = (c, strength) => { const t = new THREE.CanvasTexture(normalCanvas(c, strength)); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; return t; };

function flagstoneTex() {
  const rnd = mulberry32(7);
  const S = 1024;
  const c = canvas(S, S, (g) => {
    g.fillStyle = '#b79d74'; g.fillRect(0, 0, S, S);            // 缝
    const rows = 8;
    for (let r = 0; r < rows; r++) {
      const h = S / rows;
      let x = -rnd() * 120;
      while (x < S) {
        const w = 110 + rnd() * 150;
        const t = rnd();
        const base = t < 0.06 ? [226, 178, 92] : t < 0.1 ? [222, 170, 160] : t < 0.13 ? [150, 196, 186] : [214 + rnd() * 14, 192 + rnd() * 12, 152 + rnd() * 14];
        const draw = (ox) => {
          g.fillStyle = `rgb(${base[0] | 0},${base[1] | 0},${base[2] | 0})`;
          g.beginPath(); g.roundRect(x + ox + 3, r * h + 3, w - 6, h - 6, 10); g.fill();
        };
        draw(0); if (x + w > S) draw(-S);
        x += w;
      }
    }
    // 颗粒
    const id = g.getImageData(0, 0, S, S), d = id.data;
    for (let i = 0; i < d.length; i += 4) { const n = (rnd() - 0.5) * 22; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
    g.putImageData(id, 0, 0);
  });
  return c;
}

function asphaltTex() {
  const rnd = mulberry32(11);
  const S = 512;
  return canvas(S, S, (g) => {
    g.fillStyle = '#5f5b58'; g.fillRect(0, 0, S, S);
    const id = g.getImageData(0, 0, S, S), d = id.data;
    for (let i = 0; i < d.length; i += 4) { const n = (rnd() - 0.5) * 34; d[i] += n; d[i + 1] += n * 0.95; d[i + 2] += n * 0.9; }
    g.putImageData(id, 0, 0);
    for (let i = 0; i < 900; i++) { g.fillStyle = rnd() < 0.5 ? 'rgba(150,140,128,.5)' : 'rgba(40,38,36,.5)'; g.fillRect(rnd() * S, rnd() * S, 2, 2); }
  });
}

const imgCanvas = (im, S) => canvas(S, S, (g) => g.drawImage(im, 0, 0, S, S));

function roadTex(base) {      // 横向 = 路宽，纵向 = 8 米一段
  const S = 512;
  const a = base || asphaltTex();
  return canvas(S, S, (g) => {
    g.drawImage(a, 0, 0);
    // 路缘石
    g.fillStyle = '#cbb894'; g.fillRect(0, 0, 14, S); g.fillRect(S - 14, 0, 14, S);
    // 绿色车道线
    g.fillStyle = '#2f9e63'; g.fillRect(26, 0, 14, S); g.fillRect(S - 40, 0, 14, S);
    // 双黄线
    g.fillStyle = '#e8b93a'; g.fillRect(S / 2 - 12, 0, 7, S); g.fillRect(S / 2 + 5, 0, 7, S);
  });
}

function zebraTex(seed) {     // 像真斑马皮毛一样不规则的人行横道
  const rnd = mulberry32(seed);
  return canvas(512, 256, (g) => {
    g.clearRect(0, 0, 512, 256);
    g.fillStyle = '#f2efe6';
    for (let i = 0; i < 9; i++) {
      const x = 14 + i * 55;
      g.beginPath();
      g.moveTo(x + rnd() * 8, 6);
      g.bezierCurveTo(x + 18 + rnd() * 16, 70, x - 8 + rnd() * 16, 150, x + 6 + rnd() * 10, 250);
      g.lineTo(x + 30 + rnd() * 10, 250);
      g.bezierCurveTo(x + 22 + rnd() * 18, 160, x + 44 + rnd() * 14, 80, x + 30 + rnd() * 10, 6);
      g.closePath(); g.fill();
    }
  });
}

function rockTexFallback() {
  const rnd = mulberry32(3);
  return canvas(512, 512, (g) => {
    g.fillStyle = '#d9a066'; g.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 60; i++) {
      g.fillStyle = `rgba(${150 + rnd() * 90 | 0},${90 + rnd() * 60 | 0},${40 + rnd() * 40 | 0},.25)`;
      g.fillRect(0, rnd() * 512, 512, 4 + rnd() * 26);
    }
    for (let i = 0; i < 40; i++) { g.strokeStyle = 'rgba(90,50,20,.35)'; g.lineWidth = 1 + rnd() * 2; g.beginPath(); const y = rnd() * 512; g.moveTo(0, y); g.bezierCurveTo(170, y + rnd() * 30 - 15, 340, y + rnd() * 30 - 15, 512, y); g.stroke(); }
  });
}

export function buildGround(scene, tex) {
  const G = new THREE.Group(); G.name = 'ground';

  // 1. 人行道石板（整片）
  const flagC = tex.paving ? imgCanvas(tex.paving, 1024) : flagstoneTex();          // 生成的石板纹理，缺失时用程序纹理
  const flag = canvasTex(flagC, { repeat: [1, 1] });
  const paveMat = new THREE.MeshStandardMaterial({ map: flag, normalMap: nrm(flagC, 3.2), normalScale: new THREE.Vector2(0.8, 0.8), roughness: 0.9, metalness: 0, side: THREE.DoubleSide });
  flag.wrapS = flag.wrapT = THREE.RepeatWrapping;
  // 铺地范围 = 园区可达区域的外轮廓（墙外是草地与树）
  const OUTLINE = [[-63, 12], [-63, -56.5], [-57, -57.5], [-58.5, -66], [-56, -84.5], [-36, -86], [-20, -79], [-14.4, -69.7], [-4.4, -60.2], [0.8, -63.2],
    [14, -65.5], [26.1, -61], [42.2, -61], [51, -58.3], [56.3, -52.7], [62.9, -61.8], [69.9, -65.4], [72.5, -74.3], [73.6, -90], [86, -90], [83.7, -74.6],
    [79.3, -61.8], [75.2, -53], [68.6, -44.6], [62, -33.5], [56, -27.6], [56, 12]];
  const base = new THREE.Mesh(polyFlat(OUTLINE, 0, 4.2), paveMat); base.receiveShadow = true;
  G.add(base);

  // 2. 大马路
  const asphBase = tex.asphalt ? imgCanvas(tex.asphalt, 512) : asphaltTex();
  const roadC = roadTex(asphBase);
  const road = canvasTex(roadC, { repeat: [1, 1] });
  road.wrapS = road.wrapT = THREE.RepeatWrapping;
  const roadMat = new THREE.MeshStandardMaterial({ map: road, normalMap: nrm(roadC, 2.2), normalScale: new THREE.Vector2(0.6, 0.6), roughness: 0.86 });
  const rg = ribbon(ROAD, ROAD_HALF, { y: 0.03, uvScale: 8, step: 0.8 });
  const roadMesh = new THREE.Mesh(rg, roadMat); roadMesh.receiveShadow = true; G.add(roadMesh);
  // 通往市政厅的支路，和它与环岛之间的浅色铺装分隔带
  { const sp = new THREE.Mesh(ribbon(SPUR, ROAD_HALF * 0.86, { y: 0.028, uvScale: 8, step: 0.8 }), roadMat); sp.receiveShadow = true; G.add(sp);
    const md = new THREE.Mesh(ribbon(MEDIAN, 1.5, { y: 0.07, uvScale: 4, step: 0.8 }), new THREE.MeshStandardMaterial({ map: flag, color: 0xf2dcb4, roughness: 0.9 })); md.receiveShadow = true; G.add(md); }

  // 3. 追尾环岛：沥青环 + 中心岛
  const asphC = asphBase;
  const asph = canvasTex(asphC, { repeat: [1, 1] }); asph.wrapS = asph.wrapT = THREE.RepeatWrapping;
  const asphMat = new THREE.MeshStandardMaterial({ map: asph, normalMap: nrm(asphC, 2.2), normalScale: new THREE.Vector2(0.6, 0.6), roughness: 0.86 });
  const ring = new THREE.RingGeometry(CIRCLE.rIn, CIRCLE.rOut, 64, 1); ring.rotateX(-Math.PI / 2);
  { const p = ring.attributes.position, uv = ring.attributes.uv; for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / 4, p.getZ(i) / 4); }
  const ringMesh = new THREE.Mesh(ring, asphMat); ringMesh.position.set(CIRCLE.c[0], 0.025, -CIRCLE.c[1]); ringMesh.scale.set(CIRCLE.sx || 1, 1, CIRCLE.sy || 1); ringMesh.receiveShadow = true; G.add(ringMesh);
  const mkLine = (r0, r1, color, y) => {
    const g = new THREE.RingGeometry(r0, r1, 64, 1); g.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color, roughness: 0.9 }));
    m.position.set(CIRCLE.c[0], y, -CIRCLE.c[1]); m.scale.set(CIRCLE.sx || 1, 1, CIRCLE.sy || 1); m.receiveShadow = true; G.add(m);
  };
  mkLine(CIRCLE.rOut - 0.55, CIRCLE.rOut - 0.37, 0x2f9e63, 0.034);
  mkLine(CIRCLE.rIn + 0.3, CIRCLE.rIn + 0.45, 0xe8b93a, 0.034);

  // 岩石质感（警局、花坛、围墙共用）
  const rockTex = tex.rock || canvasTex(rockTexFallback(), { repeat: [1, 1] });
  rockTex.wrapS = rockTex.wrapT = THREE.RepeatWrapping;
  const rockMat = new THREE.MeshStandardMaterial({ map: rockTex, roughness: 0.92, color: 0xffffff });
  if (rockTex.image && rockTex.image.getContext) { rockMat.normalMap = nrm(rockTex.image, 3.0); rockMat.normalScale = new THREE.Vector2(1.1, 1.1); }
  G.userData.rockMat = rockMat;

  // 环岛中心岛
  const isl = new THREE.Mesh(new THREE.CylinderGeometry(CIRCLE.rIn, CIRCLE.rIn + 0.15, 0.55, 48), rockMat);
  isl.position.set(CIRCLE.c[0], 0.275, -CIRCLE.c[1]); isl.scale.set(CIRCLE.sx || 1, 1, CIRCLE.sy || 1); isl.castShadow = isl.receiveShadow = true; G.add(isl);
  const grassMat = new THREE.MeshStandardMaterial({ color: 0x5fa043, roughness: 1, side: THREE.DoubleSide });
  const islTop = new THREE.Mesh(new THREE.CircleGeometry(CIRCLE.rIn - 0.35, 48), grassMat);
  islTop.rotation.x = -Math.PI / 2; islTop.position.set(CIRCLE.c[0], 0.56, -CIRCLE.c[1]); islTop.scale.set(CIRCLE.sx || 1, CIRCLE.sy || 1, 1); islTop.receiveShadow = true; G.add(islTop);
  G.userData.grassMat = grassMat;

  // 4. 斑马纹人行横道
  const { pts, tan } = resample(ROAD, 1);
  const cross = (i, seed, at = null) => {
    const t = canvasTex(zebraTex(seed)); const m = new THREE.MeshStandardMaterial({ map: t, transparent: true, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2 });
    const q = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_HALF * 2 - 1.3, 3.2), m);
    q.rotation.x = -Math.PI / 2; q.rotation.z = (at ? at[2] : Math.atan2(tan[i][1], tan[i][0])) + Math.PI / 2;   // 条纹垂直于行走方向
    q.position.set(at ? at[0] : pts[i][0], 0.045, -(at ? at[1] : pts[i][1])); q.receiveShadow = true; G.add(q);
  };
  // 位置取自航拍：入口内、分隔带东端、警局东南的路口，以及环岛西侧跨环道的两处
  const nearest = (x, y) => { let b = 0, bd = 1e9; pts.forEach((p, k) => { const d = (p[0] - x) ** 2 + (p[1] - y) ** 2; if (d < bd) { bd = d; b = k; } }); return b; };
  cross(nearest(-39, -68), 1); cross(nearest(-12.5, -21), 2); cross(nearest(9.5, -29), 3);
  cross(0, 4, [-32.0, -12.6, 1.08]); cross(0, 5, [-29.4, -21.6, -0.38]);
  // 环岛旁的停车位地标（白框 + 小车图样；实景里是兔子开车的图样）
  const bayT = canvasTex(canvas(256, 512, (c) => {
    c.clearRect(0, 0, 256, 512); c.strokeStyle = '#f2efe6'; c.lineWidth = 14; c.strokeRect(10, 10, 236, 492);
    c.fillStyle = '#f2efe6'; c.beginPath(); c.roundRect(70, 190, 116, 150, 30); c.fill();
    c.fillStyle = '#5f5b58'; c.beginPath(); c.roundRect(88, 215, 80, 50, 12); c.fill();
    c.fillStyle = '#f2efe6'; for (const [x, y] of [[62, 210], [182, 210], [62, 300], [182, 300]]) { c.beginPath(); c.roundRect(x, y, 14, 34, 5); c.fill(); }
  }));
  const bayM = new THREE.MeshStandardMaterial({ map: bayT, transparent: true, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2 });
  for (const [x, y, rz] of [[-7.2, -24.6, -1.76], [-3.4, -25.9, -1.9], [-33.6, -9.6, 0.6]]) {
    const q = new THREE.Mesh(new THREE.PlaneGeometry(2.9, 5.6), bayM); q.rotation.x = -Math.PI / 2; q.rotation.z = rz; q.position.set(x, 0.047, -y); q.receiveShadow = true; G.add(q);
  }
  // 路面白色导向箭头
  const arrowT = canvasTex(canvas(128, 384, (g) => {
    g.clearRect(0, 0, 128, 384); g.fillStyle = '#f2efe6';
    g.beginPath(); g.moveTo(64, 14); g.lineTo(118, 120); g.lineTo(82, 120); g.lineTo(82, 370); g.lineTo(46, 370); g.lineTo(46, 120); g.lineTo(10, 120); g.closePath(); g.fill();
  }));
  const arrowM = new THREE.MeshStandardMaterial({ map: arrowT, transparent: true, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2 });
  const arrow = (i, sideSign) => {
    const q = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 2.7), arrowM);
    const nx = -tan[i][1], ny = tan[i][0], off = sideSign * ROAD_HALF * 0.5;
    q.rotation.x = -Math.PI / 2; q.rotation.z = Math.atan2(tan[i][1], tan[i][0]) + (sideSign > 0 ? Math.PI / 2 : -Math.PI / 2);
    q.position.set(pts[i][0] + nx * off, 0.046, -(pts[i][1] + ny * off)); q.receiveShadow = true; G.add(q);
  };
  for (const i of [20, 50, 90, 122, 158]) { arrow(i, -1); arrow(i + 4, 1); }

  // 5. 警局前广场：赭色放射铺地
  const fore = new THREE.Mesh(new THREE.RingGeometry(ZPD.r + 0.2, ZPD.r + 8.5, 64, 1, Math.PI * 1.08, Math.PI * 0.84),
    new THREE.MeshStandardMaterial({ color: 0xd9a868, roughness: 0.95, map: flag }));
  fore.rotation.x = -Math.PI / 2; fore.position.set(ZPD.c[0], 0.012, -ZPD.c[1]); fore.receiveShadow = true; G.add(fore);

  // 6. 中央绿地（遮挡矿山车的种植带）：岩石路缘 + 草坡
  const curb = new THREE.Mesh(polyPrism(PARK, 0, 0.6), rockMat); curb.castShadow = curb.receiveShadow = true; G.add(curb);
  const lawn = new THREE.Mesh(polyFlat(PARK, 0.61, 3), grassMat); lawn.receiveShadow = true; G.add(lawn);

  // 7. 园区外围草地（南侧、东侧），让视线越过围墙时不穿帮
  const outer = new THREE.Mesh(new THREE.PlaneGeometry(700, 700), new THREE.MeshStandardMaterial({ color: 0x6f9a52, roughness: 1 }));
  outer.rotation.x = -Math.PI / 2; outer.position.y = -0.05; outer.receiveShadow = true; G.add(outer);

  scene.add(G);
  return G;
}
