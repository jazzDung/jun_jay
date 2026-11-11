/**
 * Dựng toàn bộ phòng từ room.json: sàn, tường (khoét ô cửa), cửa sổ, cánh cửa + vùng quét,
 * ô thông, phào chỉ, ốp PVC, trần thả, máy lạnh, đèn, tường bên trong các phòng phụ.
 *
 * Cấu trúc group trả về (tên dùng cho chọn đối tượng / ẩn hiện ở các lát sau):
 *   room
 *   ├─ floors            floor:<zoneId>
 *   ├─ walls             wall:<wallId> (group cục bộ của tường; mesh mặt tường tên wallSurface:<id>)
 *   ├─ innerWalls        tường tự sinh bên trong WC / pha chế / hành lang
 *   ├─ ceiling           trần + downlight (ẩn được)
 *   └─ backdrop          phông ngoài cửa sổ
 */
import * as THREE from 'three';
import type { Opening, Room, Wall, Zone } from '../../data/schema';
import { cm } from '../units';
import {
  dropCeilingTexture,
  outdoorBackdropTexture,
  pvcTexture,
  repeatFor,
  tileTexture,
  woodOakTexture,
} from './textures';
import { WallFrame } from './wallFrame';

const COLORS = {
  aluminum: '#B8BCBF',
  glass: '#A9C7CF',
  casing: '#EEEBE3',
  baseboard: '#ECE9E1',
  ledge: '#C9813F',
  swing: '#E07A2F',
};

const EPS = 0.0015; // m — tách lớp phủ khỏi mặt tường để tránh z-fighting

/** Đối tượng chọn được bằng chạm/click (gắn vào mesh qua userData.pick). */
export type PickTarget = { kind: 'wall'; id: string } | { kind: 'ceiling' };

export interface WallSurface {
  group: THREE.Object3D;
  /** Vật liệu mặt tường. */
  surface: THREE.MeshStandardMaterial;
  /** Vật liệu đổi màu theo tường (phào chỉ khi `mouldings.color` = null). */
  followers: THREE.MeshStandardMaterial[];
  mouldings: THREE.Object3D | null;
  baseColor: string;
  baseMouldings: boolean;
}

export interface RoomBuild {
  group: THREE.Group;
  ceiling: THREE.Group;
  /** Bề mặt đổi được màu, theo id tường. */
  walls: Map<string, WallSurface>;
  /** Trần của khu chính (zone đầu tiên trong room.json). Sàn gỗ giữ nguyên, không chọn được. */
  ceilingSurface: { mesh: THREE.Mesh; mat: THREE.MeshStandardMaterial; baseColor: string };
  /** Thông tin để ẩn tường đứng chắn giữa camera và phòng. */
  cutaway: { group: THREE.Object3D; mid: THREE.Vector3; normal: THREE.Vector3 }[];
  /** Phông nền ngoài cửa sổ — chỉ nên hiện khi camera ở trong phòng. */
  backdrop: THREE.Group;
  /** Hộp bao của phòng (không tính phông nền). */
  bounds: THREE.Box3;
}

