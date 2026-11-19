// 立面图像素处理的 Worker：解码图片 → processSheet → 把结果缓冲区零拷贝交回主线程
import { processSheet } from './facade-pix.js';

async function getPixels(url, W, H, maxW = 0) {
  const bmp = await createImageBitmap(await (await fetch(url)).blob());
  let w = W || bmp.width, h = H || bmp.height;
  if (!W && maxW && w > maxW) { h = Math.round((h * maxW) / w); w = maxW; W = w; }
  const c = new OffscreenCanvas(w, h), g = c.getContext('2d', { willReadFrequently: true });
  if (W) g.imageSmoothingQuality = 'high';
  g.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  return { data: g.getImageData(0, 0, w, h).data, w, h };
}

self.onmessage = async (e) => {
  const { id, job } = e.data;
  try {
    const { result, transfer } = await processSheet(job, getPixels);
    self.postMessage({ id, result }, transfer);
  } catch (err) {
    self.postMessage({ id, error: String(err && err.message || err) });
  }
};
