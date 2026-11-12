/**
 * Hình khối bổ sung cho đồ phong cách Bauhaus (ống thép, kính, da) và phương Đông
 * (pouf, mâm đồng, đôn sứ, bình phong, đèn lồng đồng…). Cùng quy ước với index.ts:
 * gốc tâm đáy, mặt trước +z, vừa hộp bao w × h × d.
 */
import * as THREE from 'three';
import { box, cyl, legs, num, type ShapeFn } from './index';
import { cm } from '../units';

/** Ống tròn nối 2 điểm. */
function tube(a: THREE.Vector3, b: THREE.Vector3, r: number, mat: THREE.Material): THREE.Mesh {
  const d = b.clone().sub(a);
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, d.length(), 10), mat);
  m.position.copy(a).addScaledVector(d, 0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  return m;
}

/** Chuỗi ống qua danh sách điểm (khung ống thép uốn). */
function tubePath(points: [number, number, number][], r: number, mat: THREE.Material): THREE.Mesh[] {
  const v = points.map((p) => new THREE.Vector3(...p));
  const out: THREE.Mesh[] = [];
  for (let i = 0; i < v.length - 1; i++) out.push(tube(v[i], v[i + 1], r, mat));
  for (const p of v.slice(1, -1)) {
    const s = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 6), mat);
    s.position.copy(p);
    out.push(s);
  }
  return out;
}

function lathe(profile: [number, number][], mat: THREE.Material, seg = 32): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), seg), mat);
  (mat as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
  return m;
}

/** Ghế club ống thép + đai da (kiểu Wassily). */
const tubeLounge: ShapeFn = ({ w, d, h, p, mat }) => {
  const steel = mat('frame', '#C8C8C8');
  const strap = mat('seat', '#1c1a18');
  const r = 0.011;
  const sh = cm(num(p.seatHeight, 42));
  const out: THREE.Object3D[] = [];
  for (const s of [-1, 1]) {
    const x = (s * w) / 2 - s * r;
    // khung bên: thanh trượt sàn → chân trước → tay vịn → chân sau
    out.push(...tubePath([[x, r, -d / 2 + r], [x, r, d / 2 - r], [x, h * 0.78, d / 2 - r], [x, h * 0.78, -d / 2 + 0.08], [x, r, -d / 2 + r]], r, steel));
    out.push(box(0.012, 0.07, d * 0.8, strap, x, h * 0.78 - 0.035, 0.02)); // đai tay vịn
  }
  out.push(...tubePath([[-w / 2 + r, r, d / 2 - r], [w / 2 - r, r, d / 2 - r]], r, steel));
  const seat = box(w - 0.1, 0.012, d * 0.72, strap, 0, sh, 0.04);
  seat.rotation.x = 0.12;
  const back = box(w - 0.14, h - sh - 0.02, 0.012, strap, 0, sh + 0.04, -d / 2 + 0.16);
  back.rotation.x = -0.28;
  out.push(seat, back);
  return out;
};

/** Ghế cantilever ống thép (kiểu Cesca / MR): không chân sau. */
const cantileverChair: ShapeFn = ({ w, d, h, p, mat }) => {
  const steel = mat('frame', '#C8C8C8');
  const r = 0.011;
  const sh = cm(num(p.seatHeight, 46));
  const out: THREE.Object3D[] = [];
  for (const s of [-1, 1]) {
    const x = (s * w) / 2 - s * r;
    out.push(...tubePath([[x, r, -d / 2 + r], [x, r, d / 2 - r], [x, sh, d / 2 - 0.04], [x, sh, -d / 2 + 0.1], [x, h - 0.02, -d / 2 + 0.03]], r, steel));
  }
  out.push(...tubePath([[-w / 2 + r, r, -d / 2 + r], [w / 2 - r, r, -d / 2 + r]], r, steel));
  out.push(box(w - 0.03, 0.035, d * 0.72, mat('seat'), 0, sh - 0.005, 0.03, 0.01));
  const back = box(w - 0.03, Math.min(0.24, (h - sh) * 0.5), 0.03, mat('back', '#c9a66b'), 0, h - Math.min(0.24, (h - sh) * 0.5) - 0.02, -d / 2 + 0.05, 0.01);
  out.push(back);
  return out;
};

