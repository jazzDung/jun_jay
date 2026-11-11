/**
 * Dựng lớp ốp lam sóng / ván phẳng trên một mảng tường (toạ độ cục bộ WallFrame, m).
 *
 * Biên dạng ngang (x, z) lặp lại theo bước sóng; mỗi bước: nửa rãnh – bậc lên – mặt sóng –
 * bậc xuống – nửa rãnh. Biên dạng được đùn theo chiều cao (y) thành các mặt phẳng, có
 * nắp trên/dưới/hai đầu, và chừa trống các ô cửa. Một mesh cho cả mảng ốp.
 */
import * as THREE from 'three';
import type { Opening, Panel, PanelFinish, PanelProfile } from '../../data/schema';
import { cm } from '../units';
import type { WallFrame } from './wallFrame';

const textureCache = new Map<string, THREE.Texture>();
const loader = new THREE.TextureLoader();

function loadTexture(url: string): THREE.Texture {
  let t = textureCache.get(url);
  if (!t) {
    t = loader.load(url);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.MirroredRepeatWrapping; // soi gương → không lộ đường nối ô
    t.anisotropy = 8;
    textureCache.set(url, t);
  }
  return t;
}

export function panelMaterial(panel: Panel, finish: PanelFinish, baseUrl: string): THREE.MeshStandardMaterial {
  const roughness = { matte: 0.75, satin: 0.5, gloss: 0.3 }[panel.sheen];
  const mat = new THREE.MeshStandardMaterial({ roughness, metalness: 0 });
  if (finish.texture) {
    mat.map = loadTexture(baseUrl + finish.texture);
    mat.color.set(panel.tone ?? '#ffffff');
  } else {
    mat.color.set(panel.tone ?? finish.color);
  }
  return mat;
}

interface Pt {
  x: number;
  z: number;
}

/** Độ dày biên dạng tại x (m) — hàm bậc thang theo bước sóng tính từ gốc `x0` của tấm ốp. */
function profileFn(p: PanelProfile, x0: number) {
  const pitch = cm(p.width / p.ridges);
  const ridge = Math.min(cm(p.ridgeWidth), pitch);
  const groove = pitch - ridge;
  const base = cm(p.base);
  const top = base + cm(p.ridgeDepth);
  return {
    pitch,
    /** Các điểm x trong khoảng [a, b] nơi biên dạng đổi độ dày. */
    breaks(a: number, b: number): number[] {
      const out: number[] = [];
      const k0 = Math.floor((a - x0) / pitch) - 1;
      const k1 = Math.ceil((b - x0) / pitch) + 1;
      for (let k = k0; k <= k1; k++) {
        for (const x of [x0 + k * pitch + groove / 2, x0 + k * pitch + groove / 2 + ridge]) {
          if (x > a + 1e-6 && x < b - 1e-6) out.push(x);
        }
      }
      return out;
    },
    z(x: number): number {
      const t = (((x - x0) % pitch) + pitch) % pitch;
      return t >= groove / 2 && t < groove / 2 + ridge ? top : base;
    },
  };
}

/** Polyline (x, z) của biên dạng trên đoạn [a, b], gồm cả bậc thẳng đứng. */
function polyline(fn: ReturnType<typeof profileFn>, a: number, b: number): Pt[] {
  const pts: Pt[] = [{ x: a, z: fn.z(a + 1e-5) }];
  for (const x of fn.breaks(a, b)) {
    const before = fn.z(x - 1e-5);
    const after = fn.z(x + 1e-5);
    pts.push({ x, z: before }, { x, z: after });
  }
  pts.push({ x: b, z: fn.z(b - 1e-5) });
  return pts;
}

class GeoBuilder {
  pos: number[] = [];
  nor: number[] = [];
  uv: number[] = [];
  constructor(private readonly period: [number, number]) {}

  /** Tứ giác 4 đỉnh theo thứ tự ngược chiều kim đồng hồ khi nhìn từ phía pháp tuyến. */
  quad(v: [number, number, number][], n: [number, number, number], uvMode: 'xy' | 'zy' | 'xz') {
    const [pw, ph] = this.period;
    const uvOf = ([x, y, z]: [number, number, number]): [number, number] =>
      uvMode === 'xy' ? [x / pw, y / ph] : uvMode === 'zy' ? [z / pw, y / ph] : [x / pw, z / ph];
    for (const i of [0, 1, 2, 0, 2, 3]) {
      this.pos.push(...v[i]);
      this.nor.push(...n);
      this.uv.push(...uvOf(v[i]));
    }
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    return g;
  }
}

