// 招牌与街景里的画面：Codex 生成的 3×2 插画拼版，题材对应实景。
//   artA / artB / artC：广告插画（方形整幅）
//   artD：窗口居民（洋红底抠像）   artE：门童、徽记、骑乘海报主图（洋红底抠像）
// 画的都是原创的普通动物形象，不是电影里的具名角色；文字由程序另行叠加。
import * as THREE from 'three';

const SHEETS = {
  artA: { keys: ['koala', 'cheetah', 'carrot', 'sahara', 'hero', 'hamsters'] },
  artB: { keys: ['pig', 'moose', 'polar', 'lion', 'llama', 'car'] },
  artC: { keys: ['tigers', 'bazaar', 'tiki', 'cat', 'concert', 'lemmings'] },
  artD: { keys: ['trunk', 'rabbits', 'sloth', 'bear', 'yak', 'wolves'], cut: true },
  artE: { keys: ['doorman', 'shrew', 'elephant', 'giraffeSign', 'otter', 'cruiser'], cut: true },
  artF: { keys: ['leafA', 'leafB', 'conifer', 'camellia', 'flowers', 'agave'], cut: true, green: ['leafA', 'leafB', 'conifer', 'agave'] },
};
export const ART = {};

const loadImg = (url) => new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error('load ' + url)); im.src = url; });
const isKey = (r, g, b) => r > 150 && b > 150 && g < 125 && Math.abs(r - b) < 90 && (r + b) / 2 - g > 70;

// 把一格洋红底的图抠成带透明通道、并裁到内容外接框的画布
// green：这一格画的是纯绿的枝叶（没有粉 / 紫色的东西），可以把所有偏洋红的像素都当背景处理
function cutPanel(img, sx, sy, sw, sh, green = false) {
  const w = Math.round(sw), h = Math.round(sh);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
  const id = g.getImageData(0, 0, w, h), d = id.data;
  let mask = new Uint8Array(w * h).fill(1);
  const st = [];
  const push = (x, y) => { const i = y * w + x; if (mask[i] && isKey(d[i * 4], d[i * 4 + 1], d[i * 4 + 2])) { mask[i] = 0; st.push(i); } };
  for (let x = 0; x < w; x++) { push(x, 0); push(x, h - 1); }
  for (let y = 0; y < h; y++) { push(0, y); push(w - 1, y); }
  while (st.length) { const i = st.pop(), x = i % w, y = (i / w) | 0; if (x > 0) push(x - 1, y); if (x < w - 1) push(x + 1, y); if (y > 0) push(x, y - 1); if (y < h - 1) push(x, y + 1); }
  // 枝叶之间被围住的洋红小空隙与边缘不连通：纯洋红的像素一律抠掉，再向外吃两圈毛边
  for (let i = 0; i < w * h; i++) if (mask[i] && d[i * 4] > 200 && d[i * 4 + 2] > 200 && d[i * 4 + 1] < 90) mask[i] = 0;
  for (let it = 0; it < 2; it++) {
    const m3 = mask.slice();
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) { const i = y * w + x; if (mask[i] && (!mask[i - 1] || !mask[i + 1] || !mask[i - w] || !mask[i + w]) && isKey(d[i * 4], d[i * 4 + 1], d[i * 4 + 2])) m3[i] = 0; }
    mask = m3;
  }
  if (green) {
    // 枝叶缝隙里的洋红常常是和叶子混了色的暗粉、灰紫，上面两道判定都认不出，贴到树上就是叶片边缘的洋红小点。
    // 绿叶和褐色枝条的绿色分量一定不低于红、蓝里较小的那个：凡是「红和蓝都明显高过绿」的像素一律抠掉；
    // 只高一点的（叶缘的反光被染了色）保留，但把红、蓝压回到不超过绿，去掉粉色调。
    for (let i = 0; i < w * h; i++) {
      if (!mask[i]) continue;
      const r = d[i * 4], gg = d[i * 4 + 1], b = d[i * 4 + 2], m = Math.min(r, b) - gg;
      if (m > 22) mask[i] = 0;
      else if (m > 0) { const k = gg / Math.min(r, b); d[i * 4] = r * k; d[i * 4 + 2] = b * k; }
    }
  }
  for (let it = 0; it < 2; it++) {                 // 腐蚀两圈去掉洋红毛边
    const m2 = mask.slice();
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = y * w + x; if (mask[i] && ((x > 0 && !mask[i - 1]) || (x < w - 1 && !mask[i + 1]) || (y > 0 && !mask[i - w]) || (y < h - 1 && !mask[i + w]))) m2[i] = 0; }
    mask = m2;
  }
  let x0 = w, y0 = h, x1 = 0, y1 = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = y * w + x; d[i * 4 + 3] = mask[i] ? 255 : 0; if (mask[i]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } }
  g.putImageData(id, 0, 0);
  if (x1 <= x0 || y1 <= y0) return c;
  const o = document.createElement('canvas'); o.width = x1 - x0 + 1; o.height = y1 - y0 + 1;
  o.getContext('2d').drawImage(c, x0, y0, o.width, o.height, 0, 0, o.width, o.height);
  return o;
}

