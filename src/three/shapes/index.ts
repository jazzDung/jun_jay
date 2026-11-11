/**
 * Thư viện hình khối cho đồ trong catalog. Mỗi shape là một hàm
 *   (kích thước m, params, vật liệu) → THREE.Group
 * với gốc ở TÂM ĐÁY, mặt trước hướng +z, vừa khít hộp bao w × h × d của catalog.
 * Thêm shape mới: viết hàm rồi đăng ký vào SHAPES; catalog chỉ cần ghi tên shape.
 * Shape không có trong bảng → hộp đơn giản (vẫn đúng kích thước).
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { CatalogItem } from '../../data/schema';
import { cm } from '../units';

type MatSpec = CatalogItem['materials'][string];

interface Ctx {
  w: number;
  d: number;
  h: number;
  p: Record<string, unknown>;
  /** Vật liệu theo tên phần (body, legs, top…); thiếu thì lấy phần đầu tiên / màu mặc định. */
  mat: (part: string, fallback?: string) => THREE.Material;
  glow: boolean;
}

type ShapeFn = (c: Ctx) => THREE.Object3D[];

// ---------------------------------------------------------------- materials

const ROUGH: Record<MatSpec['type'], [number, number]> = {
  fabric: [0.95, 0],
  leather: [0.55, 0],
  wood: [0.6, 0],
  // real-time không có env map → kim loại thật (metalness cao) bị tối; giữ vừa phải
  metal: [0.38, 0.3],
  chrome: [0.15, 0.6],
  glass: [0.05, 0],
  acrylic: [0.2, 0],
  ceramic: [0.3, 0],
  plastic: [0.45, 0],
  paper: [0.9, 0],
  plant: [0.75, 0],
  rattan: [0.9, 0],
  tile: [0.35, 0],
  print: [0.85, 0],
};

const textures = new Map<string, THREE.Texture>();
const loader = new THREE.TextureLoader();

function loadTexture(path: string): THREE.Texture {
  let t = textures.get(path);
  if (!t) {
    t = loader.load(import.meta.env.BASE_URL + path);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    textures.set(path, t);
  }
  return t;
}

function makeMaterial(spec: MatSpec | undefined, fallback: string, glow: boolean): THREE.Material {
  const type = spec?.type ?? 'plastic';
  const color = spec?.color ?? fallback;
  const [roughness, metalness] = ROUGH[type];
  const mat = new THREE.MeshStandardMaterial({ color, roughness, metalness });
  if (spec?.texture) {
    mat.map = loadTexture(spec.texture);
    mat.color.set('#ffffff'); // texture đã mang màu thật
  }
  if (type === 'glass') Object.assign(mat, { transparent: true, opacity: 0.35, depthWrite: false });
  // đèn: chao giấy / mica tự phát sáng (ánh sáng thật làm ở v4)
  if (glow && (type === 'paper' || type === 'acrylic')) {
    mat.emissive.set(color);
    mat.emissiveIntensity = 0.6;
    mat.userData.glow = true; // lighting.updateGlow đổi theo bật/tắt + Kelvin
  }
  return mat;
}

// ------------------------------------------------------------------ helpers

function box(w: number, h: number, d: number, mat: THREE.Material, x = 0, y = 0, z = 0, r = 0): THREE.Mesh {
  const geo = r > 0 ? new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2, h / 2, d / 2)) : new THREE.BoxGeometry(w, h, d);
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y + h / 2, z);
  return m;
}

function cyl(rTop: number, rBottom: number, h: number, mat: THREE.Material, x = 0, y = 0, z = 0, seg = 24): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBottom, h, seg), mat);
  m.position.set(x, y + h / 2, z);
  return m;
}

/** 4 chân ở góc, lùi vào `inset`. */
function legs(w: number, d: number, h: number, mat: THREE.Material, inset: number, r = 0.015): THREE.Mesh[] {
  const xs = [-w / 2 + inset, w / 2 - inset];
  const zs = [-d / 2 + inset, d / 2 - inset];
  return xs.flatMap((x) => zs.map((z) => cyl(r, r * 0.8, h, mat, x, 0, z, 12)));
}

const num = (v: unknown, d: number) => (typeof v === 'number' ? v : d);

// -------------------------------------------------------------------- shapes

