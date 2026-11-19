// 立面图的逐像素处理（抠洋红底、深度图平滑、法线 / 粗糙度 / 夜景贴图）。
// 只用类型化数组，不碰 DOM 和 three.js，所以既能在 Web Worker 里并行跑（见 facade.worker.js），
// 也能在主线程上当兜底。二十多张两三千像素的大图，原先全在主线程上排队算，占了加载时间的一半以上。

export function isKey(r, g, b) { return r > 150 && b > 150 && g < 125 && Math.abs(r - b) < 90 && (r + b) / 2 - g > 70; }

// 抠掉洋红背景：就地改写 d（RGBA），返回蒙版 Uint8Array(1 = 建筑)。maskFrom = { mask, w, h } 时复用已有蒙版。
export function keyOutPix(d, w, h, maskFrom = null) {
  let mask;
  if (maskFrom && maskFrom.w === w && maskFrom.h === h) {
    mask = maskFrom.mask;
  } else if (maskFrom) {            // 尺寸不同（白天图已高清化）：把白天的蒙版按比例取样过来
    mask = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) { const sy = Math.min(maskFrom.h - 1, Math.floor((y + 0.5) * maskFrom.h / h)) * maskFrom.w; for (let x = 0; x < w; x++) mask[y * w + x] = maskFrom.mask[sy + Math.min(maskFrom.w - 1, Math.floor((x + 0.5) * maskFrom.w / w))]; }
  } else {
    mask = new Uint8Array(w * h).fill(1);
    // 从上/左/右边缘泛洪
    const stack = [];
    const push = (x, y) => { const i = y * w + x; if (mask[i] && isKey(d[i * 4], d[i * 4 + 1], d[i * 4 + 2])) { mask[i] = 0; stack.push(i); } };
    for (let x = 0; x < w; x++) push(x, 0);
    for (let y = 0; y < h; y++) { push(0, y); push(w - 1, y); }
    while (stack.length) {
      const i = stack.pop(), x = i % w, y = (i / w) | 0;
      if (x > 0) push(x - 1, y); if (x < w - 1) push(x + 1, y);
      if (y > 0) push(x, y - 1); if (y < h - 1) push(x, y + 1);
    }
    // 腐蚀 2 像素去掉洋红毛边
    for (let it = 0; it < 2; it++) {
      const m2 = mask.slice();
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = y * w + x; if (!mask[i]) continue;
        if ((x > 0 && !mask[i - 1]) || (x < w - 1 && !mask[i + 1]) || (y > 0 && !mask[i - w]) || (y < h - 1 && !mask[i + w])) m2[i] = 0;
      }
      mask = m2;
    }
  }
  // 建筑内部被围住的洋红（比如小摊棚子里透出的背景）不与边缘连通，泛洪抠不到：涂成暗色，当作棚内阴影
  if (!maskFrom) {
    const hole = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) if (mask[i] && d[i * 4] > 215 && d[i * 4 + 2] > 215 && d[i * 4 + 1] < 70) hole[i] = 1;
    for (let it = 0; it < 3; it++) {              // 向外扩 3 圈，吃掉洋红毛边
      const h2 = hole.slice();
      for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) { const i = y * w + x; if (!hole[i] && mask[i] && (hole[i - 1] || hole[i + 1] || hole[i - w] || hole[i + w]) && isKey(d[i * 4], d[i * 4 + 1], d[i * 4 + 2])) h2[i] = 1; }
      hole.set(h2);
    }
    for (let i = 0; i < w * h; i++) if (hole[i]) { d[i * 4] = 52; d[i * 4 + 1] = 40; d[i * 4 + 2] = 58; }
  }
  // 被抠掉的像素：用同列下方最近的建筑像素颜色填充（轮廓由几何裁切，这里只为避免毛边露色）
  for (let x = 0; x < w; x++) {
    let lr = 120, lg = 110, lb = 100, have = false;
    for (let y = h - 1; y >= 0; y--) {
      const i = y * w + x, k = i * 4;
      if (mask[i]) { lr = d[k]; lg = d[k + 1]; lb = d[k + 2]; have = true; }
      else if (have) { d[k] = lr; d[k + 1] = lg; d[k + 2] = lb; }
      else { d[k] = 120; d[k + 1] = 110; d[k + 2] = 100; }
      d[k + 3] = 255;
    }
  }
  return mask;
}