export function buildRoom(room: Room): RoomBuild {
  const group = new THREE.Group();
  group.name = 'room';
  const zones = new Map(room.zones.map((z) => [z.id, z]));
  const H = cm(room.ceilingHeight);

  const mainZone = room.zones[0];
  const floors = named('floors');
  for (const zone of room.zones) floors.add(buildFloor(zone));

  const walls = named('walls');
  const wallSurfaces = new Map<string, WallSurface>();
  const frames = room.walls.map((w) => new WallFrame(w, room, zones));
  const cutaway: RoomBuild['cutaway'] = [];
  for (const frame of frames) {
    const openings = room.openings.filter((o) => o.wall === frame.wall.id);
    const fixtures = room.fixtures.filter((f) => f.wall === frame.wall.id);
    const g = frame.makeGroup(`wall:${frame.wall.id}`);
    const surface = buildWallBody(frame, openings);
    g.add(surface);

    const back = backSideZone(frame, room);
    if (back?.interiorWallColor) g.add(buildBackFace(frame, openings, back.interiorWallColor));

    for (const o of openings) g.add(buildOpening(frame, o));
    for (const c of frame.wall.claddings) g.add(buildCladding(frame, c));
    const m = frame.wall.mouldings;
    const mouldingMat = std(m?.color ?? frame.wall.color, { roughness: 0.8 });
    let mouldings: THREE.Object3D | null = null;
    if (m) {
      mouldings = buildMouldings(frame, openings, mouldingMat);
      mouldings.visible = m.enabled;
      g.add(mouldings);
    }
    for (const f of fixtures) {
      const x = frame.uToX(f.u ?? 0);
      const mesh = buildFixtureMesh(f.type, f.size, f.color);
      mesh.position.set(x, cm(f.v ?? 0), cm(f.size.d) / 2);
      mesh.name = `fixture:${f.id}`;
      g.add(mesh);
    }
    walls.add(g);
    const pick: PickTarget = { kind: 'wall', id: frame.wall.id };
    g.traverse((o) => (o.userData.pick = pick));
    wallSurfaces.set(frame.wall.id, {
      group: g,
      surface: surface.material as THREE.MeshStandardMaterial,
      followers: m && m.color === null ? [mouldingMat] : [],
      mouldings,
      baseColor: frame.wall.color,
      baseMouldings: m?.enabled ?? false,
    });
    const [ax, az] = frame.wall.from;
    const [bx, bz] = frame.wall.to;
    cutaway.push({ group: g, mid: new THREE.Vector3(cm((ax + bx) / 2), 0, cm((az + bz) / 2)), normal: frame.normal });
  }

  const innerWalls = named('innerWalls');
  for (const zone of room.zones) {
    if (zone.interiorWallColor) innerWalls.add(...buildInnerWalls(zone, room, H));
  }

  const ceiling = named('ceiling');
  for (const zone of room.zones) ceiling.add(buildCeiling(zone, room, H, zone === mainZone));
  const ceilingMesh = ceiling.getObjectByName(`ceiling:${mainZone.id}`) as THREE.Mesh;
  ceilingMesh.userData.pick = { kind: 'ceiling' } satisfies PickTarget;
  for (const f of room.fixtures) {
    if (f.wall !== undefined) continue;
    const mesh = buildFixtureMesh(f.type, f.size, f.color);
    mesh.position.set(cm(f.x!), H - cm(f.size.h) / 2, cm(f.z!));
    mesh.name = `fixture:${f.id}`;
    ceiling.add(mesh);
  }

  const bounds = new THREE.Box3().setFromObject(floors);
  bounds.max.y = H;
  const backdrop = buildBackdrop(room, frames);
  group.add(floors, walls, innerWalls, ceiling, backdrop);
  return {
    group,
    ceiling,
    walls: wallSurfaces,
    ceilingSurface: { mesh: ceilingMesh, mat: ceilingMesh.material as THREE.MeshStandardMaterial, baseColor: room.ceiling.color },
    cutaway,
    backdrop,
    bounds,
  };
}

// ------------------------------------------------------------------ helpers

function named(name: string): THREE.Group {
  const g = new THREE.Group();
  g.name = name;
  return g;
}

function std(color: string, opts: THREE.MeshStandardMaterialParameters = {}): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, ...opts });
}

function box(w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  return m;
}

// -------------------------------------------------------------------- floor

function buildFloor(zone: Zone): THREE.Mesh {
  const [x0, z0, x1, z1] = zone.rect;
  const w = cm(x1 - x0);
  const d = cm(z1 - z0);
  const mat = std('#ffffff', { roughness: 0.7 });
  if (zone.floor.material.startsWith('wood')) mat.map = repeatFor(woodOakTexture(), w, d);
  else if (zone.floor.material.startsWith('tile')) mat.map = repeatFor(tileTexture(zone.floor.color), w, d);
  else mat.color.set(zone.floor.color);
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(cm(x0) + w / 2, 0, cm(z0) + d / 2);
  mesh.name = `floor:${zone.id}`;
  return mesh;
}

// --------------------------------------------------------------------- wall

/**
 * Biên dạng mặt tường (toạ độ cục bộ x, y) với các ô cửa:
 * ô chạm sàn (cửa đi) được cắt vào đường viền ngoài; ô còn lại là lỗ.
 */