const sofa: ShapeFn = ({ w, d, h, p, mat }) => {
  const body = mat('body');
  const legH = cm(num(p.legHeight, 8));
  const seatH = cm(num(p.seatHeight, 40));
  const armW = Math.min(cm(num(p.armWidth, 18)), w / 4);
  const backD = Math.min(0.2, d * 0.25);
  const armH = Math.min(h * 0.85, seatH + 0.22);
  const n = Math.max(1, Math.round(num(p.cushions, Math.max(1, Math.round((w - 2 * armW) / 0.6)))));
  const out: THREE.Object3D[] = [
    ...legs(w, d, legH, mat('legs', '#5a3a2a'), 0.06, 0.018),
    box(w, seatH - legH - 0.1, d, body, 0, legH, 0, 0.03), // khung đế
    box(w, h - legH, backD, body, 0, legH, -d / 2 + backD / 2, 0.04), // lưng
    box(armW, armH - legH, d, body, -w / 2 + armW / 2, legH, 0, 0.04),
    box(armW, armH - legH, d, body, w / 2 - armW / 2, legH, 0, 0.04),
  ];
  const seatW = (w - 2 * armW) / n;
  for (let i = 0; i < n; i++) {
    const x = -w / 2 + armW + seatW * (i + 0.5);
    out.push(box(seatW - 0.01, 0.12, d - backD - 0.02, body, x, seatH - 0.12, backD / 2, 0.05)); // đệm ngồi
    out.push(box(seatW - 0.02, h - seatH - 0.04, 0.14, body, x, seatH, -d / 2 + backD + 0.06, 0.06)); // gối tựa
  }
  return out;
};

const armchair: ShapeFn = (c) => sofa({ ...c, p: { cushions: 1, armWidth: 14, ...c.p } });

const booth: ShapeFn = ({ w, d, h, p, mat }) => {
  const body = mat('body');
  const seatH = cm(num(p.seatHeight, 40));
  const backD = 0.12;
  return [
    box(w, seatH - 0.1, d, body, 0, 0, 0, 0.02),
    box(w, 0.1, d - backD, body, 0, seatH - 0.1, backD / 2, 0.04),
    box(w, h, backD, body, 0, 0, -d / 2 + backD / 2, 0.04),
  ];
};

const bench: ShapeFn = ({ w, d, h, p, mat }) => {
  const out: THREE.Object3D[] = [];
  const topT = 0.04;
  if (p.cushion) {
    out.push(box(w, h - 0.08, d, mat('body'), 0, 0, 0, 0.01));
    out.push(box(w - 0.02, 0.08, d - 0.02, mat('cushion', '#E8D9BF'), 0, h - 0.08, 0, 0.03));
  } else {
    out.push(box(w, topT, d, mat('body'), 0, h - topT, 0, 0.008));
    out.push(...legs(w, d, h - topT, mat('legs', '#5a3a2a'), 0.05, 0.02));
  }
  return out;
};

const tableRect: ShapeFn = ({ w, d, h, mat }) => {
  const top = mat('top');
  const topT = Math.min(0.035, h * 0.2);
  return [box(w, topT, d, top, 0, h - topT, 0, 0.004), ...legs(w, d, h - topT, mat('legs', '#222222'), 0.05, 0.016)];
};

function ellipseTop(w: number, d: number, t: number, mat: THREE.Material, y: number): THREE.Mesh {
  const m = cyl(0.5, 0.5, t, mat, 0, y, 0, 48);
  m.scale.set(w, 1, d);
  return m;
}

const tableOval: ShapeFn = ({ w, d, h, mat }) => {
  const top = mat('top');
  const t = 0.035;
  return [ellipseTop(w, d, t, top, h - t), ...legs(w * 0.62, d * 0.62, h - t, mat('legs', '#5a3a2a'), 0.03, 0.02)];
};

const tableRound: ShapeFn = ({ w, d, h, mat }) => {
  const t = 0.03;
  return [ellipseTop(w, d, t, mat('top'), h - t), cyl(0.03, 0.03, h - t, mat('legs', '#222222')), cyl(w * 0.25, w * 0.28, 0.02, mat('legs', '#222222'))];
};

