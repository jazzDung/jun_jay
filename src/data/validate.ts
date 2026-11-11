/**
 * Kiểm tra dữ liệu: đúng schema + các ràng buộc chéo (id trùng, tham chiếu tường/zone,
 * ô cửa nằm trong tường…). Trả về danh sách lỗi dễ đọc thay vì throw, để UI và
 * script `npm run validate-data` cùng dùng.
 */
import type { z } from 'zod';
import { Catalog, Room, Scene } from './schema';

export interface DataBundle {
  room: Room;
  catalog: Catalog;
  scene: Scene;
}

export type Result<T> = { ok: true; data: T; warnings: string[] } | { ok: false; errors: string[] };

function formatZod(file: string, error: z.ZodError): string[] {
  return error.issues.map((i) => `${file}: ${i.path.join('.') || '(gốc)'} — ${i.message}`);
}

function duplicates(ids: string[]): string[] {
  const seen = new Set<string>();
  const dup = new Set<string>();
  for (const id of ids) (seen.has(id) ? dup : seen).add(id);
  return [...dup];
}

export function wallLength(w: Room['walls'][number]): number {
  return Math.hypot(w.to[0] - w.from[0], w.to[1] - w.from[1]);
}

function checkRoom(room: Room): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  const zoneIds = new Set(room.zones.map((z) => z.id));
  const walls = new Map(room.walls.map((w) => [w.id, w]));

  for (const [kind, ids] of [
    ['zone', room.zones.map((z) => z.id)],
    ['wall', room.walls.map((w) => w.id)],
    ['opening', room.openings.map((o) => o.id)],
    ['fixture', room.fixtures.map((f) => f.id)],
  ] as const) {
    for (const d of duplicates(ids)) errors.push(`room.json: ${kind} id "${d}" bị trùng`);
  }

  for (const w of room.walls) {
    if (!zoneIds.has(w.faces)) errors.push(`room.json: tường "${w.id}" faces zone không tồn tại "${w.faces}"`);
    const len = wallLength(w);
    if (len === 0) errors.push(`room.json: tường "${w.id}" có độ dài 0`);
    for (const c of w.claddings) {
      if (c.u[1] > len + 0.01) errors.push(`room.json: ốp "${c.id}" vượt quá chiều dài tường "${w.id}" (${len})`);
      if (c.v[1] > room.ceilingHeight) warnings.push(`room.json: ốp "${c.id}" cao hơn trần`);
    }
    if (w.mouldings && w.mouldings.uRange[1] > len + 0.01)
      errors.push(`room.json: phào chỉ của "${w.id}" vượt quá chiều dài tường (${len})`);
  }

  for (const o of room.openings) {
    const w = walls.get(o.wall);
    if (!w) {
      errors.push(`room.json: ô cửa "${o.id}" gắn vào tường không tồn tại "${o.wall}"`);
      continue;
    }
    const len = wallLength(w);
    if (o.u[0] < 0 || o.u[1] > len + 0.01)
      errors.push(`room.json: ô cửa "${o.id}" (u ${o.u.join('–')}) nằm ngoài tường "${w.id}" dài ${len}`);
    if (o.sill + o.height > room.ceilingHeight)
      errors.push(`room.json: ô cửa "${o.id}" cao hơn trần (${o.sill} + ${o.height} > ${room.ceilingHeight})`);
    if (o.door && !zoneIds.has(o.door.opensInto))
      errors.push(`room.json: cửa "${o.id}" mở vào zone không tồn tại "${o.door.opensInto}"`);
  }

  for (const f of room.fixtures) {
    if (f.wall !== undefined && !walls.has(f.wall))
      errors.push(`room.json: thiết bị "${f.id}" gắn vào tường không tồn tại "${f.wall}"`);
    if (f.wall === undefined && (f.x === undefined || f.z === undefined))
      errors.push(`room.json: thiết bị "${f.id}" cần (wall, u, v) hoặc (x, z)`);
  }
  return { errors, warnings };
}

export function validateBundle(raw: { room: unknown; catalog: unknown; scene: unknown }): Result<DataBundle> {
  const errors: string[] = [];
  const room = Room.safeParse(raw.room);
  const catalog = Catalog.safeParse(raw.catalog);
  const scene = Scene.safeParse(raw.scene);
  if (!room.success) errors.push(...formatZod('room.json', room.error));
  if (!catalog.success) errors.push(...formatZod('catalog.json', catalog.error));
  if (!scene.success) errors.push(...formatZod('scene.json', scene.error));
  if (!room.success || !catalog.success || !scene.success) return { ok: false, errors };

  const roomCheck = checkRoom(room.data);
  errors.push(...roomCheck.errors);
  const warnings = [...roomCheck.warnings];

  const catalogIds = new Set(catalog.data.items.map((i) => i.id));
  for (const d of duplicates(catalog.data.items.map((i) => i.id))) errors.push(`catalog.json: id "${d}" bị trùng`);

  const wallIds = new Set(room.data.walls.map((w) => w.id));
  for (const p of scene.data.items) {
    if (!catalogIds.has(p.catalogId)) errors.push(`scene.json: "${p.uid}" dùng catalogId không tồn tại "${p.catalogId}"`);
    if ('wall' in p && !wallIds.has(p.wall)) errors.push(`scene.json: "${p.uid}" treo lên tường không tồn tại "${p.wall}"`);
  }
  for (const id of Object.keys(scene.data.room.walls)) {
    if (!wallIds.has(id)) warnings.push(`scene.json: ghi đè cho tường không tồn tại "${id}" (bỏ qua)`);
  }

  if (errors.length) return { ok: false, errors };
  return { ok: true, data: { room: room.data, catalog: catalog.data, scene: scene.data }, warnings };
}
