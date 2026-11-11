/**
 * Ốp lam sóng / ván cho một mảng tường: bật/tắt, màu gỗ, phạm vi ngang (cả tường / một nửa /
 * tuỳ chỉnh), chiều cao (kín trần / ốp lửng), và áp dụng giống vậy cho cả 2 tường dài.
 */
import type { Panel, Panels, Room, Wall } from '../data/schema';
import { wallLength } from '../data/validate';

interface Props {
  room: Room;
  wall: Wall;
  panels: Panels;
  /** Lớp ốp đang có hiệu lực (ghi đè của cảnh, hoặc của room.json). */
  panel: Panel | null;
  onChange: (panel: Panel | null) => void;
  /** Các tường dài của khu chính (để "ốp cả 2 tường"). */
  longWalls: Wall[];
  onApplyTo: (wallIds: string[], panel: Panel) => void;
}

type RangeMode = 'full' | 'first' | 'second' | 'custom';

export function defaultPanel(panels: Panels): Panel {
  return {
    profile: panels.profiles[0].id,
    finish: (panels.finishes.find((f) => f.texture) ?? panels.finishes[0]).id,
    tone: null,
    sheen: 'matte',
    coverage: 'full',
    wainscotHeight: 120,
    uRange: null,
  };
}

/** Tên hai nửa tường: tường chạy dọc trục x thì gọi theo phía cửa sổ (x nhỏ) / phía trong. */
function halfNames(wall: Wall): [string, string] {
  if (wall.from[1] === wall.to[1]) {
    const fromIsWindowSide = wall.from[0] < wall.to[0];
    return fromIsWindowSide ? ['Nửa phía cửa sổ', 'Nửa phía trong'] : ['Nửa phía trong', 'Nửa phía cửa sổ'];
  }
  return ['Nửa đầu', 'Nửa cuối'];
}

export function PanelEditor({ room, wall, panels, panel, onChange, longWalls, onApplyTo }: Props) {
  const len = wallLength(wall);
  const half = Math.round(len / 2);
  const [firstName, secondName] = halfNames(wall);

  if (!panel) {
    return (
      <>
        <h3>Ốp lam sóng</h3>
        <button class="btn" onClick={() => onChange(defaultPanel(panels))}>
          Ốp lam sóng cho tường này
        </button>
      </>
    );
  }

  const set = (p: Partial<Panel>) => onChange({ ...panel, ...p });
  const r = panel.uRange;
  const mode: RangeMode = !r ? 'full' : r[0] === 0 && r[1] === half ? 'first' : r[0] === half && r[1] === len ? 'second' : 'custom';
  const maxWainscot = room.ceilingHeight - 10;
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(v)));
  const base = import.meta.env.BASE_URL;
  const otherLong = longWalls.filter((w) => w.id !== wall.id);
  const isLong = longWalls.some((w) => w.id === wall.id);

  return (
    <>
      <h3>Ốp lam sóng</h3>
      {panels.profiles.length > 1 && (
        <div class="seg seg-full" role="group" aria-label="Loại ốp">
          {panels.profiles.map((p) => (
            <button key={p.id} aria-pressed={panel.profile === p.id} onClick={() => set({ profile: p.id })}>
              {p.name}
            </button>
          ))}
        </div>
      )}

      <div class="finish-grid" role="group" aria-label="Màu gỗ">
        {panels.finishes.map((f) => (
          <button
            key={f.id}
            class={`finish${panel.finish === f.id ? ' active' : ''}`}
            onClick={() => set({ finish: f.id })}
            title={f.name}
          >
            <span class="finish-swatch" style={{ background: f.texture ? `url(${base}${f.texture}) center/cover` : f.color }} />
            <span class="finish-name">{f.name}</span>
          </button>
        ))}
      </div>

      <h3>Phạm vi ngang</h3>
      <div class="seg seg-full seg-wrap" role="group" aria-label="Phạm vi ngang">
        <button aria-pressed={mode === 'full'} onClick={() => set({ uRange: null })}>Cả tường</button>
        <button aria-pressed={mode === 'first'} onClick={() => set({ uRange: [0, half] })}>{firstName}</button>
        <button aria-pressed={mode === 'second'} onClick={() => set({ uRange: [half, len] })}>{secondName}</button>
        <button aria-pressed={mode === 'custom'} onClick={() => set({ uRange: r && mode === 'custom' ? r : [0, Math.min(len, 200)] })}>
          Tuỳ chỉnh
        </button>
      </div>
      {mode === 'custom' && r && (
        <div class="range-row">
          <label>
            Từ
            <input
              type="number"
              min={0}
              max={len}
              step={5}
              value={r[0]}
              onChange={(e) => {
                const a = clamp(+(e.currentTarget as HTMLInputElement).value, 0, r[1] - 5);
                set({ uRange: [a, r[1]] });
              }}
            />
          </label>
          <label>
            Đến
            <input
              type="number"
              min={0}
              max={len}
              step={5}
              value={r[1]}
              onChange={(e) => {
                const b = clamp(+(e.currentTarget as HTMLInputElement).value, r[0] + 5, len);
                set({ uRange: [r[0], b] });
              }}
            />
          </label>
          <span class="unit">cm / {len}</span>
        </div>
      )}

      <h3>Chiều cao</h3>
      <div class="seg seg-full" role="group" aria-label="Chiều cao ốp">
        <button aria-pressed={panel.coverage === 'full'} onClick={() => set({ coverage: 'full' })}>Kín trần</button>
        <button aria-pressed={panel.coverage === 'wainscot'} onClick={() => set({ coverage: 'wainscot' })}>Ốp lửng</button>
      </div>
      {panel.coverage === 'wainscot' && (
        <div class="slider-row">
          <input
            type="range"
            min={40}
            max={maxWainscot}
            step={5}
            value={panel.wainscotHeight}
            onInput={(e) => set({ wainscotHeight: +(e.currentTarget as HTMLInputElement).value })}
            aria-label="Chiều cao ốp lửng"
          />
          <span class="unit">{panel.wainscotHeight} cm</span>
        </div>
      )}

      {isLong && otherLong.length > 0 && (
        <button class="btn" onClick={() => onApplyTo(longWalls.map((w) => w.id), panel)}>
          Ốp giống vậy cho cả {longWalls.length} tường dài
        </button>
      )}
      <button class="btn ghost" onClick={() => onChange(null)}>Bỏ ốp</button>
    </>
  );
}