/** Trừ các khoảng `holes` khỏi [lo, hi]. */
function subtract(lo: number, hi: number, holes: [number, number][]): [number, number][] {
  let parts: [number, number][] = [[lo, hi]];
  for (const [a, b] of holes) {
    parts = parts.flatMap(([p, q]) => {
      if (b <= p || a >= q) return [[p, q] as [number, number]];
      const out: [number, number][] = [];
      if (a > p) out.push([p, a]);
      if (b < q) out.push([b, q]);
      return out;
    });
  }
  return parts.filter(([p, q]) => q - p > 0.002);
}

export function buildPanel(
  frame: WallFrame,
  panel: Panel,
  profile: PanelProfile,
  finish: PanelFinish,
  openings: Opening[],
  baseUrl: string,
): THREE.Mesh {
  const [x0, x1] = panel.uRange ? frame.rangeToX(panel.uRange) : [0, frame.length];
  const yTop = panel.coverage === 'full' ? frame.height : Math.min(cm(panel.wainscotHeight), frame.height);
  const fn = profileFn(profile, x0);
  const period: [number, number] = finish.period ? [cm(finish.period.w), cm(finish.period.h)] : [0.2, 0.6];
  const geo = new GeoBuilder(period);

  const holes = openings.map((o) => {
    const [a, b] = frame.rangeToX(o.u);
    return { a, b, y0: cm(o.sill), y1: cm(o.sill + o.height) };
  });

  // Chia [x0, x1] tại mép các ô cửa → mỗi khoảng có cùng tập đoạn dọc cần ốp.
  const cuts = [x0, x1, ...holes.flatMap((h) => [h.a, h.b])].filter((x) => x >= x0 && x <= x1).sort((p, q) => p - q);
  for (let i = 0; i < cuts.length - 1; i++) {
    const a = cuts[i];
    const b = cuts[i + 1];
    if (b - a < 0.002) continue;
    const mid = (a + b) / 2;
    const vHoles = holes.filter((h) => h.a < mid && h.b > mid).map((h) => [h.y0, h.y1] as [number, number]);
    const pts = polyline(fn, a, b);
    for (const [y0, y1] of subtract(0, yTop, vHoles)) {
      // mặt trước + các bậc
      for (let k = 0; k < pts.length - 1; k++) {
        const p = pts[k];
        const q = pts[k + 1];
        const dx = q.x - p.x;
        const dz = q.z - p.z;
        const len = Math.hypot(dx, dz);
        if (len < 1e-6) continue;
        const n: [number, number, number] = [-dz / len, 0, dx / len];
        geo.quad(
          [
            [p.x, y0, p.z],
            [q.x, y0, q.z],
            [q.x, y1, q.z],
            [p.x, y1, p.z],
          ],
          n,
          Math.abs(dx) > 1e-6 ? 'xy' : 'zy',
        );
      }
      // nắp trên (khi chưa chạm trần) / dưới (khi không chạm sàn): dải từ mặt tường (z=0) tới biên dạng
      for (const [y, up] of [
        [y1, true],
        [y0, false],
      ] as const) {
        if ((up && y >= frame.height - 1e-4) || (!up && y <= 1e-4)) continue;
        for (let k = 0; k < pts.length - 1; k++) {
          const p = pts[k];
          const q = pts[k + 1];
          if (Math.abs(q.x - p.x) < 1e-6) continue;
          const v: [number, number, number][] = [
            [p.x, y, 0],
            [q.x, y, 0],
            [q.x, y, q.z],
            [p.x, y, p.z],
          ];
          geo.quad(up ? [v[3], v[2], v[1], v[0]] : v, [0, up ? 1 : -1, 0], 'xz');
        }
      }
      // nắp hai đầu (mép ốp hoặc mép ô cửa)
      for (const [x, sign] of [
        [a, -1],
        [b, 1],
      ] as const) {
        if ((sign < 0 && x <= 1e-4) || (sign > 0 && x >= frame.length - 1e-4)) continue;
        const z = fn.z(x - sign * 1e-5);
        const v: [number, number, number][] = [
          [x, y0, 0],
          [x, y0, z],
          [x, y1, z],
          [x, y1, 0],
        ];
        geo.quad(sign > 0 ? [v[3], v[2], v[1], v[0]] : v, [sign, 0, 0], 'zy');
      }
    }
  }

  const mesh = new THREE.Mesh(geo.build(), panelMaterial(panel, finish, baseUrl));
  mesh.position.z = 0.0005; // tách khỏi mặt tường
  mesh.name = `panel:${frame.wall.id}`;
  return mesh;
}