const counter: ShapeFn = ({ w, d, h, mat }) => {
  const topT = 0.04;
  return [box(w - 0.04, h - topT, d - 0.06, mat('body'), 0, 0, -0.03), box(w, topT, d, mat('top'), 0, h - topT, 0, 0.005)];
};

const cabinet: ShapeFn = ({ w, d, h, mat }) => {
  const body = mat('body');
  const legH = Math.min(0.1, h * 0.15);
  const line = new THREE.MeshStandardMaterial({ color: '#3a2a20', roughness: 0.8 });
  const out = [...legs(w, d, legH, mat('legs', '#3a2a20'), 0.04, 0.015), box(w, h - legH, d, body, 0, legH, 0, 0.01)];
  const doors = Math.max(2, Math.round(w / 0.45));
  for (let i = 1; i < doors; i++) out.push(box(0.004, h - legH - 0.04, 0.004, line, -w / 2 + (w * i) / doors, legH + 0.02, d / 2));
  return out;
};

const chair: ShapeFn = ({ w, d, h, p, mat }) => {
  const seatH = cm(num(p.seatHeight, 45));
  const frame = mat('frame', '#C8C8C8');
  const seat = mat('seat');
  return [
    ...legs(w, d, seatH - 0.05, frame, 0.03, 0.011),
    box(w, 0.05, d, seat, 0, seatH - 0.05, 0, 0.02),
    box(w * 0.9, (h - seatH) * 0.55, 0.05, seat, 0, h - (h - seatH) * 0.55, -d / 2 + 0.03, 0.02),
    cyl(0.01, 0.01, h - seatH, frame, -w / 2 + 0.03, seatH, -d / 2 + 0.03, 8),
    cyl(0.01, 0.01, h - seatH, frame, w / 2 - 0.03, seatH, -d / 2 + 0.03, 8),
  ];
};

const officeChair: ShapeFn = ({ w, d, h, p, mat }) => {
  const seatH = cm(num(p.seatHeight, 48));
  const body = mat('body');
  const out: THREE.Object3D[] = [cyl(0.03, 0.03, seatH - 0.12, body, 0, 0.06), box(w * 0.75, 0.08, d * 0.7, mat('mesh', '#9A9A96'), 0, seatH - 0.08, 0.02, 0.03)];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const arm = box(w / 2 - 0.02, 0.03, 0.04, body, 0, 0.04, 0);
    arm.geometry.translate(w / 4, 0, 0);
    arm.rotation.y = a;
    out.push(arm);
  }
  out.push(box(w * 0.65, h - seatH - 0.05, 0.05, mat('mesh', '#9A9A96'), 0, seatH + 0.03, -d / 2 + 0.08, 0.04));
  return out;
};

const stool: ShapeFn = ({ w, h, mat }) => {
  const r = w / 2;
  const legsMat = mat('legs', '#222222');
  const out: THREE.Object3D[] = [cyl(r, r, 0.04, mat('seat'), 0, h - 0.04)];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    out.push(cyl(0.012, 0.014, h - 0.04, legsMat, Math.cos(a) * r * 0.7, 0, Math.sin(a) * r * 0.7, 8));
  }
  out.push(cyl(r * 0.72, r * 0.72, 0.012, legsMat, 0, h * 0.3));
  return out;
};

const cushion: ShapeFn = ({ w, d, h, mat }) => {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, h, 32), mat('body'));
  m.scale.set(w, 1, d);
  m.position.y = h / 2;
  return [m];
};

const rug: ShapeFn = ({ w, d, h, mat }) => [box(w, Math.max(h, 0.006), d, mat('body'), 0, 0, 0)];

const fridge: ShapeFn = ({ w, d, h, mat }) => [
  box(w, h, d - 0.02, mat('body'), 0, 0, -0.01, 0.01),
  box(w - 0.08, h - 0.3, 0.02, mat('door', '#BFD9E0'), 0, 0.12, d / 2 - 0.01),
];

const shelfRack: ShapeFn = ({ w, d, h, mat }) => {
  const m = mat('body');
  const out = [box(0.02, h, d, m, -w / 2 + 0.01), box(0.02, h, d, m, w / 2 - 0.01)];
  for (const y of [0.03, h / 2, h - 0.02]) out.push(box(w, 0.02, d, m, 0, y - 0.01));
  return out;
};