function wallShape(frame: WallFrame, openings: Opening[]): THREE.Shape {
  const L = frame.length;
  const H = frame.height;
  const doors = openings
    .filter((o) => o.sill <= 0)
    .map((o) => {
      const [a, b] = frame.rangeToX(o.u);
      return { a: Math.max(0, a), b: Math.min(L, b), top: Math.min(cm(o.height), H - 0.005) };
    })
    .sort((p, q) => p.a - q.a);

  const pts: [number, number][] = [];
  const startsAtZero = doors.length > 0 && doors[0].a <= 1e-6;
  pts.push([0, startsAtZero ? doors[0].top : 0]);
  doors.forEach((d, i) => {
    if (!(i === 0 && startsAtZero)) pts.push([d.a, 0], [d.a, d.top]);
    pts.push([d.b, d.top]);
    if (d.b < L - 1e-6) pts.push([d.b, 0]);
  });
  const last = doors[doors.length - 1];
  if (!last || last.b < L - 1e-6) pts.push([L, 0]);
  pts.push([L, H], [0, H]);

  const shape = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
  for (const o of openings) {
    if (o.sill <= 0) continue;
    const [a, b] = frame.rangeToX(o.u);
    const y0 = cm(o.sill);
    const y1 = Math.min(cm(o.sill + o.height), H - 0.005);
    const hole = new THREE.Path();
    hole.moveTo(a, y0);
    hole.lineTo(a, y1);
    hole.lineTo(b, y1);
    hole.lineTo(b, y0);
    hole.closePath();
    shape.holes.push(hole);
  }
  return shape;
}

function buildWallBody(frame: WallFrame, openings: Opening[]): THREE.Mesh {
  const geo = new THREE.ExtrudeGeometry(wallShape(frame, openings), {
    depth: frame.thickness,
    bevelEnabled: false,
  });
  geo.translate(0, 0, -frame.thickness);
  const mesh = new THREE.Mesh(geo, std(frame.wall.color, { roughness: 0.92 }));
  mesh.name = `wallSurface:${frame.wall.id}`;
  mesh.userData = { kind: 'wall', wallId: frame.wall.id };
  return mesh;
}

/** Zone nằm ở phía sau tường (nếu có). */
function backSideZone(frame: WallFrame, room: Room): Zone | undefined {
  const [ax, az] = frame.wall.from;
  const [bx, bz] = frame.wall.to;
  const n = frame.normal;
  const off = frame.wall.thickness + 5;
  const px = (ax + bx) / 2 - n.x * off;
  const pz = (az + bz) / 2 - n.z * off;
  return room.zones.find((z) => px > z.rect[0] && px < z.rect[2] && pz > z.rect[1] && pz < z.rect[3]);
}

/** Mặt sau của tường nhìn vào phòng phụ — sơn màu của phòng đó. */
function buildBackFace(frame: WallFrame, openings: Opening[], color: string): THREE.Mesh {
  const geo = new THREE.ShapeGeometry(wallShape(frame, openings));
  const mesh = new THREE.Mesh(geo, std(color, { side: THREE.BackSide }));
  mesh.position.z = -frame.thickness - EPS;
  mesh.name = `wallBack:${frame.wall.id}`;
  return mesh;
}

// ----------------------------------------------------------------- openings