/** Ghế / đi-văng khung chữ X + nệm chần (kiểu Barcelona). `daybed: true` → nằm dài + gối ống. */
const xLounge: ShapeFn = ({ w, d, h, p, mat }) => {
  const steel = mat('frame', '#C8C8C8');
  const leather = mat('seat', '#2a2623');
  const sh = cm(num(p.seatHeight, 43));
  const out: THREE.Object3D[] = [];
  const bar = (a: [number, number, number], b: [number, number, number]) => out.push(...tubePath([a, b], 0.012, steel));
  if (p.daybed) {
    out.push(...legs(w, d, sh - 0.14, steel, 0.12, 0.018));
    out.push(box(w, 0.04, d, mat('base', '#6b4a2f'), 0, sh - 0.14, 0));
    out.push(box(w - 0.02, 0.1, d - 0.02, leather, 0, sh - 0.1, 0, 0.03));
    const bolster = cyl(0.09, 0.09, d - 0.06, leather, -w / 2 + 0.14, 0, 0, 20);
    bolster.rotation.x = Math.PI / 2;
    bolster.position.y = sh + 0.09;
    out.push(bolster);
    return out;
  }
  for (const s of [-1, 1]) {
    const x = (s * w) / 2 - s * 0.02;
    bar([x, 0.01, d / 2 - 0.03], [x, h - 0.02, -d / 2 + 0.04]); // thanh trước-dưới → lưng-trên
    bar([x, 0.01, -d / 2 + 0.1], [x, sh, d / 2 - 0.06]); // thanh sau-dưới → mép ghế
  }
  const seat = box(w - 0.02, 0.11, d * 0.72, leather, 0, sh - 0.06, 0.06, 0.035);
  seat.rotation.x = 0.1;
  const back = box(w - 0.02, h - sh - 0.02, 0.11, leather, 0, sh, -d / 2 + 0.16, 0.035);
  back.rotation.x = -0.3;
  out.push(seat, back);
  return out;
};

/** Đèn bàn quả cầu thuỷ tinh opal trên trụ (kiểu Wagenfeld). */
const globeLamp: ShapeFn = ({ w, h, mat }) => {
  const r = w / 2;
  const metal = mat('stand', '#C8C8C8');
  const shade = new THREE.Mesh(new THREE.SphereGeometry(r, 28, 16, 0, Math.PI * 2, 0, Math.PI * 0.62), mat('shade', '#F4F1E8'));
  shade.position.y = h - r;
  return [cyl(r * 0.85, r * 0.85, 0.018, mat('base', '#dfe5e6')), cyl(0.012, 0.012, h - r * 1.2, metal, 0, 0.018, 0, 12), shade];
};

/** Đèn bàn chao vòm kim loại trên cần cong (kiểu Kaiser Idell). */
const domeLamp: ShapeFn = ({ w, d, h, mat }) => {
  const body = mat('body', '#1c1c1c');
  const r = w / 2;
  const dome = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), body);
  (body as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
  dome.position.set(0, h - r, d / 2 - r);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(r * 0.35, 12, 8), mat('shade', '#FFF1D0'));
  bulb.position.set(0, h - r * 0.9, d / 2 - r);
  return [cyl(r * 0.8, r * 0.85, 0.02, body, 0, 0, -d / 2 + r * 0.85), ...tubePath([[0, 0.02, -d / 2 + r * 0.85], [0, h - r * 0.6, -d / 2 + r * 0.85], [0, h - r * 0.2, d / 2 - r]], 0.008, mat('stand', '#C8C8C8')), dome, bulb];
};

/** Bàn bên mặt kính tròn, chân vòng ống thép (kiểu E1027). */
const ringTable: ShapeFn = ({ w, h, mat }) => {
  const steel = mat('frame', '#C8C8C8');
  const r = w / 2;
  const ring = (y: number, open: boolean) => {
    const m = new THREE.Mesh(new THREE.TorusGeometry(r - 0.012, 0.012, 8, 40, open ? Math.PI * 1.5 : Math.PI * 2), steel);
    m.rotation.x = Math.PI / 2;
    m.position.y = y;
    return m;
  };
  const top = cyl(r - 0.02, r - 0.02, 0.008, mat('top', '#BFD9E0'), 0, h - 0.014);
  return [ring(0.012, true), ring(h - 0.012, false), top, ...tubePath([[-r + 0.012, 0.012, 0], [-r + 0.012, h - 0.012, 0]], 0.012, steel), ...tubePath([[-r + 0.1, 0.012, 0.06], [-r + 0.1, h - 0.012, 0.06]], 0.008, steel)];
};

