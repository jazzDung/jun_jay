import { useEffect, useState } from 'preact/hooks';

/** Bảng màu gợi ý theo concept (handoff.md mục 1) + màu hiện trạng. */
export const PALETTE: { hex: string; name: string }[] = [
  { hex: '#9DB4AA', name: 'Sage (hiện trạng)' },
  { hex: '#5B8A80', name: 'Xanh đậm (hiện trạng)' },
  { hex: '#F4F1EA', name: 'Trắng ngà' },
  { hex: '#EFE3CC', name: 'Kem ấm' },
  { hex: '#C9813F', name: 'Gỗ thông cam' },
  { hex: '#E07A2F', name: 'Cam' },
  { hex: '#B5462E', name: 'Đỏ gạch' },
  { hex: '#2B4BD9', name: 'Cobalt' },
  { hex: '#4E6B4A', name: 'Xanh rêu' },
  { hex: '#5A3A2A', name: 'Nâu chocolate' },
];

const HEX_RE = /^#?([0-9a-f]{6})$/i;

export function normalizeHex(input: string): string | null {
  const m = HEX_RE.exec(input.trim());
  return m ? `#${m[1].toUpperCase()}` : null;
}

interface Props {
  value: string;
  onChange: (hex: string) => void;
}

export function ColorField({ value, onChange }: Props) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  const invalid = normalizeHex(text) === null;

  const commitText = (t: string) => {
    setText(t);
    const hex = normalizeHex(t);
    if (hex && hex !== value) onChange(hex);
  };

  return (
    <div class="color-field">
      <div class="color-row">
        <label class="color-wheel" style={{ background: value }} title="Mở bảng chọn màu">
          <input
            type="color"
            value={value.toLowerCase()}
            onInput={(e) => onChange((e.currentTarget as HTMLInputElement).value.toUpperCase())}
            aria-label="Chọn màu"
          />
        </label>
        <input
          class={`hex-input${invalid ? ' invalid' : ''}`}
          value={text}
          spellcheck={false}
          autocomplete="off"
          maxLength={7}
          aria-label="Mã màu hex"
          aria-invalid={invalid}
          onInput={(e) => commitText((e.currentTarget as HTMLInputElement).value)}
          onBlur={() => setText(value)}
        />
      </div>
      <div class="swatches" role="group" aria-label="Bảng màu gợi ý">
        {PALETTE.map((p) => (
          <button
            key={p.hex}
            class={`swatch${p.hex === value.toUpperCase() ? ' active' : ''}`}
            style={{ background: p.hex }}
            title={`${p.name} ${p.hex}`}
            aria-label={`${p.name} ${p.hex}`}
            onClick={() => onChange(p.hex)}
          />
        ))}
      </div>
    </div>
  );
}