const trolley: ShapeFn = ({ w, d, h, p, mat }) => {
  const m = mat('body');
  const wheel = 0.05;
  const tiers = Math.max(1, num(p.tiers, 3));
  const out: THREE.Object3D[] = [];
  for (const x of [-w / 2 + 0.02, w / 2 - 0.02]) for (const z of [-d / 2 + 0.02, d / 2 - 0.02]) {
    out.push(box(0.025, h - wheel, 0.025, m, x, wheel, z));
    out.push(cyl(0.025, 0.025, 0.02, new THREE.MeshStandardMaterial({ color: '#222222' }), x, 0, z, 12));
  }
  for (let i = 0; i < tiers; i++) {
    const y = wheel + 0.06 + ((h - wheel - 0.1) * i) / Math.max(1, tiers - 1);
    out.push(box(w - 0.04, 0.015, d - 0.04, m, 0, y));
    out.push(box(w - 0.04, 0.05, 0.01, m, 0, y, d / 2 - 0.025), box(w - 0.04, 0.05, 0.01, m, 0, y, -d / 2 + 0.025));
  }
  return out;
};

const floorLamp: ShapeFn = ({ w, h, mat }) => {
  const stand = mat('stand', '#222222');
  const shadeH = Math.min(0.4, h * 0.3);
  return [cyl(w * 0.4, w * 0.45, 0.025, stand), cyl(0.012, 0.012, h - shadeH, stand, 0, 0.02, 0, 8), cyl(w * 0.35, w / 2, shadeH, mat('shade'), 0, h - shadeH)];
};

/** Đèn bút BIC: ống dài `length` dựng nghiêng `leanAngle` độ, tựa về phía sau (−z). */
const penLamp: ShapeFn = ({ d, p, mat }) => {
  const len = cm(num(p.length, 150));
  const lean = THREE.MathUtils.degToRad(num(p.leanAngle, 20));
  const g = new THREE.Group();
  const r = 0.035;
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len * 0.82, 20), mat('tube', '#F2F2F2'));
  tube.position.y = len * 0.18 + (len * 0.82) / 2;
  const core = new THREE.Mesh(
    new THREE.CylinderGeometry(r * 0.35, r * 0.35, len * 0.8, 10),
    new THREE.MeshStandardMaterial({ color: '#fff4dc', emissive: '#ffe6b8', emissiveIntensity: 1.2 }),
  );
  (core.material as THREE.Material).userData.glow = true;
  core.position.y = tube.position.y;
  const capMat = mat('cap', '#2B35D9');
  const cap = new THREE.Mesh(new THREE.ConeGeometry(r * 1.15, len * 0.18, 20), capMat);
  cap.rotation.x = Math.PI;
  cap.position.y = len * 0.09;
  const end = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.1, r * 1.1, 0.04, 20), capMat);
  end.position.y = len - 0.02;
  g.add(tube, core, cap, end);
  g.rotation.x = -lean; // đỉnh ngả về −z (tựa tường)
  g.position.z = d / 2 - 0.04;
  return [g];
};

const cubeLamp: ShapeFn = ({ w, d, h, mat }) => {
  const m = mat('body');
  const out: THREE.Object3D[] = [box(w, h, d, m, 0, 0, 0, 0.004)];
  const rib = new THREE.MeshStandardMaterial({ color: '#ffffff', transparent: true, opacity: 0.25 });
  for (let y = 0.02; y < h; y += 0.02) out.push(box(w + 0.002, 0.003, d + 0.002, rib, 0, y));
  return out;
};

/** Đèn lồng giấy treo trần: quả cầu (có nan ngang) + dây lên trần (dây vẽ dài 1 m, bị trần che). */
const lantern: ShapeFn = ({ w, h, p, mat }) => {
  const r = w / 2;
  const ball = new THREE.Mesh(new THREE.SphereGeometry(r, 32, 20), mat('shade'));
  ball.position.y = h / 2;
  const out: THREE.Object3D[] = [ball, cyl(0.004, 0.004, 1, new THREE.MeshStandardMaterial({ color: '#222222' }), 0, h)];
  if (p.ribs) {
    const rib = new THREE.MeshStandardMaterial({ color: '#d9d4c8', roughness: 0.9 });
    for (let k = -6; k <= 6; k++) {
      const lat = (k / 7) * (Math.PI / 2);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(r * Math.cos(lat) * 1.003, 0.0015, 4, 48), rib);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = h / 2 + r * Math.sin(lat);
      out.push(ring);
    }
  }
  return out;
};