/** Bộ bàn lồng nhau (kiểu Albers): `colors` = màu mặt từng bàn, từ nhỏ tới lớn. */
const nestingTables: ShapeFn = ({ w, d, h, p, mat }) => {
  const colors = (Array.isArray(p.colors) ? p.colors : ['#7FB6D9', '#E4572E', '#F2C230', '#2A9D8F']) as string[];
  const n = colors.length;
  const frame = mat('frame', '#C9A66B');
  const out: THREE.Object3D[] = [];
  for (let i = 0; i < n; i++) {
    const k = (i + 1) / n;
    const tw = w * (0.7 + 0.3 * k) - 0.0;
    const th = h * (0.64 + 0.36 * k);
    const z = -d / 2 + d * 0.5 + (n - 1 - i) * 0.035 - 0.05;
    const top = new THREE.MeshStandardMaterial({ color: colors[i], roughness: 0.25 });
    out.push(box(tw, 0.012, d * 0.82, top, 0, th - 0.012, z));
    for (const s of [-1, 1]) out.push(box(0.03, th - 0.012, 0.03, frame, (s * tw) / 2 - s * 0.015, 0, z - d * 0.41 + 0.015), box(0.03, th - 0.012, 0.03, frame, (s * tw) / 2 - s * 0.015, 0, z + d * 0.41 - 0.015));
  }
  return out;
};

/** Bàn khung ống thép dạng xe trượt + mặt phẳng (kiểu Laccio). */
const sledTable: ShapeFn = ({ w, d, h, mat }) => {
  const steel = mat('frame', '#C8C8C8');
  const r = 0.011;
  const out: THREE.Object3D[] = [box(w - 0.04, 0.02, d, mat('top', '#1c1c1c'), 0, h - 0.02, 0)];
  for (const s of [-1, 1]) {
    const x = (s * w) / 2 - s * r;
    out.push(...tubePath([[x, h - 0.03, -d / 2 + r], [x, r, -d / 2 + r], [x, r, d / 2 - r], [x, h - 0.03, d / 2 - r]], r, steel));
  }
  return out;
};

/** Pouf da / vải nhồi: trụ phình, mặt trên có hoạ tiết. */
const pouf: ShapeFn = ({ w, h, mat }) => {
  const r = w / 2;
  const body = lathe([[0.001, 0], [r * 0.82, 0], [r, h * 0.3], [r, h * 0.7], [r * 0.84, h], [0.001, h]], mat('body'));
  const cap = cyl(r * 0.45, r * 0.45, 0.004, mat('top', '#EFE3CC'), 0, h);
  return [body, cap];
};

/** Bàn mâm đồng trên chân gỗ xếp chéo. */
const trayTable: ShapeFn = ({ w, h, mat }) => {
  const r = w / 2;
  const wood = mat('legs', '#5a3a2a');
  const tray = lathe([[0.001, h - 0.03], [r - 0.02, h - 0.03], [r, h]], mat('top', '#C9A24B'), 48);
  const out: THREE.Object3D[] = [tray];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const b = a + Math.PI;
    out.push(tube(new THREE.Vector3(Math.cos(a) * r * 0.7, 0, Math.sin(a) * r * 0.7), new THREE.Vector3(Math.cos(b) * r * 0.5, h - 0.03, Math.sin(b) * r * 0.5), 0.014, wood));
  }
  return out;
};

/** Đôn sứ hình trống. */
const drumStool: ShapeFn = ({ w, h, mat }) => {
  const r = w / 2;
  return [lathe([[0.001, 0], [r * 0.72, 0], [r * 0.95, h * 0.25], [r, h * 0.5], [r * 0.95, h * 0.75], [r * 0.72, h], [0.001, h]], mat('body', '#F4F4F0'))];
};

/** Bình / lọ gốm (bình gừng, bình cổ cao). */
const vase: ShapeFn = ({ w, h, p, mat }) => {
  const r = w / 2;
  const neck = num(p.neck, 0.45);
  return [lathe([[0.001, 0], [r * 0.55, 0], [r, h * 0.42], [r * 0.85, h * 0.72], [r * neck, h * 0.88], [r * (neck + 0.12), h], [r * (neck - 0.05), h]], mat('body', '#F4F4F0'))];
};