function buildOpening(frame: WallFrame, o: Opening): THREE.Group {
  const g = named(`opening:${o.id}`);
  g.userData = { kind: 'opening', openingId: o.id };
  const [a, b] = frame.rangeToX(o.u);
  const y0 = cm(o.sill);
  const y1 = cm(o.sill + o.height);
  const t = frame.thickness;

  if (o.type === 'window') {
    const alu = std(COLORS.aluminum, { metalness: 0.6, roughness: 0.4 });
    const glass = new THREE.MeshStandardMaterial({
      color: COLORS.glass,
      transparent: true,
      opacity: 0.18,
      roughness: 0.05,
      metalness: 0,
      depthWrite: false,
    });
    const bar = 0.04;
    const zc = -t / 2;
    // khung bao quanh cả ô
    g.add(box(b - a, bar, 0.05, alu, (a + b) / 2, y0 + bar / 2, zc));
    g.add(box(b - a, bar, 0.05, alu, (a + b) / 2, y1 - bar / 2, zc));
    g.add(box(bar, y1 - y0, 0.05, alu, a + bar / 2, (y0 + y1) / 2, zc));
    g.add(box(bar, y1 - y0, 0.05, alu, b - bar / 2, (y0 + y1) / 2, zc));
    const frames = o.frames ?? [{ u: o.u, cols: 1, rows: 1, sliding: false }];
    const xs: [number, number][] = frames.map((f) => frame.rangeToX(f.u)).sort((p, q) => p[0] - q[0]);
    // phần trống giữa các cụm → trụ đặc
    let cursor = a;
    for (const [fa, fb] of [...xs, [b, b] as [number, number]]) {
      if (fa - cursor > 0.005) g.add(box(fa - cursor, y1 - y0, 0.06, alu, (cursor + fa) / 2, (y0 + y1) / 2, zc));
      cursor = Math.max(cursor, fb);
    }
    frames.forEach((f, i) => {
      const [fa, fb] = xs[i];
      const w = fb - fa;
      for (let c = 1; c < f.cols; c++) {
        const x = fa + (w * c) / f.cols;
        g.add(box(bar, y1 - y0, 0.05, alu, x, (y0 + y1) / 2, zc + (f.sliding && c % 2 ? 0.02 : 0)));
      }
      for (let r = 1; r < f.rows; r++) {
        const y = y0 + ((y1 - y0) * r) / f.rows;
        g.add(box(w, bar * 0.7, 0.04, alu, (fa + fb) / 2, y, zc));
      }
      g.add(box(w, y1 - y0, 0.004, glass, (fa + fb) / 2, (y0 + y1) / 2, zc));
      g.add(box(bar, y1 - y0, 0.05, alu, fa + bar / 2, (y0 + y1) / 2, zc));
      g.add(box(bar, y1 - y0, 0.05, alu, fb - bar / 2, (y0 + y1) / 2, zc));
    });
    return g;
  }

  if (o.type === 'passthrough') {
    const ledge = box(b - a + 0.1, 0.035, t + 0.25, std(COLORS.ledge, { roughness: 0.6 }), (a + b) / 2, y0 + 0.0175, -t / 2 + 0.125);
    g.add(ledge);
    return g;
  }

  // door / doorway: nẹp khung phía trong phòng
  const casing = std(COLORS.casing, { roughness: 0.6 });
  const cw = 0.06;
  const cd = 0.015;
  g.add(box(cw, y1, cd, casing, a - cw / 2, y1 / 2, cd / 2));
  g.add(box(cw, y1, cd, casing, b + cw / 2, y1 / 2, cd / 2));
  g.add(box(b - a + cw * 2, cw, cd, casing, (a + b) / 2, y1 + cw / 2, cd / 2));

  if (o.type === 'door' && o.door) {
    const width = b - a;
    // bản lề 'start' = đầu u[0]; đổi sang toạ độ x cục bộ
    const hingeAtU0 = o.door.hinge === 'start';
    const hingeX = hingeAtU0 ? frame.uToX(o.u[0]) : frame.uToX(o.u[1]);
    const s = hingeX <= a + 1e-6 ? 1 : -1; // hướng từ bản lề vào giữa ô
    const into = o.door.opensInto === frame.wall.faces ? 1 : -1; // +z = phía phòng tường nhìn vào
    const zHinge = into > 0 ? 0 : -t;

    const leafT = 0.04;
    const leaf = box(leafT, y1 - 0.01, width - 0.01, std(o.door.color, { roughness: 0.55 }), 0, (y1 - 0.01) / 2, 0);
    leaf.position.set(hingeX + (s * leafT) / 2, (y1 - 0.01) / 2, zHinge + (into * (width - 0.01)) / 2);
    leaf.name = `doorLeaf:${o.id}`;
    g.add(leaf);

    // vùng quét cửa: 1/4 hình tròn bán kính = bề rộng cánh
    const ys = -into; // sau rotateX(-π/2), y của circle = -z
    const startAngle = s > 0 ? (ys > 0 ? 0 : 1.5 * Math.PI) : ys > 0 ? 0.5 * Math.PI : Math.PI;
    const arcGeo = new THREE.CircleGeometry(width, 32, startAngle, Math.PI / 2);
    arcGeo.rotateX(-Math.PI / 2);
    const arc = new THREE.Mesh(
      arcGeo,
      new THREE.MeshBasicMaterial({ color: COLORS.swing, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide }),
    );
    arc.position.set(hingeX, 0.004, zHinge);
    arc.name = `doorSwing:${o.id}`;
    arc.userData = { kind: 'doorSwing', openingId: o.id };
    g.add(arc);
  }
  return g;
}