// ------------------------------------------------------- đồ treo tường
// Gốc tâm đáy, mặt trước +z, mặt sau ở z = −d/2 (áp vào tường).

/** Tranh / poster: mặt in (texture) + khung `frame` cm (0 = canvas không khung). */
const frame: ShapeFn = ({ w, d, h, p, mat }) => {
  const f = cm(num(p.frame, 0));
  const out: THREE.Object3D[] = [box(w, h, d, f > 0 ? mat('frame', '#C79A63') : mat('art'), 0, 0, 0)];
  const art = new THREE.Mesh(new THREE.PlaneGeometry(w - 2 * f, h - 2 * f), mat('art'));
  art.position.set(0, h / 2, d / 2 + 0.001);
  out.push(art);
  return out;
};

const clock: ShapeFn = ({ w, d, h, mat }) => {
  const r = w / 2;
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(r, r, d, 48), mat('rim', '#1F2328'));
  rim.rotation.x = Math.PI / 2;
  rim.position.y = h / 2;
  const face = new THREE.Mesh(new THREE.CircleGeometry(r * 0.92, 48), mat('face', '#F5F3EE'));
  face.position.set(0, h / 2, d / 2 + 0.001);
  return [rim, face];
};

const panelSheet: ShapeFn = ({ w, d, h, mat }) => [box(w, h, Math.max(d, 0.003), mat('body'), 0, 0, 0)];

const pegboardShape: ShapeFn = ({ w, d, h, mat }) => [box(w, h, d, mat('body'), 0, 0, 0)];

const wallShelf: ShapeFn = ({ w, d, h, mat }) => {
  const m = mat('body');
  const t = 0.025;
  const out: THREE.Object3D[] = [box(w, t, d, m, 0, h - t, 0, 0.003)];
  for (const x of [-w / 2 + 0.08, w / 2 - 0.08]) {
    out.push(box(0.015, h - t, 0.02, mat('bracket', '#222222'), x, 0, -d / 2 + 0.01));
    out.push(box(0.015, 0.02, d * 0.8, mat('bracket', '#222222'), x, h - t - 0.02, -d / 2 + d * 0.4));
  }
  return out;
};

const tapestry: ShapeFn = ({ w, h, mat }) => {
  const geo = new THREE.PlaneGeometry(w, h * 0.97, 24, 4);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setZ(i, 0.004 + Math.sin((pos.getX(i) / w) * Math.PI * 6) * 0.004);
  geo.computeVertexNormals();
  const cloth = new THREE.Mesh(geo, mat('body'));
  (cloth.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
  cloth.position.set(0, h * 0.97 / 2, 0);
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, w + 0.1, 12), mat('rod', '#5a3a2a'));
  rod.rotation.z = Math.PI / 2;
  rod.position.set(0, h - 0.01, 0.01);
  return [cloth, rod];
};

const wallLight: ShapeFn = ({ w, d, h, mat }) => {
  const plate = new THREE.Mesh(new THREE.CylinderGeometry(w / 2, w / 2, d * 0.3, 40), mat('base', '#2a2a2a'));
  plate.rotation.x = Math.PI / 2;
  plate.position.set(0, h / 2, -d / 2 + d * 0.15);
  const shade = new THREE.Mesh(new THREE.SphereGeometry(w / 2, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), mat('shade'));
  shade.rotation.x = Math.PI / 2;
  shade.scale.set(1, (d * 0.7) / (w / 2), 1);
  shade.position.set(0, h / 2, -d / 2 + d * 0.3);
  return [plate, shade];
};

/** Đèn đuốc: cán nghiêng ra trước + đầu lục giác phát sáng. */
const torchLamp: ShapeFn = ({ w, d, h, mat }) => {
  const g = new THREE.Group();
  const stickH = h * 0.72;
  g.add(box(w * 0.35, stickH, w * 0.35, mat('body'), 0, 0, 0));
  const head = new THREE.Mesh(new THREE.CylinderGeometry(w / 2, w / 2, h - stickH, 6), mat('head'));
  head.position.y = stickH + (h - stickH) / 2;
  g.add(head);
  g.rotation.x = Math.atan2(d * 0.6, h); // ngả đầu ra phía trước
  g.position.z = -d / 2 + w * 0.2;
  return [g];
};

