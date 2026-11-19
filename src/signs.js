// 招牌系统：按实景照片与报道里能确认的文字来做（中英双语、门牌号、戏仿广告），
// 只用文字和抽象图形，不含角色形象与官方标志图案。
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { canvas, canvasTex } from './util.js';
import { drawArt, drawCut, cutTex, captionBand } from './art.js';

export const ZH = '"Microsoft YaHei","PingFang SC","Noto Sans SC",sans-serif';
const SERIF = 'Georgia, "Times New Roman", serif';

// 自适应字号：把文字塞进给定宽度
function fit(g, text, maxW, size, font, weight = 'bold') {
  let s = size;
  do { g.font = `${weight} ${s}px ${font}`; if (g.measureText(text).width <= maxW) break; s -= 2; } while (s > 10);
  return s;
}

const PALETTES = {
  gold: { top: '#fff4b8', mid: '#e7b944', bot: '#9a6a14', edge: '#5a3a0a', side: '#7a5210' },
  white: { top: '#ffffff', mid: '#f2f2f2', bot: '#cfd3d8', edge: '#7a7f86', side: '#9aa0a8' },
  dark: { top: '#4a4038', mid: '#2b241c', bot: '#15110c', edge: '#000000', side: '#000000' },
  brass: { top: '#f6e2a0', mid: '#c79a3a', bot: '#7a5a1c', edge: '#3c2d12', side: '#5a4216' },
  cream: { top: '#fffaf0', mid: '#f4ead2', bot: '#d8c8a0', edge: '#6b4a2a', side: '#8a6a40' },
  red: { top: '#ff6a6a', mid: '#d6202a', bot: '#8a1018', edge: '#4a0608', side: '#6a0c12' },
  green: { top: '#8fe0a8', mid: '#2f9e63', bot: '#17603a', edge: '#0c3a22', side: '#145030' },
  purple: { top: '#d6b8ff', mid: '#8a52d0', bot: '#4a2390', edge: '#2a1058', side: '#3a1a78' },
};

function litMat(tex, { day = 0, night = 1, transparent = true } = {}) {
  const m = new THREE.MeshStandardMaterial({
    map: tex, transparent, alphaTest: transparent ? 0.06 : 0, roughness: 0.45, metalness: 0.0,
    emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: day, side: THREE.DoubleSide, depthWrite: !transparent,
  });
  m.userData.lit = [day, night];
  return m;
}

// ---------------------------------------------------------------- 立体字（金属 / 漆面字，带厚度感与投影）
export function letters(zh, en, { w = 4, style = 'gold', enRatio = 0.3, enFont = 'Arial, sans-serif', zhFont = ZH, script = false, day = 0, night = 1.1 } = {}) {
  const P = PALETTES[style] || PALETTES.gold;
  const PW = 1400, hasBoth = zh && en;
  const zhH = zh ? 250 : 0, enH = en ? (hasBoth ? Math.round(250 * enRatio / (1 - enRatio)) : 220) : 0;
  const PH = zhH + enH + 50;
  const c = canvas(PW, PH, (g) => {
    g.clearRect(0, 0, PW, PH);
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
    const drawLine = (text, cy, size, font, weight = 'bold') => {
      const s = fit(g, text, PW - 90, size, font, weight);
      const depth = Math.max(4, Math.round(s * 0.06));
      // 厚度：向右下叠画几层暗色
      g.fillStyle = P.side;
      for (let k = depth; k >= 1; k--) g.fillText(text, PW / 2 + k * 0.8, cy + k);
      g.strokeStyle = P.edge; g.lineWidth = Math.max(3, s * 0.045); g.strokeText(text, PW / 2, cy);
      const gr = g.createLinearGradient(0, cy - s / 2, 0, cy + s / 2);
      gr.addColorStop(0, P.top); gr.addColorStop(0.5, P.mid); gr.addColorStop(1, P.bot);
      g.fillStyle = gr; g.fillText(text, PW / 2, cy);
      // 高光
      g.save(); g.globalCompositeOperation = 'source-atop'; g.fillStyle = 'rgba(255,255,255,.22)'; g.fillRect(0, cy - s * 0.42, PW, s * 0.2); g.restore();
    };
    if (zh) drawLine(zh, 25 + zhH / 2, zhH * 0.8, zhFont);
    if (en) drawLine(en, 25 + zhH + enH / 2, enH * 0.78, script ? `italic ${SERIF}` : enFont, script ? 'bold italic' : 'bold');
  });
  const tex = canvasTex(c);
  const h = (w * PH) / PW;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), litMat(tex, { day, night }));
  m.renderOrder = 3;
  const grp = new THREE.Group(); grp.add(m);
  grp.userData.size = [w, h]; grp.userData.lit = [m.material];
  return grp;
}

