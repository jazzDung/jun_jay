/**
 * Phân tích bố cục (thuần dữ liệu, đơn vị cm — không phụ thuộc Three.js):
 *  - footprint AABB của từng món (đã xoay),
 *  - khoảng cách tới 4 mặt tường của khu chứa nó,
 *  - cảnh báo: chồng lấn, xuyên tường, nằm trong vùng quét cửa, lối đi chính < minWidth.
 */
import type { CatalogItem, ItemPlacement, Room, Scene, WallPlacement, Zone } from '../data/schema';
import { wallLength } from '../data/validate';

/** Hạ chữ cái đầu (giữ nguyên viết tắt như WC). */
const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

export interface Rect {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}

export interface Warning {
  kind: 'overlap' | 'wall' | 'door' | 'aisle';
  message: string;
  /** Các món liên quan (để tô đỏ / hiện trong panel món). */
  uids: string[];
}

export interface ItemInfo {
  placement: ItemPlacement;
  item: CatalogItem;
  rect: Rect;
}

export function footprint(p: ItemPlacement, item: CatalogItem): Rect {
  const a = (p.rot * Math.PI) / 180;
  const c = Math.abs(Math.cos(a));
  const s = Math.abs(Math.sin(a));
  const hw = (item.size.w * c + item.size.d * s) / 2;
  const hd = (item.size.w * s + item.size.d * c) / 2;
  return { x0: p.x - hw, x1: p.x + hw, z0: p.z - hd, z1: p.z + hd };
}

export function placedItems(scene: Scene, catalog: Map<string, CatalogItem>): ItemInfo[] {
  const out: ItemInfo[] = [];
  for (const p of scene.items) {
    if ('wall' in p) continue;
    const item = catalog.get(p.catalogId);
    if (item) out.push({ placement: p, item, rect: footprint(p, item) });
  }
  return out;
}

export function zoneAt(room: Room, x: number, z: number): Zone | undefined {
  return room.zones.find((zn) => x >= zn.rect[0] && x <= zn.rect[2] && z >= zn.rect[1] && z <= zn.rect[3]);
}

/** Khoảng cách từ mép món tới 4 tường của khu chứa tâm món (cm). */
export function wallDistances(room: Room, info: ItemInfo): { label: string; cm: number }[] | null {
  const zn = zoneAt(room, info.placement.x, info.placement.z);
  if (!zn) return null;
  const r = info.rect;
  const [x0, z0, x1, z1] = zn.rect;
  const main = zn === room.zones[0];
  return [
    { label: main ? 'Tường cửa sổ' : 'Tường x nhỏ', cm: r.x0 - x0 },
    { label: main ? 'Tường sau' : 'Tường x lớn', cm: x1 - r.x1 },
    { label: main ? 'Tường phải (WC)' : 'Tường z nhỏ', cm: r.z0 - z0 },
    { label: main ? 'Tường trái (lối vào)' : 'Tường z lớn', cm: z1 - r.z1 },
  ];
}

const overlaps = (a: Rect, b: Rect, tol = 0.5) => a.x0 < b.x1 - tol && b.x0 < a.x1 - tol && a.z0 < b.z1 - tol && b.z0 < a.z1 - tol;

/** Món nằm sàn và chắn lối đi (bỏ thảm, đồ treo trần, đồ đặt trên mặt bàn). */
const isObstacle = (i: ItemInfo) => i.item.mount === 'floor' && i.item.category !== 'rug' && !(i.placement.y && i.placement.y > 0);

// --------------------------------------------------------------- doors

interface Swing {
  label: string;
  hinge: [number, number];
  radius: number;
  /** Hướng từ bản lề vào giữa ô cửa, và hướng mở vào phòng (đơn vị). */
  along: [number, number];
  into: [number, number];
}

/** Vùng quét của các cửa mở vào khu chính (cm). */
export function doorSwings(room: Room): Swing[] {
  const main = room.zones[0];
  const cx = (main.rect[0] + main.rect[2]) / 2;
  const cz = (main.rect[1] + main.rect[3]) / 2;
  const out: Swing[] = [];
  for (const o of room.openings) {
    if (!o.door || o.door.opensInto !== main.id) continue;
    const w = room.walls.find((x) => x.id === o.wall);
    if (!w) continue;
    const len = wallLength(w);
    const dir: [number, number] = [(w.to[0] - w.from[0]) / len, (w.to[1] - w.from[1]) / len];
    const at = (u: number): [number, number] => [w.from[0] + dir[0] * u, w.from[1] + dir[1] * u];
    const hingeU = o.door.hinge === 'start' ? o.u[0] : o.u[1];
    const sign = o.door.hinge === 'start' ? 1 : -1;
    let n: [number, number] = [-dir[1], dir[0]];
    const hinge = at(hingeU);
    if (n[0] * (cx - hinge[0]) + n[1] * (cz - hinge[1]) < 0) n = [-n[0], -n[1]];
    out.push({ label: o.label, hinge, radius: o.u[1] - o.u[0], along: [dir[0] * sign, dir[1] * sign], into: n });
  }
  return out;
}