// ---------------------------------------------------------- cladding/moulding

function buildCladding(frame: WallFrame, c: Wall['claddings'][number]): THREE.Mesh {
  const [a, b] = frame.rangeToX(c.u);
  const y0 = cm(c.v[0]);
  const y1 = Math.min(cm(c.v[1]), frame.height);
  const d = 0.012;
  const mat = std('#ffffff', { roughness: 0.45, map: repeatFor(pvcTexture(c.type, c.color), b - a, y1 - y0) });
  const mesh = box(b - a, y1 - y0, d, mat, (a + b) / 2, (y0 + y1) / 2, d / 2 + EPS);
  mesh.name = `cladding:${c.id}`;
  return mesh;
}

function overlaps(a0: number, a1: number, b0: number, b1: number): boolean {
  return a0 < b1 && b0 < a1;
}

function buildMouldings(frame: WallFrame, openings: Opening[], mat: THREE.Material): THREE.Group {
  const m = frame.wall.mouldings!;
  const g = named('mouldings');
  const [ua, ub] = frame.rangeToX(m.uRange);
  const gap = cm(m.gap);
  const pw = cm(m.profileWidth);
  const depth = 0.018;
  const bayW = (ub - ua - gap * (m.bays + 1)) / m.bays;
  const holes = openings.map((o) => {
    const [a, b] = frame.rangeToX(o.u);
    return { a, b, y0: cm(o.sill), y1: cm(o.sill + o.height) };
  });

  const rect = (x0: number, x1: number, y0: number, y1: number) => {
    if (holes.some((h) => overlaps(x0, x1, h.a, h.b) && overlaps(y0, y1, h.y0, h.y1))) return;
    const z = depth / 2 + EPS;
    g.add(box(x1 - x0, pw, depth, mat, (x0 + x1) / 2, y0 + pw / 2, z));
    g.add(box(x1 - x0, pw, depth, mat, (x0 + x1) / 2, y1 - pw / 2, z));
    g.add(box(pw, y1 - y0 - pw * 2, depth, mat, x0 + pw / 2, (y0 + y1) / 2, z));
    g.add(box(pw, y1 - y0 - pw * 2, depth, mat, x1 - pw / 2, (y0 + y1) / 2, z));
  };
  if (bayW > 0.1) {
    for (let i = 0; i < m.bays; i++) {
      const x0 = ua + gap + i * (bayW + gap);
      rect(x0, x0 + bayW, cm(m.upper[0]), cm(m.upper[1]));
      rect(x0, x0 + bayW, cm(m.lower[0]), cm(m.lower[1]));
    }
  }

  // len chân tường, ngắt ở cửa đi
  if (m.baseboardHeight > 0) {
    const bh = cm(m.baseboardHeight);
    const bmat = std(COLORS.baseboard, { roughness: 0.5 });
    const cuts = holes.filter((h) => h.y0 <= 0).sort((p, q) => p.a - q.a);
    let x = 0;
    for (const seg of [...cuts, { a: frame.length, b: frame.length }]) {
      if (seg.a - x > 0.01) g.add(box(seg.a - x, bh, 0.012, bmat, (x + seg.a) / 2, bh / 2, 0.006 + EPS));
      x = Math.max(x, seg.b);
    }
  }
  return g;
}

// ------------------------------------------------------------------ fixtures