// ---------------------------------------------------------------- 牌匾（有厚度的板 + 画面）
// lines: [{t, size?, color?, font?}], shape: rect | oval | round
export function plaque(lines, { w = 2, h = 0.7, bg = '#1d6d48', bg2 = null, fg = '#fff', border = '#c9a23a', frame = 0x2f2a24, shape = 'rect', day = 0, night = 0.7, thick = 0.07, draw = null, doubleSided = false, textX = [0, 1], textY = [0, 1], textStroke = null } = {}) {
  const PW = 768, PH = Math.max(96, Math.round((PW * h) / w));
  const c = canvas(PW, PH, (g) => {
    g.clearRect(0, 0, PW, PH);
    const path = () => {
      g.beginPath();
      if (shape === 'rect') g.roundRect(4, 4, PW - 8, PH - 8, Math.min(PW, PH) * 0.12);
      else g.ellipse(PW / 2, PH / 2, PW / 2 - 4, PH / 2 - 4, 0, 0, Math.PI * 2);
    };
    path();
    if (bg2) { const gr = g.createLinearGradient(0, 0, 0, PH); gr.addColorStop(0, bg); gr.addColorStop(1, bg2); g.fillStyle = gr; } else g.fillStyle = bg;
    g.fill();
    g.save(); path(); g.clip();
    if (draw) draw(g, PW, PH);
    g.restore();
    if (border) { g.strokeStyle = border; g.lineWidth = Math.max(6, PH * 0.045); g.beginPath(); if (shape === 'rect') g.roundRect(12, 12, PW - 24, PH - 24, Math.min(PW, PH) * 0.1); else g.ellipse(PW / 2, PH / 2, PW / 2 - 14, PH / 2 - 14, 0, 0, Math.PI * 2); g.stroke(); }
    g.textAlign = 'center'; g.textBaseline = 'middle';
    const total = lines.reduce((a, l) => a + (l.size || 1), 0);
    const cx = (PW * (textX[0] + textX[1])) / 2, maxW = PW * (textX[1] - textX[0]) * (shape === 'rect' ? 0.88 : 0.72);
    let y = PH * (textY[0] + (textY[1] - textY[0]) * 0.12);
    const usable = PH * (textY[1] - textY[0]) * 0.76;
    for (const l of lines) {
      const lh = (usable * (l.size || 1)) / total;
      const s = fit(g, l.t, maxW, lh * 0.86, l.font || (/[一-鿿]/.test(l.t) ? ZH : 'Arial, sans-serif'));
      g.fillStyle = l.color || fg;
      const st = l.stroke || textStroke;
      if (st) { g.strokeStyle = st; g.lineWidth = s * 0.14; g.lineJoin = 'round'; g.strokeText(l.t, cx, y + lh / 2); }
      g.fillText(l.t, cx, y + lh / 2);
      y += lh;
    }
  });
  const tex = canvasTex(c);
  const grp = new THREE.Group();
  const frameMat = new THREE.MeshStandardMaterial({ color: frame, roughness: 0.5, metalness: 0.3 });
  let body;
  if (shape === 'rect') body = new THREE.Mesh(new RoundedBoxGeometry(w + 0.06, h + 0.06, thick, 3, Math.min(0.05, thick * 0.45)), frameMat);
  else { body = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, thick, 40), frameMat); body.rotation.x = Math.PI / 2; body.scale.set(w + 0.06, 1, h + 0.06); }
  body.castShadow = true; grp.add(body);
  const mk = (z, flip) => {
    const f = new THREE.Mesh(new THREE.PlaneGeometry(w, h), litMat(tex, { day, night }));
    f.position.z = z; if (flip) f.rotation.y = Math.PI; f.renderOrder = 3; grp.add(f); return f.material;
  };
  const mats = [mk(thick / 2 + 0.006, false)];
  if (doubleSided) mats.push(mk(-thick / 2 - 0.006, true));
  grp.userData.size = [w, h]; grp.userData.lit = mats;
  return grp;
}