function hitsSwing(r: Rect, s: Swing): boolean {
  // điểm gần bản lề nhất của hình chữ nhật
  const px = Math.max(r.x0, Math.min(s.hinge[0], r.x1));
  const pz = Math.max(r.z0, Math.min(s.hinge[1], r.z1));
  if (Math.hypot(px - s.hinge[0], pz - s.hinge[1]) >= s.radius) return false;
  // và hình chữ nhật phải chạm vào góc phần tư quét (hộp bao của 1/4 hình tròn)
  const ex = s.hinge[0] + (s.along[0] + s.into[0]) * s.radius;
  const ez = s.hinge[1] + (s.along[1] + s.into[1]) * s.radius;
  const q: Rect = {
    x0: Math.min(s.hinge[0], ex),
    x1: Math.max(s.hinge[0], ex),
    z0: Math.min(s.hinge[1], ez),
    z1: Math.max(s.hinge[1], ez),
  };
  return overlaps(r, q, 0.5);
}

// --------------------------------------------------------------- aisle

const CELL = 5; // cm

/**
 * Tìm đường trên lưới 5 cm từ `start` tới từng `target` sao cho tâm người đi luôn cách
 * vật cản / tường ≥ minWidth/2. Không có đường → lối đi bị hẹp hơn minWidth.
 */
function aisleWarnings(room: Room, items: ItemInfo[]): Warning[] {
  const circ = room.circulation;
  if (!circ) return [];
  const [rx0, rz0, rx1, rz1] = room.zones[0].rect;
  const nx = Math.round((rx1 - rx0) / CELL);
  const nz = Math.round((rz1 - rz0) / CELL);
  // nửa ô lưới dung sai: khe đúng bằng minWidth vẫn tính là đi được
  const half = circ.minWidth / 2 - CELL / 2;
  const blocked = new Uint8Array(nx * nz);
  const obstacles = items.filter(isObstacle).map((i) => i.rect);
  for (let iz = 0; iz < nz; iz++) {
    for (let ix = 0; ix < nx; ix++) {
      const x = rx0 + (ix + 0.5) * CELL;
      const z = rz0 + (iz + 0.5) * CELL;
      let b = x - rx0 < half || rx1 - x < half || z - rz0 < half || rz1 - z < half;
      if (!b) {
        for (const r of obstacles) {
          const dx = Math.max(r.x0 - x, 0, x - r.x1);
          const dz = Math.max(r.z0 - z, 0, z - r.z1);
          if (dx * dx + dz * dz < half * half) {
            b = true;
            break;
          }
        }
      }
      blocked[iz * nx + ix] = b ? 1 : 0;
    }
  }
  // điểm đầu/cuối nằm sát tường (cửa) → lấy ô trống gần nhất trong bán kính minWidth
  const nearestFree = ([x, z]: [number, number]): number => {
    let best = -1;
    let bestD = Infinity;
    for (let iz = 0; iz < nz; iz++) {
      for (let ix = 0; ix < nx; ix++) {
        if (blocked[iz * nx + ix]) continue;
        const d = Math.hypot(rx0 + (ix + 0.5) * CELL - x, rz0 + (iz + 0.5) * CELL - z);
        if (d < bestD && d <= circ.minWidth) [best, bestD] = [iz * nx + ix, d];
      }
    }
    return best;
  };
  const start = nearestFree(circ.start.point);
  const seen = new Uint8Array(nx * nz);
  if (start >= 0) {
    const queue = [start];
    seen[start] = 1;
    while (queue.length) {
      const c = queue.pop()!;
      const ix = c % nx;
      const iz = (c - ix) / nx;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const jx = ix + dx;
        const jz = iz + dz;
        if (jx < 0 || jz < 0 || jx >= nx || jz >= nz) continue;
        const k = jz * nx + jx;
        if (!seen[k] && !blocked[k]) {
          seen[k] = 1;
          queue.push(k);
        }
      }
    }
  }
  const out: Warning[] = [];
  for (const t of circ.targets) {
    const k = nearestFree(t.point);
    if (start < 0 || k < 0 || !seen[k]) {
      out.push({
        kind: 'aisle',
        message: `Lối đi chính hẹp hơn ${circ.minWidth} cm: không có đường đủ rộng từ ${lowerFirst(circ.start.label)} tới ${lowerFirst(t.label)}.`,
        uids: [],
      });
    }
  }
  return out;
}

// --------------------------------------------------------------- wall items

