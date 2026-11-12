/**
 * Kiểm tra các phương án mẫu trong public/scenes: hợp lệ với phòng + catalog, và liệt kê
 * cảnh báo bố cục (chồng lấn, xuyên tường, vùng quét cửa, lối đi < 80 cm, đồ treo tường).
 * Chạy: npm run check-scenes
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { analyze } from '../src/analysis/checks';
import { parseScene, validateBundle } from '../src/data/validate';

const pub = resolve(import.meta.dirname, '..', 'public');
const read = (p: string): unknown => JSON.parse(readFileSync(resolve(pub, p), 'utf8'));

const base = validateBundle({ room: read('data/room.json'), catalog: read('data/catalog.json'), scene: read('data/scene.json'), panels: read('data/panels.json') });
if (!base.ok) {
  console.error(base.errors.join('\n'));
  process.exit(1);
}
const catalog = new Map(base.data.catalog.items.map((i) => [i.id, i]));
let bad = 0;
for (const entry of read('scenes/index.json') as { id: string; name: string; file: string }[]) {
  const r = parseScene(read(entry.file), base.data, entry.file);
  if (!r.ok) {
    bad++;
    console.error(`✗ ${entry.id}\n  ${r.errors.join('\n  ')}`);
    continue;
  }
  const { warnings } = analyze(base.data.room, r.data, catalog);
  const owned = r.data.items.filter((p) => catalog.get(p.catalogId)?.owned).length;
  console.log(`${warnings.length ? '!' : '✓'} ${entry.name} — ${r.data.items.length} món (${owned} có sẵn), ${warnings.length} cảnh báo`);
  for (const w of [...r.warnings, ...warnings.map((x) => x.message)]) console.log(`    - ${w}`);
  bad += warnings.length;
}
process.exit(bad ? 1 : 0);
