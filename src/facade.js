// 立面管线：Codex 生成的「正立面 + 洋红底」图片 → 抠底 → 轮廓线 → 拉伸成有体积的建筑块
import * as THREE from 'three';
import { canvas } from './util.js';
import { processSheet } from './facade-pix.js';

const loadImg = (url) => new Promise((res, rej) => {
  const im = new Image();
  im.onload = () => res(im); im.onerror = () => rej(new Error('load ' + url));
  im.src = url;
});


// 亮度 → 法线贴图（半分辨率），让砖缝、线脚在光照下有起伏
function normalFrom(data, w, h, strength = 2.2, depth = null) {
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
  if (depth && depth.w === W && depth.h === H) for (let i = 0; i < W * H; i++) L[i] = L[i] * 0.45 + (depth.fine || depth.data)[i] * 1.6;   // 深度图提供大起伏，亮度提供砖缝等细节
  const c = canvas(W, H);
  const g = c.getContext('2d'), id = g.createImageData(W, H), o = id.data;
  const at = (x, y) => L[Math.min(H - 1, Math.max(0, y)) * W + Math.min(W - 1, Math.max(0, x))];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const dx = (at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1)) - (at(x - 1, y - 1) + 2 * at(x - 1, y) + at(x - 1, y + 1));
    const dy = (at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1)) - (at(x - 1, y - 1) + 2 * at(x, y - 1) + at(x + 1, y - 1));
    let nx = -dx * strength, ny = dy * strength, nz = 1;
    const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
    const k = (y * W + x) * 4;
    o[k] = (nx * 0.5 + 0.5) * 255; o[k + 1] = (ny * 0.5 + 0.5) * 255; o[k + 2] = (nz * 0.5 + 0.5) * 255; o[k + 3] = 255;
  }
  g.putImageData(id, 0, 0);
  return c;
}

// 任意画布 → 法线贴图（给地面、岩石用）
export function normalCanvas(c, strength = 2.5) {
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  return normalFrom(d, c.width, c.height, strength);
}