// ---------------------------------------------------------------- 悬挑挂牌：垂直于墙面，绿色铁艺支架
export function blade(lines, opts = {}) {
  const p = plaque(lines, { ...opts, doubleSided: true });
  const [w, h] = p.userData.size;
  const grp = new THREE.Group();
  const iron = new THREE.MeshStandardMaterial({ color: opts.iron ?? 0x1f6a44, roughness: 0.5, metalness: 0.4 });
  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, w + 0.5, 8), iron); arm.rotation.x = Math.PI / 2; arm.position.set(0, h / 2 + 0.22, (w + 0.5) / 2); grp.add(arm);
  const curl = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.022, 6, 16, Math.PI * 1.5), iron); curl.rotation.y = Math.PI / 2; curl.position.set(0, h / 2 + 0.04, 0.22); grp.add(curl);
  for (const z of [0.42, w + 0.08]) { const ch = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.2, 6), iron); ch.position.set(0, h / 2 + 0.12, z); grp.add(ch); }
  p.rotation.y = Math.PI / 2; p.position.set(0, 0, w / 2 + 0.25); grp.add(p);
  grp.userData.size = [0.2, h]; grp.userData.lit = p.userData.lit; grp.userData.blade = true;
  grp.traverse((m) => { if (m.isMesh && !m.material.transparent) m.castShadow = true; });
  return grp;
}

// ---------------------------------------------------------------- 霓虹字
export function neon(text, { w = 3, color = '#9ad8ff', glow = '#2a8bff', sub = null, font = ZH, day = 0.45, night = 2.6 } = {}) {
  const PW = 1024, PH = sub ? 300 : 230;
  const c = canvas(PW, PH, (g) => {
    g.clearRect(0, 0, PW, PH); g.textAlign = 'center'; g.textBaseline = 'middle';
    const y = sub ? PH * 0.4 : PH / 2;
    const s = fit(g, text, PW - 80, 150, font);
    g.shadowColor = glow; g.shadowBlur = 30; g.strokeStyle = glow; g.lineWidth = s * 0.09; g.lineJoin = 'round';
    g.strokeText(text, PW / 2, y); g.strokeText(text, PW / 2, y);
    g.shadowBlur = 8; g.strokeStyle = color; g.lineWidth = s * 0.035; g.strokeText(text, PW / 2, y);
    g.fillStyle = 'rgba(255,255,255,.92)'; g.shadowBlur = 0;
    g.font = g.font; g.lineWidth = 1; g.fillStyle = color; g.globalAlpha = 0.35; g.fillText(text, PW / 2, y); g.globalAlpha = 1;
    if (sub) { const ss = fit(g, sub, PW - 120, 60, 'Arial, sans-serif'); g.shadowColor = glow; g.shadowBlur = 16; g.fillStyle = color; g.fillText(sub, PW / 2, PH * 0.83); }
  });
  const tex = canvasTex(c), h = (w * PH) / PW;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), litMat(tex, { day, night }));
  m.renderOrder = 3;
  const grp = new THREE.Group(); grp.add(m);
  grp.userData.size = [w, h]; grp.userData.lit = [m.material];
  return grp;
}