// 整张洋红底图片 → 带透明通道并裁到内容外接框的画布
export function cutWhole(img, green = false) { return cutPanel(img, 0, 0, img.naturalWidth || img.width, img.naturalHeight || img.height, green); }

export async function loadArt(manifest, TEXDIR = './assets/tex/') {
  await Promise.all(Object.entries(SHEETS).map(async ([sheet, def]) => {
    const file = [sheet + '.webp', sheet + '.png'].find((f) => manifest.includes(f)); if (!file) return;
    try {
      const img = await loadImg(TEXDIR + file);
      const pw = img.naturalWidth / 3, ph = img.naturalHeight / 2, inset = def.cut ? 0.012 : 0.035;      // 去掉分隔线
      def.keys.forEach((k, i) => {
        const sx = (i % 3) * pw + pw * inset, sy = Math.floor(i / 3) * ph + ph * inset, sw = pw * (1 - 2 * inset), sh = ph * (1 - 2 * inset);
        if (def.cut) { const c = cutPanel(img, sx, sy, sw, sh, !!(def.green && def.green.includes(k))); ART[k] = { img: c, sx: 0, sy: 0, sw: c.width, sh: c.height, cut: true }; }
        else ART[k] = { img, sx, sy, sw, sh };
      });
    } catch (e) { console.warn('插画加载失败', sheet, e); }
  }));
}

// 以「铺满裁切」的方式把某幅插画画进 (x, y, w, h)；focusY 0 = 靠上、1 = 靠下。没有该插画时返回 false
export function drawArt(g, key, x, y, w, h, focusY = 0.35) {
  const a = ART[key]; if (!a) return false;
  const r = w / h, ar = a.sw / a.sh;
  let sx = a.sx, sy = a.sy, sw = a.sw, sh = a.sh;
  if (ar > r) { sw = a.sh * r; sx = a.sx + (a.sw - sw) / 2; } else { sh = a.sw / r; sy = a.sy + (a.sh - sh) * focusY; }
  g.drawImage(a.img, sx, sy, sw, sh, x, y, w, h);
  return true;
}

// 把抠像完整地（不裁切）画进 (x, y, w, h) 并居中
export function drawCut(g, key, x, y, w, h) {
  const a = ART[key]; if (!a) return false;
  const s = Math.min(w / a.sw, h / a.sh), dw = a.sw * s, dh = a.sh * s;
  g.drawImage(a.img, a.sx, a.sy, a.sw, a.sh, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
  return true;
}

// 抠像 → 贴图（带透明通道），返回 { tex, aspect }；没有时返回 null
const _tex = {};
export function cutTex(key) {
  const a = ART[key]; if (!a || !a.cut) return null;
  if (!_tex[key]) { const t = new THREE.CanvasTexture(a.img); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; _tex[key] = { tex: t, aspect: a.sw / a.sh }; }
  return _tex[key];
}

// 画面下方压一条渐变暗带，保证叠加的文字清晰
export function captionBand(g, W, H, from = 0.52, color = '0,0,0', alpha = 0.72) {
  const gr = g.createLinearGradient(0, H * from, 0, H);
  gr.addColorStop(0, `rgba(${color},0)`); gr.addColorStop(1, `rgba(${color},${alpha})`);
  g.fillStyle = gr; g.fillRect(0, H * from, W, H * (1 - from));
}
