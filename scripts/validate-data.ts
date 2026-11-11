/**
 * Kiểm tra public/data/*.json từ dòng lệnh: `npm run validate-data`.
 * Chạy sau mỗi lần sửa tay room.json / catalog.json.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { validateBundle } from '../src/data/validate';

const dir = resolve(import.meta.dirname, '..', 'public', 'data');

function read(name: string): unknown {
  const path = resolve(dir, `${name}.json`);
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    console.error(`✗ ${name}.json: ${(e as Error).message}`);
    process.exit(1);
  }
}

const result = validateBundle({ room: read('room'), catalog: read('catalog'), scene: read('scene') });
if (!result.ok) {
  console.error(`✗ ${result.errors.length} lỗi:`);
  for (const e of result.errors) console.error(`  - ${e}`);
  process.exit(1);
}
for (const w of result.warnings) console.warn(`  ! ${w}`);
const { room, catalog } = result.data;
const todoCount =
  (room.todo?.length ?? 0) +
  room.walls.reduce((n, w) => n + (w.todo?.length ?? 0), 0) +
  room.openings.reduce((n, o) => n + (o.todo?.length ?? 0), 0) +
  catalog.items.reduce((n, i) => n + (i.todo?.length ?? 0), 0);
console.log(
  `✓ Dữ liệu hợp lệ: ${room.walls.length} tường, ${room.openings.length} ô cửa, ` +
    `${catalog.items.length} món catalog (${catalog.items.filter((i) => i.owned).length} owned). ` +
    `Còn ${todoCount} mục TODO cần đo.`,
);