// ---------------------------------------------------------------- 灯泡跑马灯牌（喜剧俱乐部那种）
export function marquee(title, lines, { w = 3.4, h = 1.5, bg = '#103a3c', bulb = '#ffe9a8' } = {}) {
  const PW = 768, PH = Math.round((PW * h) / w);
  const c = canvas(PW, PH, (g) => {
    g.fillStyle = bg; g.beginPath(); g.roundRect(0, 0, PW, PH, 30); g.fill();
    g.fillStyle = '#f6efd8'; g.beginPath(); g.roundRect(54, PH * 0.34, PW - 108, PH * 0.52, 12); g.fill();
    g.fillStyle = bulb;
    const n = 26; for (let i = 0; i < n; i++) { const x = 30 + (i / (n - 1)) * (PW - 60); for (const y of [26, PH - 26]) { g.beginPath(); g.arc(x, y, 9, 0, 7); g.fill(); } }
    const m = Math.round(n * h / w); for (let i = 1; i < m; i++) { const y = 26 + (i / m) * (PH - 52); for (const x of [30, PW - 30]) { g.beginPath(); g.arc(x, y, 9, 0, 7); g.fill(); } }
    g.textAlign = 'center'; g.textBaseline = 'middle';
    let s = fit(g, title, PW - 140, PH * 0.2, 'Arial, sans-serif'); g.fillStyle = '#ffd86a'; g.fillText(title, PW / 2, PH * 0.2);
    const lh = (PH * 0.46) / lines.length;
    lines.forEach((t, i) => { s = fit(g, t, PW - 160, lh * 0.8, /[一-鿿]/.test(t) ? ZH : 'Arial, sans-serif'); g.fillStyle = '#1a1a1a'; g.fillText(t, PW / 2, PH * 0.37 + lh * (i + 0.5)); });
  });
  const tex = canvasTex(c);
  const grp = new THREE.Group();
  const body = new THREE.Mesh(new RoundedBoxGeometry(w, h, 0.5, 3, 0.08), new THREE.MeshStandardMaterial({ color: 0x0c2a2c, roughness: 0.5 })); body.castShadow = true; grp.add(body);
  const f = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.98, h * 0.98), litMat(tex, { day: 0.12, night: 1.5, transparent: false })); f.position.z = 0.256; grp.add(f);
  grp.userData.size = [w, h]; grp.userData.lit = [f.material]; grp.userData.thick = 0.5;
  return grp;
}

// ---------------------------------------------------------------- 门牌号
export function numberPlate(num, style = 'brass') {
  const dark = style === 'dark';
  return plaque([{ t: String(num), font: SERIF }], { w: 0.42, h: 0.24, bg: dark ? '#1c1c1c' : '#c79a3a', bg2: dark ? '#0c0c0c' : '#8a6420', fg: dark ? '#e7c35a' : '#2a1c08', border: dark ? '#e7c35a' : '#5a3a0a', frame: 0x3c2d12, thick: 0.035, night: 0.25 });
}

// ---------------------------------------------------------------- 海报（博物馆、排队区）
export function poster(titleLines, { w = 1.1, h = 1.6, c1 = '#1d6a8a', c2 = '#f2c165', accent = '#fff' } = {}) {
  return plaque(titleLines, { w, h, bg: c1, bg2: c2, fg: accent, border: '#f3ead2', frame: 0x1f7a6e, night: 0.55, thick: 0.05,
    draw: (g, W, H) => {       // 抽象的自然图形：水滴 / 叶片 / 同心环
      g.globalAlpha = 0.28; g.fillStyle = '#fff';
      for (let i = 0; i < 6; i++) { g.beginPath(); g.ellipse(W * (0.2 + 0.13 * i), H * (0.3 + 0.07 * ((i * 3) % 5)), W * 0.09, H * 0.12, i, 0, 7); g.fill(); }
      g.globalAlpha = 1;
    } });
}