/** Khung (u0..u1, v0..v1) cm của đồ treo trên mặt tường. */
export function wallRect(p: WallPlacement, item: CatalogItem) {
  return { u0: p.u - item.size.w / 2, u1: p.u + item.size.w / 2, v0: p.v - item.size.h / 2, v1: p.v + item.size.h / 2 };
}

type WR = ReturnType<typeof wallRect>;
const wOverlap = (a: WR, b: WR, tol = 0.5) => a.u0 < b.u1 - tol && b.u0 < a.u1 - tol && a.v0 < b.v1 - tol && b.v0 < a.v1 - tol;

function wallItemWarnings(room: Room, scene: Scene, catalog: Map<string, CatalogItem>): Warning[] {
  const out: Warning[] = [];
  const hidden = new Set(scene.room.hiddenFixtures);
  const list = scene.items
    .filter((p): p is WallPlacement => 'wall' in p)
    .flatMap((p) => {
      const item = catalog.get(p.catalogId);
      return item ? [{ p, item, r: wallRect(p, item) }] : [];
    });
  for (let i = 0; i < list.length; i++) {
    const a = list[i];
    const wall = room.walls.find((w) => w.id === a.p.wall);
    if (!wall) continue;
    const len = wallLength(wall);
    if (a.r.u0 < -0.5 || a.r.u1 > len + 0.5 || a.r.v0 < -0.5 || a.r.v1 > room.ceilingHeight + 0.5)
      out.push({ kind: 'wall', message: `${a.item.name} tràn ra ngoài mặt tường.`, uids: [a.p.uid] });
    for (const o of room.openings.filter((o) => o.wall === wall.id)) {
      const or = { u0: o.u[0], u1: o.u[1], v0: o.sill, v1: o.sill + o.height };
      if (wOverlap(a.r, or)) out.push({ kind: 'wall', message: `${a.item.name} che ${lowerFirst(o.label)}.`, uids: [a.p.uid] });
    }
    for (const f of room.fixtures.filter((f) => f.wall === wall.id && !hidden.has(f.id))) {
      const fr = { u0: (f.u ?? 0) - f.size.w / 2, u1: (f.u ?? 0) + f.size.w / 2, v0: (f.v ?? 0) - f.size.h / 2, v1: (f.v ?? 0) + f.size.h / 2 };
      if (wOverlap(a.r, fr)) out.push({ kind: 'overlap', message: `${a.item.name} chồng lên ${lowerFirst(f.label)}.`, uids: [a.p.uid] });
    }
    for (let j = i + 1; j < list.length; j++) {
      const b = list[j];
      if (b.p.wall === a.p.wall && wOverlap(a.r, b.r))
        out.push({ kind: 'overlap', message: `${a.item.name} chồng lên ${b.item.name} trên tường.`, uids: [a.p.uid, b.p.uid] });
    }
  }
  return out;
}

// --------------------------------------------------------------- all

export function analyze(room: Room, scene: Scene, catalog: Map<string, CatalogItem>): { items: ItemInfo[]; warnings: Warning[] } {
  const items = placedItems(scene, catalog);
  const warnings: Warning[] = [];
  const floor = items.filter(isObstacle);

  for (let i = 0; i < floor.length; i++) {
    for (let j = i + 1; j < floor.length; j++) {
      const a = floor[i];
      const b = floor[j];
      if (!overlaps(a.rect, b.rect)) continue;
      // ghế kê sát / lùa dưới bàn là bình thường
      const pair = new Set([a.item.category, b.item.category]);
      if (pair.has('seating') && pair.has('table')) continue;
      warnings.push({ kind: 'overlap', message: `${a.item.name} chồng lên ${b.item.name}.`, uids: [a.placement.uid, b.placement.uid] });
    }
  }

  for (const it of items) {
    if (it.item.mount !== 'floor' || (it.placement.y ?? 0) > 0) continue;
    const zn = zoneAt(room, it.placement.x, it.placement.z);
    const r = it.rect;
    if (!zn) {
      warnings.push({ kind: 'wall', message: `${it.item.name} nằm ngoài phòng.`, uids: [it.placement.uid] });
      continue;
    }
    const [x0, z0, x1, z1] = zn.rect;
    if (r.x0 < x0 - 0.5 || r.x1 > x1 + 0.5 || r.z0 < z0 - 0.5 || r.z1 > z1 + 0.5) {
      warnings.push({ kind: 'wall', message: `${it.item.name} xuyên qua tường.`, uids: [it.placement.uid] });
    }
  }

  const swings = doorSwings(room);
  for (const it of floor) {
    for (const s of swings) {
      if (hitsSwing(it.rect, s)) {
        warnings.push({ kind: 'door', message: `${it.item.name} nằm trong vùng quét của ${lowerFirst(s.label)}.`, uids: [it.placement.uid] });
      }
    }
  }

  warnings.push(...aisleWarnings(room, items));
  warnings.push(...wallItemWarnings(room, scene, catalog));
  return { items, warnings };
}
