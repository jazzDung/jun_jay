/**
 * Sinh prompt.md cho Gemini (tiếng Anh) từ dữ liệu phòng + cảnh hiện tại: kích thước, ô cửa,
 * màu từng mảng tường, lớp ốp, thiết bị, đồ đạc, ánh sáng, và mô tả từng ảnh góc nhìn.
 * Hàm thuần — không đụng DOM, dễ kiểm tra.
 */
import type { CatalogItem, Panel, Scene, Wall } from '../data/schema';
import type { DataBundle } from '../data/validate';
import { wallLength } from '../data/validate';

export interface ViewFile {
  file: string;
  label: string;
  description: string;
  /** m */
  position?: [number, number, number];
  target?: [number, number, number];
}

const NAMED_COLORS: [string, string][] = [
  ['#9DB4AA', 'muted sage green'],
  ['#5B8A80', 'deep teal green'],
  ['#F4F1EA', 'warm off-white'],
  ['#EFE3CC', 'warm cream'],
  ['#D6C6AE', 'light beige'],
  ['#C9813F', 'orange-toned pine'],
  ['#E07A2F', 'burnt orange'],
  ['#B5462E', 'terracotta / brick red'],
  ['#D9A441', 'mustard yellow'],
  ['#2B4BD9', 'cobalt blue'],
  ['#1F3A8A', 'navy blue'],
  ['#4E6B4A', 'moss green'],
  ['#2F7A34', 'leaf green'],
  ['#5A3A2A', 'chocolate brown'],
  ['#8A5A2B', 'medium brown wood'],
  ['#F08A93', 'soft pink'],
  ['#FFFFFF', 'white'],
  ['#C8C8C8', 'light grey'],
  ['#777777', 'mid grey'],
  ['#333333', 'charcoal'],
  ['#111111', 'black'],
];

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** "#2B4BD9 (cobalt blue)" — tên màu gần nhất giúp model hiểu nhanh, mã hex để chính xác. */
export function colorName(hex: string): string {
  const [r, g, b] = rgb(hex);
  let best = NAMED_COLORS[0];
  let bestD = Infinity;
  for (const c of NAMED_COLORS) {
    const [r2, g2, b2] = rgb(c[0]);
    const d = (r - r2) ** 2 * 0.3 + (g - g2) ** 2 * 0.59 + (b - b2) ** 2 * 0.11;
    if (d < bestD) [best, bestD] = [c, d];
  }
  return `${hex.toUpperCase()} (${best[1]})`;
}

const m = (cm: number) => `${(cm / 100).toFixed(2).replace(/\.?0+$/, '')} m`;

function wallName(w: Wall): string {
  return w.en ?? w.label;
}

function panelText(panel: Panel, wall: Wall, data: DataBundle): string {
  const profile = data.panels.profiles.find((p) => p.id === panel.profile);
  const finish = data.panels.finishes.find((f) => f.id === panel.finish);
  const len = wallLength(wall);
  const kind =
    profile?.style === 'fluted'
      ? `vertical fluted wood-look slat panels (${profile.ridges} raised ridges per ${profile.width} cm board, ridges ${profile.ridgeDepth} cm deep)`
      : `vertical wood-look boards ${profile?.width ?? ''} cm wide with V-grooves`;
  const color = finish ? `${finish.name.toLowerCase()} finish ${colorName(panel.tone ?? finish.color)}` : '';
  const range = panel.uRange
    ? isAlongX(wall)
      ? `covering ${m(Math.abs(xAt(wall, panel.uRange[0])))}–${m(Math.abs(xAt(wall, panel.uRange[1])))} measured from the window wall`
      : `covering ${m(panel.uRange[0])}–${m(panel.uRange[1])} along this ${m(len)} wall`
    : 'covering the whole wall';
  const height = panel.coverage === 'full' ? 'from floor to ceiling' : `as wainscoting up to ${m(panel.wainscotHeight)} high`;
  const texture = finish?.texture ? ` (real sample photo: materials/${finish.id}.jpg)` : '';
  return `${kind}, ${color}${texture}, ${range}, ${height}`;
}

function isAlongX(w: Wall): boolean {
  return w.from[1] === w.to[1];
}

/** Toạ độ x (cm) của điểm u trên tường chạy dọc trục x. */
function xAt(w: Wall, u: number): number {
  const dir = Math.sign(w.to[0] - w.from[0]);
  return w.from[0] + dir * u;
}