// ---------------------------------------------------------------- 交通标志
export function trafficSign(kind, zh, en) {
  const S = 320;
  const c = canvas(S, S, (g) => {
    g.clearRect(0, 0, S, S); g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
    const text = (dark) => {
      g.fillStyle = dark; let s = fit(g, zh, S * 0.62, 34, ZH); g.fillText(zh, S / 2, S * 0.73);
      s = fit(g, en, S * 0.6, 18, 'Arial, sans-serif'); g.fillText(en, S / 2, S * 0.84);
    };
    if (kind === 'ban') {                 // 红圈斜杠：禁止鸣笛
      g.fillStyle = '#fff'; g.beginPath(); g.arc(S / 2, S / 2, S / 2 - 4, 0, 7); g.fill();
      g.fillStyle = '#3a3a3a'; g.beginPath(); g.moveTo(96, 170); g.bezierCurveTo(120, 96, 210, 92, 232, 138); g.bezierCurveTo(196, 126, 150, 140, 128, 190); g.fill();
      g.strokeStyle = '#3a3a3a'; g.lineWidth = 5; for (let i = 0; i < 3; i++) { g.beginPath(); g.arc(238, 120, 16 + i * 14, -0.9, 0.5); g.stroke(); }
      g.strokeStyle = '#d6202a'; g.lineWidth = 26; g.beginPath(); g.arc(S / 2, S / 2, S / 2 - 22, 0, 7); g.stroke();
      g.beginPath(); g.moveTo(66, 66); g.lineTo(254, 254); g.stroke();
      text('#d6202a');
    } else if (kind === 'merge') {        // 蓝底方牌：哺乳动物并道（大车 + 小车）
      g.fillStyle = '#1d5fc0'; g.beginPath(); g.roundRect(6, 6, S - 12, S - 12, 34); g.fill();
      g.strokeStyle = '#fff'; g.lineWidth = 8; g.beginPath(); g.roundRect(18, 18, S - 36, S - 36, 26); g.stroke();
      g.fillStyle = '#fff'; g.beginPath(); g.roundRect(60, 78, 120, 78, 22); g.fill(); g.beginPath(); g.roundRect(204, 124, 54, 32, 10); g.fill();
      g.fillStyle = '#1d5fc0'; for (const [x, y, r] of [[92, 158, 15], [150, 158, 15], [216, 158, 8], [246, 158, 8]]) { g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); }
      g.strokeStyle = '#fff'; g.lineWidth = 9; g.beginPath(); g.moveTo(232, 60); g.quadraticCurveTo(200, 80, 196, 108); g.stroke();
      text('#fff');
    } else if (kind === 'slow') {         // 红边三角：慢 · 幼兽活动
      g.fillStyle = '#fff'; g.strokeStyle = '#d6202a'; g.lineWidth = 26;
      g.beginPath(); g.moveTo(S / 2, 24); g.lineTo(S - 22, S - 40); g.lineTo(22, S - 40); g.closePath(); g.fill(); g.stroke();
      g.fillStyle = '#2a2a2a'; g.beginPath(); g.arc(S / 2 - 26, 150, 17, 0, 7); g.fill(); g.beginPath(); g.arc(S / 2 + 22, 162, 12, 0, 7); g.fill();
      g.fillRect(S / 2 - 34, 168, 16, 46); g.fillRect(S / 2 + 16, 176, 12, 38);
      g.fillStyle = '#d6202a'; let s = fit(g, zh, S * 0.5, 30, ZH); g.fillText(zh, S / 2, S * 0.76); s = fit(g, en, S * 0.46, 15, 'Arial'); g.fillText(en, S / 2, S * 0.84);
    } else {                              // 黄色菱形：限高（长颈鹿）
      g.save(); g.translate(S / 2, S / 2); g.rotate(Math.PI / 4); g.fillStyle = '#f5c518'; g.strokeStyle = '#1a1a1a'; g.lineWidth = 10;
      g.beginPath(); g.roundRect(-104, -104, 208, 208, 18); g.fill(); g.stroke(); g.restore();
      g.fillStyle = '#1a1a1a'; g.fillRect(S / 2 - 7, 92, 14, 96); g.beginPath(); g.moveTo(S / 2 - 26, 96); g.lineTo(S / 2 + 26, 96); g.lineTo(S / 2, 64); g.fill();
      let s = fit(g, zh, S * 0.44, 28, ZH); g.fillText(zh, S / 2, S * 0.68); s = fit(g, en, S * 0.4, 15, 'Arial'); g.fillText(en, S / 2, S * 0.76);
    }
  });
  const tex = canvasTex(c);
  const grp = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, 3.0, 8), new THREE.MeshStandardMaterial({ color: 0x2f9e63, roughness: 0.45, metalness: 0.25 }));
  pole.position.y = 1.5; pole.castShadow = true; grp.add(pole);
  const mat = new THREE.MeshStandardMaterial({ map: tex, transparent: true, alphaTest: 0.3, roughness: 0.5, side: THREE.DoubleSide });
  const face = new THREE.Mesh(new THREE.PlaneGeometry(0.92, 0.92), mat); face.position.set(0, 2.72, 0.06); face.castShadow = true; grp.add(face);
  const back = new THREE.Mesh(new THREE.CircleGeometry(0.4, 20), new THREE.MeshStandardMaterial({ color: 0x8a9096, roughness: 0.6, metalness: 0.5 })); back.rotation.y = Math.PI; back.position.set(0, 2.72, 0.05); grp.add(back);
  return grp;
}