function buildFixtureMesh(
  type: Room['fixtures'][number]['type'],
  size: { w: number; h: number; d: number },
  color?: string,
): THREE.Object3D {
  const w = cm(size.w);
  const h = cm(size.h);
  const d = cm(size.d);
  switch (type) {
    case 'ac_unit': {
      const g = new THREE.Group();
      g.add(box(w, h, d, std(color ?? '#F2F0EA', { roughness: 0.4 }), 0, 0, 0));
      g.add(box(w * 0.85, 0.012, 0.01, std('#3A3A3A'), 0, -h / 2 + 0.05, d / 2)); // khe gió
      return g;
    }
    case 'tube_light':
      return box(w, h, d, new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#F4FBFF', emissiveIntensity: 1.2 }), 0, 0, 0);
    case 'downlight': {
      const geo = new THREE.CylinderGeometry(w / 2, w / 2, h, 24);
      return new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#FFF6E8', emissiveIntensity: 1 }));
    }
    default:
      return box(w, h, d, std(color ?? '#F4F2EC', { roughness: 0.4 }), 0, 0, 0);
  }
}

// ----------------------------------------------------- inner walls / ceiling

/**
 * Tường bên trong phòng phụ: với mỗi cạnh của zone, phần không trùng tường khai báo
 * trong room.json được dựng thành mặt phẳng một mặt nhìn vào zone.
 */
function buildInnerWalls(zone: Zone, room: Room, H: number): THREE.Mesh[] {
  const [x0, z0, x1, z1] = zone.rect;
  const edges = [
    { axis: 'z' as const, c: z0, from: x0, to: x1, inward: 1 },
    { axis: 'z' as const, c: z1, from: x0, to: x1, inward: -1 },
    { axis: 'x' as const, c: x0, from: z0, to: z1, inward: 1 },
    { axis: 'x' as const, c: x1, from: z0, to: z1, inward: -1 },
  ];
  const meshes: THREE.Mesh[] = [];
  const mat = std(zone.interiorWallColor!, { roughness: 0.9 });
  for (const e of edges) {
    // khoảng bị tường khai báo che (cùng đường thẳng)
    const covered = room.walls
      .filter((w) => {
        const [ax, az] = w.from;
        const [bx, bz] = w.to;
        return e.axis === 'z' ? az === e.c && bz === e.c : ax === e.c && bx === e.c;
      })
      .map((w) => {
        const vals = e.axis === 'z' ? [w.from[0], w.to[0]] : [w.from[1], w.to[1]];
        return [Math.min(...vals), Math.max(...vals)] as [number, number];
      })
      .sort((p, q) => p[0] - q[0]);
    let cursor = e.from;
    const free: [number, number][] = [];
    for (const [a, b] of [...covered, [e.to, e.to] as [number, number]]) {
      if (a > cursor) free.push([cursor, Math.min(a, e.to)]);
      cursor = Math.max(cursor, b);
    }
    for (const [a, b] of free) {
      if (b - a < 1) continue;
      const len = cm(b - a);
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(len, H), mat);
      const mid = cm((a + b) / 2);
      if (e.axis === 'z') {
        plane.position.set(mid, H / 2, cm(e.c));
        plane.rotation.y = e.inward > 0 ? 0 : Math.PI;
      } else {
        plane.position.set(cm(e.c), H / 2, mid);
        plane.rotation.y = e.inward > 0 ? Math.PI / 2 : -Math.PI / 2;
      }
      plane.name = `innerWall:${zone.id}`;
      meshes.push(plane);
    }
  }
  return meshes;
}

function buildCeiling(zone: Zone, room: Room, H: number, isMain: boolean): THREE.Mesh {
  const [x0, z0, x1, z1] = zone.rect;
  const w = cm(x1 - x0);
  const d = cm(z1 - z0);
  // Mặt trần quay xuống chỉ nhận ánh sáng hắt từ sàn → tự phát sáng nhẹ để không ngả nâu.
  const mat = std('#ffffff', { roughness: 0.9, side: THREE.DoubleSide, emissive: '#ffffff', emissiveIntensity: 0.45 });
  if (isMain && room.ceiling.type === 'drop_tile') {
    mat.map = repeatFor(dropCeilingTexture(room.ceiling.color, cm(room.ceiling.tile ?? 60)), w, d);
    mat.emissiveMap = mat.map;
  } else {
    mat.color.set(room.ceiling.color);
    mat.emissive.set(room.ceiling.color);
  }
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
  mesh.rotation.x = Math.PI / 2;
  mesh.position.set(cm(x0) + w / 2, H, cm(z0) + d / 2);
  mesh.name = `ceiling:${zone.id}`;
  return mesh;
}

/** Phông nền phía sau mọi tường có cửa sổ. */
function buildBackdrop(room: Room, frames: WallFrame[]): THREE.Group {
  const g = named('backdrop');
  const tex = outdoorBackdropTexture();
  for (const o of room.openings) {
    if (o.type !== 'window') continue;
    const frame = frames.find((f) => f.wall.id === o.wall)!;
    const holder = frame.makeGroup(`backdrop:${o.id}`);
    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(frame.length + 3, 4),
      new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }),
    );
    plane.position.set(frame.length / 2, 1.6, -1.5);
    plane.name = 'backdrop';
    holder.add(plane);
    g.add(holder);
  }
  return g;
}
