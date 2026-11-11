/**
 * Panel bên phải (trên điện thoại: khay dưới): thuộc tính của bề mặt đang chọn,
 * hoặc khi chưa chọn gì thì là thông tin cảnh + Xuất / Nhập / Chia sẻ / Đặt lại.
 */
import { useRef, useState } from 'preact/hooks';
import type { Panels, Room, Scene, Wall } from '../data/schema';
import { wallLength } from '../data/validate';
import type { PickTarget } from '../three/viewer';
import { ColorField } from './ColorField';
import { PanelEditor } from './PanelEditor';

interface Props {
  room: Room;
  panels: Panels;
  scene: Scene;
  selection: PickTarget | null;
  saveState: 'saved' | 'pending' | 'unavailable' | 'shared';
  onScene: (next: Scene) => void;
  onClearSelection: () => void;
  onExport: () => void;
  onImport: (file: File) => void;
  onShare: () => void;
  onReset: () => void;
  onExportAi: () => void;
  onSnapshot: () => void;
  exporting: boolean;
}

export function Sidebar(props: Props) {
  return (
    <aside class="sidebar" aria-label="Thuộc tính">
      {props.selection ? <SurfaceInspector {...props} selection={props.selection} /> : <SceneInfo {...props} />}
    </aside>
  );
}

function SurfaceInspector({ room, panels, scene, selection, onScene, onClearSelection }: Props & { selection: PickTarget }) {
  let title: string;
  let value: string;
  let isOverridden: boolean;
  let setColor: (hex: string | undefined) => void;
  let extra = null;
  let panelEditor = null;

  if (selection.kind === 'wall') {
    const wall = room.walls.find((w) => w.id === selection.id)!;
    const o = scene.room.walls[wall.id] ?? {};
    title = wall.label;
    value = o.color ?? wall.color;
    isOverridden = o.color !== undefined;
    const patch = (p: Partial<typeof o>) => {
      const next = { ...o, ...p };
      for (const k of Object.keys(next) as (keyof typeof next)[]) if (next[k] === undefined) delete next[k];
      const walls = { ...scene.room.walls };
      if (Object.keys(next).length) walls[wall.id] = next;
      else delete walls[wall.id];
      onScene({ ...scene, room: { ...scene.room, walls } });
    };
    setColor = (hex) => patch({ color: hex });
    const effectivePanel = o.panel !== undefined ? o.panel : wall.panel;
    panelEditor = (
      <PanelEditor
        room={room}
        wall={wall}
        panels={panels}
        panel={effectivePanel}
        // bỏ ốp: nếu room.json không có ốp thì xoá ghi đè, ngược lại ghi đè bằng null
        onChange={(p) => patch({ panel: p === null && wall.panel === null ? undefined : p })}
        longWalls={longWalls(room)}
        onApplyTo={(ids, p) => {
          const walls = { ...scene.room.walls };
          for (const id of ids) walls[id] = { ...walls[id], panel: { ...p } };
          onScene({ ...scene, room: { ...scene.room, walls } });
        }}
      />
    );
    if (wall.mouldings) {
      const on = o.mouldings ?? wall.mouldings.enabled;
      extra = (
        <label class="toggle-row">
          <input
            type="checkbox"
            checked={on}
            onChange={(e) => {
              const checked = (e.currentTarget as HTMLInputElement).checked;
              patch({ mouldings: checked === wall.mouldings!.enabled ? undefined : checked });
            }}
          />
          Phào chỉ khung tranh
        </label>
      );
    }
  } else {
    title = `Trần — ${room.zones[0].label}`;
    value = scene.room.ceilingColor ?? room.ceiling.color;
    isOverridden = scene.room.ceilingColor !== undefined;
    setColor = (hex) => onScene({ ...scene, room: { ...scene.room, ceilingColor: hex } });
  }

  return (
    <section class="panel">
      <header class="panel-head">
        <h2>{title}</h2>
        <button class="icon-btn" onClick={onClearSelection} aria-label="Bỏ chọn" title="Bỏ chọn">
          ×
        </button>
      </header>
      <h3>Màu</h3>
      <ColorField value={value} onChange={(hex) => setColor(hex)} />
      {extra}
      <button class="btn ghost" disabled={!isOverridden} onClick={() => setColor(undefined)}>
        Khôi phục màu hiện trạng
      </button>
      {panelEditor}
    </section>
  );
}