// ---------------------------------------------------------------- 长椅靠背广告
export function benchAd(kind) {
  const defs = {
    floatzen: { art: 'moose', bg: '#c9b6ee', bg2: '#a98bd0', lines: [{ t: 'FLOATZEN', color: '#3a2470', size: 1 }] },
    outlet: { art: 'polar', bg: '#bfe3ee', bg2: '#8fc4e0', lines: [{ t: '冰川镇 TUNDRATOWN', color: '#17456a', size: 1 }, { t: '时尚奥莱 FASHION OUTLET', color: '#17456a', size: 1 }, { t: 'cool brands, cheap prices', color: '#2a6a90', size: 0.6 }] },
    lion: { art: 'lion', bg: '#f2b23a', bg2: '#e0812a', lines: [{ t: '狮凯奇', color: '#3a1c08', size: 1 }] },
  };
  const d = defs[kind] || defs.floatzen;
  // 画面在左（约占 1/3），文字在右
  return plaque(d.lines, { w: 1.5, h: 0.42, bg: d.bg, bg2: d.bg2, border: '#ffffff', frame: 0x237a4c, thick: 0.03, night: 0.35, textX: [0.34, 1],
    draw: (g, W, H) => { drawArt(g, d.art, 0, 0, W * 0.36, H, 0.25); } });
}

