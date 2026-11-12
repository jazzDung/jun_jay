/**
 * Hoạ tiết sinh bằng code cho thảm, tranh, vải, mặt bàn… Dùng trong catalog qua
 *   "texture": "gen:<tên>:<màu1>,<màu2>,…"
 * Tên: kilim | persian | bauhaus | lattice | zellige | cane | stripes | checker.
 * Canvas nằm trong bộ nhớ CPU (willReadFrequently) để không mất khi GPU reset.
 */
import * as THREE from 'three';

type Draw = (g: CanvasRenderingContext2D, s: number, c: string[], rand: () => number) => void;

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

const kilim: Draw = (g, s, c) => {
  g.fillStyle = c[0];
  g.fillRect(0, 0, s, s);
  const bands = 7;
  const bh = s / bands;
  for (let b = 0; b < bands; b++) {
    const y = b * bh;
    g.fillStyle = c[(b % (c.length - 1)) + 1];
    if (b % 2 === 0) {
      // dải kim cương
      const n = 6;
      for (let i = 0; i < n; i++) {
        const cx = ((i + 0.5) * s) / n;
        g.beginPath();
        g.moveTo(cx, y + 4);
        g.lineTo(cx + s / n / 2 - 3, y + bh / 2);
        g.lineTo(cx, y + bh - 4);
        g.lineTo(cx - s / n / 2 + 3, y + bh / 2);
        g.closePath();
        g.fill();
      }
    } else {
      // dải răng cưa
      g.fillRect(0, y + bh * 0.35, s, bh * 0.3);
      for (let i = 0; i < 16; i++) g.fillRect((i * s) / 16, y + bh * 0.15, s / 32, bh * 0.7);
    }
  }
  g.strokeStyle = c[c.length - 1];
  g.lineWidth = s * 0.03;
  g.strokeRect(0, 0, s, s);
};

const persian: Draw = (g, s, c, rand) => {
  g.fillStyle = c[0];
  g.fillRect(0, 0, s, s);
  // viền nhiều lớp
  [0.02, 0.06, 0.1].forEach((m, i) => {
    g.strokeStyle = c[(i % (c.length - 1)) + 1];
    g.lineWidth = s * 0.025;
    g.strokeRect(s * m, s * m, s * (1 - 2 * m), s * (1 - 2 * m));
  });
  // hoa văn nhỏ rải đều
  for (let i = 0; i < 140; i++) {
    const x = s * (0.14 + rand() * 0.72);
    const y = s * (0.14 + rand() * 0.72);
    g.fillStyle = c[1 + Math.floor(rand() * (c.length - 1))];
    g.beginPath();
    g.arc(x, y, s * (0.006 + rand() * 0.01), 0, Math.PI * 2);
    g.fill();
  }
  // huy chương giữa
  const R = s * 0.2;
  for (let k = 3; k > 0; k--) {
    g.fillStyle = c[k % c.length];
    g.beginPath();
    for (let a = 0; a < 16; a++) {
      const r = (R * k) / 3 * (a % 2 ? 0.78 : 1);
      const t = (a / 16) * Math.PI * 2;
      g.lineTo(s / 2 + Math.cos(t) * r, s / 2 + Math.sin(t) * r * 1.25);
    }
    g.closePath();
    g.fill();
  }
};

const bauhaus: Draw = (g, s, c, rand) => {
  g.fillStyle = c[0];
  g.fillRect(0, 0, s, s);
  const n = 4;
  const u = s / n;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const col = c[1 + Math.floor(rand() * (c.length - 1))];
      g.fillStyle = col;
      const k = Math.floor(rand() * 5);
      const px = x * u;
      const py = y * u;
      g.beginPath();
      if (k === 0) g.arc(px + u / 2, py + u / 2, u * 0.42, 0, Math.PI * 2);
      else if (k === 1) g.rect(px + u * 0.08, py + u * 0.08, u * 0.84, u * 0.84);
      else if (k === 2) {
        g.moveTo(px + u * 0.08, py + u * 0.92);
        g.lineTo(px + u * 0.92, py + u * 0.92);
        g.lineTo(px + u * 0.08, py + u * 0.08);
      } else if (k === 3) g.arc(px, py + u, u * 0.9, -Math.PI / 2, 0);
      else g.rect(px + u * 0.08, py + u * 0.35, u * 0.84, u * 0.3);
      if (k === 3) g.lineTo(px, py + u);
      g.fill();
    }
  }
};

