// 天空与光照：白天 / 黄昏 / 夜晚三个时段，之间平滑过渡。
// 调子往动画电影靠：暖色主光 + 偏蓝的天空补光，饱和的蓝天和蓬松的积云，黄昏是橙粉到蓝紫的渐变。
import * as THREE from 'three';
import { smooth } from './util.js';

const SKY_VS = /* glsl */`
varying vec3 vDir;
void main(){
  vDir = normalize(position);
  vec4 p = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * p;
  gl_Position.z = gl_Position.w;       // 始终在最远处
}`;

const SKY_FS = /* glsl */`
precision highp float;
varying vec3 vDir;
uniform vec3 uW;        // 白天 / 黄昏 / 夜晚 的权重
uniform float uTime;
uniform vec3 uSun;      // 当前太阳方向
uniform vec3 uMoon;

float hash(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
float noise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*f*(f*(f*6.0-15.0)+10.0);
  return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y); }
// 每叠一层把坐标转一个角度：格点噪声的横平竖直不再层层对齐，云的边缘就不会出现带棱角的折线
float fbm(vec2 p){ float a=0.5, s=0.0; mat2 m = mat2(0.8, 0.6, -0.6, 0.8); for(int i=0;i<5;i++){ s+=a*noise(p); p=m*p*2.03+17.0; a*=0.5; } return s; }

void main(){
  vec3 d = normalize(vDir);
  float h = clamp(d.y, -0.2, 1.0);
  float t = pow(clamp(h,0.0,1.0), 0.42);
  vec3 sunDir = normalize(uSun);
  float sunD = max(dot(d, sunDir), 0.0);

  // ---- 白天：地平线带一点暖白的薄雾 → 天顶饱和的蓝
  vec3 day = mix(vec3(0.80, 0.90, 0.99), vec3(0.085, 0.33, 0.84), t);
  day += vec3(1.0, 0.90, 0.70) * (pow(sunD, 5.0) * 0.20 + pow(sunD, 40.0) * 0.55);
  day += vec3(1.0, 0.95, 0.82) * pow(sunD, 900.0) * 7.0;

  // ---- 黄昏：橙 → 粉紫 → 深蓝紫，太阳周围一大片暖光
  vec3 dusk = mix(vec3(1.0, 0.58, 0.28), vec3(0.86, 0.44, 0.56), smoothstep(0.0, 0.28, h));
  dusk = mix(dusk, vec3(0.20, 0.22, 0.54), smoothstep(0.16, 0.85, h));
  dusk += vec3(1.0, 0.62, 0.25) * (pow(sunD, 3.0) * 0.55 + pow(sunD, 24.0) * 0.9);
  dusk += vec3(1.0, 0.85, 0.6) * pow(sunD, 500.0) * 6.0;

  // ---- 夜晚：城市光晕（紫粉）→ 深蓝天顶 + 星星 + 月亮
  vec3 night = mix(vec3(0.16, 0.085, 0.25), vec3(0.03, 0.035, 0.12), smoothstep(0.0, 0.32, h));
  night = mix(night, vec3(0.006, 0.008, 0.035), smoothstep(0.25, 1.0, h));
  vec2 sp = d.xz / (abs(d.y)+0.35) * 90.0;
  float st = hash(floor(sp));
  float tw = 0.6 + 0.4*sin(uTime*2.0 + st*90.0);
  vec2 sf = fract(sp)-0.5;
  night += vec3(0.9,0.95,1.0) * smoothstep(0.985, 1.0, st) * smoothstep(0.22, 0.0, length(sf)) * tw * smoothstep(0.08,0.4,d.y) * 1.6;
  float moonD = max(dot(d, normalize(uMoon)), 0.0);
  night += vec3(0.95,0.96,1.0) * (smoothstep(0.9993, 0.9996, moonD)*1.4 + pow(moonD, 60.0)*0.18);

  // ---- 积云：两层噪声做出蓬松的团块，朝太阳一侧更亮、底部偏蓝灰
  vec2 cuv = d.xz / (d.y + 0.2) * 1.15 + vec2(uTime*0.004, 0.0);
  float warp = fbm(cuv * 0.6 + 3.1);
  float f = fbm(cuv + warp * 0.9);
  float c = smoothstep(0.46, 0.86, f) * smoothstep(0.03, 0.26, d.y);
  float lit = smoothstep(0.42, 0.9, fbm(cuv + warp * 0.9 + sunDir.xz * 0.22));
  vec3 cloudDay = mix(vec3(0.74, 0.80, 0.92), vec3(1.0, 1.0, 0.99), lit);
  vec3 cloudDusk = mix(vec3(0.46, 0.34, 0.56), vec3(1.0, 0.70, 0.50), lit);
  vec3 cloudNight = vec3(0.12, 0.10, 0.22);

  vec3 col = day * uW.x + dusk * uW.y + night * uW.z;
  vec3 cloud = cloudDay * uW.x + cloudDusk * uW.y + cloudNight * uW.z;
  col = mix(col, cloud, c * (0.86 * uW.x + 0.8 * uW.y + 0.22 * uW.z));
  // 地平线以下
  vec3 below = vec3(0.62,0.66,0.66) * uW.x + vec3(0.42,0.30,0.32) * uW.y + vec3(0.03,0.03,0.07) * uW.z;
  col = mix(col, below, smoothstep(0.0, -0.12, d.y));
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

// 三个时段的关键帧
const KEYS = {
  sunDir: [new THREE.Vector3(-0.42, 0.62, 0.66), new THREE.Vector3(-0.88, 0.2, 0.42), new THREE.Vector3(0.5, 0.55, 0.35)],
  sunCol: [[1.0, 0.93, 0.80], [1.0, 0.56, 0.26], [0.50, 0.60, 1.0]],
  sunInt: [3.7, 2.7, 0.22],
  hemiSky: [[0.62, 0.80, 1.0], [0.60, 0.46, 0.78], [0.20, 0.24, 0.52]],
  hemiGround: [[0.96, 0.80, 0.60], [0.92, 0.56, 0.40], [0.16, 0.10, 0.22]],
  hemiInt: [1.08, 0.8, 0.34],
  fogCol: [[0.80, 0.88, 0.97], [0.96, 0.66, 0.54], [0.07, 0.06, 0.16]],
  fogDen: [0.0021, 0.0027, 0.0032],
  envInt: [0.55, 0.5, 0.35],
  exposure: [1.08, 1.1, 1.12],
};
export const TIMES = [{ t: 0, label: '☀ 白天' }, { t: 0.5, label: '🌇 黄昏' }, { t: 1, label: '☾ 夜晚' }];

export class Environment {
  constructor(scene, renderer) {
    this.scene = scene;
    this.renderer = renderer;
    this.t = 0;                // 当前时间：0 白天 → 0.5 黄昏 → 1 夜晚
    this.target = 0;
    this.night = 0;            // 灯光点亮程度（0..1），给招牌、窗户、路灯用
    this.dusk = 0;             // 黄昏权重，给调色用
    this.listeners = [];
    this.sunWorldDir = KEYS.sunDir[0].clone().normalize();
    this.moonDir = KEYS.sunDir[2].clone().normalize();

    this.skyMat = new THREE.ShaderMaterial({
      vertexShader: SKY_VS, fragmentShader: SKY_FS, side: THREE.BackSide, depthWrite: false, depthTest: true, fog: false,
      uniforms: { uW: { value: new THREE.Vector3(1, 0, 0) }, uTime: { value: 0 }, uSun: { value: this.sunWorldDir }, uMoon: { value: this.moonDir } },
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(900, 48, 24), this.skyMat);
    this.sky.frustumCulled = false; this.sky.renderOrder = -10;
    scene.add(this.sky);

    this.hemi = new THREE.HemisphereLight(0xcfe2ff, 0xb9a488, 1.0);
    scene.add(this.hemi);

    this.sun = new THREE.DirectionalLight(0xfff0d8, 3.2);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(4096, 4096);
    const s = this.sun.shadow.camera;
    s.left = -105; s.right = 105; s.top = 95; s.bottom = -95; s.near = 20; s.far = 460;
    this.sun.shadow.bias = -0.0004; this.sun.shadow.normalBias = 0.05;
    this.sun.shadow.radius = 3.2;
    scene.add(this.sun, this.sun.target);
    this.center = new THREE.Vector3(5, 0, 35);
    this.sun.target.position.copy(this.center);

    scene.fog = new THREE.FogExp2(0xcfe0f0, 0.002);

    // 环境反射：把三个时段的天空各烘成一张 PMREM
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.envs = [0, 0.5, 1].map((t) => this._bakeEnv(t));
    scene.environment = this.envs[0];
    this.apply(0);
  }

  static weights(t) { return [Math.max(0, 1 - 2 * t), 1 - Math.abs(2 * t - 1), Math.max(0, 2 * t - 1)]; }

  _bakeEnv(t) {
    const w = Environment.weights(t);
    const sc = new THREE.Scene();
    const m = this.skyMat.clone();
    m.uniforms = THREE.UniformsUtils.clone(this.skyMat.uniforms);
    m.uniforms.uW.value.set(w[0], w[1], w[2]);
    m.uniforms.uSun.value = KEYS.sunDir[0].clone().multiplyScalar(w[0]).addScaledVector(KEYS.sunDir[1], w[1]).addScaledVector(KEYS.sunDir[2], w[2]).normalize();
    sc.add(new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), m));
    return this.pmrem.fromScene(sc, 0.04).texture;
  }

  onChange(fn) { this.listeners.push(fn); fn(this.night); }
  setNight(on) { this.target = on ? 1 : 0; }
  // 白天 → 黄昏 → 夜晚 → 白天
  toggle() { const i = this.timeIndex(); this.target = TIMES[(i + 1) % TIMES.length].t; return this.target; }
  timeIndex() { return this.target < 0.25 ? 0 : this.target < 0.75 ? 1 : 2; }
  isNight() { return this.target > 0.75; }

  apply(t) {
    this.t = t;
    const w = Environment.weights(t);
    const mix = (k) => k[0] * w[0] + k[1] * w[1] + k[2] * w[2];
    const mix3 = (k, c) => c.setRGB(k[0][0] * w[0] + k[1][0] * w[1] + k[2][0] * w[2], k[0][1] * w[0] + k[1][1] * w[1] + k[2][1] * w[2], k[0][2] * w[0] + k[1][2] * w[1] + k[2][2] * w[2]);
    this.skyMat.uniforms.uW.value.set(w[0], w[1], w[2]);
    this.sunWorldDir.copy(KEYS.sunDir[0]).multiplyScalar(w[0]).addScaledVector(KEYS.sunDir[1], w[1]).addScaledVector(KEYS.sunDir[2], w[2]).normalize();
    this.sun.position.copy(this.center).addScaledVector(this.sunWorldDir, 230);
    mix3(KEYS.sunCol, this.sun.color); this.sun.intensity = mix(KEYS.sunInt);
    mix3(KEYS.hemiSky, this.hemi.color); mix3(KEYS.hemiGround, this.hemi.groundColor); this.hemi.intensity = mix(KEYS.hemiInt);
    mix3(KEYS.fogCol, this.scene.fog.color); this.scene.fog.density = mix(KEYS.fogDen);
    this.scene.environment = this.envs[t < 0.25 ? 0 : t < 0.75 ? 1 : 2];
    this.scene.environmentIntensity = mix(KEYS.envInt);
    this.renderer.toneMappingExposure = mix(KEYS.exposure);
    this.renderer.shadowMap.needsUpdate = true;      // 场景是静态的：阴影只在光照变化时重算
    this.dusk = w[1];
    this.night = smooth(Math.min(1, Math.max(0, (t - 0.2) / 0.6)));      // 黄昏时灯已亮起一半
    for (const fn of this.listeners) fn(this.night);
  }

  // 太阳在屏幕上的位置（0..1）与可见度，给体积光用
  sunScreen(camera, out) {
    const p = _v.copy(camera.position).addScaledVector(this.sunWorldDir, 1000).project(camera);
    const fwd = camera.getWorldDirection(_f).dot(this.sunWorldDir);
    out.x = p.x * 0.5 + 0.5; out.y = p.y * 0.5 + 0.5;
    const off = Math.max(Math.abs(p.x), Math.abs(p.y));
    return fwd > 0 ? Math.max(0, 1 - Math.max(0, off - 1) * 1.6) * Math.min(1, fwd * 3) : 0;
  }

  update(dt, time) {
    this.skyMat.uniforms.uTime.value = time;
    if (this.t !== this.target) {
      const d = Math.sign(this.target - this.t) * dt / 3.0;      // 白天到夜晚约 3 秒
      let n = this.t + d;
      if ((d > 0 && n > this.target) || (d < 0 && n < this.target)) n = this.target;
      this.apply(n);
    }
  }
}
const _v = new THREE.Vector3(), _f = new THREE.Vector3();