// ---------------------------------------------------------------- 蓝色木板海报栏
export function posterKiosk() {
  const grp = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: 0x2f6fb8, roughness: 0.8 });
  const board = new THREE.Mesh(new RoundedBoxGeometry(2.6, 2.1, 0.12, 2, 0.03), wood); board.position.y = 1.55; board.castShadow = true; grp.add(board);
  for (const x of [-1.15, 1.15]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.7, 0.12), wood); leg.position.set(x, 1.35, 0); leg.castShadow = true; grp.add(leg); }
  const roof = new THREE.Mesh(new THREE.BoxGeometry(2.9, 0.1, 0.5), new THREE.MeshStandardMaterial({ color: 0x1f4f8a, roughness: 0.7 })); roof.position.y = 2.68; roof.castShadow = true; grp.add(roof);
  const items = [
    [[{ t: '舞虎', size: 1.5 }, { t: 'TIGER DANCING CLUB', size: 0.6 }], '#e0621a', '#8a2a0a', -0.82, 2.0, 'tigers'],
    [[{ t: '牦牛哥', size: 1.1 }, { t: '舶来集市', size: 1.1 }], '#e8b83a', '#b8741a', 0, 2.0, 'bazaar'],
    [[{ t: 'TIKI TIKI TIKI', size: 0.8 }, { t: 'NIGHTS', size: 1.2 }, { t: "TRADER LAMB'S", size: 0.6 }], '#1d6a6a', '#0c3a4a', 0.82, 2.0, 'tiki'],
    [[{ t: 'MEOWANA', size: 1.0 }], '#2a8ac0', '#1a4a8a', -0.82, 1.08, 'cat'],
    [[{ t: 'GAZELLE', size: 1.1 }, { t: '全城疯唱派对', size: 0.8 }], '#7a1fb8', '#d0339a', 0, 1.08, 'concert'],
    [[{ t: '疯狂健身房', size: 1.0 }, { t: 'FITNESS', size: 0.7 }], '#5a9a3c', '#2f6a2a', 0.82, 1.08, 'hamsters'],
  ];
  const lit = [];
  for (const [lines, c1, c2, x, y, art] of items) {
    for (const s of [1, -1]) {
      const p = plaque(lines, { w: 0.72, h: 0.82, bg: c1, bg2: c2, fg: '#fff', textStroke: 'rgba(0,0,0,.75)', border: '#f3ead2', frame: 0x1a3f70, thick: 0.02, night: 0.5, textY: [0.56, 1],
        draw: (g, W, H) => { if (drawArt(g, art, 0, 0, W, H, 0.3)) captionBand(g, W, H, 0.45); } });
      p.position.set(x * s, y, s * 0.075); if (s < 0) p.rotation.y = Math.PI; grp.add(p); lit.push(...p.userData.lit);
    }
  }
  grp.userData.lit = lit;
  return grp;
}

// ---------------------------------------------------------------- 抠像徽记（金色圆牌、象头饰件、圆形挂牌等）
export function emblem(key, size = 1, { metal = 0.5, rough = 0.4, night = 0.25 } = {}) {
  const c = cutTex(key); if (!c) return null;
  const w = c.aspect >= 1 ? size : size * c.aspect, h = c.aspect >= 1 ? size / c.aspect : size;
  const m = new THREE.MeshStandardMaterial({ map: c.tex, alphaTest: 0.5, roughness: rough, metalness: metal, side: THREE.DoubleSide, emissive: 0xffffff, emissiveMap: c.tex, emissiveIntensity: 0 });
  m.userData.lit = [0, night];
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m); mesh.castShadow = true;
  const grp = new THREE.Group(); grp.add(mesh);
  grp.userData.size = [w, h]; grp.userData.lit = [m]; grp.userData.thick = 0.02;
  return grp;
}

// ---------------------------------------------------------------- 骑乘项目海报（青绿边框；主图为冲破冰面的警车，不含角色）
export function ridePoster() {
  return plaque([{ t: '疯狂动物城：热力追踪', size: 1 }, { t: 'ZOOTOPIA: HOT PURSUIT', size: 0.62 }], {
    w: 1.5, h: 2.1, bg: '#0d3a6e', bg2: '#35b6d8', fg: '#fff', textStroke: 'rgba(120,10,10,.9)', border: '#e7f6fb', frame: 0x1f8a80, thick: 0.08, night: 0.9, textY: [0.68, 1], doubleSided: true,
    draw: (g, W, H) => {
      g.fillStyle = 'rgba(255,255,255,.18)'; for (let i = 0; i < 7; i++) { g.beginPath(); g.moveTo(W / 2, H * 0.36); g.lineTo(W * (i / 6) - 40, 0); g.lineTo(W * (i / 6) + 40, 0); g.fill(); }
      drawCut(g, 'cruiser', W * 0.04, H * 0.06, W * 0.92, H * 0.6);
      captionBand(g, W, H, 0.6, '10,20,60', 0.8);
    } });
}

// 把一批招牌的发光材质登记到昼夜切换
export function bindNight(env, mats) {
  env.onChange((e) => { for (const m of mats) { const [d, n] = m.userData.lit || [0, 1]; m.emissiveIntensity = d + (n - d) * e; } });
}