function SceneInfo({ room, scene, saveState, onScene, onExport, onImport, onShare, onReset, onExportAi, onSnapshot, exporting }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const changedWalls = Object.keys(scene.room.walls).length;

  return (
    <section class="panel">
      <header class="panel-head">
        <h2>Cảnh</h2>
        <span class={`save-state ${saveState}`}>
          {{ saved: 'Đã tự lưu', pending: 'Đang lưu…', unavailable: 'Trình duyệt không cho lưu', shared: 'Cảnh chia sẻ — chưa lưu' }[saveState]}
        </span>
      </header>
      <label class="field">
        <span>Tên phương án</span>
        <input
          value={scene.name}
          onChange={(e) => onScene({ ...scene, name: (e.currentTarget as HTMLInputElement).value.trim() || 'Chưa đặt tên' })}
        />
      </label>
      <p class="hint">
        {changedWalls > 0 ? `${changedWalls} mảng tường đã đổi.` : 'Chưa đổi gì so với hiện trạng.'} Chạm vào một mảng tường hoặc trần để chỉnh.
      </p>
      <div class="btn-grid">
        <button class="btn" onClick={onShare}>Chia sẻ link</button>
        <button class="btn" onClick={onExport}>Xuất JSON</button>
        <button class="btn" onClick={() => fileRef.current?.click()}>Nhập JSON</button>
        {confirmReset ? (
          <button
            class="btn danger"
            onClick={() => {
              setConfirmReset(false);
              onReset();
            }}
            onBlur={() => setConfirmReset(false)}
          >
            Chắc chắn đặt lại?
          </button>
        ) : (
          <button class="btn ghost" onClick={() => setConfirmReset(true)}>Đặt lại</button>
        )}
      </div>
      <h3>Ảnh</h3>
      <div class="btn-grid">
        <button class="btn accent" onClick={onExportAi} disabled={exporting} title="Bộ ảnh các góc nhìn + prompt mô tả chi tiết, nén .zip">
          {exporting ? 'Đang render…' : 'Xuất cho AI'}
        </button>
        <button class="btn" onClick={onSnapshot}>Chụp ảnh PNG</button>
      </div>
      <p class="hint">"Xuất cho AI" tải về .zip gồm mặt bằng + {room.views.length} góc nhìn và prompt.md để đưa vào Gemini.</p>
      <FixtureToggles room={room} scene={scene} onScene={onScene} />
      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={(e) => {
          const input = e.currentTarget as HTMLInputElement;
          const file = input.files?.[0];
          if (file) onImport(file);
          input.value = '';
        }}
      />
    </section>
  );
}

/** Các tường dài nhất của khu chính (zone đầu tiên) — "2 mặt tường" của quán. */
function longWalls(room: Room): Wall[] {
  const main = room.walls.filter((w) => w.faces === room.zones[0].id);
  const max = Math.max(...main.map(wallLength));
  return main.filter((w) => wallLength(w) === max);
}

const FIXTURE_ICON: Record<string, string> = { tube_light: 'Đèn tuýp', downlight: 'Downlight', ac_unit: 'Máy lạnh' };

/** Bật/tắt thiết bị hiện trạng (đèn tuýp, downlight, máy lạnh) — downlight gộp thành một nhóm. */
function FixtureToggles({ room, scene, onScene }: { room: Room; scene: Scene; onScene: (s: Scene) => void }) {
  const hidden = new Set(scene.room.hiddenFixtures);
  const groups: { label: string; ids: string[] }[] = [];
  const downlights = room.fixtures.filter((f) => f.type === 'downlight').map((f) => f.id);
  for (const f of room.fixtures) {
    if (f.type === 'downlight' || !(f.type in FIXTURE_ICON)) continue;
    groups.push({ label: f.label, ids: [f.id] });
  }
  if (downlights.length) groups.push({ label: `Downlight âm trần (${downlights.length})`, ids: downlights });
  if (!groups.length) return null;

  const toggle = (ids: string[], show: boolean) => {
    const next = new Set(hidden);
    for (const id of ids) (show ? next.delete(id) : next.add(id));
    onScene({ ...scene, room: { ...scene.room, hiddenFixtures: [...next] } });
  };

  return (
    <>
      <h3>Đèn & thiết bị hiện trạng</h3>
      {groups.map((g) => {
        const visible = g.ids.every((id) => !hidden.has(id));
        return (
          <label key={g.label} class="toggle-row compact">
            <input type="checkbox" checked={visible} onChange={() => toggle(g.ids, !visible)} />
            {g.label}
          </label>
        );
      })}
    </>
  );
}