// 亮度 → 法线贴图（半分辨率 RGBA），让砖缝、线脚在光照下有起伏
export function normalPix(data, w, h, strength = 2.2, depth = null) {
  const W = w >> 1, H = h >> 1;
  const L = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let s = 0;
    for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
      const k = ((y * 2 + dy) * w + x * 2 + dx) * 4;
      s += 0.299 * data[k] + 0.587 * data[k + 1] + 0.114 * data[k + 2];
    }
    L[y * W + x] = s / (4 * 255);
  }
  if (depth && depth.w === W && depth.h === H) for (let i = 0; i < W * H; i++) L[i] = L[i] * 0.45 + (depth.fine || depth.data)[i] * 1.0;   // 深度图提供大起伏，亮度提供砖缝等细节
  const o = new Uint8ClampedArray(W * H * 4);
  const at = (x, y) => L[Math.min(H - 1, Math.max(0, y)) * W + Math.min(W - 1, Math.max(0, x))];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const dx = (at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1)) - (at(x - 1, y - 1) + 2 * at(x - 1, y) + at(x - 1, y + 1));
    const dy = (at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1)) - (at(x - 1, y - 1) + 2 * at(x, y - 1) + at(x + 1, y - 1));
    let nx = -dx * strength, ny = dy * strength, nz = 1;
    const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
    const k = (y * W + x) * 4;
    o[k] = (nx * 0.5 + 0.5) * 255; o[k + 1] = (ny * 0.5 + 0.5) * 255; o[k + 2] = (nz * 0.5 + 0.5) * 255; o[k + 3] = 255;
  }
  return { data: o, w: W, h: H };
}

// 没有夜景图时的兜底：把玻璃（偏蓝/偏暗的窗洞）变成暖色窗光
export function fakeNightPix(data, w, h) {
  const o = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const k = i * 4, r = data[k] / 255, gg = data[k + 1] / 255, b = data[k + 2] / 255;
    const lum = 0.299 * r + 0.587 * gg + 0.114 * b;
    const mx = Math.max(r, gg, b), mn = Math.min(r, gg, b), sat = mx - mn;
    const glassy = (b >= r && b >= gg * 0.92 && sat > 0.06 && lum < 0.72) ? 1 : 0;
    const base = 0.1;
    if (glassy) { const q = 0.35 + lum * 0.55; o[k] = 255 * 0.95 * q; o[k + 1] = 255 * 0.7 * q; o[k + 2] = 255 * 0.34 * q; }
    else { o[k] = 255 * r * base * 0.75; o[k + 1] = 255 * gg * base * 0.8; o[k + 2] = 255 * Math.min(1, b * base * 1.5 + 0.02); }
    o[k + 3] = 255;
  }
  return o;
}

