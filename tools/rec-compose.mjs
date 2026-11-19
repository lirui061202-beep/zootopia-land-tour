// 把 rec/frames 里的逐帧画面合成成片：片头字、蓝色路牌字幕、片尾字、淡入淡出，可选配乐。
// 用法：node tools/rec-compose.mjs [配乐文件]              →  rec/zootopia-diary-1440p.mp4 + rec/zootopia-diary.mp4
//       node tools/rec-compose.mjs --portrait [配乐文件]   →  rec/zootopia-diary-vertical.mp4（1080×1920，用 rec/frames_v 里的竖版帧）
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const REC = path.join(path.dirname(path.dirname(fileURLToPath(import.meta.url))), 'rec');
process.chdir(REC);                                    // 滤镜里的路径都用相对路径，避开盘符冒号的转义
const { SHOTS, FPS } = await import('./rec-shots.js');
const START = {}; let DUR = 0; for (const sh of SHOTS) { START[sh.id] = [DUR, DUR + sh.dur]; DUR += sh.dur; }   // 每个镜头的起止秒数
const S = 1440 / 1080;                                  // 逐帧画面是 1440p；叠加的字和牌子按 1080p 设计，这里统一放大
const px = (n) => Math.round(n * S);
const PORTRAIT = process.argv.includes('--portrait');
const music = process.argv.slice(2).find((a) => !a.startsWith('--')) || ['bgm.mp3', 'bgm.webm', 'bgm.m4a'].find((n) => fs.existsSync(n)) || null;
for (const [src, dst] of [['C:/Windows/Fonts/msyhbd.ttc', 'font_b.ttc'], ['C:/Windows/Fonts/msyh.ttc', 'font_r.ttc']]) if (!fs.existsSync(dst)) fs.copyFileSync(src, dst);
const ff = (args) => execFileSync('ffmpeg', ['-v', 'error', '-y', ...args], { stdio: 'inherit' });

// [镜头, 中文, 英文小字, 位置, 竖版位置]：字幕在镜头开始 0.5 秒后出现、结束前 0.5 秒消失。
// 文案只写画面里看得见的东西，不做评价；位置默认左下角，'top' 放左上角（烟花镜头里城堡在画面下方，左下角会挡住它）
const CAPS = [
  ['entrance', '上午十点，露露精品店的橱窗里挂着小裙子', 'FASHIONS BY FRU FRU'],
  ['frufru', '店门口站着一位熊门童', 'THE DOORMAN', 'bottom', 'top'],      // 竖版里门童在画面最下方，字幕牌改放上面
  ['circle', '追尾环岛旁，一座塔上挂满了广告', 'TAIL CHASE CIRCLE'],
  ['police', '砂岩巨石垒成的动物城警局', 'ZOOTOPIA POLICE DEPARTMENT'],
  ['castle', '黄昏，树梢后面露出城堡的尖顶', 'DUSK'],
  ['nightfall', '灯，一盏一盏亮起来', 'NIGHTFALL'],
  ['neon', '入夜，警局的招牌亮了', 'AFTER DARK'],
  ['fireworks', '城堡上空，烟花升起', 'FIREWORKS OVER THE CASTLE', 'top'],
].map(([id, zh, en, pos, posV]) => [START[id][0] + 0.5, START[id][1] - 0.5, zh, en, (PORTRAIT && posV) || pos || 'bottom']);
// 1. 每条字幕做成一张带透明底的行李牌
CAPS.forEach(([, , zh, en], i) => {
  fs.writeFileSync(`cap${i}_zh.txt`, zh); fs.writeFileSync(`cap${i}_en.txt`, en);
  ff(['-i', 'gfx/plate2.png', '-vf',
    `colorkey=0xFF00FF:0.30:0.08,crop=1392:262:72:381,scale=1000:-1,` +
    `drawtext=fontfile=font_b.ttc:textfile=cap${i}_zh.txt:fontsize=42:fontcolor=white:shadowcolor=0x0a2a80@0.7:shadowx=0:shadowy=2:x=166:y=44,` +
    `drawtext=fontfile=font_r.ttc:textfile=cap${i}_en.txt:fontsize=22:fontcolor=0xd6e9ff:x=168:y=110`,
    '-frames:v', '1', `cap${i}.png`]);
});
fs.writeFileSync('end_zh.txt', '动物城，下次见'); fs.writeFileSync('end_en.txt', 'SEE YOU NEXT TIME');

