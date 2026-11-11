/**
 * Thuộc tính món đang chọn: kích thước, vị trí (cm), xoay, độ thả (đồ treo trần),
 * khoảng cách tới tường, cảnh báo của món, nhân bản / xoá.
 */
import type { CatalogItem, ItemPlacement, Room } from '../data/schema';
import { footprint, wallDistances, type Warning } from '../analysis/checks';
import { sizeText } from './Catalog';

interface Props {
  room: Room;
  item: CatalogItem;
  placement: ItemPlacement;
  warnings: Warning[];
  onChange: (patch: Partial<ItemPlacement>, tag?: string) => void;
  onRotate: (delta: number) => void;
  onDuplicate: () => void;
  onRemove: () => void;
  onClose: () => void;
}

const norm360 = (r: number) => ((Math.round(r) % 360) + 360) % 360;

export function ItemInspector({ room, item, placement: p, warnings, onChange, onRotate, onDuplicate, onRemove, onClose }: Props) {
  const dist = wallDistances(room, { placement: p, item, rect: footprint(p, item) });
  const numField = (label: string, value: number, set: (v: number) => void, hint?: string) => (
    <label class="num-field">
      <span>{label}</span>
      <input
        type="number"
        step={5}
        value={value}
        onChange={(e) => {
          const v = Number((e.currentTarget as HTMLInputElement).value);
          if (Number.isFinite(v)) set(v);
        }}
      />
      {hint && <small>{hint}</small>}
    </label>
  );

  return (
    <section class="panel">
      <header class="panel-head">
        <h2>
          {item.name}
          {item.owned && <span class="badge owned">Có sẵn</span>}
        </h2>
        <button class="icon-btn" onClick={onClose} aria-label="Bỏ chọn" title="Bỏ chọn (Esc)">×</button>
      </header>
      <p class="hint">{sizeText(item)}{item.notes ? ` — ${item.notes}` : ''}</p>

      <h3>Vị trí tâm (cm)</h3>
      <div class="num-row">
        {numField('Từ tường cửa sổ', p.x, (x) => onChange({ x }, 'pos'))}
        {numField('Từ tường phải (WC)', p.z, (z) => onChange({ z }, 'pos'))}
      </div>
      {item.mount === 'ceiling' && (
        <div class="num-row">{numField('Thả từ trần xuống', p.drop ?? 30, (drop) => onChange({ drop: Math.max(0, drop) }, 'drop'))}</div>
      )}

      <h3>Xoay — {norm360(p.rot)}°</h3>
      <div class="seg seg-full" role="group" aria-label="Xoay">
        <button onClick={() => onRotate(-90)} title="Xoay trái 90°">⟲ 90°</button>
        <button onClick={() => onRotate(-15)} title="Xoay trái 15° (Q)">⟲ 15°</button>
        <button onClick={() => onRotate(15)} title="Xoay phải 15° (E)">15° ⟳</button>
        <button onClick={() => onRotate(90)} title="Xoay phải 90° (R)">90° ⟳</button>
      </div>

      {dist && item.mount === 'floor' && (
        <>
          <h3>Khoảng cách mép tới tường</h3>
          <ul class="dist-list">
            {dist.map((d) => (
              <li key={d.label} class={d.cm < 0 ? 'bad' : ''}>
                <span>{d.label}</span>
                <b>{Math.round(d.cm)} cm</b>
              </li>
            ))}
          </ul>
        </>
      )}

      {warnings.length > 0 && (
        <ul class="warn-list">
          {warnings.map((w) => (
            <li key={w.message}>⚠ {w.message}</li>
          ))}
        </ul>
      )}

      <div class="btn-grid">
        <button class="btn" onClick={onDuplicate} title="Ctrl+D">Nhân bản</button>
        <button class="btn danger-ghost" onClick={onRemove} title="Delete">Xoá</button>
      </div>
    </section>
  );
}