// 一张立面图的全部像素活。getPixels(url, W?, H?) → { data: Uint8ClampedArray, w, h }（解码，可选缩放）
// 返回 { result, transfer }：result 里全是类型化数组，transfer 是可以零拷贝交给主线程的缓冲区列表。
export async function processSheet({ url, nightUrl = null, depthUrl = null, maxW = 0 }, getPixels) {
  const img = await getPixels(url, 0, 0, maxW);
  const w = img.w, h = img.h, d = img.data;
  const mask = keyOutPix(d, w, h);
  // 轮廓：每列最高的建筑像素
  const cols = 512, top = new Float32Array(cols);
  for (let cI = 0; cI < cols; cI++) {
    const x0 = Math.floor((cI / cols) * w), x1 = Math.max(x0 + 1, Math.floor(((cI + 1) / cols) * w));
    let best = h;
    for (let x = x0; x < x1; x++) for (let y = 0; y < best; y++) if (mask[y * w + x]) { best = y; break; }
    top[cI] = 1 - best / h;
  }
  // 深度图（Codex 由白天图转出的灰度浮雕图）：白 = 凸出，中灰 = 墙面，黑 = 凹进
  let depth = null;
  if (depthUrl) {
    try {
      const DW = w >> 1, DH = h >> 1;
      const dd = (await getPixels(depthUrl, DW, DH)).data;
      const raw = new Float32Array(DW * DH);
      for (let i = 0; i < DW * DH; i++) raw[i] = (0.299 * dd[i * 4] + 0.587 * dd[i * 4 + 1] + 0.114 * dd[i * 4 + 2]) / 255;
      // 轻微模糊，去掉生成图里的噪点台阶
      let bl = raw, fine = null;
      for (let pass = 0; pass < 6; pass++) {              // 细节层（2 遍）给法线贴图用；几何层（6 遍，约 5 厘米）与 10 厘米网格匹配，避免藤叶砖缝变成乱凸的毛刺
        const src = bl, out = new Float32Array(DW * DH);
        for (let y = 0; y < DH; y++) for (let x = 0; x < DW; x++) {
          let a = 0, n = 0;
          for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= DW || yy >= DH) continue; a += src[yy * DW + xx]; n++; }
          out[y * DW + x] = a / n;
        }
        bl = out;
        if (pass === 1) fine = out;
      }
      // 墙面基准 = 建筑范围内灰度的中位数
      const hist = new Uint32Array(256); let cnt = 0;
      for (let y = 0; y < DH; y++) for (let x = 0; x < DW; x++) if (mask[(y * 2) * w + x * 2]) { hist[Math.min(255, (bl[y * DW + x] * 255) | 0)]++; cnt++; }
      let acc = 0, wall = 0.5; for (let i = 0; i < 256; i++) { acc += hist[i]; if (acc >= cnt / 2) { wall = i / 255; break; } }
      depth = { data: bl, fine, w: DW, h: DH, wall };
    } catch (e) { depth = null; }
  }
  // 轻度锐化（反遮罩），近看更清晰（高清化过的图本身已经够锐，跳过）。只用于贴图本身，d 保持原样给法线等用
  let texData = null;
  if (w <= 1600 && h <= 1600) {
    texData = new Uint8ClampedArray(d);
    const amt = 0.55;
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      const i = (y * w + x) * 4;
      for (let c = 0; c < 3; c++) {
        const bl = (d[i + c - 4] + d[i + c + 4] + d[i + c - w * 4] + d[i + c + w * 4]) * 0.25;
        texData[i + c] = d[i + c] + (d[i + c] - bl) * amt;       // Uint8ClampedArray 自动夹到 0..255
      }
    }
  }
  const normal = normalPix(d, w, h, depth ? 2.6 : 2.2, depth);
  // 粗糙度：明显凹进的部位（窗玻璃、门扇）更光滑，能映出天空
  let rough = null;
  if (depth) {
    const D = depth, ro = new Uint8ClampedArray(D.w * D.h * 4);
    for (let i = 0; i < D.w * D.h; i++) {
      const x = (i % D.w) * 2, y = ((i / D.w) | 0) * 2, p = (y * w + x) * 4;
      const lum = (0.299 * d[p] + 0.587 * d[p + 1] + 0.114 * d[p + 2]) / 255;
      const rec = Math.min(1, Math.max(0, (D.wall - 0.1 - D.data[i]) / 0.12));          // 0 墙面 → 1 深凹
      const glass = rec * (lum < 0.78 ? 1 : 0.4);
      const r = 0.86 - glass * 0.68;
      ro[i * 4] = 255; ro[i * 4 + 1] = r * 255; ro[i * 4 + 2] = 0; ro[i * 4 + 3] = 255;
    }
    rough = ro;
  }
  // 平均色（给侧墙/屋顶用）
  let r = 0, g = 0, b = 0, n = 0;
  for (let i = 0; i < mask.length; i += 97) if (mask[i]) { r += d[i * 4]; g += d[i * 4 + 1]; b += d[i * 4 + 2]; n++; }
  const avg = n ? [r / n / 255, g / n / 255, b / n / 255] : [0.5, 0.5, 0.5];
  // 夜景
  let night = null, nw = w, nh = h;
  if (nightUrl) {
    try {
      const ni = await getPixels(nightUrl, 0, 0, maxW);
      const d2 = ni.data; nw = ni.w; nh = ni.h;
      keyOutPix(d2, nw, nh, { mask, w, h });          // 复用白天的蒙版（夜景图墙面带洋红光，不能再按颜色抠）
      // 压暗墙面、保留窗光与灯带：亮度越低压得越狠
      for (let i = 0; i < d2.length; i += 4) {
        const l = (0.299 * d2[i] + 0.587 * d2[i + 1] + 0.114 * d2[i + 2]) / 255;
        const t = Math.min(1, Math.max(0, (l - 0.3) / 0.5)), f = 0.4 + 0.6 * t * t * (3 - 2 * t);
        d2[i] *= f; d2[i + 1] *= f; d2[i + 2] *= f;
      }
      night = d2;
    } catch (e) { night = null; }
  }
  if (!night) { night = fakeNightPix(d, w, h); nw = w; nh = h; }
  const result = { w, h, data: d, texData, mask, top, cols, depth, normal, rough, avg, night, nw, nh };
  const transfer = [d.buffer, mask.buffer, top.buffer, normal.data.buffer, night.buffer];
  if (texData) transfer.push(texData.buffer);
  if (rough) transfer.push(rough.buffer);
  if (depth) { transfer.push(depth.data.buffer); if (depth.fine && depth.fine !== depth.data) transfer.push(depth.fine.buffer); }
  return { result, transfer };
}
