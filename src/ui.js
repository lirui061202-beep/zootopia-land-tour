// 小地图、景点提示、按钮
import { BLOCKS, PARK, ROAD, POIS, ZPD, ZOOTRON, CIRCLE, WALLS } from './layout.js';

export class UI {
  constructor(walker, env) {
    this.walker = walker; this.env = env;
    this.cv = document.querySelector('#map canvas');
    this.g = this.cv.getContext('2d');
    this.poiEl = document.getElementById('poi');
    this.cur = null;
    // 地图范围（平面坐标）
    this.x0 = -70; this.x1 = 96; this.y0 = -96; this.y1 = 42;
    const W = this.cv.width, H = this.cv.height;
    this.s = Math.min(W / (this.x1 - this.x0), H / (this.y1 - this.y0));
    this.ox = (W - (this.x1 - this.x0) * this.s) / 2; this.oy = (H - (this.y1 - this.y0) * this.s) / 2;
    this.cv.parentElement.addEventListener('click', (e) => {
      const r = this.cv.getBoundingClientRect();
      const px = ((e.clientX - r.left) / r.width) * W, py = ((e.clientY - r.top) / r.height) * H;
      walker.teleport((px - this.ox) / this.s + this.x0, this.y1 - (py - this.oy) / this.s);
    });
    this.bg = document.createElement('canvas'); this.bg.width = W; this.bg.height = H;
    this._drawBg();
  }

  X(x) { return this.ox + (x - this.x0) * this.s; }
  Y(y) { return this.oy + (this.y1 - y) * this.s; }

  _poly(g, poly, fill, stroke) {
    g.beginPath(); poly.forEach((p, i) => (i ? g.lineTo(this.X(p[0]), this.Y(p[1])) : g.moveTo(this.X(p[0]), this.Y(p[1])))); g.closePath();
    if (fill) { g.fillStyle = fill; g.fill(); } if (stroke) { g.strokeStyle = stroke; g.lineWidth = 1.5; g.stroke(); }
  }

  // 小地图画成动物城的城市导览图：深蓝底、亮色街区、白色马路加黄色中线
  _drawBg() {
    const g = this.bg.getContext('2d'), W = this.bg.width, H = this.bg.height;
    const bgG = g.createLinearGradient(0, 0, 0, H); bgG.addColorStop(0, '#12306b'); bgG.addColorStop(1, '#0b1a3c'); g.fillStyle = bgG; g.fillRect(0, 0, W, H);
    g.strokeStyle = 'rgba(120,190,255,.10)'; g.lineWidth = 1;                      // 淡淡的方格，像导览图的坐标网
    for (let x = 0; x < W; x += 38) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
    for (let y = 0; y < H; y += 38) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
    this._poly(g, PARK, '#35c27a', 'rgba(255,255,255,.35)');
    const cols = { ride: '#2c4f9c', west: '#ff7fb0', central: '#a988f2', east: '#ff9a3d' };
    for (const k of ['ride', 'west', 'central', 'east']) this._poly(g, BLOCKS[k], cols[k], 'rgba(255,255,255,.55)');
    const line = (pts) => { g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(this.X(p[0]), this.Y(p[1])) : g.moveTo(this.X(p[0]), this.Y(p[1])))); g.stroke(); };
    g.lineCap = g.lineJoin = 'round';
    g.strokeStyle = '#0b1a3c'; g.lineWidth = 7.4 * this.s; line(ROAD);                 // 马路：深色描边 + 白色路面 + 黄色虚线
    g.strokeStyle = '#f2f6ff'; g.lineWidth = 5.4 * this.s; line(ROAD);
    const rx = (CIRCLE.rOut + CIRCLE.rIn) / 2 * this.s;
    g.lineWidth = (CIRCLE.rOut - CIRCLE.rIn) * this.s; g.beginPath(); g.ellipse(this.X(CIRCLE.c[0]), this.Y(CIRCLE.c[1]), rx * (CIRCLE.sx || 1), rx * (CIRCLE.sy || 1), 0, 0, 7); g.stroke();
    g.fillStyle = '#35c27a'; g.beginPath(); g.ellipse(this.X(CIRCLE.c[0]), this.Y(CIRCLE.c[1]), CIRCLE.rIn * this.s * (CIRCLE.sx || 1), CIRCLE.rIn * this.s * (CIRCLE.sy || 1), 0, 0, 7); g.fill();
    g.setLineDash([6, 7]); g.strokeStyle = '#ffd23a'; g.lineWidth = 1.6; line(ROAD); g.setLineDash([]);
    g.strokeStyle = 'rgba(53,201,242,.75)'; g.lineWidth = 1.6; for (const w of WALLS) line(w);
    // 警局（金色警徽）和广告塔（霓虹洋红）
    g.fillStyle = '#ffd23a'; g.strokeStyle = '#fff'; g.lineWidth = 2; g.beginPath(); g.arc(this.X(ZPD.c[0]), this.Y(ZPD.c[1]), ZPD.r * this.s, 0, 7); g.fill(); g.stroke();
    g.fillStyle = '#ff4fb0'; g.beginPath(); g.arc(this.X(ZOOTRON.c[0]), this.Y(ZOOTRON.c[1]), ZOOTRON.r * this.s, 0, 7); g.fill(); g.stroke();
    g.font = 'bold 15px "Microsoft YaHei",sans-serif'; g.textAlign = 'center'; g.lineJoin = 'round';
    const tags = [['警局', ZPD.c[0], ZPD.c[1] - 2], ['大屏', ZOOTRON.c[0], ZOOTRON.c[1] + 12], ['公寓群', -13, -50], ['露露', -46, -34], ['食集', 38, -40], ['入口', -52, -90]];
    for (const [t, x, y] of tags) { g.strokeStyle = 'rgba(8,18,44,.85)'; g.lineWidth = 4; g.strokeText(t, this.X(x), this.Y(y)); g.fillStyle = '#fff'; g.fillText(t, this.X(x), this.Y(y)); }
    g.fillStyle = '#35c9f2'; g.font = 'bold 13px sans-serif'; g.fillText('N ↑', W - 24, 20);
  }

  update() {
    const g = this.g, w = this.walker;
    g.clearRect(0, 0, this.cv.width, this.cv.height);
    g.drawImage(this.bg, 0, 0);
    // 游客箭头
    g.save(); g.translate(this.X(w.pos.x), this.Y(w.pos.y)); g.rotate(w.yaw);
    g.fillStyle = 'rgba(53,201,242,.28)'; g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, 42, -Math.PI / 2 - 0.55, -Math.PI / 2 + 0.55); g.fill();
    g.fillStyle = '#ff7a1a'; g.strokeStyle = '#fff'; g.lineWidth = 2.2;
    g.beginPath(); g.moveTo(0, -11); g.lineTo(7, 8); g.lineTo(0, 4); g.lineTo(-7, 8); g.closePath(); g.fill(); g.stroke();
    g.restore();
    // 景点提示
    let best = null, bd = 1e9;
    for (const p of POIS) { const d = Math.hypot(p.p[0] - w.pos.x, p.p[1] - w.pos.y) / p.r; if (d < 1 && d < bd) { bd = d; best = p; } }
    if (best !== this.cur) {
      this.cur = best;
      if (best) { this.poiEl.innerHTML = `<b>${best.zh}</b><small>${best.en}</small>`; this.poiEl.classList.add('on'); }
      else this.poiEl.classList.remove('on');
    }
  }
}
