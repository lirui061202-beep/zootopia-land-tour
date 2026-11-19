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

  _drawBg() {
    const g = this.bg.getContext('2d'), W = this.bg.width, H = this.bg.height;
    g.fillStyle = '#f3e2bd'; g.fillRect(0, 0, W, H);                 // 手帐纸的底色
    this._poly(g, PARK, '#9ccf86');
    g.strokeStyle = '#7f8a8d'; g.lineWidth = 5.8 * this.s; g.lineCap = g.lineJoin = 'round';
    g.beginPath(); ROAD.forEach((p, i) => (i ? g.lineTo(this.X(p[0]), this.Y(p[1])) : g.moveTo(this.X(p[0]), this.Y(p[1])))); g.stroke();
    g.beginPath(); g.arc(this.X(CIRCLE.c[0]), this.Y(CIRCLE.c[1]), (CIRCLE.rOut + CIRCLE.rIn) / 2 * this.s, 0, 7); g.lineWidth = (CIRCLE.rOut - CIRCLE.rIn) * this.s; g.stroke();
    const cols = { west: '#f0a9a2', central: '#bfa6e2', east: '#eaa06e', ride: '#d9c08c' };
    for (const [k, p] of Object.entries(BLOCKS)) this._poly(g, p, cols[k], 'rgba(35,71,74,.45)');
    g.fillStyle = '#d9a066'; g.beginPath(); g.arc(this.X(ZPD.c[0]), this.Y(ZPD.c[1]), ZPD.r * this.s, 0, 7); g.fill();
    g.fillStyle = '#c9743f'; g.beginPath(); g.arc(this.X(ZOOTRON.c[0]), this.Y(ZOOTRON.c[1]), ZOOTRON.r * this.s, 0, 7); g.fill();
    g.strokeStyle = 'rgba(31,111,107,.6)'; g.lineWidth = 1.5;
    for (const w of WALLS) { g.beginPath(); w.forEach((p, i) => (i ? g.lineTo(this.X(p[0]), this.Y(p[1])) : g.moveTo(this.X(p[0]), this.Y(p[1])))); g.stroke(); }
    g.fillStyle = '#23474a'; g.font = 'bold 15px "Microsoft YaHei",sans-serif'; g.textAlign = 'center';
    const tags = [['警局', ZPD.c[0], ZPD.c[1] + 16], ['大屏', ZOOTRON.c[0], ZOOTRON.c[1] + 12], ['公寓群', -13, -50], ['露露', -46, -34], ['食集', 43, -52], ['入口', -52, -90]];
    for (const [t, x, y] of tags) g.fillText(t, this.X(x), this.Y(y));
    g.fillStyle = '#1f6f6b'; g.font = 'bold 13px sans-serif'; g.fillText('N ↑', W - 24, 20);
  }

  update() {
    const g = this.g, w = this.walker;
    g.clearRect(0, 0, this.cv.width, this.cv.height);
    g.drawImage(this.bg, 0, 0);
    // 游客箭头
    g.save(); g.translate(this.X(w.pos.x), this.Y(w.pos.y)); g.rotate(w.yaw);
    g.fillStyle = 'rgba(255,140,30,.3)'; g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, 42, -Math.PI / 2 - 0.55, -Math.PI / 2 + 0.55); g.fill();
    g.fillStyle = '#ff8c1e'; g.strokeStyle = '#3a2408'; g.lineWidth = 2;
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