const plant: ShapeFn = ({ w, h, p, mat }) => {
  const out: THREE.Object3D[] = [];
  let y = 0;
  if (p.stand) {
    const standH = h * 0.35;
    out.push(cyl(w * 0.4, w * 0.4, 0.03, mat('stand', '#B8925A'), 0, standH - 0.03));
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      out.push(cyl(0.012, 0.012, standH - 0.03, mat('stand', '#B8925A'), Math.cos(a) * w * 0.3, 0, Math.sin(a) * w * 0.3, 8));
    }
    y = standH;
  }
  const potH = (h - y) * (p.flowers ? 0.45 : 0.32);
  out.push(cyl(w * 0.45, w * 0.36, potH, mat('pot'), 0, y));
  const leaves = mat('leaves', '#3F6B35');
  const top = h - y - potH;
  const blobs = p.flowers ? 9 : 6;
  for (let i = 0; i < blobs; i++) {
    const a = (i / blobs) * Math.PI * 2;
    const rr = w * 0.22 + (i % 2) * 0.03;
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(rr, 1), leaves);
    const t = 0.35 + ((i * 37) % 10) / 16;
    m.position.set(Math.cos(a) * w * 0.22, y + potH + top * t * 0.8, Math.sin(a) * w * 0.22);
    out.push(m);
  }
  return out;
};

function glowMat(color = '#ffffff'): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.2 });
  m.userData.glow = true;
  return m;
}

const tubeLight: ShapeFn = ({ w, h, d }) => [box(w, h, d, glowMat())];

/** Dải LED trong máng nhôm: máng mờ + dải phát sáng ở mặt trước. */
const ledStrip: ShapeFn = ({ w, h, d, mat }) => [
  box(w, h, d * 0.7, new THREE.MeshStandardMaterial({ color: '#bfc3c7', metalness: 0.3, roughness: 0.4 }), 0, 0, -d * 0.15),
  box(w - 0.01, h * 0.6, d * 0.3, glowMat((mat('body') as THREE.MeshStandardMaterial).color.getStyle()), 0, h * 0.2, d * 0.35),
];

const plainBox: ShapeFn = ({ w, d, h, mat }) => [box(w, h, d, mat('body'), 0, 0, 0, 0.005)];

export const SHAPES: Record<string, ShapeFn> = {
  box: plainBox,
  sofa,
  armchair,
  booth,
  bench,
  table_rect: tableRect,
  table_oval: tableOval,
  table_round: tableRound,
  counter,
  cabinet,
  chair,
  office_chair: officeChair,
  stool,
  cushion,
  rug,
  fridge,
  shelf_rack: shelfRack,
  trolley,
  floor_lamp: floorLamp,
  pen_lamp: penLamp,
  cube_lamp: cubeLamp,
  lantern,
  plant,
  tube_light: tubeLight,
  led_strip: ledStrip,
  frame,
  clock,
  panel_sheet: panelSheet,
  pegboard: pegboardShape,
  wall_shelf: wallShelf,
  tapestry,
  wall_light: wallLight,
  torch_lamp: torchLamp,
};

/** Dựng một món catalog. Gốc tâm đáy, mặt trước +z, đơn vị m. */
export function buildShape(item: CatalogItem): THREE.Group {
  const materials = new Map<string, THREE.Material>();
  const parts = Object.keys(item.materials);
  const glow = !!item.light;
  const mat = (part: string, fallback = '#B9A998') => {
    let m = materials.get(part);
    if (!m) {
      const spec = item.materials[part] ?? (part === 'body' || !parts.length ? item.materials[parts[0]] : undefined);
      m = makeMaterial(spec, fallback, glow);
      materials.set(part, m);
    }
    return m;
  };
  const fn = SHAPES[item.shape] ?? plainBox;
  const g = new THREE.Group();
  g.add(...fn({ w: cm(item.size.w), d: cm(item.size.d), h: cm(item.size.h), p: item.params, mat, glow }));
  g.name = `shape:${item.id}`;
  return g;
}