const lattice: Draw = (g, s, c) => {
  g.fillStyle = c[1] ?? '#1f1a17';
  g.fillRect(0, 0, s, s);
  g.strokeStyle = c[0];
  g.lineWidth = s * 0.012;
  const n = 8;
  const u = s / n;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const cx = (x + 0.5) * u;
      const cy = (y + 0.5) * u;
      g.beginPath();
      for (let a = 0; a < 8; a++) {
        const r = u * (a % 2 ? 0.28 : 0.5);
        const t = (a / 8) * Math.PI * 2 + Math.PI / 8;
        g.lineTo(cx + Math.cos(t) * r, cy + Math.sin(t) * r);
      }
      g.closePath();
      g.stroke();
      g.strokeRect(cx - u * 0.14, cy - u * 0.14, u * 0.28, u * 0.28);
    }
  }
  g.lineWidth = s * 0.03;
  g.strokeRect(0, 0, s, s);
};

const zellige: Draw = (g, s, c, rand) => {
  const n = 10;
  const u = s / n;
  g.fillStyle = '#e9e2d2';
  g.fillRect(0, 0, s, s);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      g.fillStyle = c[Math.floor(rand() * c.length)];
      g.globalAlpha = 0.82 + rand() * 0.18;
      g.fillRect(x * u + 1.5, y * u + 1.5, u - 3, u - 3);
    }
  }
  g.globalAlpha = 1;
};

const cane: Draw = (g, s, c) => {
  g.fillStyle = c[0];
  g.fillRect(0, 0, s, s);
  g.strokeStyle = c[1] ?? '#8a6a3a';
  g.lineWidth = s * 0.008;
  const n = 14;
  for (let i = 0; i <= n; i++) {
    const p = (i / n) * s;
    g.beginPath();
    g.moveTo(p, 0);
    g.lineTo(p, s);
    g.moveTo(0, p);
    g.lineTo(s, p);
    g.moveTo(p, 0);
    g.lineTo(0, p);
    g.moveTo(s, p);
    g.lineTo(p, s);
    g.moveTo(s - p, 0);
    g.lineTo(s, p);
    g.moveTo(0, s - p);
    g.lineTo(p, s);
    g.stroke();
  }
};

const stripes: Draw = (g, s, c) => {
  const n = 12;
  for (let i = 0; i < n; i++) {
    g.fillStyle = c[i % c.length];
    g.fillRect(0, (i * s) / n, s, s / n + 1);
  }
};

const checker: Draw = (g, s, c) => {
  const n = 8;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    g.fillStyle = c[(x + y) % Math.min(2, c.length)];
    g.fillRect((x * s) / n, (y * s) / n, s / n + 1, s / n + 1);
  }
};

const DRAW: Record<string, Draw> = { kilim, persian, bauhaus, lattice, zellige, cane, stripes, checker };
const cache = new Map<string, THREE.Texture>();

/** Phân tích "gen:<tên>:<màu,…>" → texture (có cache). */
export function patternTexture(spec: string): THREE.Texture | null {
  const hit = cache.get(spec);
  if (hit) return hit;
  const [, name, colors = ''] = spec.split(':');
  const draw = DRAW[name];
  if (!draw) return null;
  const s = 512;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = s;
  const g = canvas.getContext('2d', { willReadFrequently: true })!;
  const c = colors.split(',').filter(Boolean);
  let seed = 7;
  for (const ch of spec) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
  draw(g, s, c.length ? c : ['#EFE3CC', '#B5462E', '#2B4BD9'], rng(seed));
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  cache.set(spec, tex);
  return tex;
}
