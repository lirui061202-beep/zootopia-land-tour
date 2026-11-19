// 上海迪士尼「疯狂动物城」园区 · 可游览模型 —— 入口
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { Environment, TIMES } from './env.js';
import { buildGround } from './ground.js';
import { buildBuildings } from './buildings.js';
import { buildProps } from './props.js';
import { Walker, buildColliders } from './controls.js';
import { UI } from './ui.js';
import { Fireworks } from './fireworks.js';
import { LightPool } from './lightpool.js';
import { buildVista } from './vista.js';
import { BLOCKS } from './layout.js';
import { lerp } from './util.js';

const QS = new URLSearchParams(location.search);
const DEBUG = QS.has('debug'), FAST = QS.has('fast');      // ?fast 关闭环境光遮蔽，低配机器用
const $ = (id) => document.getElementById(id);
const prog = (v, t) => { $('progBar').style.width = Math.round(v * 100) + '%'; if (t) $('btnGo').textContent = t; };

async function boot() {
  const marks = [['start', Math.round(performance.now())]];
  const mark = (n) => marks.push([n, Math.round(performance.now())]);       // 各加载阶段的时间点（调试用，T.marks）
  const canvasEl = $('view');
  const renderer = new THREE.WebGLRenderer({ canvas: canvasEl, antialias: true, powerPreference: 'high-performance' });
  // 画质分档：独立显卡（如 RTX 5060）用高档——全分辨率遮蔽、更密的浮雕网格、更高的渲染倍率；
  // 集成显卡或 ?fast 用中档。?high / ?mid 可手动指定。
  let gpuName = '';
  try { const gl = renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info'); gpuName = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : ''; } catch (e) { /* 读不到就按中档 */ }
  const discrete = /NVIDIA|GeForce|RTX|GTX|Radeon (RX|Pro)|Quadro/i.test(gpuName);
  const HIGH = !FAST && !QS.has('mid') && (QS.has('high') || discrete);
  {
    const el = document.getElementById('gpu');
    // 例："ANGLE (Intel, Intel(R) Arc(TM) 140T GPU (16GB) (0x00007D51) Direct3D11 …)" → 取中间的显卡型号
    const parts = gpuName.split(', ');
    const short = (parts.length > 1 ? parts[1].split(' (0x')[0].split(' Direct3D')[0].split(' OpenGL')[0] : gpuName).trim() || '未知';
    if (el) el.textContent = '当前渲染显卡：' + short + '（画质：' + (HIGH ? '高' : '中') + '）' + (discrete ? '' : ' · 若电脑有独立显卡，请在 Windows「设置 › 系统 › 屏幕 › 显示卡」里把所用浏览器设为「高性能」后重开');
  }
  renderer.setPixelRatio(Math.min(devicePixelRatio, FAST ? 1.25 : HIGH ? 2 : 1.5));
  renderer.setSize(innerWidth, innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;            // 比 PCFSoft 每像素少一半多的阴影采样，软硬程度由 shadow.radius 控制

  const scene = new THREE.Scene();
  // 竖直视角 60°（原来 68°）：宽屏上 68° 相当于横向 100° 的广角，画面两侧的建筑会被明显拉斜拉宽
  const FOV = 60;
  const camera = new THREE.PerspectiveCamera(FOV, innerWidth / innerHeight, 0.15, 1400);

  const env = new Environment(scene, renderer);
  prog(0.06);

  // 贴图清单
  let manifest = [];
  try { manifest = await (await fetch('./assets/tex/manifest.json', { cache: 'no-store' })).json(); } catch (e) { console.warn('缺少 manifest.json'); }
  // 贴图已转成 WebP（体积约为 PNG 的七分之一）；清单里有哪个扩展名就用哪个
  const texFile = (n) => [n + '.webp', n + '.png'].find((f) => manifest.includes(f)) || null;
  // 中档画质（集成显卡）把高清立面图缩到 1600 像素宽再处理：显存和加载时间都省一半多，隔着几米看不出差别
  const tex = { manifest, cell: HIGH ? 0.09 : 0.12, mark, file: texFile, maxSheet: HIGH ? 0 : 1600 };
  if (texFile('rock')) {
    // 生成的岩石偏橙红；实景是赭黄偏米色的砂岩，这里把色相往米黄拉、降一点饱和度
    const im = (await new THREE.TextureLoader().loadAsync('./assets/tex/' + texFile('rock'))).image;
    const c = document.createElement('canvas'); c.width = c.height = 1024;
    const g = c.getContext('2d'); g.drawImage(im, 0, 0, 1024, 1024);
    const id = g.getImageData(0, 0, 1024, 1024), d = id.data;
    for (let i = 0; i < d.length; i += 4) {
      const l = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) * 1.22, k = 0.6;
      d[i] = d[i] * (1 - k) + Math.min(255, l * 1.0) * k; d[i + 1] = d[i + 1] * (1 - k) + Math.min(255, l * 0.8) * k; d[i + 2] = d[i + 2] * (1 - k) + Math.min(255, l * 0.56) * k;
    }
    g.putImageData(id, 0, 0);
    tex.rock = new THREE.CanvasTexture(c);
    tex.rock.colorSpace = THREE.SRGBColorSpace; tex.rock.anisotropy = 8;
  }
  for (const n of ['paving', 'asphalt', 'terracotta', 'bluetile', 'foliage', 'bark', 'frond']) if (texFile(n)) { try { tex[n] = (await new THREE.TextureLoader().loadAsync('./assets/tex/' + texFile(n))).image; } catch (e) { /* 用程序纹理兜底 */ } }
  prog(0.12); mark('textures');

  const ground = buildGround(scene, tex);
  tex.rockMat = ground.userData.rockMat;
  const B = await buildBuildings(scene, env, tex, (v) => prog(0.12 + v * 0.7));
  prog(0.86); mark('buildings');
  const propsG = buildProps(scene, env, { blocks: Object.values(BLOCKS), facInfo: B.facInfo, sheets: B.sheets, tex });
  for (const s of Object.values(B.sheets)) s.freeSat();        // 浮雕建完，积分图可以放掉了
  prog(0.95); mark('props');

  const walker = new Walker(camera, canvasEl, buildColliders(propsG.userData.solid));
  const fw = new Fireworks(scene, env, renderer);          // 夜晚的远景烟花（城堡方向）
  const vista = buildVista(scene, env, { sheet: B.sheets.castle, fw });   // 远景：城堡背影 + 外围树林
  const lightPool = new LightPool(scene, 6);                // 十几盏点光源 → 白天 0 盏、夜里最近的 6 盏
  const ui = new UI(walker, env);

  // 后期：泛光（夜晚霓虹）
  const rt = new THREE.WebGLRenderTarget(innerWidth, innerHeight, { samples: 4, type: THREE.HalfFloatType });
  if (!FAST) rt.depthTexture = new THREE.DepthTexture(innerWidth, innerHeight);     // 主画面的深度留给环境光遮蔽用（见下）
  const composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  let gtao = null;
  if (!FAST) {
    gtao = new GTAOPass(scene, camera, innerWidth, innerHeight);
    gtao.updateGtaoMaterial({ radius: 1.6, distanceExponent: 1.4, thickness: 1.2, scale: 1.15, samples: 12, distanceFallOff: 1, screenSpaceRadius: false });
    gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 });
    gtao.blendIntensity = 0.85;
    // 环境光遮蔽按半分辨率计算再放大混合：画面几乎看不出差别，但这一步的耗时降到约四分之一。
    // 高档也这样做：笔记本的高分屏上全分辨率遮蔽是整条后期里最贵的一步。
    {
      const fullSize = gtao.setSize.bind(gtao);
      gtao.setSize = (w, h) => fullSize(Math.max(2, Math.round(w / 2)), Math.max(2, Math.round(h / 2)));
    }
    // 遮蔽默认会把整个场景再画一遍（只为了拿深度和法线）——等于每帧两遍几何。
    // 改成直接读主画面刚画好的深度图，法线由深度推算：整整省掉一遍场景绘制和一半的绘制调用。
    {
      gtao._renderGBuffer = false;
      for (const m of [gtao.gtaoMaterial, gtao.pdMaterial]) { m.defines.NORMAL_VECTOR_TYPE = 0; m.defines.DEPTH_SWIZZLING = 'x'; m.uniforms.tNormal.value = null; m.needsUpdate = true; }
      gtao.normalRenderTarget.dispose();
      const aoRender = gtao.render.bind(gtao);
      gtao.render = (r, wb, rb, dt, mask) => {
        gtao.gtaoMaterial.uniforms.tDepth.value = rb.depthTexture; gtao.pdMaterial.uniforms.tDepth.value = rb.depthTexture;
        aoRender(r, wb, rb, dt, mask);
      };
    }
    composer.addPass(gtao);
  }
  const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.1, 0.6, 0.95);
  composer.addPass(bloom);
  // 体积光（丁达尔光）：从每个像素朝太阳方向取样，把天空里够亮的部分拉成光束，被建筑挡住的地方自然留下暗纹
  const rays = new ShaderPass({
    uniforms: { tDiffuse: { value: null }, uSun: { value: new THREE.Vector2(0.5, 0.8) }, uAmt: { value: 0 }, uTint: { value: new THREE.Color(1, 0.92, 0.78) } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform sampler2D tDiffuse; uniform vec2 uSun; uniform float uAmt; uniform vec3 uTint; varying vec2 vUv;
      void main(){
        vec4 base = texture2D(tDiffuse, vUv);
        if (uAmt < 0.002) { gl_FragColor = base; return; }
        vec2 stepv = (uSun - vUv) * (0.92 / 22.0); vec2 p = vUv; float w = 1.0; vec3 acc = vec3(0.0);
        for (int i = 0; i < 22; i++) {
          p += stepv;
          vec3 s = texture2D(tDiffuse, clamp(p, 0.001, 0.999)).rgb;
          float l = max(s.r, max(s.g, s.b));
          acc += s * smoothstep(1.05, 2.4, l) * w; w *= 0.955;
        }
        gl_FragColor = vec4(base.rgb + acc * uTint * (uAmt / 22.0), base.a);
      }`,
  });
  rays.enabled = !FAST;
  composer.addPass(rays);
  composer.addPass(new OutputPass());
  // 调色：动画电影式的通透高饱和——先提「自然饱和度」（灰的颜色提得多、已经很艳的提得少），
  // 再做暖高光 / 冷阴影的分离调色、柔和的 S 曲线、一点点抬黑和暗角；黄昏时整体更暖更紫
  const grade = new ShaderPass({
    uniforms: { tDiffuse: { value: null }, uSat: { value: 1.12 }, uVib: { value: 0.4 }, uNight: { value: 0 }, uDusk: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform sampler2D tDiffuse; uniform float uSat; uniform float uVib; uniform float uNight; uniform float uDusk; varying vec2 vUv;
      void main(){
        vec3 c = max(texture2D(tDiffuse, vUv).rgb, 0.0);
        float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
        float sat = max(c.r, max(c.g, c.b)) - min(c.r, min(c.g, c.b));
        c = mix(vec3(l), c, 1.0 + uVib * (1.0 - sat));                 // 自然饱和度
        c = mix(vec3(l), c, uSat);                                      // 整体饱和度
        vec3 sh = mix(vec3(0.94, 0.985, 1.065), vec3(0.97, 0.92, 1.09), uDusk);
        vec3 hi = mix(vec3(1.045, 1.005, 0.94), vec3(1.10, 0.985, 0.86), uDusk);
        c *= mix(sh, hi, smoothstep(0.08, 0.8, l));                     // 分离调色
        c = mix(c, c * c * (3.0 - 2.0 * c), 0.26);                      // 柔和 S 曲线
        c = c * 0.985 + 0.012 * (1.0 - uNight);                         // 白天略抬暗部，更通透
        vec2 q = vUv - 0.5; float vig = smoothstep(0.98, 0.34, length(q * vec2(1.0, 0.85)));
        c *= mix(1.0, vig, 0.13 + uNight * 0.16 + uDusk * 0.06);
        gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
      }`,
  });
  composer.addPass(grade);
  env.onChange((e) => {
    const k = env.dusk;
    grade.uniforms.uNight.value = e; grade.uniforms.uDusk.value = k;
    grade.uniforms.uSat.value = 1.12 - e * 0.04; grade.uniforms.uVib.value = 0.4 - e * 0.15;
    // 白天也留一层柔光（亮部微微晕开），黄昏和夜晚更强
    bloom.strength = 0.2 + k * 0.16 + e * 0.24; bloom.threshold = 0.9 - e * 0.1; bloom.radius = 0.62 + e * 0.12;
    rays.uniforms.uTint.value.setRGB(1, 0.92 - k * 0.3, 0.78 - k * 0.42);
  });
  const _sun = new THREE.Vector2();
  const updateRays = () => {
    const vis = env.sunScreen(camera, _sun);
    rays.uniforms.uSun.value.copy(_sun);
    rays.uniforms.uAmt.value = vis * (0.5 + env.dusk * 0.55) * Math.max(0, 1 - env.t * 1.25 + env.dusk * 0.6) * (1 - Math.max(0, env.t - 0.5) * 2);
  };

  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight);
  });

  // 按钮与快捷键
  const btnTime = $('btnTime'), btnTour = $('btnTour'), btnView = $('btnView');
  const setTimeBtn = () => { const i = env.timeIndex(); btnTime.textContent = TIMES[i].label; btnTime.classList.toggle('on', i > 0); };
  btnTime.onclick = () => { env.toggle(); setTimeBtn(); };
  btnTour.onclick = () => walker.setMode(walker.mode === 'tour' ? 'walk' : 'tour');
  btnView.onclick = () => walker.setMode(walker.mode === 'orbit' ? 'walk' : 'orbit');
  walker.onMode = (m) => {
    btnTour.classList.toggle('on', m === 'tour'); btnTour.textContent = m === 'tour' ? '■ 停止游览' : '▶ 自动游览';
    btnView.classList.toggle('on', m === 'orbit'); btnView.textContent = m === 'orbit' ? '🚶 步行' : '⛶ 俯瞰';
  };
  addEventListener('keydown', (e) => {
    if (e.code === 'KeyN') btnTime.onclick();
    else if (e.code === 'KeyT') btnTour.onclick();
    else if (e.code === 'KeyO') btnView.onclick();
    else if (e.code === 'KeyM') $('map').style.display = $('map').style.display === 'none' ? '' : 'none';
    else if (e.code === 'KeyR') walker.rescue();
    else if (e.code === 'KeyF') fw.toggle();
  });
  canvasEl.addEventListener('click', () => { if (document.body.classList.contains('started') && !DEBUG) walker.lock(); });

  let time = 0;
  const step = (dt) => {
    time += dt;
    env.update(dt, time);
    walker.update(dt);
    lightPool.update(camera, dt, env.night);
    B.tick?.(time, dt, camera);
    updateRays();
    fw.update(dt, time);
    vista.tick(time);
    ui.update();
  };
  const render = () => composer.render();

  // 自适应分辨率：帧率持续偏低就降一点渲染分辨率，富余时再升回去（集成显卡上保持流畅）
  const prMax = renderer.getPixelRatio(), prMin = Math.min(prMax, 0.8);
  const setPR = (pr) => { renderer.setPixelRatio(pr); renderer.setSize(innerWidth, innerHeight); composer.setPixelRatio(pr); composer.setSize(innerWidth, innerHeight); };
  let acc = 0, frames = 0, slowFor = 0, fastFor = 0, startedAt = 0, prCeil = prMax, raisedAt = -1e9;
  const fpsEl = $('fps');
  const adapt = (ms) => {
    acc += ms; frames++;
    if (acc < 1000) return;
    const avg = acc / frames; acc = 0; frames = 0;
    if (fpsEl) fpsEl.textContent = Math.round(1000 / avg) + ' FPS';
    // 合适的分辨率在进园前已经测好了（见下面的 calibrate），这里只做兜底；
    // 进园后的头 3 秒不动（切换分辨率本身会卡一下），之后连续 2 秒偏慢才降
    if (!startedAt || performance.now() - startedAt < 3000) { slowFor = fastFor = 0; return; }
    // 「够快」按稳定跑满 60 帧算（帧间隔受显示器刷新率限制，60Hz 屏上永远到不了 12 毫秒，
    // 以前用 12 毫秒当门槛，分辨率一旦降下去就再也升不回来）
    slowFor = avg > 25 ? slowFor + 1 : 0; fastFor = avg < 17.5 ? fastFor + 1 : 0;
    let pr = renderer.getPixelRatio();
    const now = performance.now();
    if (slowFor >= 2 && pr > prMin) {
      if (now - raisedAt < 9000) { pr = Math.max(prMin, pr - 0.1); prCeil = pr; }     // 刚试着升了一档就变慢：退回去，以后不再往上试
      else pr = Math.max(prMin, pr - 0.2);
    } else if (fastFor >= 5 && pr < prCeil - 0.01) { pr = Math.min(prCeil, pr + 0.1); raisedAt = now; }
    else return;
    slowFor = fastFor = 0;
    setPR(pr);
  };

  // 进园前测速定分辨率：在最吃力的几个视角各画几帧并等显卡真正画完，取中位数；
  // 超过 15 毫秒（约 60 帧的余量）就按比例降渲染分辨率再测，最多三轮。
  // 以前是进园后边卡边降，头几秒的卡顿主要就是这么来的。
  const calibrate = async (views) => {
    const gl = renderer.getContext(), px = new Uint8Array(4);
    const measure = async () => {
      const ms = [];
      for (const v of views) {
        walker.pos.set(v[0], v[1]); walker.yaw = (v[2] * Math.PI) / 180; walker.pitch = 0.12;
        for (let k = 0; k < 4; k++) {
          const t0 = performance.now();
          step(0); render();
          gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);       // 逼显卡把这一帧做完再计时
          if (k) ms.push(performance.now() - t0);                         // 每个视角的第一帧不算
        }
        await new Promise((r) => setTimeout(r, 0));
      }
      ms.sort((a, b) => a - b);
      return ms[ms.length >> 1];
    };
    let ms = await measure();
    for (let round = 0; round < 3 && ms > 15 && renderer.getPixelRatio() > prMin + 0.01; round++) {
      setPR(Math.max(prMin, Math.min(renderer.getPixelRatio() - 0.1, renderer.getPixelRatio() * Math.sqrt(13 / ms))));
      ms = await measure();
    }
    // 分辨率降到底还是慢：依次关掉环境光遮蔽（它要把场景再画一遍）和体积光
    const off = [];
    if (ms > 24 && gtao && gtao.enabled) { gtao.enabled = false; off.push('环境光遮蔽'); ms = await measure(); }
    if (ms > 33 && rays.enabled) { rays.enabled = false; off.push('体积光'); ms = await measure(); }
    return { ms, off };
  };

  let last = performance.now();
  const loop = (now) => {
    const raw = now - last, dt = Math.min(0.05, raw / 1000); last = now;
    step(dt); render();
    if (document.visibilityState === 'visible' && raw < 500) adapt(raw);
    requestAnimationFrame(loop);
  };

  // 预先把贴图传进显存：否则第一次走到某栋楼前会卡一下
  {
    const seen = new Set();
    scene.traverse((o) => {
      for (const mat of [].concat(o.material || [])) for (const k of ['map', 'normalMap', 'emissiveMap', 'roughnessMap']) {
        const t = mat[k]; if (t && !seen.has(t)) { seen.add(t); try { renderer.initTexture(t); } catch (e) { /* 忽略 */ } }
      }
    });
  }
  renderer.shadowMap.autoUpdate = false; renderer.shadowMap.needsUpdate = true;
  // 预热：在加载画面后面先把着色器编译好，并从十几个位置各画一帧，把所有贴图和阴影都跑一遍。
  // 否则这些开销会摊到刚进园的头几秒里，表现为一走动就卡。
  mark('setup'); prog(0.96, '预热中…');
  // 着色器有两套：夜里带 6 盏点光源的、白天不带的。先编夜里那套，再编白天那套（留在白天状态进园）
  lightPool.setForce(true);
  try { await renderer.compileAsync(scene, camera); } catch (e) { /* 不支持异步编译就跳过 */ }
  step(0); render();
  lightPool.setForce(false);
  try { await renderer.compileAsync(scene, camera); } catch (e) { /* 同上 */ }
  {
    const keep = { x: walker.pos.x, y: walker.pos.y, yaw: walker.yaw, pitch: walker.pitch };
    const views = [[-47.5, -75.5, 35], [-36, -58, 25], [-28, -44, -80], [-28, -44, 95], [-27, -30, 5], [-24, -14, -110], [-16, -19, -10], [-6, -20, 165], [3, -24, -150], [10, -22, 80], [22, -40, 100], [30, -41, -30], [42.5, -46.5, 2], [60, -47, -70], [74, -64, -20]];
    for (let i = 0; i < views.length; i++) {
      const v = views[i];
      walker.pos.set(v[0], v[1]); walker.yaw = (v[2] * Math.PI) / 180; walker.pitch = 0.18;
      step(0); render();
      prog(0.96 + (0.04 * (i + 1)) / views.length);
      await new Promise((r) => setTimeout(r, 0));
    }
    if (document.visibilityState === 'visible') {                          // 页面在后台时计时不准，不测
      const cal = await calibrate([views[0], views[2], views[5], views[12]]);
      const el = $('gpu'); if (el) el.textContent += ' · 预热后每帧约 ' + cal.ms.toFixed(0) + ' 毫秒，渲染倍率 ' + renderer.getPixelRatio().toFixed(2) + (cal.off.length ? '，已自动关闭' + cal.off.join('、') : '');
    }
    walker.pos.set(keep.x, keep.y); walker.yaw = keep.yaw; walker.pitch = keep.pitch;
  }
  mark('warm+calibrate'); prog(1, '进入园区');
  const go = $('btnGo'); go.disabled = false;
  go.onclick = () => { document.body.classList.add('started'); startedAt = performance.now(); fw.initAudio(); if (!DEBUG) walker.lock(); };
  step(0); render();
  requestAnimationFrame(loop);

  if (DEBUG) {
    document.body.classList.add('started');
    window.T = { scene, camera, renderer, composer, env, walker, ui, B, fw, vista, lightPool, marks, step, render, THREE,
      frame(dt = 0.016, n = 1) { for (let i = 0; i < n; i++) step(dt); render(); },
      night(on) { this.time(on ? 1 : 0); },
      time(t) { env.target = t; env.apply(t); setTimeBtn(); step(0); render(); },
      look(x, y, yawDeg, pitchDeg = 0) { walker.pos.set(x, y); walker.yaw = yawDeg * Math.PI / 180; walker.pitch = pitchDeg * Math.PI / 180; step(0); render(); } };
  }
}

boot().catch((e) => { console.error(e); $('btnGo').textContent = '加载失败：' + e.message; });