/** Bình phong gấp `panels` cánh (zigzag). */
const foldingScreen: ShapeFn = ({ w, d, h, p, mat }) => {
  const n = Math.max(2, num(p.panels, 4));
  const frame = mat('frame', '#3a2a20');
  const fill = mat('body');
  const out: THREE.Object3D[] = [];
  // mỗi cánh nghiêng xen kẽ; chiều rộng hình chiếu = w / n
  const pw = Math.hypot(w / n, d);
  const ang = Math.atan2(d, w / n);
  for (let i = 0; i < n; i++) {
    const g = new THREE.Group();
    g.add(box(pw, h, 0.02, frame, 0, 0, 0), box(pw - 0.06, h - 0.24, 0.024, fill, 0, 0.16, 0));
    g.position.set(-w / 2 + (i + 0.5) * (w / n), 0, 0);
    g.rotation.y = i % 2 ? ang : -ang;
    out.push(g);
  }
  return out;
};

/** Ghế mây lưng quạt (peacock). */
const peacockChair: ShapeFn = ({ w, d, h, p, mat }) => {
  const rattan = mat('body', '#C9A66B');
  const sh = cm(num(p.seatHeight, 42));
  const r = Math.min(w, d) * 0.36;
  const base = lathe([[r * 0.8, 0], [r * 0.55, sh * 0.5], [r, sh]], rattan, 24);
  base.position.z = d / 2 - r - 0.02;
  const seat = cyl(r, r, 0.05, mat('cushion', '#EFE3CC'), 0, sh, d / 2 - r - 0.02);
  const fan = new THREE.Mesh(new THREE.CircleGeometry(0.5, 40), rattan);
  (rattan as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
  fan.scale.set(w, h - sh + 0.1, 1);
  fan.position.set(0, sh + (h - sh) / 2 - 0.05, -d / 2 + 0.06);
  fan.rotation.x = -0.12;
  return [base, seat, fan];
};

/** Đèn treo: `style` moroccan (lồng đồng đục lỗ, 6 cạnh) | dome (chao vòm) | cylinder (trụ vải). */
const pendant: ShapeFn = ({ w, h, p, mat }) => {
  const r = w / 2;
  const cord = cyl(0.004, 0.004, 1, new THREE.MeshStandardMaterial({ color: '#222222' }), 0, h);
  const style = String(p.style ?? 'moroccan');
  if (style === 'dome') {
    const m = mat('body', '#1c1c1c');
    (m as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
    const dome = new THREE.Mesh(new THREE.SphereGeometry(r, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2), m);
    dome.scale.y = h / r;
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(r * 0.3, 12, 8), mat('shade', '#FFF1D0'));
    bulb.position.y = h * 0.25;
    return [dome, bulb, cord];
  }
  if (style === 'cylinder') return [cyl(r, r, h, mat('shade', '#F3E6C8'), 0, 0, 0, 32), cord];
  const metal = mat('body', '#B08D3C');
  const glass = mat('shade', '#FFB84D');
  return [
    lathe([[0.001, 0], [r * 0.35, 0.01], [r, h * 0.38], [r, h * 0.55], [r * 0.3, h * 0.92], [0.02, h]], metal, 6),
    lathe([[r * 0.3, 0.03], [r * 0.9, h * 0.4], [r * 0.9, h * 0.54], [r * 0.32, h * 0.86]], glass, 6),
    cord,
  ];
};

/** Ghế bệt / sofa sàn kiểu majlis: đệm dày sát sàn + gối tựa. */
const majlis: ShapeFn = ({ w, d, h, p, mat }) => {
  const sh = cm(num(p.seatHeight, 24));
  const out: THREE.Object3D[] = [box(w, sh, d, mat('body'), 0, 0, 0, 0.04)];
  const n = Math.max(1, Math.round(w / 0.7));
  for (let i = 0; i < n; i++) out.push(box(w / n - 0.03, h - sh, 0.16, mat('cushion', '#EFE3CC'), -w / 2 + (i + 0.5) * (w / n), sh, -d / 2 + 0.09, 0.06));
  return out;
};

/** Kệ sách hở nhiều tầng, khung gỗ / thép. */
const bookshelf: ShapeFn = ({ w, d, h, p, mat }) => {
  const m = mat('body');
  const n = Math.max(2, num(p.shelves, 4));
  const out: THREE.Object3D[] = [box(0.025, h, d, m, -w / 2 + 0.0125), box(0.025, h, d, m, w / 2 - 0.0125)];
  const colors = ['#B5462E', '#2B4BD9', '#EFE3CC', '#D9A441', '#4E6B4A', '#1c1c1c'];
  for (let i = 0; i <= n; i++) {
    const y = 0.04 + ((h - 0.07) * i) / n;
    out.push(box(w - 0.05, 0.025, d, m, 0, y - 0.0125));
    if (i === n || !p.books) continue;
    // gáy sách: dãy hộp mỏng màu
    let x = -w / 2 + 0.06;
    let k = i * 3;
    const gap = (h - 0.07) / n;
    while (x < w / 2 - 0.12) {
      const bw = 0.025 + ((k * 7) % 4) * 0.008;
      const bh = gap * (0.55 + ((k * 5) % 4) * 0.08);
      out.push(box(bw, bh, d * 0.7, new THREE.MeshStandardMaterial({ color: colors[k % colors.length], roughness: 0.8 }), x + bw / 2, y + 0.0125, 0));
      x += bw + 0.003;
      k++;
      if (k % 9 === 0) x += 0.12;
    }
  }
  return out;
};

/** Gương / hốc vòm treo tường (cổng vòm kiểu Moorish). */
const archMirror: ShapeFn = ({ w, d, h, mat }) => {
  const shape = new THREE.Shape();
  const r = w / 2;
  shape.moveTo(-r, 0);
  shape.lineTo(r, 0);
  shape.lineTo(r, h - r);
  shape.absarc(0, h - r, r, 0, Math.PI, false);
  shape.lineTo(-r, 0);
  const frame = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: d, bevelEnabled: false }), mat('frame', '#B08D3C'));
  frame.position.z = -d / 2;
  const inner = new THREE.Shape();
  const m = 0.03;
  inner.moveTo(-r + m, m);
  inner.lineTo(r - m, m);
  inner.lineTo(r - m, h - r);
  inner.absarc(0, h - r, r - m, 0, Math.PI, false);
  inner.lineTo(-r + m, m);
  const glass = new THREE.Mesh(new THREE.ShapeGeometry(inner), mat('glass', '#cfd8dc'));
  glass.position.z = d / 2 + 0.001;
  return [frame, glass];
};

