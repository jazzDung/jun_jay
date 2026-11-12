/**
 * Texture sinh bằng canvas cho các bề mặt có sẵn của phòng (sàn gỗ, ốp PVC, trần thả).
 * Mỗi texture mô tả MỘT chu kỳ có kích thước thật `period` (m); mesh tự set repeat
 * theo kích thước của nó bằng `repeatFor()`.
 */
import * as THREE from 'three';

interface PeriodicTexture {
  texture: THREE.CanvasTexture;
  /** Kích thước thật của một ô texture [rộng, cao] (m). */
  period: [number, number];
}

const cache = new Map<string, PeriodicTexture>();

function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  // willReadFrequently → canvas nằm trong bộ nhớ CPU, không mất nội dung khi GPU bị reset
  return [c, c.getContext('2d', { willReadFrequently: true })!];
}

function finish(canvas: HTMLCanvasElement, period: [number, number]): PeriodicTexture {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 8;
  return { texture, period };
}

/** PRNG có seed để texture giống nhau giữa các lần tải. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function cached(key: string, make: () => PeriodicTexture): PeriodicTexture {
  let t = cache.get(key);
  if (!t) cache.set(key, (t = make()));
  return t;
}

/**
 * Sàn gỗ sồi sáng hiện trạng (theo ảnh ref/space): tông be ấm ngả mật ong, ván ~15 cm
 * chạy dọc trục u của texture (= trục x của quán), mối nối đầu ván so le, vân dọc rõ.
 */
export function woodOakTexture(): PeriodicTexture {
  return cached('wood_oak', () => {
    const [c, g] = makeCanvas(1024, 1024); // = 1.2 m × 1.2 m
    const rand = rng(11);
    const rows = 8; // 15 cm/ván
    const rowH = c.height / rows;
    for (let r = 0; r < rows; r++) {
      const y0 = r * rowH;
      const joint = rand() * c.width;
      // mỗi hàng: 2 đoạn ván nối tại `joint`, màu hơi khác nhau
      for (const [xa, xb] of [[0, joint], [joint, c.width]] as const) {
        const tone = 0.975 + rand() * 0.04;
        const warm = rand() * 6 - 2; // lệch nhẹ ngả mật ong / ngả xám
        g.fillStyle = `rgb(${Math.round((216 + warm) * tone)}, ${Math.round(200 * tone)}, ${Math.round((178 - warm) * tone)})`;
        g.fillRect(xa, y0, xb - xa, rowH);
        g.save();
        g.beginPath();
        g.rect(xa, y0, xb - xa, rowH);
        g.clip();
        // vân gỗ: đường dài mảnh, lượn nhẹ — sẫm ngả mật ong và sáng xen kẽ
        for (let i = 0; i < 34; i++) {
          const y = y0 + rand() * rowH;
          const dark = rand() < 0.7;
          g.strokeStyle = dark
            ? `rgba(160, 128, 92, ${0.06 + rand() * 0.12})`
            : `rgba(246, 236, 220, ${0.1 + rand() * 0.15})`;
          g.lineWidth = 0.5 + rand() * (dark ? 1.8 : 2.6);
          const phase = rand() * 10;
          const amp = 1 + rand() * 3;
          g.beginPath();
          g.moveTo(xa, y);
          for (let x = xa; x <= xb + 32; x += 32) g.lineTo(x, y + Math.sin(x / 110 + phase) * amp);
          g.stroke();
        }
        g.restore();
      }
      g.fillStyle = 'rgba(120, 100, 80, 0.45)';
      g.fillRect(joint, y0, 2, rowH); // mối nối đầu ván
      g.fillStyle = 'rgba(120, 100, 80, 0.35)';
      g.fillRect(0, y0, c.width, 2); // khe dọc giữa các ván
    }
    return finish(c, [1.2, 1.2]);
  });
}

/** Gạch vuông 30 cm. */
export function tileTexture(color: string): PeriodicTexture {
  return cached(`tile_${color}`, () => {
    const [c, g] = makeCanvas(256, 256);
    g.fillStyle = color;
    g.fillRect(0, 0, 256, 256);
    g.fillStyle = 'rgba(255,255,255,0.08)';
    g.fillRect(0, 0, 128, 128);
    g.fillRect(128, 128, 128, 128);
    g.strokeStyle = 'rgba(40, 30, 25, 0.5)';
    g.lineWidth = 3;
    g.strokeRect(0, 0, 256, 256);
    g.beginPath();
    g.moveTo(128, 0);
    g.lineTo(128, 256);
    g.moveTo(0, 128);
    g.lineTo(256, 128);
    g.stroke();
    return finish(c, [0.6, 0.6]);
  });
}

/** Ốp PVC: rãnh dọc (vgroove, bản 10 cm) hoặc sọc ngang (hstripe, bản 15 cm). */
export function pvcTexture(kind: 'pvc_vgroove' | 'pvc_hstripe', color: string): PeriodicTexture {
  return cached(`${kind}_${color}`, () => {
    const [c, g] = makeCanvas(128, 128);
    g.fillStyle = color;
    g.fillRect(0, 0, 128, 128);
    const grad =
      kind === 'pvc_vgroove' ? g.createLinearGradient(0, 0, 128, 0) : g.createLinearGradient(0, 0, 0, 128);
    grad.addColorStop(0, 'rgba(0,0,0,0.28)');
    grad.addColorStop(0.04, 'rgba(0,0,0,0.0)');
    grad.addColorStop(0.9, 'rgba(255,255,255,0.0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.06)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
    const p = kind === 'pvc_vgroove' ? 0.1 : 0.15;
    return finish(c, kind === 'pvc_vgroove' ? [p, 1] : [1, p]);
  });
}

/** Trần thả: tấm 60 × 60 với khung T xám. */
export function dropCeilingTexture(color: string, tileM: number): PeriodicTexture {
  return cached(`ceiling_${color}_${tileM}`, () => {
    const [c, g] = makeCanvas(256, 256);
    g.fillStyle = color;
    g.fillRect(0, 0, 256, 256);
    g.strokeStyle = '#C9C8C2';
    g.lineWidth = 5;
    g.strokeRect(0, 0, 256, 256);
    return finish(c, [tileM, tileM]);
  });
}

/** Phông nền ngoài cửa sổ: trời sáng phía trên, tán cây xanh phía dưới. */
export function outdoorBackdropTexture(): THREE.CanvasTexture {
  const [c, g] = makeCanvas(512, 256);
  const sky = g.createLinearGradient(0, 0, 0, 256);
  sky.addColorStop(0, '#DCE9F0');
  sky.addColorStop(0.5, '#C9DCC4');
  sky.addColorStop(1, '#6E8F5A');
  g.fillStyle = sky;
  g.fillRect(0, 0, 512, 256);
  const rand = rng(3);
  for (let i = 0; i < 260; i++) {
    const x = rand() * 512;
    const y = 60 + rand() * 200;
    const r = 8 + rand() * 26;
    const l = 30 + rand() * 25;
    g.fillStyle = `hsla(${95 + rand() * 30}, 35%, ${l}%, 0.55)`;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Clone texture (dùng chung ảnh) với repeat khớp kích thước mặt `w × h` (m). */
export function repeatFor(pt: PeriodicTexture, w: number, h: number): THREE.Texture {
  const t = pt.texture.clone();
  t.repeat.set(w / pt.period[0], h / pt.period[1]);
  t.needsUpdate = true;
  return t;
}