// 2. 合成
const inputs = ['-framerate', String(FPS), '-i', (PORTRAIT ? 'frames_v' : 'frames') + '/f_%05d.jpg', '-loop', '1', '-t', String(DUR), '-i', 'gfx/title2.png'];
CAPS.forEach((_, i) => inputs.push('-loop', '1', '-t', String(DUR), '-i', `cap${i}.png`));
let g = `[1:v]scale=${px(PORTRAIT ? 1010 : 1500)}:-1,format=rgba,colorkey=0x000000:0.07:0.16,fade=t=in:st=0.8:d=0.7:alpha=1,fade=t=out:st=${(START.arrive[1] - 1.4).toFixed(2)}:d=0.8:alpha=1[ttl];` +
        // 片头字抠掉黑底后直接盖在画面上（滤色叠加在白天的亮天空上会发灰），字后面的画面同时压暗一点
        `[0:v]eq=brightness='-0.10*between(t,1.0,${(START.arrive[1] - 0.9).toFixed(2)})':eval=frame[base];[base][ttl]overlay=x=(W-w)/2:y=${PORTRAIT ? 'H*0.17' : '(H-h)/2-' + px(40)}:enable='between(t,0.8,${(START.arrive[1] - 0.5).toFixed(2)})',format=yuv420p[v0];`;
CAPS.forEach(([a, b, , , pos], i) => {
  g += `[${i + 2}:v]format=rgba,scale=${px(PORTRAIT ? 960 : 1000)}:-1,fade=t=in:st=${a}:d=0.45:alpha=1,fade=t=out:st=${(b - 0.45).toFixed(2)}:d=0.45:alpha=1[c${i}];` +
       `[v${i}][c${i}]overlay=x=${PORTRAIT ? '(W-w)/2' : px(70)}:y=${pos === 'top' ? px(PORTRAIT ? 200 : 64) : 'H-h-' + px(PORTRAIT ? 240 : 70)}:enable='between(t,${a},${b})'[v${i + 1}];`;
});
const n = CAPS.length;
const e0 = DUR - 4.6;            // 片尾字：最后 4.6 秒里淡入、停留、淡出。放在画面上方的空天里，不压在烟花和城堡上
const endA = `if(lt(t,${e0}),0,if(lt(t,${e0 + 1}),t-${e0},if(lt(t,${e0 + 3.4}),1,max(0,${e0 + 4.2}-t)/0.8)))`;
g += `[v${n}]drawtext=fontfile=font_b.ttc:textfile=end_zh.txt:fontsize=${px(92)}:fontcolor=white:shadowcolor=black@0.6:shadowx=4:shadowy=5:x=(w-text_w)/2:y=h*0.13:alpha='${endA}',` +
     `drawtext=fontfile=font_r.ttc:textfile=end_en.txt:fontsize=${px(28)}:fontcolor=white@0.9:shadowcolor=black@0.6:shadowx=2:shadowy=2:x=(w-text_w)/2:y=h*0.13+${px(130)}:alpha='${endA}',` +
     `${PORTRAIT ? 'scale=1080:1920:flags=lanczos,' : ''}fade=t=in:st=0:d=0.7,fade=t=out:st=${DUR - 1.3}:d=1.3[vout]`;
const args = [...inputs];
if (music) args.push('-i', music);
args.push('-filter_complex', g + (music ? `;[${n + 2}:a]atrim=0:${DUR},afade=t=in:st=0:d=1.2,afade=t=out:st=${DUR - 3}:d=3,volume=0.9[aout]` : ''), '-map', '[vout]');
if (music) args.push('-map', '[aout]', '-c:a', 'aac', '-b:a', '192k');
if (PORTRAIT) {
  // 竖版：字幕牌居中放在下方（给手机界面留出底边），片头字放在上三分之一；直接出 1080×1920 一份
  args.push('-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-maxrate', '16M', '-bufsize', '32M', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-t', String(DUR), 'zootopia-diary-vertical.mp4');
  ff(args);
  console.log('done -> ' + path.join(REC, 'zootopia-diary-vertical.mp4') + (music ? ' (with music)' : ' (silent)'));
  process.exit(0);
}
args.push('-c:v', 'libx264', '-preset', 'medium', '-crf', '17', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-t', String(DUR), 'zootopia-diary-1440p.mp4');
ff(args);
// 再出一份 1080p 的分享版（由 1440p 缩小而来，等于做了一遍超采样）
ff(['-i', 'zootopia-diary-1440p.mp4', '-vf', 'scale=1920:1080:flags=lanczos', '-c:v', 'libx264', '-preset', 'medium', '-crf', '19', '-maxrate', '16M', '-bufsize', '32M', '-pix_fmt', 'yuv420p', '-c:a', 'copy', '-movflags', '+faststart', 'zootopia-diary.mp4']);
console.log('done -> ' + path.join(REC, 'zootopia-diary-1440p.mp4') + ' + zootopia-diary.mp4' + (music ? ' (with music)' : ' (silent)'));
