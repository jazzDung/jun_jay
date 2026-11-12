/**
 * Catalog đồ: lọc theo loại, chỉ đồ có sẵn (owned), tìm theo tên.
 * Chạm một món → đồ sàn đặt giữa khung nhìn; đồ treo tường treo lên tường đang chọn
 * (hoặc tường đang hướng về camera) ở độ cao mặc định `params.defaultHeight`.
 */
import { useMemo, useState } from 'preact/hooks';
import type { CatalogItem, Scene } from '../data/schema';

export const CATEGORY_LABEL: Record<CatalogItem['category'], string> = {
  seating: 'Ghế / sofa',
  table: 'Bàn / quầy',
  storage: 'Tủ / kệ',
  rug: 'Thảm',
  lighting: 'Đèn',
  plant: 'Cây / hoa',
  decor: 'Trang trí',
  appliance: 'Thiết bị',
  wall_art: 'Tranh',
  wall_storage: 'Kệ tường',
  fixture: 'Khác',
};

interface Props {
  items: CatalogItem[];
  scene: Scene;
  onAdd: (catalogId: string) => void;
  onClose: () => void;
}

export function sizeText(it: CatalogItem): string {
  const { w, d, h } = it.size;
  return w === d && ['stool', 'table_round', 'lantern', 'cushion', 'pouf', 'tray_table', 'drum_stool', 'ring_table', 'globe_lamp', 'vase', 'pendant', 'rug_round'].includes(it.shape) ? `Ø${w} × ${h} cm` : `${w} × ${d} × ${h} cm`;
}

function swatch(it: CatalogItem): string {
  const colors = Object.values(it.materials).map((m) => m.color);
  if (!colors.length) return '#B9A998';
  if (colors.length === 1) return colors[0];
  return `linear-gradient(135deg, ${colors[0]} 0 55%, ${colors[1]} 55% 100%)`;
}

export function Catalog({ items, scene, onAdd, onClose }: Props) {
  const placeable = items;
  const categories = useMemo(() => [...new Set(placeable.map((i) => i.category))], [placeable]);
  const [cat, setCat] = useState<string | null>(null);
  const [ownedOnly, setOwnedOnly] = useState(false);
  const [style, setStyle] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const placed = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of scene.items) m.set(p.catalogId, (m.get(p.catalogId) ?? 0) + 1);
    return m;
  }, [scene.items]);

  const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase();
  const query = norm(q.trim());
  const list = placeable.filter(
    (i) => (!cat || i.category === cat) && (!ownedOnly || i.owned) && (!style || i.style === style) && (!query || norm(i.name).includes(query)),
  );

  return (
    <aside class="catalog" aria-label="Catalog đồ">
      <section class="panel">
        <header class="panel-head">
          <h2>Thêm đồ</h2>
          <button class="icon-btn" onClick={onClose} aria-label="Đóng catalog">×</button>
        </header>
        <input class="search" type="search" placeholder="Tìm theo tên…" value={q} onInput={(e) => setQ((e.currentTarget as HTMLInputElement).value)} />
        <div class="chips" role="group" aria-label="Loại">
          <button aria-pressed={cat === null} onClick={() => setCat(null)}>Tất cả</button>
          {categories.map((c) => (
            <button key={c} aria-pressed={cat === c} onClick={() => setCat(cat === c ? null : c)}>
              {CATEGORY_LABEL[c]}
            </button>
          ))}
          <button class="owned-chip" aria-pressed={ownedOnly} onClick={() => setOwnedOnly(!ownedOnly)}>★ Đồ có sẵn</button>
          <button aria-pressed={style === 'bauhaus'} onClick={() => setStyle(style === 'bauhaus' ? null : 'bauhaus')}>◼ Bauhaus</button>
          <button aria-pressed={style === 'oriental'} onClick={() => setStyle(style === 'oriental' ? null : 'oriental')}>✦ Phương Đông</button>
        </div>
        <ul class="catalog-list">
          {list.map((it) => {
            const n = placed.get(it.id) ?? 0;
            return (
              <li key={it.id}>
                <button class="catalog-item" onClick={() => onAdd(it.id)} title={it.notes || it.name}>
                  <span class="cat-swatch" style={{ background: swatch(it) }} />
                  <span class="cat-text">
                    <span class="cat-name">{it.name}</span>
                    <span class="cat-meta">
                      {sizeText(it)}
                      {it.mount === 'ceiling' && ' · treo trần'}
                      {it.mount === 'wall' && ' · treo tường'}
                    </span>
                  </span>
                  <span class="cat-badges">
                    {it.owned && <span class="badge owned">Có sẵn{it.qty > 1 ? ` ×${it.qty}` : ''}</span>}
                    {n > 0 && <span class={`badge${it.owned && n > it.qty ? ' over' : ''}`}>Đã đặt {n}</span>}
                  </span>
                </button>
              </li>
            );
          })}
          {!list.length && <li class="hint">Không có món nào khớp bộ lọc.</li>}
        </ul>
        <p class="hint">Đồ treo tường được treo lên tường đang chọn — chạm vào một mảng tường trước để chọn chỗ treo.</p>
      </section>
    </aside>
  );
}