function itemSize(it: CatalogItem): string {
  const s = it.size;
  if (it.mount === 'wall') return `${s.w} × ${s.h} cm (sticks out ${s.d} cm)`;
  return `${s.w} × ${s.d} cm footprint, ${s.h} cm tall`;
}

function itemMaterials(it: CatalogItem): string {
  const parts = Object.entries(it.materials).map(([part, mat]) => `${part}: ${mat.type} ${colorName(mat.color)}`);
  return parts.length ? parts.join('; ') : '';
}

export function buildPrompt(data: DataBundle, scene: Scene, views: ViewFile[]): string {
  const { room, catalog } = data;
  const main = room.zones[0];
  const [x0, z0, x1, z1] = main.rect;
  const L = x1 - x0;
  const W = z1 - z0;
  const H = room.ceilingHeight;
  const hidden = new Set(scene.room.hiddenFixtures);
  const lines: string[] = [];
  const push = (...l: string[]) => lines.push(...l);

  push(
    `<!--`,
    `  Jun Jẩy — gói ảnh + mô tả để đưa vào Gemini (hoặc model tạo ảnh khác).`,
    `  Cách dùng: đính kèm 1 ảnh trong views/ (+ ảnh vật liệu trong materials/ nếu có),`,
    `  dán toàn bộ nội dung file này, rồi thêm câu yêu cầu ở mục "Per-image request" bên dưới.`,
    `  Phương án: ${scene.name} — xuất lúc ${new Date().toLocaleString('vi-VN')}`,
    `-->`,
    '',
    `# Jun Jẩy café — interior scene brief`,
    '',
    `Scenario: **${scene.name}**. Mode: **${scene.mode === 'night' ? 'night (only interior lights)' : 'daytime (soft daylight through the window)'}**.`,
    '',
    `## Task`,
    `Create a photorealistic interior photograph from the attached reference render. The render is a simplified 3D model with **exact real-world dimensions** — treat it as a strict layout guide:`,
    `- keep the exact camera position, angle and focal length of the reference image;`,
    `- keep the room geometry, wall positions, window and door openings, ceiling height and every object's position, size and orientation;`,
    `- replace the flat 3D materials with realistic textures and lighting matching the descriptions below;`,
    `- do not add, remove or move architecture or furniture; no people, no text, no watermarks.`,
    '',
    `## The space`,
    `- A small café on an upper floor of an old apartment building in central Ho Chi Minh City, Vietnam. Concept: one big warm, colourful living room — editorial interior photography mood (Paul Hempstead style) with a touch of Bauhaus; warm orange-toned pine, cobalt blue, orange / brick red, warm cream, warm yellow bounced light.`,
    `- ${main.en ?? main.label}: **${m(L)} long × ${m(W)} wide** (${((L * W) / 10000).toFixed(0)} m²), **ceiling ${m(H)}** — a low ceiling.`,
    `- Two zones: a low lounge area near the window (first ~4 m) and a work area with higher tables (back ~4 m).`,
    `- Floor: existing light oak wood floor, warm beige with a honey undertone, narrow planks running along the length of the room. Keep it as is.`,
    `- Ceiling: ${room.ceiling.type === 'drop_tile' ? `white suspended ceiling tiles ${room.ceiling.tile ?? 60} × ${room.ceiling.tile ?? 60} cm with thin grey T-bars` : 'flat painted ceiling'}${scene.room.ceilingColor ? `, tinted ${colorName(scene.room.ceilingColor)}` : ''}.`,
    `- Behind the back wall (left to right when facing it): ${room.zones
      .slice(1)
      .map((z) => `${z.en ?? z.label} (${m(z.rect[3] - z.rect[1])} wide)`)
      .join(', ')}.`,
    '',
    `## Walls, openings and finishes`,
  );

  for (const w of room.walls.filter((w) => w.faces === main.id)) {
    const o = scene.room.walls[w.id] ?? {};
    const color = o.color ?? w.color;
    const panel = o.panel !== undefined ? o.panel : w.panel;
    const mouldings = w.mouldings && (o.mouldings ?? w.mouldings.enabled);
    push(`- **${wallName(w)}** — ${m(wallLength(w))} wide, painted ${colorName(color)}.`);
    const along = (u: [number, number]) =>
      isAlongX(w) ? `${m(xAt(w, u[0]))}–${m(xAt(w, u[1]))} from the window wall` : `${m(u[0])}–${m(u[1])} along the wall`;
    if (mouldings && !(panel && panel.coverage === 'full' && !panel.uRange))
      push(
        `  - Classic applied picture-frame wall mouldings in the same paint colour (a row of tall frames above a row of short frames), white skirting board${panel ? ' — only on the part NOT covered by the wood panels' : ''}.`,
      );
    for (const c of w.claddings)
      push(
        `  - Existing white PVC ${c.type === 'pvc_vgroove' ? 'cladding with vertical V-grooves' : 'cladding with horizontal stripes'}, ${m(c.u[1] - c.u[0])} wide × ${m(c.v[1] - c.v[0])} high, ${along(c.u)}.`,
      );
    if (panel) push(`  - Clad with ${panelText(panel, w, data)}.`);
    for (const op of room.openings.filter((op) => op.wall === w.id)) {
      const where = along(op.u);
      const sill = op.sill > 0 ? `, sill at ${m(op.sill)}` : '';
      push(`  - ${op.en ?? op.label}: ${m(op.u[1] - op.u[0])} wide × ${m(op.height)} high${sill}, ${where}.`);
    }
    for (const f of room.fixtures.filter((f) => f.wall === w.id)) {
      push(`  - ${f.en ?? f.label}${hidden.has(f.id) ? ' — REMOVED in this scenario, do not show it' : ` (${f.size.w} × ${f.size.h} cm, centre ${m(f.v ?? 0)} above the floor)`}.`);
    }
  }
  const downlights = room.fixtures.filter((f) => f.type === 'downlight');
  if (downlights.length) {
    const off = downlights.filter((f) => hidden.has(f.id)).length;
    push(`- ${downlights.length - off} small round recessed downlights in the ceiling${off ? ` (${off} removed)` : ''}.`);
  }
  push('');

  push(`## Furniture and decor`);
  if (!scene.items.length) {
    push(`None placed yet — the room is shown empty (current state).`);
  } else {
    const byId = new Map(catalog.items.map((i) => [i.id, i]));
    const walls = new Map(room.walls.map((w) => [w.id, w]));
    for (const p of scene.items) {
      const it = byId.get(p.catalogId);
      if (!it) continue;
      let where = '';
      if ('wall' in p) {
        const w = walls.get(p.wall)!;
        const along = isAlongX(w) ? `${m(xAt(w, p.u))} from the window wall` : `${m(p.u)} along it`;
        where = `hung on the ${wallName(w)}, ${along}, centre ${m(p.v)} above the floor`;
      } else {
        where = `centre ${m(p.x - x0)} from the window wall and ${m(p.z - z0)} from the right wall${p.rot ? `, rotated ${p.rot}°` : ''}`;
        if ('drop' in p && p.drop) where += `, hanging ${m(p.drop)} below the ceiling`;
      }
      const mats = itemMaterials(it);
      push(`- **${it.name}** — ${itemSize(it)}; ${where}.${mats ? ` Materials: ${mats}.` : ''}${it.notes ? ` ${it.notes}` : ''}`);
    }
  }
  push('');

  push(`## Lighting`);
  if (scene.mode === 'night') push(`Evening: no daylight; warm interior lights only (2200–2700 K), cosy pools of light, very low ambient.`);
  else push(`Daytime: soft natural daylight coming through the window wall from a leafy street (green trees outside), warm interior fill.`);
  for (const l of scene.lights.filter((l) => l.on)) push(`- ${l.type} light, ${l.kelvin} K, intensity ${l.intensity}.`);
  const tubes = room.fixtures.filter((f) => f.type === 'tube_light' && !hidden.has(f.id));
  if (tubes.length) push(`- ${tubes.length} existing cool-white fluorescent tube light(s) mounted high on the long walls.`);
  push('');

  push(`## Reference images (views/)`, `Coordinates: x = distance from the window wall, y = height, z = distance from the right (WC-side) wall, in metres.`);
  for (const v of views) {
    const cam = v.position && v.target ? ` Camera at (${v.position.map((n) => n.toFixed(1)).join(', ')}) looking at (${v.target.map((n) => n.toFixed(1)).join(', ')}).` : '';
    push(`- \`${v.file}\` — ${v.label}. ${v.description}${cam}`);
  }
  push(
    '',
    `## Per-image request (copy, then attach the matching image)`,
    `> Using the attached image \`views/<file>.png\` as the exact composition and layout reference, render a photorealistic photograph of this café interior following the brief above. Keep camera, geometry, openings and object placement identical; only upgrade materials, textures and lighting.`,
    '',
  );
  return lines.join('\n');
}
