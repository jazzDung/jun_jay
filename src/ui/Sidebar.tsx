/**
 * Panel bên phải (trên điện thoại: khay dưới): thuộc tính của bề mặt đang chọn,
 * hoặc khi chưa chọn gì thì là thông tin cảnh + Xuất / Nhập / Chia sẻ / Đặt lại.
 */
import { useRef, useState } from 'preact/hooks';
import type { Room, Scene } from '../data/schema';
import type { PickTarget } from '../three/viewer';
import { ColorField } from './ColorField';

interface Props {
  room: Room;
  scene: Scene;
  selection: PickTarget | null;
  saveState: 'saved' | 'pending' | 'unavailable' | 'shared';
  onScene: (next: Scene) => void;
  onClearSelection: () => void;
  onExport: () => void;
  onImport: (file: File) => void;
  onShare: () => void;
  onReset: () => void;
}

export function Sidebar(props: Props) {
  return (
    <aside class="sidebar" aria-label="Thuộc tính">
      {props.selection ? <SurfaceInspector {...props} selection={props.selection} /> : <SceneInfo {...props} />}
    </aside>
  );
}

function SurfaceInspector({ room, scene, selection, onScene, onClearSelection }: Props & { selection: PickTarget }) {
  let title: string;
  let value: string;
  let isOverridden: boolean;
  let setColor: (hex: string | undefined) => void;
  let extra = null;

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
    </section>
  );
}

function SceneInfo({ scene, saveState, onScene, onExport, onImport, onShare, onReset }: Props) {
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
