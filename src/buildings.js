// 建筑：街区体量 + 生成立面块 + 动物城之窗塔 + 警局巨石 + 天际线 + 招牌霓虹
import * as THREE from 'three';
import { FacadeSheet, placeAB, bendAround, normalCanvas, closeFacadeWorkers, sideTextures } from './facade.js';
import { canvas, canvasTex, polyPrism, polyFlat, shoelace, mulberry32, batchStatic } from './util.js';
import { FACADES, BLOCKS, BLOCK_H, ZOOTRON, ZPD, WALLS } from './layout.js';
import { blobGeo, coniferGeo, merge, T, instanced, signTex, PROP_MATS, tubeAlong } from './props.js';
import * as S from './signs.js';
import { loadArt, drawArt, cutTex, captionBand } from './art.js';
import { conifer, shrub, cutMat } from './flora.js';

const FONT_ZH = '"Microsoft YaHei","PingFang SC","Noto Sans SC",sans-serif';

function insetPoly(poly, d) {
  const ccw = shoelace(poly) > 0, n = poly.length, out = [];
  for (let i = 0; i < n; i++) {
    const p0 = poly[(i + n - 1) % n], p1 = poly[i], p2 = poly[(i + 1) % n];
    const e1 = [p1[0] - p0[0], p1[1] - p0[1]], e2 = [p2[0] - p1[0], p2[1] - p1[1]];
    const l1 = Math.hypot(...e1) || 1, l2 = Math.hypot(...e2) || 1;
    // 内法线（CCW 多边形的左侧）
    const n1 = ccw ? [-e1[1] / l1, e1[0] / l1] : [e1[1] / l1, -e1[0] / l1];
    const n2 = ccw ? [-e2[1] / l2, e2[0] / l2] : [e2[1] / l2, -e2[0] / l2];
    let bx = n1[0] + n2[0], by = n1[1] + n2[1];
    const bl = Math.hypot(bx, by) || 1; bx /= bl; by /= bl;
    const cos = Math.max(0.35, bx * n1[0] + by * n1[1]);
    out.push([p1[0] + (bx * d) / cos, p1[1] + (by * d) / cos]);
  }
  return out;
}

