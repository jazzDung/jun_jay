/**
 * Thuộc tính món đang chọn.
 *  - Đồ sàn / treo trần: vị trí tâm (cm), xoay, độ thả, khoảng cách mép tới tường.
 *  - Đồ treo tường: tường, vị trí dọc tường, độ cao tâm / mép dưới / mép trên.
 * Chung: cảnh báo của món, nhân bản, xoá.
 */
import type { CatalogItem, ItemPlacement, LightOverride, Placement, Room, Wall, WallPlacement } from '../data/schema';
import { LightFields } from './LightControls';
import { footprint, wallDistances, type Warning } from '../analysis/checks';
import { wallLength } from '../data/validate';
import { sizeText } from './Catalog';

type Patch = Partial<ItemPlacement & WallPlacement>;

interface Props {
  room: Room;
  item: CatalogItem;
  placement: Placement;
  warnings: Warning[];
  onChange: (patch: Patch, tag?: string) => void;
  onLight: (light: LightOverride | undefined, tag?: string) => void;
  onRotate: (delta: number) => void;
  onDuplicate: () => void;
  onRemove: () => void;
  onClose: () => void;
}

const norm360 = (r: number) => ((Math.round(r) % 360) + 360) % 360;

/** u đo từ đầu `from` của tường — gọi tên đầu đó cho dễ hiểu. */
export function uLabel(room: Room, wall: Wall): string {
  const [x0, z0] = room.zones[0].rect;
  if (wall.from[1] === wall.to[1]) return wall.from[0] <= wall.to[0] && wall.from[0] === x0 ? 'Từ tường cửa sổ' : 'Từ đầu tường';
  return wall.from[1] <= wall.to[1] && wall.from[1] === z0 ? 'Từ tường phải (WC)' : 'Từ đầu tường';
}

function NumField({ label, value, set, step = 5 }: { label: string; value: number; set: (v: number) => void; step?: number }) {
  return (
    <label class="num-field">
      <span>{label}</span>
      <input
        type="number"
        step={step}
        value={value}
        onChange={(e) => {
          const v = Number((e.currentTarget as HTMLInputElement).value);
          if (Number.isFinite(v)) set(v);
        }}
      />
    </label>
  );
}

export function ItemInspector({ room, item, placement: p, warnings, onChange, onLight, onRotate, onDuplicate, onRemove, onClose }: Props) {
  return (
    <section class="panel">
      <header class="panel-head">
        <h2>
          {item.name}
          {item.owned && <span class="badge owned">Có sẵn</span>}
        </h2>
        <button class="icon-btn" onClick={onClose} aria-label="Bỏ chọn" title="Bỏ chọn (Esc)">×</button>
      </header>
      <p class="hint">
        {sizeText(item)}
        {item.designer ? ` · ${item.designer}` : ''}
        {item.notes ? ` — ${item.notes}` : ''}
        {item.source?.url && (
          <>
            {' '}
            <a class="src-link" href={item.source.url} target="_blank" rel="noreferrer noopener">Ảnh & nguồn ↗</a>
          </>
        )}
      </p>

      {'wall' in p ? <WallFields room={room} item={item} p={p} onChange={onChange} /> : <FloorFields room={room} item={item} p={p} onChange={onChange} onRotate={onRotate} />}

      {item.light && (
        <>
          <h3>Đèn</h3>
          <LightFields spec={item.light} value={p.light} onChange={(v, tag) => onLight(v, tag && `light:${tag}`)} />
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

function FloorFields({ room, item, p, onChange, onRotate }: { room: Room; item: CatalogItem; p: ItemPlacement; onChange: Props['onChange']; onRotate: Props['onRotate'] }) {
  const dist = wallDistances(room, { placement: p, item, rect: footprint(p, item) });
  return (
    <>
      <h3>Vị trí tâm (cm)</h3>
      <div class="num-row">
        <NumField label="Từ tường cửa sổ" value={p.x} set={(x) => onChange({ x }, 'pos')} />
        <NumField label="Từ tường phải (WC)" value={p.z} set={(z) => onChange({ z }, 'pos')} />
      </div>
      {item.mount === 'ceiling' ? (
        <div class="num-row">
          <NumField label="Thả từ trần xuống" value={p.drop ?? 30} set={(drop) => onChange({ drop: Math.max(0, drop) }, 'drop')} />
        </div>
      ) : (
        <div class="num-row">
          <NumField label="Cao độ đáy (đặt trên bàn/kệ)" value={p.y ?? 0} step={1} set={(y) => onChange({ y: Math.max(0, y) || undefined }, 'y')} />
        </div>
      )}

      <h3>Xoay — {norm360(p.rot)}°</h3>
      <div class="seg seg-full" role="group" aria-label="Xoay">
        <button onClick={() => onRotate(-90)} title="Xoay trái 90° (Shift+R)">⟲ 90°</button>
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
    </>
  );
}

function WallFields({ room, item, p, onChange }: { room: Room; item: CatalogItem; p: WallPlacement; onChange: Props['onChange'] }) {
  const wall = room.walls.find((w) => w.id === p.wall);
  const len = wall ? wallLength(wall) : 0;
  const bottom = p.v - item.size.h / 2;
  const top = p.v + item.size.h / 2;
  return (
    <>
      <h3>Tường</h3>
      <select
        class="select"
        value={p.wall}
        onChange={(e) => {
          const id = (e.currentTarget as HTMLSelectElement).value;
          const w = room.walls.find((x) => x.id === id);
          if (!w) return;
          const L = wallLength(w);
          onChange({ wall: id, u: Math.min(Math.max(p.u, item.size.w / 2), L - item.size.w / 2) });
        }}
      >
        {room.walls.map((w) => (
          <option key={w.id} value={w.id}>
            {w.label}
          </option>
        ))}
      </select>

      <h3>Vị trí (cm)</h3>
      <div class="num-row">
        {wall && <NumField label={`${uLabel(room, wall)} tới tâm`} value={p.u} step={10} set={(u) => onChange({ u }, 'pos')} />}
        <NumField label="Tâm cao từ sàn" value={p.v} step={10} set={(v) => onChange({ v }, 'pos')} />
      </div>
      <ul class="dist-list">
        <li>
          <span>Mép dưới cách sàn</span>
          <b>{Math.round(bottom)} cm</b>
        </li>
        <li>
          <span>Mép trên cách trần</span>
          <b>{Math.round(room.ceilingHeight - top)} cm</b>
        </li>
        <li>
          <span>Mép trái / phải tới đầu tường</span>
          <b>
            {Math.round(p.u - item.size.w / 2)} / {Math.round(len - p.u - item.size.w / 2)} cm
          </b>
        </li>
      </ul>
    </>
  );
}
