// 远景：园区正南约 313 米的城堡（从疯狂动物城看到的是它的背面）和园区外围的树林。
// 城堡是一张生成的背立面图（castle.png，夜景 castle_n.png，深度图只用来算法线）立成的镂空面片，
// 后面垫一块按轮廓拉伸的实体：从正面看不到它，但它会挡住在城堡背后升空的礼花弹，俯瞰时城堡也不是纸片。
// 距离这么远、园区内左右走动的视角变化不到 20°，面片和真实体量在画面上分不出来。
// 中景只放了树：城堡和疯狂动物城之间实际是梦幻世界的游乐设施，没有逐栋考证过，不编造建筑。
import * as THREE from 'three';
import { mulberry32, pointInPoly } from './util.js';
import { blobGeo, instanced, PROP_MATS } from './props.js';
import { deciduous, shrub, cutMat, coreMaterial } from './flora.js';
import { CASTLE, DIR, at } from './fireworks.js';
import { LAND, BLOCKS } from './layout.js';
import { sightCap } from './sight.js';

export function buildVista(scene, env, { sheet = null, fw = null } = {}) {
  const G = new THREE.Group(); G.name = 'vista';
  let mat = null, W = 0;

  // ---------------- 城堡
  if (sheet) {
    let vmax = 0; for (let c = 0; c < sheet.cols; c++) vmax = Math.max(vmax, sheet.top[c]);
    const H = CASTLE.h / vmax;                    // 整张图高对应的米数：图里最高的塔尖 = 62 米
    W = (H * sheet.w) / sheet.h;
    mat = sheet.cardMat().clone();
    // 夜景图里抠掉的背景仍是洋红色：远处贴图取小一级时会渗进轮廓边和门洞，这里先把背景涂黑
    {
      const k = sheet.k, ni = sheet.night.image, c = document.createElement('canvas'); c.width = ni.width; c.height = ni.height;
      const g = c.getContext('2d'); g.drawImage(ni, 0, 0);
      const id = g.getImageData(0, 0, c.width, c.height), d = id.data, sx = k.w / c.width, sy = k.h / c.height;
      for (let y = 0; y < c.height; y++) { const my = Math.min(k.h - 1, Math.floor(y * sy)) * k.w; for (let x = 0; x < c.width; x++) if (!k.mask[my + Math.min(k.w - 1, Math.floor(x * sx))]) { const i = (y * c.width + x) * 4; d[i] = d[i + 1] = d[i + 2] = 0; } }
      g.putImageData(id, 0, 0);
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; mat.emissiveMap = t;
    }
    mat.normalMap = sheet.normal; mat.normalScale = new THREE.Vector2(1.3, 1.3);
    mat.side = THREE.FrontSide; mat.alphaTest = 0.35; mat.alphaToCoverage = true; mat.roughness = 0.8;
    // 全场景的雾是按园区内几十米的尺度调的，照搬到 300 米外会把城堡洗成一片白：只取一半，留一层空气感
    mat.onBeforeCompile = (sh) => {
      sh.fragmentShader = sh.fragmentShader.replace('#include <fog_fragment>',
        '#ifdef USE_FOG\n  float vistaFog = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );\n  gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, vistaFog * 0.5 );\n#endif');
    };
    mat.customProgramCacheKey = () => 'vista-castle';
    const card = new THREE.Mesh(new THREE.PlaneGeometry(W, H).translate(W / 2, H / 2, 0), mat);
    // 实体：轮廓略往里收一点，藏在面片后面
    const shape = new THREE.Shape(); shape.moveTo(0, 0);
    for (let c = 0; c < sheet.cols; c += 2) shape.lineTo(((c + 0.5) / sheet.cols) * W, Math.max(0.5, sheet.top[c] * H * 0.97 - 0.8));
    shape.lineTo(W, 0); shape.closePath();
    const bodyGeo = new THREE.ExtrudeGeometry(shape, { depth: 26, bevelEnabled: false, curveSegments: 1 }); bodyGeo.translate(0, 0, -27.5);
    const body = new THREE.Mesh(bodyGeo, new THREE.MeshStandardMaterial({ color: sheet.avg.clone().multiplyScalar(0.8), roughness: 0.95 }));
    const C = new THREE.Group(); C.add(card, body);
    const [px, pz] = at(-W / 2, -12);             // 立面在城堡中心以北 12 米，图的左端在东
    C.position.set(px, 0, pz); C.rotation.y = Math.atan2(-DIR.x, -DIR.z);
    C.traverse((o) => { o.castShadow = false; o.receiveShadow = false; });
    G.add(C);
    // 烟花从屋脊和塔顶打出去：告诉烟花各处的屋顶高度
    if (fw) fw.roofAt = (lat) => { const u = (lat + W / 2) / W; return u <= 0 || u >= 1 ? 0 : sheet.top[Math.min(sheet.cols - 1, Math.floor(u * sheet.cols))] * H; };
  }

  // ---------------- 外围的树林（园区围墙外一圈，南面到城堡之间最密）
  {
    const rnd = mulberry32(8807);
    const leafA = cutMat('leafA'), leafB = cutMat('leafB');
    const keepOut = [...Object.values(BLOCKS), LAND];
    const near = (x, y, m) => keepOut.some((p) => pointInPoly(x, y, p)) || [[m, 0], [-m, 0], [0, m], [0, -m]].some(([dx, dy]) => keepOut.some((p) => pointInPoly(x + dx, y + dy, p)));
    // 四个方向各自成批：看向哪边就只画哪边的树
    const sectors = { S: [], N: [], E: [], W: [] };
    // s 是相对一棵 6.5 米高行道树的倍数
    const put = (x, y, s) => {
      if (near(x, y, 16)) return;
      if (y < -278 && Math.abs(x - CASTLE.x) < W / 2 + 12) return;          // 城堡脚下留空
      s = Math.min(s, sightCap(x, y, s * 3.0) / 7.4);                        // 视线上的树压矮（见 sight.js）
      if (s < 0.7) return;
      const k = y < -100 && Math.abs(x) < 190 ? 'S' : y > 75 ? 'N' : x > 0 ? 'E' : 'W';
      sectors[k].push({ x, z: y, y: 0, s, sy: s * (0.92 + rnd() * 0.22), ry: rnd() * 6.3, v: (rnd() * 2) | 0 });
    };
    // 南面：离围墙近的矮一些，免得把城堡全挡住（真实的树也只挡得住城堡的下半截）
    for (let i = 0; i < 340; i++) { const y = -100 - rnd() * 200, x = -185 + rnd() * 370; put(x, y, 1.25 + rnd() * 0.6 + Math.min(0.5, (-y - 100) / 300)); }
    // 南墙外紧贴着的两排密植：树冠连成一条林线。没有它们，从园内望城堡时看到的是后面一棵棵压矮了的孤树（像棒棒糖）
    for (let x = -72; x <= 92; x += 3.1) for (const y0 of [-97, -104.5, -112]) put(x + rnd() * 2, y0 - rnd() * 5, 0.78 + rnd() * 0.62);
    // 原来园区四周还撒了一圈稀疏的树：从街上看不到，俯瞰时却是一棵棵孤零零立在空地上，很粗糙，已去掉。
    const trunk = new THREE.CylinderGeometry(0.12, 0.2, 3.2, 6).translate(0, 1.6, 0);
    if (leafA && leafB) {
      // 和园区里的行道树同一套枝叶卡片，不做枝干：远看是同一种树
      const kinds = [deciduous(41, { nCards: 84 }), deciduous(42, { height: 6.9, spread: 2.9, nCards: 96 })];
      const coreMat = coreMaterial();
      for (const list of Object.values(sectors)) {
        if (!list.length) continue;
        kinds.forEach((k, v) => {
          const l = list.filter((t) => t.v === v); if (!l.length) return;
          G.add(instanced(k.core, coreMat, l, false), instanced(k.cardsA, v ? leafB : leafA, l, false), instanced(k.cardsB, v ? leafA : leafB, l, false));
        });
        G.add(instanced(trunk, PROP_MATS.trunk, list, false));
      }
    } else {
      const leaf = new THREE.MeshStandardMaterial({ color: 0x4f8f3e, roughness: 1, vertexColors: true });
      const crown = blobGeo(11, 2.6, 2, 0.26).translate(0, 4.6, 0);
      for (const list of Object.values(sectors)) if (list.length) G.add(instanced(crown, leaf, list, false), instanced(trunk, PROP_MATS.trunk, list, false));
    }
    // 林下灌木丛：围墙外到林带之间、以及林带的树干之间填满一人多高的灌木。
    // 没有它，镜头升高一点就能看到林带下面是一片空地和一根根树干。高度同样不超过望向城堡的视线。
    if (leafA) {
      const big = shrub(31, { r: 1.5, h: 2.6, n: 46, core: 0.45 }), thick = [];      // 内核做小、叶片加密：不然叶缝里会露出一个个光滑的圆顶
      for (let x = -78; x <= 96; x += 2.5) for (let y = -68; y >= -116; y -= 2.5) {
        const px = x + (rnd() - 0.5) * 1.8, py = y + (rnd() - 0.5) * 1.8;
        if (near(px, py, 4)) continue;
        const h = Math.min(sightCap(px, py, 2.0) * 0.85, 2.6 + rnd() * 2.4);
        if (h < 1.2) continue;
        thick.push({ x: px, z: py, y: 0, s: h / 2.6, ry: rnd() * 6.3 });
      }
      G.add(instanced(big.core, coreMaterial(null, 0x6f9460), thick, false), instanced(big.cards, leafA, thick, false));
    }
    // 绿地南缘的一道矮绿篱：挡住围界外空荡荡的地面，又不挡城堡（高约 2.2 米）
    {
      const edge = [[-6.5, -62.5], [0.8, -66], [14, -68.3], [26.1, -64], [42.2, -64], [52, -61], [58, -54.5]];
      const hedge = [];
      for (let i = 0; i < edge.length - 1; i++) {
        const [ax, ay] = edge[i], [bx, by] = edge[i + 1], L = Math.hypot(bx - ax, by - ay);
        for (let d = 0; d < L; d += 1.25) { const t = d / L, k = (hedge.length * 0.37) % 1; hedge.push({ x: ax + (bx - ax) * t, z: ay + (by - ay) * t - k * 0.5, y: 0, s: 1.25 + k * 0.3, ry: hedge.length * 1.7 }); }
      }
      const sb = shrub(23, { r: 1.05, h: 1.75, n: 24 });
      G.add(instanced(sb.core, coreMaterial(null, 0x6f9460), hedge, false));
      if (leafA) G.add(instanced(sb.cards, leafA, hedge, false));
    }
    G.traverse((o) => { if (o.isInstancedMesh) o.receiveShadow = false; });
  }

  scene.add(G);

  // ---------------- 夜景：泛光灯下的城堡，颜色在蓝紫和粉紫之间慢慢游移；烟花炸开时被映亮一下
  const tint = new THREE.Color(), A = new THREE.Color(0.82, 0.9, 1.25), B = new THREE.Color(1.2, 0.84, 1.1);
  const tick = (time) => {
    if (!mat) return;
    const e = env.night, c = 1 - e * 0.62;
    mat.color.setRGB(c, c, c);
    const flash = fw ? fw.flashAmt * fw.level : 0;
    tint.copy(A).lerp(B, 0.5 + 0.5 * Math.sin(time * 0.11));
    if (fw && flash > 0) tint.lerp(fw.flashCol, Math.min(0.5, flash * 0.6));
    mat.emissive.copy(tint);
    // 城堡在 300 多米外，夜里的雾还会吃掉三成亮度，这里补回来
    mat.emissiveIntensity = e * (1.5 + flash * 0.9);
  };
  tick(0);
  return { group: G, tick, width: W };
}