function simplify(pts, eps) {            // Douglas–Peucker
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const st = [[0, pts.length - 1]];
  while (st.length) {
    const [a, b] = st.pop();
    let md = 0, mi = -1;
    const ax = pts[a][0], ay = pts[a][1], bx = pts[b][0], by = pts[b][1];
    const L = Math.hypot(bx - ax, by - ay) || 1e-9;
    for (let i = a + 1; i < b; i++) {
      const dd = Math.abs((bx - ax) * (ay - pts[i][1]) - (ax - pts[i][0]) * (by - ay)) / L;
      if (dd > md) { md = dd; mi = i; }
    }
    if (md > eps) { keep[mi] = 1; st.push([a, mi], [mi, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}

// 近看用的细节颗粒：一张可平铺的灰泥噪声，按约 0.5 米一格叠在立面贴图上，弥补生成图分辨率（约 77 像素/米）的不足
let _detail = null;
function detailTex() {
  if (_detail) return _detail;
  const S = 256, c = canvas(S, S), g = c.getContext("2d"), id = g.createImageData(S, S), o = id.data;
  let seed = 1234567; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const base = new Float32Array(S * S); for (let i = 0; i < S * S; i++) base[i] = rnd();
  const at = (x, y) => base[((y + S) % S) * S + ((x + S) % S)];
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    // 细颗粒 + 稍大的斑驳（可无缝平铺）
    const fine = at(x, y);
    let mid = 0; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) mid += at(x + dx, y + dy); mid /= 25;
    let big = 0; for (let dy = -8; dy <= 8; dy += 4) for (let dx = -8; dx <= 8; dx += 4) big += at((x + dx) >> 3 << 3, (y + dy) >> 3 << 3); big /= 25;
    const v = Math.max(0, Math.min(1, 0.5 + (fine - 0.5) * 0.5 + (mid - 0.5) * 1.6 + (big - 0.5) * 0.9));
    const k = (y * S + x) * 4; o[k] = o[k + 1] = o[k + 2] = v * 255; o[k + 3] = 255;
  }
  g.putImageData(id, 0, 0);
  _detail = new THREE.CanvasTexture(c); _detail.wrapS = _detail.wrapT = THREE.RepeatWrapping; _detail.anisotropy = 8;
  return _detail;
}
function addDetail(mat, repU, repV) {
  mat.userData.train = { value: new THREE.Vector4(-9, 0, 0, 1) };
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.tDetail = { value: detailTex() };
    sh.uniforms.uDetailRep = { value: new THREE.Vector2(repU, repV) };
    sh.uniforms.uTrain = mat.userData.train;          // (车头位置 u, 强度, v 下限, v 上限)：列车灯光从窗后扫过
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D tDetail; uniform vec2 uDetailRep; uniform vec4 uTrain;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  { float tb = smoothstep(uTrain.x - 0.78, uTrain.x - 0.62, vMapUv.x) * (1.0 - smoothstep(uTrain.x - 0.06, uTrain.x, vMapUv.x)); float win = 0.3 + 0.7 * step(0.4, fract((vMapUv.x - uTrain.x) * 15.0)); float bd = step(uTrain.z, vMapUv.y) * step(vMapUv.y, uTrain.w); totalEmissiveRadiance += texture2D(emissiveMap, vEmissiveMapUv).rgb * (tb * win * bd * uTrain.y); }')
      .replace('#include <map_fragment>', '#include <map_fragment>\n  { float dt = texture2D(tDetail, vMapUv * uDetailRep).g; diffuseColor.rgb *= 0.9 + 0.2 * dt; }');
  };
  mat.customProgramCacheKey = () => "facade-detail";
}

// ---- Worker 池：几张图同时算（核数 - 1，最多 6 个）。Worker 起不来或中途出错时，退回主线程逐张算
const absUrl = (u) => new URL(u, location.href).href;
const pixCanvas = (data, w, h) => { const c = canvas(w, h); c.getContext('2d').putImageData(new ImageData(data, w, h), 0, 0); return c; };
async function mainPixels(url, W, H, maxW = 0) {
  const im = await loadImg(url);
  let w = W || im.naturalWidth, h = H || im.naturalHeight;
  if (!W && maxW && w > maxW) { h = Math.round((h * maxW) / w); w = maxW; W = w; }
  const c = canvas(w, h, (g) => { if (W) g.imageSmoothingQuality = 'high'; g.drawImage(im, 0, 0, w, h); });
  return { data: c.getContext('2d').getImageData(0, 0, w, h).data, w, h };
}
let _pool = null;
function getPool() {
  if (_pool) return _pool;
  _pool = { workers: [], idle: [], queue: [], jobs: new Map(), seq: 0, dead: false };
  try {
    if (typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined') throw new Error('no worker');
    const n = Math.max(1, Math.min(6, (navigator.hardwareConcurrency || 4) - 1));
    for (let i = 0; i < n; i++) {
      const w = new Worker(new URL('./facade.worker.js', import.meta.url), { type: 'module' });
      w.onmessage = (e) => {
        const j = _pool.jobs.get(e.data.id); _pool.jobs.delete(e.data.id);
        if (j) { if (e.data.error) j.rej(new Error(e.data.error)); else j.res(e.data.result); }
        _pool.idle.push(w); pump();
      };
      w.onerror = () => {                      // 这个 Worker 废了：它手上的活交回主线程
        _pool.workers = _pool.workers.filter((x) => x !== w); _pool.idle = _pool.idle.filter((x) => x !== w);
        for (const [id, j] of _pool.jobs) if (j.w === w) { _pool.jobs.delete(id); j.rej(new Error('worker error')); }
        if (!_pool.workers.length) { _pool.dead = true; pump(); }
      };
      _pool.workers.push(w); _pool.idle.push(w);
    }
  } catch (e) { _pool.dead = true; }
  return _pool;
}
function pump() {
  const p = _pool;
  while (p.queue.length && (p.dead || p.idle.length)) {
    const j = p.queue.shift();
    if (p.dead) { j.rej(new Error('no worker')); continue; }
    const w = p.idle.pop(); j.w = w; const id = ++p.seq; p.jobs.set(id, j);
    w.postMessage({ id, job: j.job });
  }
}
function runSheetJob(job) {
  const p = getPool();
  return new Promise((res, rej) => { p.queue.push({ job, res, rej }); pump(); })
    .catch(async () => (await processSheet(job, mainPixels)).result);       // 兜底：主线程
}
export function closeFacadeWorkers() { if (_pool) { for (const w of _pool.workers) w.terminate(); _pool = null; } }

export class FacadeSheet {
  constructor(name) { this.name = name; this.pieces = []; }

  static async load(name, url, nightUrl = null, { aniso = 16, depthUrl = null, maxW = 0 } = {}) {
    const s = new FacadeSheet(name);
    // 像素处理（抠底、深度平滑、法线、粗糙度、夜景）在 Worker 里并行做，这里只把结果装成贴图
    const R = await runSheetJob({ url: absUrl(url), nightUrl: nightUrl && absUrl(nightUrl), depthUrl: depthUrl && absUrl(depthUrl), maxW });
    const k = { c: pixCanvas(R.texData || R.data, R.w, R.h), mask: R.mask, w: R.w, h: R.h, data: R.data };
    s.w = k.w; s.h = k.h;
    s.cols = R.cols; s.top = R.top;
    s.depth = R.depth;
    s.tex = new THREE.CanvasTexture(k.c); s.tex.colorSpace = THREE.SRGBColorSpace; s.tex.anisotropy = aniso;
    s.normal = new THREE.CanvasTexture(pixCanvas(R.normal.data, R.normal.w, R.normal.h)); s.normal.anisotropy = 8;
    s.rough = null;
    if (R.rough) { s.rough = new THREE.CanvasTexture(pixCanvas(R.rough, R.depth.w, R.depth.h)); s.rough.anisotropy = 4; }
    s.avg = new THREE.Color().setRGB(R.avg[0], R.avg[1], R.avg[2], THREE.SRGBColorSpace);
    s.k = k;
    s.night = new THREE.CanvasTexture(pixCanvas(R.night, R.nw, R.nh)); s.night.colorSpace = THREE.SRGBColorSpace; s.night.anisotropy = aniso;
    s.mat = new THREE.MeshStandardMaterial({
      map: s.tex, normalMap: s.normal, normalScale: new THREE.Vector2(0.9, 0.9), roughness: s.rough ? 1.0 : 0.82, roughnessMap: s.rough, metalness: 0.0,
      emissive: 0xffffff, emissiveMap: s.night, emissiveIntensity: 0,
    });
    addDetail(s.mat, 27 * (k.w / k.h), 27);
    return s;
  }

  // 某一列像素的平均颜色（取 v 高度处），用来给该段侧墙上色
  colorAt(u, v = 0.45) {
    const k = this.k, x = Math.min(k.w - 1, Math.max(0, Math.round(u * k.w))), y = Math.min(k.h - 1, Math.max(0, Math.round((1 - v) * k.h)));
    let r = 0, g = 0, b = 0, n = 0;
    for (let dy = -6; dy <= 6; dy += 3) for (let dx = -6; dx <= 6; dx += 3) {
      const xx = Math.min(k.w - 1, Math.max(0, x + dx)), yy = Math.min(k.h - 1, Math.max(0, y + dy)), i = (yy * k.w + xx) * 4;
      r += k.data[i]; g += k.data[i + 1]; b += k.data[i + 2]; n++;
    }
    return new THREE.Color().setRGB(r / n / 255, g / n / 255, b / n / 255, THREE.SRGBColorSpace);
  }

  // 取图中 [u0,u1] 一段，做成宽 width(米) 的建筑块；高度按图片比例换算（可用 hScale 微调）
  // 局部坐标：x 0→width 沿立面自左向右，y 向上，立面在 z=0 朝 +Z，体量向 -Z 延伸 depth
  // cap：体量只拉伸到图高的 cap 比例，其上的细长构件（尖顶、鹿角、屋顶广告牌、棕榈）改用镂空卡片
  // auto：自动裁掉两侧空白列
  piece({ u0 = 0, u1 = 1, width, depth = 5, hScale = 1, sideColor = null, cap = null, auto = false, noCard = false, reliefScale = 1, cell = 0.12, bodyless = false, taper = true }) {
    if (auto) {
      let a = Math.floor(u0 * this.cols), b = Math.ceil(u1 * this.cols) - 1;
      while (a < b && this.top[a] < 0.04) a++;
      while (b > a && this.top[b] < 0.04) b--;
      u0 = a / this.cols; u1 = (b + 1) / this.cols;
    }
    const pxW = (u1 - u0) * this.w;
    const H = (width * this.h) / pxW * hScale;       // 整张图高对应的米数
    const c0 = Math.max(0, Math.floor(u0 * this.cols)), c1 = Math.min(this.cols, Math.ceil(u1 * this.cols));
    let prof = [], vmax = 0;
    for (let c = c0; c < c1; c++) {
      const u = (c + 0.5) / this.cols;
      vmax = Math.max(vmax, this.top[c]);
      const v = cap != null ? Math.min(this.top[c], cap) : this.top[c];
      prof.push([((u - u0) / (u1 - u0)) * width, Math.max(0.02, v) * H]);
    }
    prof[0][0] = 0; prof[prof.length - 1][0] = width;
    prof = simplify(prof, 0.05);
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    for (const p of prof) shape.lineTo(p[0], p[1]);
    shape.lineTo(width, 0); shape.closePath();
    const uOf = (x) => u0 + (x / width) * (u1 - u0), vOf = (y) => y / H;
    const UV = {
      generateTopUV: (geo, v, a, b, c) => [a, b, c].map((i) => new THREE.Vector2(uOf(v[i * 3]), vOf(v[i * 3 + 1]))),
      generateSideWallUV: () => [new THREE.Vector2(), new THREE.Vector2(), new THREE.Vector2(), new THREE.Vector2()],
    };
    const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, UVGenerator: UV, curveSegments: 1 });
    geo.translate(0, 0, -depth);
    // 体量向后收窄（俯视呈梯形）：转角处相邻立面的侧墙就不会顶到对方立面前面来
    {
      const m = taper ? Math.min(depth * 0.47, width * 0.4) : 0, pos = geo.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const z = pos.getZ(i); if (z > -1e-3) continue;
        const x = pos.getX(i), t = -z / depth;
        pos.setX(i, x + (width / 2 - x) * ((2 * m) / width) * t);
      }
      geo.computeVertexNormals();
    }
    let sc = sideColor;
    if (!sc) {       // 侧墙 / 屋顶颜色：在该段立面上多点取样求平均，避免正好采到窗洞
      sc = new THREE.Color(0, 0, 0); let n = 0;
      for (const fu of [0.25, 0.5, 0.75]) for (const fv of [0.25, 0.45, 0.65]) {
        const u = u0 + (u1 - u0) * fu; if (this.top[Math.min(this.cols - 1, Math.floor(u * this.cols))] < fv + 0.05) continue;
        sc.add(this.colorAt(u, fv)); n++;
      }
      if (n) sc.multiplyScalar(0.95 / n); else sc = this.avg.clone();
    }
    const side = new THREE.MeshStandardMaterial({ color: sc, roughness: 0.9 });
    const mesh = new THREE.Mesh(geo, [this.mat, side]);
    mesh.castShadow = mesh.receiveShadow = true;
    const grp = new THREE.Group();
    if (!bodyless) grp.add(mesh);
    if (this.depth) grp.add(this.relief(u0, u1, width, H, cap, reliefScale, cell));
    grp.userData.height = vmax * H;
    grp.userData.bodyH = Math.max(...prof.map((p) => p[1]));
    grp.userData.H = H; grp.userData.width = width; grp.userData.u0 = u0; grp.userData.u1 = u1;
    if (cap != null && vmax > cap + 0.01 && !noCard) {
      const ch = (vmax - cap) * H;
      const pg = new THREE.PlaneGeometry(width, ch);
      const uv = pg.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) * (u1 - u0), cap + uv.getY(i) * (vmax - cap));
      const card = new THREE.Mesh(pg, this.cardMat());
      card.position.set(width / 2, cap * H + ch / 2, -Math.min(0.8, depth * 0.2));
      card.castShadow = true;
      grp.add(card);
    }
    return grp;
  }

  // 按深度图把立面做成真实起伏的浮雕网格（约 10 厘米一格）：雨棚、阳台、线脚凸出，窗洞门洞凹进
  // rs：起伏幅度的缩放（小摊这类小体块用小一些）；cell：网格边长（米）
  relief(u0, u1, width, H, cap, rs = 1, cell = 0.12) {
    const D = this.depth, Z0 = 0.3 * rs, K = 1.15 * rs, ZMAX = 1.05 * rs;
    const nx = Math.max(8, Math.min(320, Math.round(width / cell)));
    const topAt = (u) => {
      const f = u * this.cols - 0.5, i0 = Math.max(0, Math.min(this.cols - 1, Math.floor(f))), i1 = Math.min(this.cols - 1, i0 + 1), t = Math.max(0, Math.min(1, f - i0));
      let v = this.top[i0] * (1 - t) + this.top[i1] * t;
      if (cap != null) v = Math.min(v, cap);
      return Math.max(0.02, v);
    };
    // 取深度时按网格的大小做面积平均（积分图，O(1)），而不是在一个点上取值。
    // 网格一格约 10 厘米，深度图一个像素不到 1 厘米：逐点取样会把窗框、衣架、灯臂这些比一格还窄的东西
    // 采成忽高忽低的锯齿，贴图被拉到这些小台阶上，近看就是「扭曲、融化」的观感。
    // 面积平均之后，网格只表达雨棚、阳台、门窗洞这类一格以上的大起伏，细节留给法线贴图。
    const I = this._sat(), IW = D.w + 1;
    const box = (u, v, ru, rv) => {
      const x0 = Math.max(0, Math.min(D.w - 1, Math.round((u - ru) * D.w))), x1 = Math.max(x0 + 1, Math.min(D.w, Math.round((u + ru) * D.w)));
      const y0 = Math.max(0, Math.min(D.h - 1, Math.round((1 - v - rv) * D.h))), y1 = Math.max(y0 + 1, Math.min(D.h, Math.round((1 - v + rv) * D.h)));
      const a = y0 * IW + x0, b = y0 * IW + x1, c = y1 * IW + x0, d = y1 * IW + x1;
      const m = I.m[d] - I.m[b] - I.m[c] + I.m[a];                 // 只统计建筑范围内的像素，轮廓边上不被背景拉低
      return m > 0.5 ? (I.d[d] - I.d[b] - I.d[c] + I.d[a]) / m : D.wall;
    };
    let RU = 0, RV = 0;
    const sample = (u, v) => {
      const s = 0.5 * box(u, v, RU, RV) + 0.5 * box(u, v, RU * 2, RV * 2), dz = s - D.wall, a = Math.abs(dz);
      return D.wall + (a < 0.02 ? 0 : Math.sign(dz) * (a - 0.02));  // 墙面附近的微小起伏归零：平墙就是平的
    };
    let vTop = 0; for (let i = 0; i <= nx; i++) vTop = Math.max(vTop, topAt(u0 + (i / nx) * (u1 - u0)));
    const ny = Math.max(8, Math.min(240, Math.round((vTop * H) / cell)));
    RU = (0.7 * (u1 - u0)) / nx; RV = (0.7 * vTop) / ny;
    const pos = new Float32Array((nx + 1) * (ny + 1) * 3), uv = new Float32Array((nx + 1) * (ny + 1) * 2);
    for (let i = 0; i <= nx; i++) {
      const u = u0 + (i / nx) * (u1 - u0), x = (i / nx) * width, vt = topAt(u);
      for (let j = 0; j <= ny; j++) {
        const v = (j / ny) * vt, p = i * (ny + 1) + j;
        let z = Z0 + (sample(u, v) - D.wall) * K;
        z = Math.max(0.03 * rs, Math.min(ZMAX, z));
        const edge = Math.min(i, nx - i, ny - j);                 // 左右两端和顶边收回墙面，封住缝隙
        if (edge === 0) z = 0; else if (edge === 1) z *= 0.6;
        pos[p * 3] = x; pos[p * 3 + 1] = v * H; pos[p * 3 + 2] = z;
        uv[p * 2] = u; uv[p * 2 + 1] = v;
      }
    }
    const idx = new Uint32Array(nx * ny * 6); let q = 0;
    for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
      const a = i * (ny + 1) + j, b = a + (ny + 1), c = a + 1, d = b + 1;
      idx[q++] = a; idx[q++] = b; idx[q++] = c; idx[q++] = c; idx[q++] = b; idx[q++] = d;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, this.mat);
    m.castShadow = m.receiveShadow = true;
    return m;
  }

  // 深度图的积分图（d：深度之和，m：建筑范围内的像素数）。只在建模时用，建完由 freeSat() 释放
  _sat() {
    if (this._I) return this._I;
    const D = this.depth, k = this.k, W = D.w + 1, d = new Float64Array(W * (D.h + 1)), m = new Float32Array(W * (D.h + 1));
    const sx = k.w / D.w, sy = k.h / D.h;
    for (let y = 0; y < D.h; y++) {
      let rd = 0, rm = 0; const my = Math.min(k.h - 1, Math.floor(y * sy)) * k.w;
      for (let x = 0; x < D.w; x++) {
        if (k.mask[my + Math.min(k.w - 1, Math.floor(x * sx))]) { rd += D.data[y * D.w + x]; rm++; }
        d[(y + 1) * W + x + 1] = d[y * W + x + 1] + rd; m[(y + 1) * W + x + 1] = m[y * W + x + 1] + rm;
      }
    }
    return (this._I = { d, m });
  }
  freeSat() { this._I = null; }

  // 某块区域（u、v 范围）内浮雕凸出的最大距离，用来把招牌挂在浮雕外面
  reliefMaxZ(uA, uB, vA, vB) {
    if (!this.depth) return 0;
    const D = this.depth; let m = 0;
    for (let i = 0; i <= 8; i++) for (let j = 0; j <= 4; j++) {
      const u = uA + (uB - uA) * (i / 8), v = vA + (vB - vA) * (j / 4);
      const x = Math.max(0, Math.min(D.w - 1, Math.round(u * D.w))), y = Math.max(0, Math.min(D.h - 1, Math.round((1 - v) * D.h)));
      m = Math.max(m, 0.3 + (D.data[y * D.w + x] - D.wall) * 1.3);
    }
    return Math.max(0, Math.min(1.05, m));
  }

  cardMat() {
    if (this._card) return this._card;
    const k = this.k;
    const c = canvas(k.w, k.h, (g) => g.drawImage(this.tex.image, 0, 0));
    const g = c.getContext('2d'), id = g.getImageData(0, 0, k.w, k.h);
    for (let i = 0; i < k.mask.length; i++) id.data[i * 4 + 3] = k.mask[i] ? 255 : 0;
    g.putImageData(id, 0, 0);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
    this._card = new THREE.MeshStandardMaterial({
      map: t, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.85,
      emissive: 0xffffff, emissiveMap: this.night, emissiveIntensity: 0,
    });
    return this._card;
  }

  setNight(e) {
    this.mat.emissiveIntensity = e * 1.0;
    const c = 1 - e * 0.55;
    this.mat.color.setRGB(c, c, c);
    if (this._card) { this._card.emissiveIntensity = e; this._card.color.setRGB(c, c, c); }
  }
}

// 把一块立面（只含浮雕皮，bodyless）绕半径 R 的竖直圆柱弯过去：原来沿 x 的宽度变成弧长，z 变成径向外凸。
// 弯完后局部原点就是圆柱轴心，θ = 0 朝 +Z。
export function bendAround(group, R, width) {
  group.traverse((o) => {
    if (!o.isMesh) return;
    const p = o.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const th = (p.getX(i) + o.position.x - width / 2) / R, r = R + p.getZ(i) + o.position.z;
      p.setXYZ(i, r * Math.sin(th), p.getY(i) + o.position.y, r * Math.cos(th));
    }
    o.position.set(0, 0, 0); p.needsUpdate = true; o.geometry.computeVertexNormals(); o.geometry.computeBoundingSphere(); o.geometry.computeBoundingBox();
  });
  return group;
}

// 把建筑块放到平面线段 A→B 上（面向街道的人看：A 在左、B 在右）
export function placeAB(mesh, A, B, y = 0) {
  const dx = B[0] - A[0], dy = B[1] - A[1];
  mesh.position.set(A[0], y, -A[1]);
  mesh.rotation.y = Math.atan2(dy, dx);        // 世界 Z = -平面 y
  return mesh;
}
