/**
 * Khử nhiễu hạt cho ảnh path tracing: lọc song phương (bilateral) 2 lượt trên canvas 2D.
 * Giữ cạnh (chênh màu lớn không bị trộn), làm mịn nhiễu hạt ở vùng phẳng.
 */
export function denoise(canvas: HTMLCanvasElement, strength = 1): void {
  const g = canvas.getContext('2d', { willReadFrequently: true })!;
  const { width: w, height: h } = canvas;
  const img = g.getImageData(0, 0, w, h);
  let src: Uint8ClampedArray = img.data;
  const R = 3;
  const sigmaS = 2.2;
  const sigmaC = 34 * strength; // ngưỡng chênh màu (0–255)
  const spatial: number[] = [];
  for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) spatial.push(Math.exp(-(dx * dx + dy * dy) / (2 * sigmaS * sigmaS)));
  const range = new Float32Array(256 * 3 + 1);
  for (let i = 0; i < range.length; i++) range[i] = Math.exp(-(i * i) / (2 * sigmaC * sigmaC * 3));

  for (let pass = 0; pass < 2; pass++) {
    const dst = new Uint8ClampedArray(src.length);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const r0 = src[i];
        const g0 = src[i + 1];
        const b0 = src[i + 2];
        let sr = 0;
        let sg = 0;
        let sb = 0;
        let sw = 0;
        let k = 0;
        for (let dy = -R; dy <= R; dy++) {
          const yy = Math.min(h - 1, Math.max(0, y + dy));
          for (let dx = -R; dx <= R; dx++, k++) {
            const xx = Math.min(w - 1, Math.max(0, x + dx));
            const j = (yy * w + xx) * 4;
            const d = Math.abs(src[j] - r0) + Math.abs(src[j + 1] - g0) + Math.abs(src[j + 2] - b0);
            const wgt = spatial[k] * range[d];
            sr += src[j] * wgt;
            sg += src[j + 1] * wgt;
            sb += src[j + 2] * wgt;
            sw += wgt;
          }
        }
        dst[i] = sr / sw;
        dst[i + 1] = sg / sw;
        dst[i + 2] = sb / sw;
        dst[i + 3] = 255;
      }
    }
    src = dst;
  }
  img.data.set(src);
  g.putImageData(img, 0, 0);
}