/** Thảm tròn. */
const rugRound: ShapeFn = ({ w, d, h, mat }) => {
  const m = cyl(0.5, 0.5, Math.max(h, 0.006), mat('body'), 0, 0, 0, 48);
  m.scale.set(w, 1, d);
  return [m];
};

/** Đệm vuông bo góc (đệm ngồi bệt, gối sàn). */
const cushionSq: ShapeFn = ({ w, d, h, mat }) => [box(w, h, d, mat('body'), 0, 0, 0, Math.min(h / 2, 0.06))];

/** Cây cọ / kentia: thân mảnh + tàu lá toả. */
const palm: ShapeFn = ({ w, h, mat }) => {
  const out: THREE.Object3D[] = [cyl(w * 0.2, w * 0.16, h * 0.18, mat('pot', '#B5462E'))];
  const leaf = mat('leaves', '#3F6B35');
  (leaf as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
  const n = 9;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const tilt = 0.35 + (i % 3) * 0.22;
    const len = h * (0.62 + (i % 2) * 0.12);
    const g = new THREE.Group();
    const stem = cyl(0.006, 0.01, len, mat('stem', '#5a6b3a'), 0, 0, 0, 6);
    const blade = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.34, len * 0.55), leaf);
    blade.position.y = len * 0.72;
    g.add(stem, blade);
    g.position.y = h * 0.16;
    g.rotation.set(0, a, 0);
    g.rotateZ(tilt);
    out.push(g);
  }
  return out;
};

export const EXTRA_SHAPES: Record<string, ShapeFn> = {
  tube_lounge: tubeLounge,
  cantilever_chair: cantileverChair,
  x_lounge: xLounge,
  globe_lamp: globeLamp,
  dome_lamp: domeLamp,
  ring_table: ringTable,
  nesting_tables: nestingTables,
  sled_table: sledTable,
  pouf,
  tray_table: trayTable,
  drum_stool: drumStool,
  vase,
  folding_screen: foldingScreen,
  peacock_chair: peacockChair,
  pendant,
  majlis,
  bookshelf,
  arch_mirror: archMirror,
  rug_round: rugRound,
  cushion_sq: cushionSq,
  palm,
};
