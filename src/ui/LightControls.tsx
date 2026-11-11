/**
 * Điều khiển ánh sáng: ngày / đêm, bóng đổ, đèn hiện trạng theo nhóm (downlight, đèn tuýp),
 * và các control dùng lại cho đèn của từng món (Kelvin, độ sáng, bật/tắt).
 */
import { useRef } from 'preact/hooks';
import type { LightOverride, LightSpec, Room, Scene } from '../data/schema';

export const KELVIN_MIN = 2200;
export const KELVIN_MAX = 6500;

/** Mô tả nhiệt độ màu cho người không quen Kelvin. */
export function kelvinName(k: number): string {
  if (k < 2600) return 'vàng rất ấm';
  if (k < 3200) return 'vàng ấm';
  if (k < 4500) return 'trắng trung tính';
  if (k < 5500) return 'trắng';
  return 'trắng lạnh';
}

interface LightFieldsProps {
  spec: LightSpec;
  value: LightOverride | undefined;
  onChange: (next: LightOverride | undefined, tag?: string) => void;
  label?: string;
}

/** Bật/tắt + Kelvin + độ sáng cho một đèn (hoặc một nhóm đèn). */
export function LightFields({ spec, value, onChange, label }: LightFieldsProps) {
  const on = value?.on ?? true;
  const fixedColor = spec.color && value?.kelvin === undefined;
  const kelvin = value?.kelvin ?? spec.kelvin ?? 2700;
  const intensity = value?.intensity ?? spec.intensity;
  const set = (p: Partial<LightOverride>, tag?: string) => onChange({ on, ...value, ...p }, tag);
  return (
    <div class="light-fields">
      <label class="toggle-row compact">
        <input type="checkbox" checked={on} onChange={() => set({ on: !on })} />
        {label ?? 'Bật đèn'}
        {fixedColor && <span class="color-dot" style={{ background: spec.color }} title="Đèn màu cố định" />}
      </label>
      {on && (
        <>
          <div class="slider-row">
            <span class="slider-label">Màu</span>
            <input
              class="kelvin"
              type="range"
              min={KELVIN_MIN}
              max={KELVIN_MAX}
              step={100}
              value={kelvin}
              onInput={(e) => set({ kelvin: +(e.currentTarget as HTMLInputElement).value }, 'kelvin')}
              aria-label="Nhiệt độ màu"
            />
            <span class="unit">{fixedColor ? 'màu gốc' : `${kelvin} K`}</span>
          </div>
          {!fixedColor && <p class="hint tight">{kelvinName(kelvin)}</p>}
          <div class="slider-row">
            <span class="slider-label">Độ sáng</span>
            <input
              type="range"
              min={0}
              max={3}
              step={0.1}
              value={intensity}
              onInput={(e) => set({ intensity: +(e.currentTarget as HTMLInputElement).value }, 'intensity')}
              aria-label="Độ sáng"
            />
            <span class="unit">{Math.round(intensity * 100)}%</span>
          </div>
          {value && (value.kelvin !== undefined || value.intensity !== undefined) && (
            <button class="link small" onClick={() => onChange(on ? undefined : { on })}>Về mặc định</button>
          )}
        </>
      )}
    </div>
  );
}

const GROUP_LABEL: Record<string, string> = { downlight: 'Downlight âm trần', tube_light: 'Đèn tuýp' };

/** Ngày / đêm, bóng đổ, đèn hiện trạng — trong panel Cảnh. */
export function LightingSection({ room, scene, onScene }: { room: Room; scene: Scene; onScene: (s: Scene, tag?: string) => void }) {
  const groups = new Map<string, { spec: LightSpec; count: number }>();
  for (const f of room.fixtures) {
    if (!f.light || scene.room.hiddenFixtures.includes(f.id)) continue;
    const g = groups.get(f.type);
    if (g) g.count++;
    else groups.set(f.type, { spec: f.light, count: 1 });
  }
  return (
    <>
      <h3>Ánh sáng</h3>
      <div class="seg seg-full" role="group" aria-label="Ngày / đêm">
        <button aria-pressed={scene.mode === 'day'} onClick={() => onScene({ ...scene, mode: 'day' })}>☀ Ban ngày</button>
        <button aria-pressed={scene.mode === 'night'} onClick={() => onScene({ ...scene, mode: 'night' })}>☾ Ban đêm</button>
      </div>
      <label class="toggle-row compact">
        <input type="checkbox" checked={scene.shadows} onChange={() => onScene({ ...scene, shadows: !scene.shadows })} />
        Bóng đổ <small class="muted">(nặng hơn trên tablet)</small>
      </label>
      {[...groups].map(([type, g]) => (
        <details key={type} class="light-group">
          <summary>
            {GROUP_LABEL[type] ?? type} ({g.count})
            {scene.room.fixtureLights[type]?.on === false && <span class="muted"> · tắt</span>}
          </summary>
          <LightFields
            spec={g.spec}
            value={scene.room.fixtureLights[type]}
            label="Bật cả nhóm"
            onChange={(v, tag) => {
              const fl = { ...scene.room.fixtureLights };
              if (v) fl[type] = v;
              else delete fl[type];
              onScene({ ...scene, room: { ...scene.room, fixtureLights: fl } }, tag && `fixture:${type}:${tag}`);
            }}
          />
        </details>
      ))}
    </>
  );
}

/** Joystick ảo cho chế độ tầm mắt (cảm ứng + chuột). */
export function Joystick({ onChange }: { onChange: (x: number, y: number) => void }) {
  const base = useRef<HTMLDivElement>(null);
  const knob = useRef<HTMLDivElement>(null);
  const R = 44;
  const move = (e: PointerEvent) => {
    const b = base.current!.getBoundingClientRect();
    let dx = e.clientX - (b.left + b.width / 2);
    let dy = e.clientY - (b.top + b.height / 2);
    const len = Math.hypot(dx, dy);
    if (len > R) [dx, dy] = [(dx / len) * R, (dy / len) * R];
    knob.current!.style.transform = `translate(${dx}px, ${dy}px)`;
    onChange(dx / R, -dy / R);
  };
  const end = () => {
    knob.current!.style.transform = '';
    onChange(0, 0);
  };
  return (
    <div
      ref={base}
      class="joystick"
      aria-label="Joystick đi lại"
      onPointerDown={(e) => {
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        move(e as unknown as PointerEvent);
      }}
      onPointerMove={(e) => (e.currentTarget as HTMLElement).hasPointerCapture(e.pointerId) && move(e as unknown as PointerEvent)}
      onPointerUp={end}
      onPointerCancel={end}
    >
      <div ref={knob} class="joystick-knob" />
    </div>
  );
}
