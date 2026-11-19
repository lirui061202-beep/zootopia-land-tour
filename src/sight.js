// 城堡视线：园区是被树和围墙围起来的，不留口子的话从街上任何位置都看不到 300 米外的城堡。
// 这里选了三处观景点（大马路南段越过入口围墙、警局东侧越过绿地、食集前越过绿地），
// 凡是落在「观景点 → 城堡」这几把扇形视线上的树，都不许长过视线的高度：
// 园区外围的填充树和绿地里的树直接挪开，远处的树林压矮。行道树和建筑不动。
import { CASTLE } from './fireworks.js';

export const VIEWPOINTS = [[-33, -53], [-36.5, -58], [7, -22], [3, -18.5], [45, -49.5]];
const LATS = [-44, -36, -28, -20, -12, -4, 4, 12, 20, 28, 36, 44];
const EYE = 1.65;

// (x, y) 处一棵树冠半径 r 的树，最高能长到多高而不挡住城堡 minH 米以上的部分。不在任何视线上时返回 Infinity
export function sightCap(x, y, r, minH = 24) {
  let cap = Infinity;
  const ty = -(CASTLE.z - 12);
  for (const [vx, vy] of VIEWPOINTS) for (const lat of LATS) {
    const dx = CASTLE.x + lat - vx, dy = ty - vy, D2 = dx * dx + dy * dy;
    const t = ((x - vx) * dx + (y - vy) * dy) / D2;
    if (t <= 0.01 || t >= 1) continue;
    if (Math.hypot(x - (vx + dx * t), y - (vy + dy * t)) > r + 1.2) continue;
    cap = Math.min(cap, EYE + (minH - EYE) * t);
  }
  return cap;
}