function stuccoTex(base, seed = 1) {
  const rnd = mulberry32(seed);
  return canvasTex(canvas(256, 256, (g) => {
    g.fillStyle = base; g.fillRect(0, 0, 256, 256);
    const id = g.getImageData(0, 0, 256, 256), d = id.data;
    for (let i = 0; i < d.length; i += 4) { const n = (rnd() - 0.5) * 20; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
    g.putImageData(id, 0, 0);
  }), { repeat: [1, 1] });
}

function brickTex() {
  const rnd = mulberry32(5);
  const t = canvasTex(canvas(512, 512, (g) => {
    g.fillStyle = '#6d4a3c'; g.fillRect(0, 0, 512, 512);
    for (let r = 0; r < 16; r++) for (let c = -1; c < 8; c++) {
      const x = c * 64 + (r % 2 ? 32 : 0), y = r * 32;
      const k = 0.8 + rnd() * 0.35;
      g.fillStyle = `rgb(${150 * k | 0},${72 * k | 0},${52 * k | 0})`;
      g.beginPath(); g.roundRect(x + 2, y + 2, 60, 28, 3); g.fill();
    }
  }));
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// 文字招牌（透明底），可自发光
function label(text, { w = 4, h = 0.8, color = '#fff', glow = null, font = `bold 150px ${FONT_ZH}`, px = [1024, 220], stroke = null, sub = null, subColor = null } = {}) {
  const t = canvasTex(canvas(px[0], px[1], (g) => {
    g.clearRect(0, 0, px[0], px[1]);
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = font;
    const y = sub ? px[1] * 0.4 : px[1] / 2;
    if (glow) { g.shadowColor = glow; g.shadowBlur = 26; }
    if (stroke) { g.strokeStyle = stroke; g.lineWidth = 12; g.lineJoin = 'round'; g.strokeText(text, px[0] / 2, y, px[0] - 30); }
    g.fillStyle = color; g.fillText(text, px[0] / 2, y, px[0] - 30);
    if (glow) g.fillText(text, px[0] / 2, y, px[0] - 30);
    if (sub) { g.font = `bold ${Math.round(px[1] * 0.2)}px Arial, ${FONT_ZH}`; g.fillStyle = subColor || color; g.fillText(sub, px[0] / 2, px[1] * 0.82, px[0] - 30); }
  }));
  const mat = new THREE.MeshStandardMaterial({ map: t, transparent: true, alphaTest: 0.08, roughness: 0.5, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0, side: THREE.DoubleSide, depthWrite: false });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  m.renderOrder = 3;
  return m;
}

function adTex(draw, w = 512, h = 512) { return canvasTex(canvas(w, h, draw)); }
const zh = (g, t, x, y, size, color, align = 'center') => { g.font = `bold ${size}px ${FONT_ZH}`; g.fillStyle = color; g.textAlign = align; g.textBaseline = 'middle'; g.fillText(t, x, y); };

// 仿园区的戏仿广告牌（纯文字 + 抽象图形，不含角色形象）
// 戏仿广告牌：画面取自生成的插画（art.js），文字由程序叠加；缺插画时退回纯色底 + 文字
const zs = (g, t, x, y, size, color, stroke = 'rgba(0,0,0,.7)') => { g.font = `bold ${size}px ${FONT_ZH}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round'; g.strokeStyle = stroke; g.lineWidth = size * 0.16; g.strokeText(t, x, y); g.fillStyle = color; g.fillText(t, x, y); };
let ADS = {};
function makeAds() {
  const ad = (key, bg, texts, { w = 512, h = 512, band = 0.5, focus = 0.3 } = {}) => adTex((g) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    if (drawArt(g, key, 0, 0, w, h, focus) && texts.length) captionBand(g, w, h, band);
    for (const [t, fy, size, color] of texts) zs(g, t, w / 2, h * fy, size, color || '#fff');
  }, w, h);
  return {
    coffee: ad('koala', '#1e5fb0', [['不眠考拉', 0.74, 84], ['COFFEE CO.', 0.9, 48, '#cfe6ff']]),
    wash: adTex((g) => { g.fillStyle = '#22b6c9'; g.fillRect(0, 0, 768, 344); drawArt(g, 'cheetah', 0, 0, 344, 344, 0.3); zs(g, '快速祛斑', 556, 120, 92, '#fff'); zs(g, '洗衣液', 556, 236, 100, '#ffe35c'); }, 768, 344),
    sahara: ad('sahara', '#231a52', [['快来', 0.72, 70, '#fff'], ['撒哈拉广场', 0.88, 70, '#ffe9a8']], { w: 384, h: 512, focus: 0.5 }),
    hero: ad('hero', '#1b2440', [['迁徙侠', 0.76, 100, '#ffd23a'], ['MIGRATORS', 0.92, 56, '#fff']]),
    llama: ad('llama', '#f28ab8', []),
    car: ad('car', '#f5c518', [['全新电动蹦蹦车', 0.14, 54, '#fff'], ['全家都装得下', 0.9, 50, '#fff']], { w: 640, h: 470, focus: 0.5, band: 0.7 }),
    trio: ad('lemmings', '#f4f1ea', []),
    pig: adTex((g) => {
      g.fillStyle = '#c5202e'; g.fillRect(0, 0, 768, 384);
      if (!drawArt(g, 'pig', 0, 0, 384, 384, 0.4)) { g.fillStyle = '#fff'; g.beginPath(); g.ellipse(170, 200, 110, 130, 0, 0, 7); g.fill(); }
      zh(g, 'PIG', 570, 100, 120, '#fff'); zh(g, 'HERO', 570, 205, 100, '#fff'); zh(g, '6', 570, 310, 110, '#fff');
    }, 768, 384),
  };
}

export async function buildBuildings(scene, env, tex, onProgress = () => {}) {
  const G = new THREE.Group(); G.name = 'buildings';
  const nightFns = [];
  const rockMat = tex.rockMat;

  await loadArt(tex.manifest, tex.dir);
  ADS = makeAds();
  tex.mark?.('art');

  // ---------------- 1. 加载立面图
  const names = [...new Set(FACADES.map((f) => f.sheet)), 'skylineA', 'skylineB', 'market', 'zpd', 'taxi', 'castle'];
  const sheets = {};
  let done = 0;
  await Promise.all(names.map(async (n) => {
    const fDay = tex.file(n), fNight = tex.file(n + '_n'), fDepth = tex.file(n + '_d');
    if (fDay) {
      try {
        sheets[n] = await FacadeSheet.load(n, tex.dir + fDay, fNight ? tex.dir + fNight : null,
          { depthUrl: fDepth ? tex.dir + fDepth : null, maxW: tex.maxSheet || 0 });
      }
      catch (e) { console.warn('立面加载失败', n, e); }
    }
    onProgress(++done / names.length);
  }));
  nightFns.push((e) => Object.values(sheets).forEach((s) => s.setNight(e)));
  closeFacadeWorkers();
  tex.mark?.('sheets');

  // ---------------- 2. 街区体量
  const brick = brickTex();
  const bodyMats = {
    west: new THREE.MeshStandardMaterial({ color: 0xe9c9b8, roughness: 0.9, map: stuccoTex('#f1d6c8', 1) }),
    central: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, map: stuccoTex('#b9a3d6', 2) }),   // 雨林区洗手间的淡紫粗灰泥
    east: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, map: brick }),
    ride: rockMat,
  };
  // 灰泥墙面加一层抹灰起伏的法线，斜光下不再是一块平板
  for (const k of ['west', 'central']) { bodyMats[k].normalMap = sideTextures().plaster.normalMap; bodyMats[k].normalScale = new THREE.Vector2(0.8, 0.8); }
  const roofTile = (img, tint) => {
    if (!img) return new THREE.MeshStandardMaterial({ color: tint, roughness: 0.85 });
    const c = canvas(1024, 1024, (g) => g.drawImage(img, 0, 0, 1024, 1024));
    const map = new THREE.CanvasTexture(c); map.colorSpace = THREE.SRGBColorSpace; map.wrapS = map.wrapT = THREE.RepeatWrapping; map.repeat.set(0.2, 0.2); map.anisotropy = 8;
    const nm = new THREE.CanvasTexture(normalCanvas(c, 2.4)); nm.wrapS = nm.wrapT = THREE.RepeatWrapping; nm.repeat.set(0.2, 0.2);
    return new THREE.MeshStandardMaterial({ map, normalMap: nm, color: tint, roughness: 0.8 });
  };
  const roofMats = { west: roofTile(tex.terracotta, 0xf2d8cc), central: roofTile(tex.bluetile, 0xc9c2e6), east: roofTile(tex.terracotta, 0xd9b8a6) };
  for (const [k, poly] of Object.entries(BLOCKS)) {
    const g = polyPrism(insetPoly(poly, 0.4), 0, BLOCK_H[k]);
    // 侧墙按世界坐标平铺贴图
    const pos = g.attributes.position, nor = g.attributes.normal, uv = g.attributes.uv;
    for (let i = 0; i < pos.count; i++) {
      if (Math.abs(nor.getY(i)) > 0.5) uv.setXY(i, pos.getX(i) / 5, pos.getZ(i) / 5);
      else uv.setXY(i, (pos.getX(i) * Math.abs(nor.getZ(i)) + pos.getZ(i) * Math.abs(nor.getX(i))) / 5, pos.getY(i) / 5);
    }
    const m = new THREE.Mesh(g, bodyMats[k]); m.castShadow = m.receiveShadow = true; G.add(m);
    // 屋顶：街区体量的顶面原来和侧墙同一种纯色灰泥，从高处看是一块平板。铺上瓦面，再沿边加一圈女儿墙
    if (k !== 'ride' && roofMats[k]) {
      const inner = insetPoly(poly, 0.75);
      const top = new THREE.Mesh(polyFlat(inner, BLOCK_H[k] + 0.03, 1), roofMats[k]); top.receiveShadow = true; G.add(top);
      const rim = new THREE.Mesh(polyPrism(insetPoly(poly, 0.4), BLOCK_H[k], BLOCK_H[k] + 0.42), bodyMats[k]); rim.castShadow = true; G.add(rim);    }
  }

  // ---------------- 3. 立面块
  const facInfo = {};
  for (const f of FACADES) {
    const s = sheets[f.sheet];
    const width = Math.hypot(f.b[0] - f.a[0], f.b[1] - f.a[1]);
    if (!s) {       // 贴图缺失时的占位体块
      const ph = new THREE.Mesh(new THREE.BoxGeometry(width, 11, f.depth), new THREE.MeshStandardMaterial({ color: 0xd8c0a0, roughness: 0.9 }));
      ph.geometry.translate(width / 2, 5.5, -f.depth / 2); placeAB(ph, f.a, f.b); ph.castShadow = ph.receiveShadow = true; G.add(ph);
      facInfo[f.id] = { ...f, width, H: 11, height: 11, obj: ph };
      continue;
    }
    const p = s.piece({ u0: f.u[0], u1: f.u[1], width, depth: f.depth, hScale: f.hScale || 1, cap: f.cap ?? null, auto: f.auto !== false, noCard: !!f.noCard, cell: tex.cell || 0.12, skin: 'house' });
    placeAB(p, f.a, f.b); G.add(p);
    facInfo[f.id] = { ...f, width, H: p.userData.H, height: p.userData.height, obj: p, sheetObj: s, u0: p.userData.u0, u1: p.userData.u1 };
  }
  // 在某个立面上挂东西：s = 沿立面 0..1，h = 高度，out = 离墙距离
  const onFacade = (id, obj, s, h, out = 0.12) => {
    const f = facInfo[id]; if (!f) return;
    obj.position.set(f.width * s, h, out); f.obj.add(obj); return obj;
  };
  const lit = [];      // 夜间自发光的招牌
  const addLabel = (id, text, s, h, opts = {}) => {
    const l = label(text, opts), f = facInfo[id];
    let out = opts.out ?? 0.18;
    if (f && f.sheetObj) {          // 有浮雕时，招牌贴在该处浮雕最凸的面之外
      const du = ((opts.w || 4) / 2 / f.width) * (f.u1 - f.u0), uc = f.u0 + s * (f.u1 - f.u0), hv = (opts.h || 0.8) / 2 / f.H;
      out = Math.max(out, f.sheetObj.reliefMaxZ(uc - du, uc + du, h / f.H - hv, h / f.H + hv) + 0.07);
    }
    if (onFacade(id, l, s, h, out)) lit.push([l, opts.day ?? 0.0, opts.night ?? 1.2]);
    return l;
  };

  // ---- 招牌：位置取自各张立面图上预留的牌位（s = 沿立面 0..1，v = 占图高的比例）
  const hang = (id, sign, s, v, o = {}) => {
    const f = facInfo[id]; if (!f || !sign) return;
    const [w, h] = sign.userData.size;
    let out = o.out ?? 0.1;
    if (!o.flat && f.sheetObj) {          // 贴在该处浮雕最凸的面之外
      const du = (w / 2 / f.width) * (f.u1 - f.u0), uc = f.u0 + s * (f.u1 - f.u0), hv = h / 2 / f.H;
      out = Math.max(out, f.sheetObj.reliefMaxZ(uc - du, uc + du, v - hv, v + hv) + (sign.userData.thick || 0.07) / 2 + 0.04);
    }
    sign.position.set(f.width * s, v * f.H, out); f.obj.add(sign);
    for (const m of sign.userData.lit || []) lit.push([{ material: m }, m.userData.lit[0], m.userData.lit[1]]);
  };
  const BRASS = { bg: "#c79a3a", bg2: "#8a6420", fg: "#2a1c08", border: "#5a3a0a", frame: 0x3c2d12 };

  // 露露精品店（806 号）
  hang("frufru", S.letters("露露精品店", "FASHIONS BY FRU FRU", { w: 3.0, style: "gold", enRatio: 0.24 }), 0.5, 0.268);
  hang("frufru", S.numberPlate(806), 0.87, 0.2);
  // 花店 / 牦牛哥舶来集市（912 号）/ 爪印艺术商店
  hang("frurow", S.letters("OTTERTON'S", "FLOWER SHOP", { w: 1.1, style: "dark", zhFont: "Georgia, serif", enRatio: 0.36, night: 0.2 }), 0.19, 0.27);
  hang("frurow", S.plaque([{ t: "牦牛哥舶来集市" }], { w: 2.3, h: 0.42, bg: "#1d7a78", bg2: "#125a5c", fg: "#ffe9a8", border: "#e7c35a" }), 0.505, 0.455);
  hang("frurow", S.numberPlate(912), 0.385, 0.2);
  hang("frurow", S.letters("爪印艺术商店", "PAW PRINT ART STORE", { w: 2.8, style: "dark", enRatio: 0.28, night: 0.2 }), 0.83, 0.63);
  // 大象甜品店：金色花体英文招牌 + 橱窗上的中文店名
  hang("cafe", S.letters(null, "Jumbeaux's Café", { w: 4.6, style: "gold", script: true }), 0.5, 0.735);
  hang("cafe", S.letters("大象甜品店", null, { w: 1.5, style: "cream", night: 0.5 }), 0.165, 0.43);
  hang("cafe", S.letters("大象甜品店", null, { w: 1.5, style: "cream", night: 0.5 }), 0.835, 0.43);
  // 美洲豹喜剧俱乐部（灯泡跑马灯牌）+ 旅鼠兄弟银行（916 号）
  hang("bankL", S.letters("TONIGHT ONLY", "POLLY O'PAWSUM", { w: 2.5, style: "dark", zhFont: "Arial, sans-serif", enRatio: 0.5, night: 0.9 }), 0.53, 0.415);
  hang("bankL", S.neon("JAGUAR COMEDY CLUB", { w: 3.3, color: "#ffd27a", glow: "#ff8a1a", font: "Arial, sans-serif" }), 0.5, 0.66);
  hang("bankR", S.letters("旅鼠兄弟银行", null, { w: 3.4, style: "brass" }), 0.48, 0.775);
  hang("bankR", S.plaque([{ t: "LEMMING BROTHERS BANK" }], { w: 1.7, h: 0.26, ...BRASS, thick: 0.04, night: 0.3 }), 0.48, 0.565);
  hang("bankR", S.plaque([{ t: "ATM" }], { w: 0.6, h: 0.3, ...BRASS, thick: 0.04, night: 0.3 }), 0.345, 0.3);
  hang("bankR", S.numberPlate(916), 0.86, 0.15);
  // 动物城站
  hang("station", S.letters("动物城站 · ZOOTOPIA CENTRAL STATION", null, { w: 9.0, style: "dark", night: 0.25 }), 0.5, 0.425);
  // 市政厅
  hang("cityhall", S.letters(null, "CITY HALL", { w: 4.4, style: "white", night: 1.6 }), 0.5, 0.215);
  // 公园公寓群（1023 号）、胶囊酒店、冰窖桑拿
  hang("parkR", S.numberPlate(1023), 0.18, 0.3);
  hang("parkR", S.plaque([{ t: "动物城公园公寓" }, { t: "ZOOTOPIA PARK APARTMENTS", size: 0.6 }], { w: 1.5, h: 0.5, ...BRASS, thick: 0.04, night: 0.3 }), 0.42, 0.12);
  hang("aptsN", S.plaque([{ t: "胶囊酒店" }, { t: "HIBERNATION HOTEL", size: 0.6 }], { w: 1.7, h: 0.55, bg: "#5a3fa0", bg2: "#3a2478", fg: "#fff", border: "#e7c35a" }), 0.66, 0.335);
  hang("tundra", S.blade([{ t: "冰窖桑拿" }, { t: "ARCTIC SPA", size: 0.6 }], { w: 1.1, h: 0.62, bg: "#d6f0f6", bg2: "#8fc4e0", fg: "#17456a", border: "#ffffff", iron: 0x8fb8c8 }), 0.07, 0.32);
  // 雨林区洗手间：两块木牌
  hang("rest", S.letters("洗手间", "TOILETS", { w: 1.1, style: "dark", enRatio: 0.34, night: 0.2 }), 0.27, 0.47);
  hang("rest", S.letters("洗手间", "TOILETS", { w: 1.1, style: "dark", enRatio: 0.34, night: 0.2 }), 0.73, 0.47);
  // 长颈鹿公寓（102 号）及屋顶广告牌
  hang("giraffe", S.numberPlate(102), 0.445, 0.3);
  hang("giraffe", S.plaque([{ t: "冰川镇 TUNDRATOWN", color: "#17456a" }, { t: "时尚奥莱 FASHION OUTLET", color: "#17456a" }, { t: "cool brands, cheap prices", color: "#2a6a90", size: 0.6 }], { w: 3.3, h: 1.15, bg: "#e6f6fb", bg2: "#a8d6ea", border: null, frame: 0xc9a23a, thick: 0.05, night: 0.8, textX: [0.36, 1], draw: (g, W, H) => { drawArt(g, "polar", 0, 0, W * 0.38, H, 0.25); } }), 0.775, 0.795, { flat: true, out: -0.72 });
  // 疯狂健身房（809 号）
  hang("antler", S.blade([{ t: "疯狂健身房" }, { t: "ZOOTOPIA FITNESS", size: 0.55 }], { w: 1.3, h: 0.62, bg: "#f7f5ee", bg2: "#e4efd8", fg: "#3f8f4a", border: "#6bb04a" }), 0.288, 0.47);
  hang("antler", S.numberPlate(809), 0.238, 0.13);
  hang("antler", S.plaque([{ t: "疯狂" }, { t: "健身房" }, { t: "FITNESS", size: 0.6 }], { w: 0.92, h: 2.2, bg: "#f2c94a", bg2: "#e0a52a", fg: "#fff", textStroke: "rgba(0,0,0,.7)", border: null, frame: 0x9a7a2a, thick: 0.03, night: 0.5, textY: [0.6, 1], draw: (g, W, H) => { if (drawArt(g, "hamsters", 0, 0, W, H, 0.3)) captionBand(g, W, H, 0.5); } }), 0.052, 0.5);
  hang("antler", S.plaque([{ t: "GAZELLE" }, { t: "全城疯唱" }, { t: "派对", size: 0.9 }], { w: 0.92, h: 2.2, bg: "#7a3fc0", bg2: "#c8339a", fg: "#fff", textStroke: "rgba(0,0,0,.7)", border: null, frame: 0x9a7a2a, thick: 0.03, night: 0.7, textY: [0.6, 1], draw: (g, W, H) => { if (drawArt(g, "concert", 0, 0, W, H, 0.3)) captionBand(g, W, H, 0.5); } }), 0.052, 0.272);
  // 自然历史博物馆：檐下刻字 + 瓶形海报框下的片名牌
  hang("museum", S.letters("自然历史博物馆", null, { w: 4.2, style: "cream", night: 0.5 }), 0.16, 0.625);
  hang("museum", S.letters(null, "NATURAL HISTORY MUSEUM", { w: 4.4, style: "cream", night: 0.5 }), 0.84, 0.625);
  [["探秘微观世界 3D", 0.07], ["幼崽当家 KIDS RULE", 0.17], ["Living with the Land 3D版", 0.265], ["探秘微观世界 3D", 0.75], ["幼崽当家 KIDS RULE", 0.845], ["Living with the Land 3D版", 0.94]].forEach(([t, s]) =>
    hang("museum", S.plaque([{ t }], { w: 1.5, h: 0.24, bg: "#f3ead2", bg2: "#e2d4b0", fg: "#3a2a1c", border: "#1f7a6e", frame: 0x1f7a6e, thick: 0.03, night: 0.3 }), s, 0.085));
  // 纹身店（1015 号）、卷卷形象设计、丽爪店
  hang("iglooL", S.plaque([{ t: "造型" }, { t: "BAAAD to the BONE", size: 0.6 }], { w: 1.6, h: 0.55, bg: "#1a1a1a", bg2: "#000", fg: "#f2efe6", border: "#c9a23a" }), 0.25, 0.555);
  hang("iglooL", S.numberPlate(1015, "dark"), 0.07, 0.26);
  hang("iglooL", S.plaque([{ t: "卷卷形象设计" }], { w: 1.5, h: 0.32, bg: "#ffffff", bg2: "#ece6ff", fg: "#7a52c0", border: "#7a52c0", frame: 0x7a52c0 }), 0.67, 0.415);
  hang("iglooR", S.plaque([{ t: "丽爪店" }], { shape: "round", w: 1.45, h: 1.45, bg: "#ff9ac0", bg2: "#f06a9a", fg: "#fff", border: "#ffffff", frame: 0xd0508a, night: 1.0 }), 0.77, 0.44);
  // 嚎叫 KTV、邦戈乐器行、舞虎俱乐部、竹屋
  hang("ktv", S.neon("嚎叫", { w: 1.7, color: "#ffb6f4", glow: "#ff3bd0", sub: "HOWL KTV" }), 0.16, 0.72);
  hang("ktv", S.blade([{ t: "BONGO'S" }, { t: "MUSIC SHOP", size: 0.7 }], { w: 1.2, h: 0.6, bg: "#b85a1c", bg2: "#7a3410", fg: "#f6e6c8", border: "#f6e6c8", iron: 0x3a2a20 }), 0.37, 0.47);
  hang("ktv", S.neon("BAMBOO ROOM", { w: 3.2, color: "#a8ffc8", glow: "#18e06a", font: "Arial, sans-serif" }), 0.83, 0.43);
  hang("ktv", S.blade([{ t: "舞虎" }, { t: "TIGER DANCING CLUB", size: 0.5 }], { w: 1.2, h: 0.7, bg: "#e0621a", bg2: "#8a2a0a", fg: "#fff", border: "#1a1a1a", iron: 0x3a2a20 }), 0.668, 0.64);

  // ---- 徽记：金色圆牌、象头饰件、长颈鹿挂牌、水獭茶杯木牌（原创图样，位置照实景）
  hang("frufru", S.emblem("shrew", 0.95, { metal: 0.75, rough: 0.3 }), 0.13, 0.19);
  hang("cafe", S.emblem("elephant", 1.0, { metal: 0.7, rough: 0.3 }), 0.245, 0.735);
  hang("giraffe", S.emblem("giraffeSign", 0.85), 0.485, 0.735);
  hang("giraffe", S.emblem("otter", 1.05, { metal: 0.1, rough: 0.7 }), 0.762, 0.24);

  // ---- 窗口居民（对应实景的「疯狂动物城生活秀」：木偶式的形象在公寓窗口随机探头）。用的是原创的普通动物
  const tickers = [];
  const residents = [];
  const resident = (id, key, s, v, hM, o = {}) => {
    const f = facInfo[id], c = cutTex(key); if (!f || !c) return;
    const w = hM * c.aspect;
    const g = new THREE.PlaneGeometry(w, hM); g.translate(0, hM / 2, 0);            // 以底边为原点，方便从窗台后「升起」
    const m = new THREE.MeshStandardMaterial({ map: c.tex, alphaTest: 0.5, roughness: 0.8, side: THREE.DoubleSide, emissive: 0xffffff, emissiveMap: c.tex, emissiveIntensity: 0 });
    const mesh = new THREE.Mesh(g, m);
    let z = o.z ?? 0.12;
    if (o.z == null && f.sheetObj) { const uc = f.u0 + s * (f.u1 - f.u0); z = f.sheetObj.reliefMaxZ(uc - 0.004, uc + 0.004, v + 0.01, v + 0.03) + 0.06; }
    mesh.position.set(f.width * s, v * f.H, z); mesh.scale.y = 0.001; mesh.visible = false; f.obj.add(mesh);
    lit.push([{ material: m }, 0, 0.55]);
    residents.push({ mesh, a: 0, on: false, next: 2 + residents.length * 3.1 + (o.delay || 0) });
  };
  resident("parkL", "trunk", 0.64, 0.635, 1.5);
  resident("parkL", "wolves", 0.26, 0.405, 1.45, { delay: 9 });
  resident("parkR", "rabbits", 0.21, 0.475, 1.6);
  resident("parkR", "sloth", 0.53, 0.615, 1.55, { delay: 4 });
  resident("parkR", "bear", 0.83, 0.555, 2.0, { z: 0.42 });
  resident("parkR", "yak", 0.83, 0.745, 1.6, { z: 0.42, delay: 6 });
  tickers.push((time, dt) => {
    for (const r of residents) {
      if (time > r.next) { r.on = !r.on; r.next = time + (r.on ? 7 + ((r.next * 7.3) % 6) : 9 + ((r.next * 3.7) % 14)); }
      const target = r.on ? 1 : 0;
      if (r.a !== target) { r.a = Math.max(0, Math.min(1, r.a + (r.on ? 1 : -1) * dt * 1.6)); const e = r.a * r.a * (3 - 2 * r.a); r.mesh.scale.y = Math.max(0.001, e); r.mesh.visible = r.a > 0.01; }
    }
  });

  // ---- 露露精品店门口迎宾台后的门童（原创的北极熊门童，始终大致面向游客）
  {
    const c = cutTex("doorman");
    if (c) {
      const hM = 2.75, g = new THREE.PlaneGeometry(hM * c.aspect, hM); g.translate(0, hM / 2, 0);
      const m = new THREE.MeshStandardMaterial({ map: c.tex, alphaTest: 0.5, roughness: 0.8, side: THREE.DoubleSide, emissive: 0xffffff, emissiveMap: c.tex, emissiveIntensity: 0 });
      const bear = new THREE.Mesh(g, m); bear.position.set(-32.25, 0, 40.4); bear.rotation.y = Math.PI / 2; bear.castShadow = true; bear.userData.dyn = true; G.add(bear);
      lit.push([{ material: m }, 0, 0.35]);
      tickers.push((time, dt, cam) => {
        if (!cam) return;
        let a = Math.atan2(cam.position.x - bear.position.x, cam.position.z - bear.position.z), d = a - Math.PI / 2;
        d = Math.atan2(Math.sin(d), Math.cos(d)); d = Math.max(-1.0, Math.min(1.0, d));
        bear.rotation.y += (Math.PI / 2 + d - bear.rotation.y) * Math.min(1, dt * 3);
      });
    }
  }

  // ---- 动物城站：每隔一阵有列车从彩窗后驶过
  if (sheets.station) {
    const tr = sheets.station.mat.userData.train.value;
    tickers.push((time) => {
      const p = (time % 48) / 9;                       // 每 48 秒一趟，驶过约 9 秒
      if (p <= 1) tr.set(-0.1 + p * 2.0, 0.9 + env.night * 1.4, 0.55, 0.83); else tr.set(-9, 0, 0, 1);
    });
  }

  // 大象甜品店屋顶的红色广告牌
  if (facInfo.cafe) {
    const bb = new THREE.Mesh(new THREE.BoxGeometry(5.2, 2.6, 0.2), [PROP_MATS.dark, PROP_MATS.dark, PROP_MATS.dark, PROP_MATS.dark, new THREE.MeshStandardMaterial({ map: ADS.pig, roughness: 0.5, emissive: 0xffffff, emissiveMap: ADS.pig, emissiveIntensity: 0 }), PROP_MATS.dark]);
    onFacade('cafe', bb, 0.5, facInfo.cafe.H * 0.78 + 2.2, -1.2); bb.castShadow = true;
    lit.push([{ material: bb.material[4] }, 0, 0.9]);
    for (const x of [-2, 2]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.6, 6), PROP_MATS.dark); p.position.set(x, -1.9, 0); bb.add(p); }
  }
  // ---------------- 4. 动物城之窗（Zootopitron）+ 招募中心圆厅
  {
    const Z = new THREE.Group(); Z.position.set(ZOOTRON.c[0], 0, -ZOOTRON.c[1]);
    const r = ZOOTRON.r;
    const band = canvasTex(canvas(512, 256, (g) => {
      g.fillStyle = '#f3ead2'; g.fillRect(0, 0, 512, 256);
      g.strokeStyle = '#2f73c4'; g.lineWidth = 16;
      for (let k = 0; k < 4; k++) { g.beginPath(); for (let x = 0; x <= 512; x += 8) { const y = 46 + k * 52 + Math.sin((x / 512) * Math.PI * 4 + k) * 11; x ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke(); }
    }), { repeat: [6, 1] });
    band.wrapS = THREE.RepeatWrapping;
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 4.6, 48), new THREE.MeshStandardMaterial({ map: band, roughness: 0.8 })); drum.position.y = 2.3; Z.add(drum);
    // 圆木盘 + 金色警徽（简化为金色圆盾）
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.25, 0.18, 32), PROP_MATS.wood); disc.rotation.x = Math.PI / 2; disc.position.set(0, 2.5, r + 0.05); Z.add(disc);
    const badge = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.85, 0.1, 6), PROP_MATS.gold); badge.rotation.x = Math.PI / 2; badge.position.set(0, 2.5, r + 0.2); Z.add(badge);
    const rc = label('警局招募中心', { w: 3.6, h: 0.5, color: '#1d3f7a', sub: 'ZPD RECRUITMENT CENTER', px: [1024, 240] }); rc.position.set(0, 0.95, r + 0.12); Z.add(rc); lit.push([rc, 0, 0.3]);
    // 蓝色屋面
    const roof = new THREE.Mesh(new THREE.LatheGeometry([[r + 0.7, 0], [r + 0.55, 0.25], [r - 0.6, 0.9], [4.2, 1.5], [3.9, 1.9]].map((p) => new THREE.Vector2(p[0], p[1])), 48), new THREE.MeshStandardMaterial({ color: 0x2c6cb8, roughness: 0.35, metalness: 0.2 }));
    roof.position.y = 5.5; Z.add(roof);
    // 环形 LED 跑马屏
    const ribC = canvas(2048, 128);
    const ribT = canvasTex(ribC, { repeat: [1, 1] }); ribT.wrapS = THREE.RepeatWrapping;
    const drawRib = () => {
      const g = ribC.getContext('2d');
      const gr = g.createLinearGradient(0, 0, 2048, 0); gr.addColorStop(0, '#7a1fb8'); gr.addColorStop(0.5, '#d0339a'); gr.addColorStop(1, '#7a1fb8');
      g.fillStyle = gr; g.fillRect(0, 0, 2048, 128);
      g.font = `bold 78px ${FONT_ZH}`; g.textBaseline = 'middle'; g.fillStyle = '#fff';
      const s = '疯狂动物城 ZOOTOPIA CONCERT   ★   GAZELLE 全城疯唱派对!   ★   ';
      g.fillText(s + s, 20, 66);
    };
    drawRib();
    const ribMat = new THREE.MeshStandardMaterial({ map: ribT, emissive: 0xffffff, emissiveMap: ribT, emissiveIntensity: 0.55, roughness: 0.4 });
    const rib = new THREE.Mesh(new THREE.CylinderGeometry(r + 0.12, r + 0.12, 0.95, 64, 1, true), ribMat); rib.position.y = 5.05; Z.add(rib);
    // 叠盘塔身
    const tile = (img, ru, rv) => {
      const c = canvas(1024, 1024, (g) => g.drawImage(img, 0, 0, 1024, 1024));
      const map = new THREE.CanvasTexture(c); map.colorSpace = THREE.SRGBColorSpace; map.wrapS = map.wrapT = THREE.RepeatWrapping; map.repeat.set(ru, rv); map.anisotropy = 8;
      const nm = new THREE.CanvasTexture(normalCanvas(c, 2.4)); nm.wrapS = nm.wrapT = THREE.RepeatWrapping; nm.repeat.set(ru, rv);
      return { map, normalMap: nm };
    };
    const terr = new THREE.MeshStandardMaterial({ color: tex.terracotta ? 0xffffff : 0xc9743f, roughness: 0.78, ...(tex.terracotta ? tile(tex.terracotta, 7, 1) : {}) });
    if (tex.bluetile) { const bt = tile(tex.bluetile, 16, 2); roof.material.map = bt.map; roof.material.normalMap = bt.normalMap; roof.material.color.set(0xffffff); roof.material.needsUpdate = true; }
    const discGeo = (R, h) => new THREE.LatheGeometry([[0, 0], [R - 0.35, 0], [R, h * 0.3], [R, h * 0.7], [R - 0.35, h], [0, h]].map((p) => new THREE.Vector2(p[0], p[1])), 40);
    const glowMat = new THREE.MeshStandardMaterial({ color: 0x40202c, emissive: 0xff3ba8, emissiveIntensity: 0, roughness: 0.5 });
    let y = 7.3;
    for (let i = 0; i < 9; i++) {
      const R = 3.9 - i * 0.07 - (i % 2) * 0.35, h = 1.75;
      const d = new THREE.Mesh(discGeo(R, h), terr); d.position.y = y; Z.add(d);
      const gl = new THREE.Mesh(new THREE.CylinderGeometry(R - 0.5, R - 0.5, 0.26, 40, 1, true), glowMat); gl.position.y = y + h + 0.1; Z.add(gl);
      y += h + 0.22;
    }
    const topY = y;
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.12, 5, 8), PROP_MATS.dark); mast.position.y = topY + 2.5; Z.add(mast);
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), new THREE.MeshStandardMaterial({ color: 0xff3030, emissive: 0xff2020, emissiveIntensity: 1 })); beacon.position.y = topY + 5; Z.add(beacon);
    // 圆厅外圈的蓝色立柱
    const colMat = new THREE.MeshStandardMaterial({ color: 0x2f73c4, roughness: 0.5 });
    for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2 + 0.26; const col = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.28, 4.6, 12), colMat); col.position.set(Math.sin(a) * (r + 0.12), 2.3, Math.cos(a) * (r + 0.12)); Z.add(col); }

    // ---- 正面三块平面 LED 屏：上横、中竖（较窄）、下横（最宽）。各播各的广告，有时三块连成一幅。
    // 依据夜景 / 日景实拍：上屏是警局公益广告，中屏轮播「不眠考拉」咖啡和一张电影海报，下屏放影片片段（这里换成演唱会广告）。
    const SW = 512, SH = 1024;
    const scrC = canvas(SW, SH), scrT = canvasTex(scrC);
    // 屏幕靠自发光显示画面：底色压到接近黑，不然白天太阳照在浅色画面上会叠加过曝成一片白
    // 表面做成哑光、几乎不反射天空：原来偏亮的反光会在画面上蒙一层灰白
    const scrMat = new THREE.MeshStandardMaterial({ map: scrT, color: 0x16161a, emissive: 0xffffff, emissiveMap: scrT, emissiveIntensity: 0.95, roughness: 0.9, envMapIntensity: 0.15 });
    const R3 = { top: [0, 0, 512, 296], low: [0, 300, 512, 263], mid: [0, 568, 328, 456] };       // 三块屏在同一张画布上的分区
    const SCRZ = 4.55;
    const screen = (key, w, h, y) => {
      const [rx, ry, rw, rh] = R3[key];
      const g = new THREE.PlaneGeometry(w, h), uv = g.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, (rx + uv.getX(i) * rw) / SW, 1 - (ry + (1 - uv.getY(i)) * rh) / SH);
      const m = new THREE.Mesh(g, scrMat); m.position.set(0, y, SCRZ); m.userData.dyn = true; Z.add(m);
      const fr = new THREE.Mesh(new THREE.BoxGeometry(w + 0.34, h + 0.34, 0.6), PROP_MATS.dark); fr.position.set(0, y, SCRZ - 0.32); Z.add(fr);
      for (const sx of [-1, 1]) { const arm = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 1.6), PROP_MATS.dark); arm.position.set(sx * Math.min(w * 0.3, 1.6), y, SCRZ - 1.3); Z.add(arm); }
      return m;
    };
    const scrLow = screen('low', 7.0, 3.6, 11.7), scrMid = screen('mid', 3.6, 5.0, 16.3), scrTop = screen('top', 5.2, 3.0, 20.6);
    const adZPD = (g, x, y, w, h) => {          // 警局公益广告：米色底 + 三行字；画面里的警官换成一枚盾徽
      g.fillStyle = '#f3e9cf'; g.fillRect(x, y, w, h);
      g.fillStyle = '#1d3f7a'; g.fillRect(x, y + h * 0.84, w, h * 0.16);
      const cx = x + w * 0.17, cy = y + h * 0.42, s = h * 0.3;
      g.fillStyle = '#d9a520'; g.beginPath(); g.moveTo(cx, cy - s); g.lineTo(cx + s * 0.85, cy - s * 0.55); g.lineTo(cx + s * 0.7, cy + s * 0.5); g.lineTo(cx, cy + s); g.lineTo(cx - s * 0.7, cy + s * 0.5); g.lineTo(cx - s * 0.85, cy - s * 0.55); g.closePath(); g.fill();
      g.fillStyle = '#1d3f7a'; g.beginPath(); g.arc(cx, cy, s * 0.45, 0, 7); g.fill();
      zh(g, 'ZPD', cx, cy, s * 0.38, '#f3e9cf');
      zh(g, '责任  正直  勇敢', x + w * 0.64, y + h * 0.3, h * 0.19, '#1d3f7a');
      zh(g, '保护你我的栖息家园', x + w * 0.64, y + h * 0.6, h * 0.125, '#3a3a3a');
      zh(g, 'TRUST · BRAVERY · INTEGRITY', x + w * 0.5, y + h * 0.92, h * 0.085, '#f3e9cf');
    };
    const adCoffee = (g, x, y, w, h) => {
      g.fillStyle = '#1e5fb0'; g.fillRect(x, y, w, h);
      if (drawArt(g, 'koala', x, y, w, h, 0.3)) { const gr = g.createLinearGradient(0, y + h * 0.5, 0, y + h); gr.addColorStop(0, 'rgba(10,30,80,0)'); gr.addColorStop(1, 'rgba(10,30,80,.88)'); g.fillStyle = gr; g.fillRect(x, y + h * 0.5, w, h * 0.5); }
      zh(g, '不眠考拉', x + w / 2, y + h * 0.78, w * 0.2, '#fff'); zh(g, 'COFFEE CO.', x + w / 2, y + h * 0.91, w * 0.11, '#cfe6ff');
    };
    const adPoster = (g, x, y, w, h, time) => {  // 电影海报（只取片名文字）
      const gr = g.createLinearGradient(0, y, 0, y + h); gr.addColorStop(0, '#0b2a5c'); gr.addColorStop(1, '#58c6ee'); g.fillStyle = gr; g.fillRect(x, y, w, h);
      g.strokeStyle = 'rgba(255,255,255,.7)'; g.lineWidth = 3;
      for (let i = 0; i < 10; i++) {
        const sx = x + ((i * 97) % w), sy = y + ((i * 173 + time * 24) % h), rr = 8 + (i % 3) * 5;
        for (let k = 0; k < 3; k++) { const a = (k * Math.PI) / 3; g.beginPath(); g.moveTo(sx - Math.cos(a) * rr, sy - Math.sin(a) * rr); g.lineTo(sx + Math.cos(a) * rr, sy + Math.sin(a) * rr); g.stroke(); }
      }
      zh(g, 'Weaselton Pictures Presents', x + w / 2, y + h * 0.15, w * 0.06, '#e8f6ff');
      zh(g, 'FLOATZEN', x + w / 2, y + h * 0.45, w * 0.17, '#ffffff'); zh(g, '2', x + w / 2, y + h * 0.66, w * 0.36, '#bfeaff');
      zh(g, 'NON-INFRINGING ENTERTAINMENT', x + w / 2, y + h * 0.94, w * 0.05, '#e8f6ff');
    };
    const adConcert = (g, x, y, w, h, time) => {
      const gr = g.createLinearGradient(0, y, 0, y + h); gr.addColorStop(0, '#3a0d6e'); gr.addColorStop(1, '#e0399a'); g.fillStyle = gr; g.fillRect(x, y, w, h);
      if (drawArt(g, 'concert', x, y, w, h, 0.45)) { g.fillStyle = 'rgba(60,10,110,.3)'; g.fillRect(x, y, w, h); }
      for (let i = 0; i < 14; i++) { const bh = h * (0.12 + 0.3 * Math.abs(Math.sin(time * 3 + i * 0.9))); g.fillStyle = 'hsl(' + ((290 + i * 12) % 360) + ' 95% 68%)'; g.fillRect(x + 14 + i * (w - 28) / 14, y + h - 8 - bh, (w - 28) / 14 - 8, bh); }
      zh(g, 'GAZELLE', x + w * 0.5, y + h * 0.24, h * 0.24, '#ffe35c'); zh(g, '全城疯唱派对!', x + w * 0.5, y + h * 0.5, h * 0.17, '#ff9ad8');
    };
    const adDonut = (g, x, y, w, h, time, k) => {  // 红底甜甜圈：三块屏连成一幅时用
      g.fillStyle = '#c5202e'; g.fillRect(x, y, w, h);
      for (let i = 0; i < 7; i++) {
        const rr = h * (0.2 + (i % 3) * 0.05), cx = x + ((i * 131 + k * 57 + time * 26) % (w + rr * 2)) - rr, cy = y + h * (0.25 + ((i * 37 + k * 11) % 50) / 100);
        g.fillStyle = '#d9a05a'; g.beginPath(); g.arc(cx, cy, rr, 0, 7); g.fill();
        g.fillStyle = 'hsl(' + ((i * 67 + 320) % 360) + ' 78% 70%)'; g.beginPath(); g.arc(cx, cy, rr * 0.84, 0, 7); g.fill();
        g.fillStyle = '#fff'; for (let s = 0; s < 8; s++) { const a = s * 0.8 + i; g.fillRect(cx + Math.cos(a) * rr * 0.6 - 3, cy + Math.sin(a) * rr * 0.6 - 1.5, 7, 3); }
        g.fillStyle = '#c5202e'; g.beginPath(); g.arc(cx, cy, rr * 0.32, 0, 7); g.fill();
      }
    };
    let phase = -1;
    const drawScreen = (time) => {
      const g = scrC.getContext('2d'), p = Math.floor(time / 8) % 3;
      const zone = (key, fn, k) => { const [x, y, w, h] = R3[key]; g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip(); fn(g, x, y, w, h, time, k); g.restore(); };
      if (p === 2) { zone('top', adDonut, 0); zone('mid', adDonut, 1); zone('low', adDonut, 2); }
      else { zone('top', adZPD); zone('mid', p ? adPoster : adCoffee); zone('low', adConcert); }
      scrT.needsUpdate = true;
    };
    drawScreen(0);
    G.userData.tick = (time) => {
      const ph = Math.floor(time * 6);
      if (ph !== phase) { phase = ph; drawScreen(time); }
      ribT.offset.x = (time * 0.035) % 1;
    };

    // ---- 屏幕四周的静态 / 立体广告（位置按正面实拍：左右以面对塔的人为准，ang 为负在左）
    const polar = (o, ang, y, rad = 4.5) => { o.position.set(Math.sin(ang) * rad, y, Math.cos(ang) * rad); o.rotation.y = ang; Z.add(o); return o; };
    const bill = (texAd, ang, y0, w, h, { rad = 4.5, rz = 0, frame = PROP_MATS.dark } = {}) => {
      const m = new THREE.MeshStandardMaterial({ map: texAd, roughness: 0.5, emissive: 0xffffff, emissiveMap: texAd, emissiveIntensity: 0 });
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.16), [frame, frame, frame, frame, m, frame]);
      const back = new THREE.Mesh(new THREE.BoxGeometry(w + 0.24, h + 0.24, 0.14), frame); back.position.z = -0.04; b.add(back);
      polar(b, ang, y0, rad); b.rotation.z = rz; b.castShadow = true;
      lit.push([{ material: m }, 0.05, 0.95]);
      return b;
    };
    const gold = new THREE.MeshStandardMaterial({ color: 0xe0b040, roughness: 0.35, metalness: 0.8 });
    const blueFrame = new THREE.MeshStandardMaterial({ color: 0x1f5fb8, roughness: 0.5 });
    // 左下：「快来 撒哈拉广场」竖幅，框顶立一棵金色棕榈
    { const b = bill(ADS.sahara, -1.02, 13.3, 2.3, 3.1);
      const palm = new THREE.Group(); palm.add(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 1.0, 8).translate(0, 0.5, 0), gold));
      for (let i = 0; i < 7; i++) { const f = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.95, 5).translate(0, 0.47, 0), gold); f.scale.z = 0.3; f.position.y = 1.0; f.rotation.set(0, (i / 7) * Math.PI * 2, 1.15); palm.add(f); }
      palm.position.set(0, 1.6, 0); b.add(palm); }
    // 其下：黄色横幅，一家子挤在白色小车里
    bill(ADS.car, -1.0, 9.7, 4.0, 2.94);
    // 右下：歪挂的深色框「迁徙侠 MIGRATORS」
    bill(ADS.hero, 1.0, 10.6, 2.8, 2.8, { rz: -0.14 });
    // 下屏正下方：蓝框的洗衣液广告
    bill(ADS.wash, 0.04, 8.75, 3.9, 1.75, { rad: 4.6, rz: 0.03, frame: blueFrame });
    // 右侧朝市政厅：粉色板（驴 / 马头像），以及一块白底三人小板
    bill(ADS.llama, 1.62, 13.8, 2.6, 2.6); bill(ADS.trio, 1.8, 10.2, 2.2, 1.7);
    // 左上：牙膏管形招牌「亮白牙膏」+ 橙色爪子握着紫色牙刷
    { const tc = canvas(512, 300, (g) => {
        g.fillStyle = '#f7f7f2'; g.beginPath(); g.moveTo(60, 70); g.lineTo(400, 96); g.lineTo(400, 204); g.lineTo(60, 230); g.closePath(); g.fill();
        g.fillStyle = '#2aa7d8'; g.fillRect(400, 110, 26, 80); g.fillStyle = '#e9e9e4'; g.fillRect(426, 122, 52, 56);
        g.fillStyle = '#2aa7d8'; g.fillRect(44, 60, 24, 180);
        g.fillStyle = '#e8443a'; g.fillRect(96, 196, 280, 10);
        zh(g, '亮白牙膏', 232, 146, 76, '#1a6fb8');
      });
      const tt = canvasTex(tc);
      const tm = new THREE.MeshStandardMaterial({ map: tt, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.4, emissive: 0xffffff, emissiveMap: tt, emissiveIntensity: 0 });
      const tube = polar(new THREE.Mesh(new THREE.PlaneGeometry(3.4, 2.0), tm), -0.74, 21.6, 4.7); tube.rotation.z = 0.2; lit.push([tube, 0.05, 0.9]);
      const brush = new THREE.Group();
      brush.add(new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.16, 0.12), new THREE.MeshStandardMaterial({ color: 0x8a45c8, roughness: 0.4 })));
      const br = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.26, 0.14), new THREE.MeshStandardMaterial({ color: 0xf4f4f4, roughness: 0.9 })); br.position.set(0.72, 0.2, 0); brush.add(br);
      const paw = new THREE.Mesh(new THREE.SphereGeometry(0.34, 14, 10), new THREE.MeshStandardMaterial({ color: 0xe8862e, roughness: 0.9 })); paw.scale.set(1.1, 0.9, 0.8); paw.position.set(-0.6, -0.05, 0); brush.add(paw);
      polar(brush, -0.5, 23.2, 4.75); brush.rotation.z = -0.25; }
    // 右上：云朵底的窄竖牌「鹿立众群 通信公司」，牌顶探出一截长颈鹿脖子
    { const ct = adTex((g) => {
        const gr = g.createLinearGradient(0, 0, 0, 512); gr.addColorStop(0, '#4aa8ec'); gr.addColorStop(1, '#bfe6ff'); g.fillStyle = gr; g.fillRect(0, 0, 256, 512);
        g.fillStyle = 'rgba(255,255,255,.92)'; for (const [cx, cy, cr] of [[60, 110, 44], [110, 96, 56], [168, 112, 46], [80, 420, 40], [140, 410, 52], [196, 424, 40]]) { g.beginPath(); g.arc(cx, cy, cr, 0, 7); g.fill(); }
        zh(g, '鹿立众群', 128, 236, 56, '#fff'); zh(g, '通信公司', 128, 306, 44, '#0d4f9e');
      }, 256, 512);
      const b = bill(ct, 0.8, 20.3, 1.5, 3.0);
      const sk = canvasTex(canvas(128, 256, (g) => { g.fillStyle = '#f3d27a'; g.fillRect(0, 0, 128, 256); g.fillStyle = '#b06a2a'; for (let i = 0; i < 26; i++) { g.beginPath(); g.ellipse((i * 53) % 128, (i * 37) % 256, 14 + (i % 3) * 4, 18 + (i % 4) * 4, i, 0, 7); g.fill(); } }));
      const skin = new THREE.MeshStandardMaterial({ map: sk, roughness: 0.85 });
      const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, 2.3, 14).translate(0, 1.15, 0), skin); neck.position.set(0.1, 1.5, -0.1); neck.rotation.z = -0.1; b.add(neck);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 14, 10), skin); head.scale.set(0.85, 0.8, 1.6); head.position.set(0.34, 3.95, 0.28); b.add(head);
      for (const sx of [-0.1, 0.1]) { const h = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.28, 6), PROP_MATS.dark); h.position.set(0.34 + sx, 4.28, 0.1); b.add(h); } }
    // 中屏左侧：支架上的立体巧克力甜甜圈 + 灯泡字「THE BIG DONUT」；中屏右侧：巨型绿色饮料罐
    const dn = new THREE.Group();
    dn.add(new THREE.Mesh(new THREE.TorusGeometry(1.15, 0.52, 16, 36), new THREE.MeshStandardMaterial({ color: 0xc98a4b, roughness: 0.7 })));
    const ic = new THREE.Mesh(new THREE.TorusGeometry(1.15, 0.54, 16, 36), new THREE.MeshStandardMaterial({ color: 0x4a2617, roughness: 0.3 })); ic.scale.z = 0.6; ic.position.z = 0.22; dn.add(ic);
    { const spr = [0xff6fa8, 0xffe35c, 0x6fd0ff, 0xffffff, 0x8be06a].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.5 })); for (let i = 0; i < 26; i++) { const a = i * 2.4, rr = 1.15 + Math.sin(i * 1.7) * 0.3; const sp = new THREE.Mesh(new THREE.CapsuleGeometry(0.035, 0.16, 2, 6), spr[i % 5]); sp.position.set(Math.cos(a) * rr, Math.sin(a) * rr, 0.52); sp.rotation.z = i; dn.add(sp); } }
    const dl = label('THE BIG DONUT', { w: 3.0, h: 0.46, color: '#ffe9a8', glow: '#ffb03a', font: 'bold 120px Arial' }); dl.position.set(0, -1.95, 0.3); dn.add(dl); lit.push([dl, 0.3, 2.0]);
    polar(dn, -0.78, 17.0, 4.9);
    const can = new THREE.Group();
    can.add(new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 2.6, 28), new THREE.MeshStandardMaterial({ color: 0x35b34a, roughness: 0.25, metalness: 0.6 })));
    for (const yy of [-1.3, 1.3]) { const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.74, 0.8, 0.12, 28), new THREE.MeshStandardMaterial({ color: 0xcfd4d8, roughness: 0.3, metalness: 0.9 })); lid.position.y = yy + Math.sign(yy) * 0.04; can.add(lid); }
    const band2 = new THREE.Mesh(new THREE.CylinderGeometry(0.81, 0.81, 0.7, 28, 1, true), new THREE.MeshStandardMaterial({ color: 0xd8f26a, roughness: 0.3, metalness: 0.4 })); can.add(band2);
    polar(can, 0.78, 16.4, 4.9); can.rotation.z = 0.12;
    Z.traverse((m) => { if (m.isMesh && !m.material.transparent) { m.castShadow = true; m.receiveShadow = true; } });
    scrLow.castShadow = scrMid.castShadow = scrTop.castShadow = false; rib.castShadow = false;
    G.add(Z);
    // 夜里：塔身被染成洋红，环间灯带、屏幕、跑马屏更亮
    terr.emissive = new THREE.Color(0xff2a9a);
    // 屏幕夜里还要叠泛光，亮度稍微收一点，浅色画面才不会糊成白板
    nightFns.push((e) => { glowMat.emissiveIntensity = e * 1.5; scrMat.emissiveIntensity = 0.95 - e * 0.12; ribMat.emissiveIntensity = 0.55 + e * 0.6; terr.emissiveIntensity = e * 0.2; });
    // 屏幕向广场投射的紫粉色环境光
    const glow = new THREE.PointLight(0xe24cc0, 0, 60, 1.4); glow.position.set(ZOOTRON.c[0], 12, -ZOOTRON.c[1] + 9); G.add(glow);
    nightFns.push((e) => { glow.intensity = e * 55; });
  }

  // ---------------- 5. 动物城警局：赭色砂岩巨石冠
  {
    const Pg = new THREE.Group(); Pg.position.set(ZPD.c[0], 0, -ZPD.c[1]);
    const rnd = mulberry32(21);
    const slab = (w, h, d, seed) => {
      const g = new THREE.BoxGeometry(w, h, d, 5, 12, 3);
      const p = g.attributes.position; const r2 = mulberry32(seed); const ph = [r2() * 6, r2() * 6, r2() * 6];
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
        const n = Math.sin(y * 0.9 + ph[0]) * 0.16 + Math.sin(x * 1.7 + y * 0.6 + ph[1]) * 0.12 + Math.sin(z * 2.3 + ph[2]) * 0.08;
        const taper = 1 - 0.1 * (y / h + 0.5);
        p.setXYZ(i, x * taper + n * Math.sign(x || 1) * 0.7, y, z * taper + n * 0.6);
      }
      g.translate(0, h / 2, 0); g.computeVertexNormals();
      const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (w / 4), uv.getY(i) * (h / 4));
      return g;
    };
    const R = ZPD.r;
    const zs = sheets.zpd || null;          // 生成的巨石立面（含深度图）：绕圆厅弯成一圈浮雕皮
    // 基座鼓
    const base = new THREE.Mesh(new THREE.CylinderGeometry(R, R + 0.3, 5.2, 40, 4), rockMat);
    { const uv = base.geometry.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 14, uv.getY(i) * 1.3); }
    base.position.y = 2.6; Pg.add(base);
    const glassMat = new THREE.MeshStandardMaterial({ color: 0x1c3a52, roughness: 0.08, metalness: 0.9, emissive: 0x7fc4ff, emissiveIntensity: 0 });
    const N = 6;
    for (let i = 0; i < N; i++) {
      let a = (-0.62 + (i / (N - 1)) * 1.24) * Math.PI * 0.72;       // 0 = 正南
      a += Math.sign(a) * 0.17;                                        // 正中留出入口
      const h = (12.5 + Math.cos(a * 1.4) * 3.2 + rnd() * 1.2) * (zs ? 0.86 : 1);
      const s = new THREE.Mesh(slab(3.5 + rnd() * 0.6, h, 2.3, 30 + i), rockMat);
      const piv = new THREE.Group();
      const Rs = zs ? R - 2.9 : R - 1.2;        // 有浮雕皮时，程序生成的石板退到后面当背衬
      piv.position.set(Math.sin(a) * Rs, 0.5, Math.cos(a) * Rs); piv.rotation.y = a;
      s.rotation.x = 0.2 + rnd() * 0.06;      // 向外倾
      piv.add(s); Pg.add(piv);
      if (!zs && i < N - 1 && i !== N / 2 - 1) {
        const a2 = a + (1.24 / (N - 1)) * Math.PI * 0.72 * 0.5;
        const gl = new THREE.Mesh(new THREE.BoxGeometry(1.25, 8.2, 0.2), glassMat);
        gl.position.set(Math.sin(a2) * (R - 0.75), 4.8, Math.cos(a2) * (R - 0.75)); gl.rotation.y = a2; Pg.add(gl);
      }
    }
    // 前方的巨石平台 + 入口门洞 + 字牌
    const ledge = new THREE.Mesh(blobGeo(77, 1, 3, 0.16), rockMat); ledge.scale.set(5.4, 1.05, 2.3); ledge.position.set(0, 5.0, R + 0.9); Pg.add(ledge);
    { const uv = ledge.geometry.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 4, uv.getY(i) * 2); }
    const door = new THREE.Mesh(new THREE.BoxGeometry(4.4, 3.6, 0.5), new THREE.MeshStandardMaterial({ color: 0x0c1118, roughness: 0.4, emissive: 0xffc070, emissiveIntensity: 0 })); door.position.set(0, 1.8, R + 0.55); Pg.add(door);
    // 门洞两侧的石墩 + 正中上方的玻璃幕
    for (const sx of [-1, 1]) { const pier = new THREE.Mesh(slab(1.5, 4.4, 1.9, 60 + sx), rockMat); pier.position.set(sx * 3.0, 0, R + 0.5); pier.visible = !zs; Pg.add(pier); }
    const atr = new THREE.Mesh(new THREE.BoxGeometry(3.4, 6.0, 0.25), glassMat); atr.position.set(0, 8.6, R - 0.9); Pg.add(atr);
    let arc = null;                          // 把东西挂到弯曲的浮雕皮上：s 沿弧 0..1，v 占图高比例
    if (zs) {
      ledge.visible = door.visible = atr.visible = false;
      const Rb = R + 0.1, span = 2.95, W = Rb * span;
      const skin = zs.piece({ auto: true, width: W, depth: 0.5, bodyless: true, reliefScale: 1.45, cell: 0.13 });
      const Hs = skin.userData.H, u0 = skin.userData.u0, u1 = skin.userData.u1;
      bendAround(skin, Rb, W); zs.mat.side = THREE.DoubleSide; Pg.add(skin);
      arc = (obj, s, v, out = 0.08, w = 1, h = 0.5) => {
        const uc = u0 + s * (u1 - u0), du = (w / 2 / W) * (u1 - u0), hv = h / 2 / Hs;
        const z = Rb + zs.reliefMaxZ(uc - du, uc + du, v - hv, v + hv) * 1.45 + out, th = (s - 0.5) * span;
        obj.position.set(z * Math.sin(th), v * Hs, z * Math.cos(th)); obj.rotation.y = th; Pg.add(obj);
        // 宽的字牌是一张平板，贴在半径 10 米的圆厅上两端会翘出去半米多、像飘在空中：把它沿圆弧弯过去
        if (w > 2.5 && obj.geometry && obj.geometry.type === 'PlaneGeometry') {
          const g2 = new THREE.PlaneGeometry(w, h, 32, 1), p = g2.attributes.position;
          for (let i = 0; i < p.count; i++) { const a = p.getX(i) / z; p.setX(i, z * Math.sin(a)); p.setZ(i, z * Math.cos(a) - z); }
          g2.computeVertexNormals(); obj.geometry.dispose(); obj.geometry = g2;
        }
      };
    }
    const l1 = label('ZOOTOPIA POLICE', { w: 7.4, h: 1.0, color: '#ffffff', font: 'bold 140px Arial, sans-serif', px: [1400, 200] }); if (arc) arc(l1, 0.5, 0.455, 0.35, 7.4, 1.0); else { l1.position.set(0, 6.55, R + 2.6); Pg.add(l1); } lit.push([l1, 0.0, 1.5]);
    const l2 = label('动物城警局', { w: 3.2, h: 0.55, color: '#2b241c' }); if (arc) arc(l2, 0.5, 0.335, 0.08, 3.2, 0.55); else { l2.position.set(0, 5.05, R + 3.24); Pg.add(l2); } lit.push([l2, 0, 0.0]);
    const l3 = label('疯狂动物城：热力追踪', { w: 4.6, h: 0.5, color: '#ffe9a8', stroke: '#7a2a1a', sub: 'ZOOTOPIA: HOT PURSUIT', px: [1024, 240] }); if (arc) arc(l3, 0.5, 0.248, 0.1, 4.6, 0.5); else { l3.position.set(0, 3.85, R + 0.84); Pg.add(l3); } lit.push([l3, 0, 1.0]);
    // 排队口旁的骑乘海报
    const rp = S.ridePoster(); rp.position.set(-8.6, 2.45, R + 1.7); rp.rotation.y = -0.45; Pg.add(rp);
    for (const m of rp.userData.lit) lit.push([{ material: m }, m.userData.lit[0], m.userData.lit[1]]);
    const rpPost = new THREE.Mesh(slab(0.7, 1.5, 0.6, 72), rockMat); rpPost.position.set(-8.6, 0, R + 1.6); Pg.add(rpPost);
    // 旁边岩石上挂的「优先通道」深色吊牌
    const pa = S.plaque([{ t: "优先通道" }, { t: "PRIORITY ACCESS ENTRANCE", size: 0.5 }], { w: 1.9, h: 0.62, bg: "#22201c", bg2: "#12100c", fg: "#f2efe6", border: null, frame: 0x12100c, doubleSided: true, night: 0.6 });
    pa.position.set(8.4, 2.5, R + 1.6); pa.rotation.y = 0.45; Pg.add(pa);
    for (const m of pa.userData.lit) lit.push([{ material: m }, m.userData.lit[0], m.userData.lit[1]]);
    const paPost = new THREE.Mesh(slab(0.7, 3.3, 0.6, 71), rockMat); paPost.position.set(9.55, 0, R + 1.05); Pg.add(paPost);
    Pg.traverse((m) => { if (m.isMesh && !m.material.transparent) { m.castShadow = true; m.receiveShadow = true; } });
    G.add(Pg);
    const up1 = new THREE.PointLight(0xffc880, 0, 34, 1.5); up1.position.set(ZPD.c[0] - 6, 1.2, -ZPD.c[1] + R + 3.5); G.add(up1);
    const up2 = up1.clone(); up2.position.x = ZPD.c[0] + 6; G.add(up2);
    nightFns.push((e) => { up1.intensity = up2.intensity = e * 38; glassMat.emissiveIntensity = e * 0.55; door.material.emissiveIntensity = e * 0.1; });
  }

  // ---------------- 6. 天际线（强迫透视）：把两张图里的塔楼逐栋拆开，前后错落排在表演楼屋顶的土坡上
  {
    const S = new THREE.Group();
    const towers = [];
    for (const n of ['skylineA', 'skylineB']) {
      const s = sheets[n]; if (!s) continue;
      let c = 0;
      while (c < s.cols) {
        while (c < s.cols && s.top[c] < 0.06) c++;
        const a = c;
        while (c < s.cols && s.top[c] >= 0.06) c++;
        if (c - a > 8) towers.push({ s, u0: a / s.cols, u1: c / s.cols });
      }
    }
    const rnd = mulberry32(5);
    // 交错洗牌，让两张图的塔楼混排
    const order = towers.map((t, i) => [t, (i * 7) % towers.length]).sort((p, q) => p[1] - q[1]).map((p) => p[0]);
    const baseY = BLOCK_H.ride;
    order.forEach((t, i) => {
      const row = i % 2;                               // 前排 / 后排
      const k = (i + 0.5) / order.length;
      const x = -58 + k * 96 + (rnd() - 0.5) * 2.5;
      const y = row ? 24 + rnd() * 9 : 10.5 + rnd() * 5;      // 卫星图里这排塔楼紧贴在市政厅和警局背后
      const pxW = (t.u1 - t.u0) * t.s.w;
      const scale = (row ? 0.034 : 0.026) * (0.9 + rnd() * 0.25);      // 米/像素
      const w = pxW * scale;
      const p = t.s.piece({ u0: t.u0, u1: t.u1, width: w, depth: Math.min(w * 0.7, 3.2), reliefScale: 0.32, cell: 0.07, taper: false, skin: 'wrap' });
      const yaw = (x + 12) * 0.006;
      p.position.set(x - w / 2, baseY + (row ? 2.2 : 0.6), -y); p.rotation.y = -yaw;
      S.add(p);
    });
    // 土坡 + 针叶树、灌木遮住塔基
    const berm = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x4f8f3e, roughness: 1 }));
    berm.scale.set(56, 3.6, 17); berm.position.set(-8, baseY - 0.2, -21); berm.receiveShadow = true; S.add(berm);
    const cg = coniferGeo(), con = [], bush = [];
    for (let i = 0; i < 46; i++) { const x = -60 + rnd() * 100, y = 7.5 + rnd() * 5; con.push({ x, z: y, y: baseY + 0.3, s: 0.7 + rnd() * 0.6, ry: rnd() * 6 }); }
    for (let i = 0; i < 40; i++) { const x = -60 + rnd() * 100, y = 6.2 + rnd() * 3.5; bush.push({ x, z: y, y: baseY + 0.5, s: 1.0 + rnd() * 0.9, ry: rnd() * 6 }); }
    const coniferM = cutMat('conifer'), leafM = cutMat('leafA');
    const darkCore = new THREE.MeshStandardMaterial({ color: 0x1f4a2c, roughness: 1 });
    if (coniferM) { const cf = conifer(3); S.add(instanced(cf.core, darkCore, con), instanced(cf.trunk, PROP_MATS.trunk, con), instanced(cf.cards, coniferM, con)); }
    else S.add(instanced(cg, new THREE.MeshStandardMaterial({ color: 0x2f6f3a, roughness: 1 }), con));
    if (leafM) { const sb = shrub(4, { r: 1.0, h: 1.2, n: 24 }); S.add(instanced(sb.core, new THREE.MeshStandardMaterial({ color: 0x2f6a2c, roughness: 1 }), bush), instanced(sb.cards, leafM, bush)); }
    else S.add(instanced(blobGeo(9, 1, 1, 0.25), new THREE.MeshStandardMaterial({ color: 0x5c9a44, roughness: 1 }), bush));
    G.add(S);
    // 夜间：天际线的洋红 / 紫 / 蓝 / 青色泛光
    // 天际线的彩色染光：两盏就够（粉紫 + 蓝青），四盏在远景上看不出区别，却要多占两个灯位
    const washes = [[0xad3abd, -33], [0x308ef4, 11]].map(([c, x]) => { const l = new THREE.PointLight(c, 0, 80, 1.3); l.position.set(x, baseY + 5, -7); G.add(l); return l; });
    nightFns.push((e) => washes.forEach((l) => { l.intensity = e * 190; }));
  }

  // ---------------- 7. 夜行弄堂：霓虹招牌挂在东街区内院
  {
    const neon = (text, x, y, h, ry, color, glow, opts = {}) => {
      const l = label(text, { w: opts.w || 3, h: opts.h || 0.6, color, glow, font: opts.font || `bold 130px ${FONT_ZH}`, sub: opts.sub, px: opts.px || [1024, 220] });
      l.position.set(x, h, -y); l.rotation.y = ry; if (opts.flip) l.rotation.z = Math.PI; G.add(l); lit.push([l, 0.45, 2.6]);
    };
    neon('夜行弄堂', 35.9, -25.9, 4.6, 0, '#9ad8ff', '#2a8bff', { w: 3.0, h: 0.62, sub: 'NOCTURNAL ALLEY', px: [1024, 240] });
    neon('THE HANGOUT', 38.5, -14.6, 4.2, 0, '#d6a8ff', '#8a3bff', { w: 3.6, h: 0.55, font: 'bold 120px Arial', flip: true });       // 蝙蝠夜店：招牌倒着挂
    neon('舞虎俱乐部', 47.9, -20.6, 3.6, -Math.PI / 2, '#ffb36a', '#ff6a1a', { w: 3.2, h: 0.55 });
    neon('34卡 · 奶茶 · 航空', 32.3, -19.4, 3.0, Math.PI / 2, '#8dffd0', '#18e0a0', { w: 3.0, h: 0.42 });
    const al = new THREE.PointLight(0x7a5bff, 0, 26, 1.5); al.position.set(40, 3.2, 19.5); G.add(al);
    nightFns.push((e) => { al.intensity = e * 40; });
  }

  // ---------------- 8. 围墙（东通道两侧、入口周边）：砂岩墙 + 上方绿篱
  {
    const hedgeMat = new THREE.MeshStandardMaterial({ color: 0x4f9440, roughness: 1, vertexColors: true });
    const hedge = [];
    for (const wl of WALLS.slice(1)) {
      for (let i = 0; i < wl.length - 1; i++) {
        const a = wl[i], b = wl[i + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const wgeo = new THREE.BoxGeometry(L + 0.5, 2.6, 0.7);
        { const uv = wgeo.attributes.uv; for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * (L / 4), uv.getY(k) * 0.65); }
        const w = new THREE.Mesh(wgeo, rockMat);
        w.position.set((a[0] + b[0]) / 2, 1.3, -(a[1] + b[1]) / 2); w.rotation.y = Math.atan2(b[1] - a[1], b[0] - a[0]);
        w.castShadow = w.receiveShadow = true; G.add(w);
        for (let d = 0.4; d < L; d += 1.05) {                 // 墙顶的绿篱：一团团修剪过的灌木，不再是方盒子
          const t = d / L, k = (hedge.length * 0.37) % 1;
          hedge.push({ x: a[0] + (b[0] - a[0]) * t, z: a[1] + (b[1] - a[1]) * t, y: 2.75 + k * 0.25, s: 0.95 + k * 0.35, ry: hedge.length * 1.7 });
        }
      }
    }
    const hedgeMesh = instanced(blobGeo(31, 1, 2, 0.2), hedgeMat, hedge); G.add(hedgeMesh);
    const hedgeLeaf = cutMat('leafA');
    if (hedgeLeaf) { const hs = shrub(17, { r: 1.02, h: 1.75, n: 20 }); G.add(instanced(hs.cards, hedgeLeaf, hedge.map((h) => ({ ...h, y: h.y - 0.95 })))); }
  }

  G.userData.batched = batchStatic(G);                 // 同材质的小零件合批，省绘制调用
  scene.add(G);
  env.onChange((e) => {
    nightFns.forEach((f) => f(e));
    for (const [l, d, n] of lit) l.material.emissiveIntensity = d + (n - d) * e;
  });
  const tick = (time, dt = 0.016, cam = null) => { G.userData.tick?.(time); for (const f of tickers) f(time, dt, cam); };
  return { group: G, facInfo, sheets, tick, residents };
}
