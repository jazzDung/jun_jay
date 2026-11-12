/**
 * Hộp thoại "Render đẹp": path tracing một lần từ góc nhìn hiện tại, xem tiến độ trực tiếp,
 * khử nhiễu, tải PNG.
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import { denoise } from '../three/denoise';
import type { Viewer } from '../three/viewer';
import { fileStamp } from '../util/stamp';

const QUALITY = [
  { id: 'draft', label: 'Nháp', samples: 24, hint: '~20 giây' },
  { id: 'good', label: 'Đẹp', samples: 96, hint: '~1,5 phút' },
  { id: 'best', label: 'Rất đẹp', samples: 256, hint: '~4 phút' },
] as const;
const SIZES = [
  { id: 's', label: '1280 × 800', w: 1280, h: 800 },
  { id: 'm', label: '1600 × 1000', w: 1600, h: 1000 },
  { id: 'l', label: '1920 × 1200', w: 1920, h: 1200 },
] as const;

interface Props {
  viewer: Viewer;
  onClose: () => void;
}

export function RenderDialog({ viewer, onClose }: Props) {
  const [quality, setQuality] = useState<(typeof QUALITY)[number]['id']>('good');
  const [size, setSize] = useState<(typeof SIZES)[number]['id']>('s');
  const [clean, setClean] = useState(true);
  const [phase, setPhase] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [progress, setProgress] = useState({ s: 0, total: 0, sec: 0 });
  const [error, setError] = useState('');
  const preview = useRef<HTMLCanvasElement>(null);
  const result = useRef<HTMLCanvasElement | null>(null);
  const cancel = useRef(false);

  useEffect(() => () => void (cancel.current = true), []);

  const show = (c: HTMLCanvasElement) => {
    const p = preview.current;
    if (!p) return;
    if (p.width !== c.width || p.height !== c.height) [p.width, p.height] = [c.width, c.height];
    p.getContext('2d')!.drawImage(c, 0, 0);
  };

  const start = async () => {
    const q = QUALITY.find((x) => x.id === quality)!;
    const sz = SIZES.find((x) => x.id === size)!;
    cancel.current = false;
    setPhase('running');
    setProgress({ s: 0, total: q.samples, sec: 0 });
    const t0 = performance.now();
    try {
      const c = await viewer.renderHQ({
        width: sz.w,
        height: sz.h,
        samples: q.samples,
        shouldCancel: () => cancel.current,
        onProgress: (s, total, canvas) => {
          show(canvas);
          setProgress({ s, total, sec: Math.round((performance.now() - t0) / 1000) });
        },
      });
      if (clean) denoise(c, c.width > 1400 ? 1.1 : 1);
      result.current = c;
      show(c);
      setProgress((p) => ({ ...p, sec: Math.round((performance.now() - t0) / 1000) }));
      setPhase('done');
    } catch (e) {
      setError((e as Error).message);
      setPhase('error');
    }
  };

  const download = () => {
    const c = result.current;
    if (!c) return;
    const a = document.createElement('a');
    a.href = c.toDataURL('image/png');
    a.download = `junjay-render-${fileStamp()}.png`;
    a.click();
  };

  const eye = viewer.cameraMode !== 'top';
  return (
    <div class="modal" role="dialog" aria-label="Render đẹp">
      <div class="modal-box">
        <header class="panel-head">
          <h2>Render đẹp (path tracing)</h2>
          <button class="icon-btn" onClick={onClose} aria-label="Đóng">×</button>
        </header>
        {phase === 'idle' && (
          <>
            <p class="hint">
              Render một ảnh chất lượng cao từ <b>góc nhìn hiện tại</b>: ánh sáng dội giữa các bề mặt, bóng mềm, nắng qua cửa sổ
              (ban ngày) hoặc chỉ đèn trong quán (ban đêm). Trong lúc render, khung 3D tạm dừng.
              {!eye && ' Đang ở chế độ Mặt bằng — hãy chuyển sang 3D hoặc Tầm mắt để chọn góc.'}
            </p>
            <h3>Chất lượng</h3>
            <div class="seg seg-full">
              {QUALITY.map((q) => (
                <button key={q.id} aria-pressed={quality === q.id} onClick={() => setQuality(q.id)}>
                  {q.label}
                  <small class="muted"> {q.hint}</small>
                </button>
              ))}
            </div>
            <h3>Kích thước</h3>
            <div class="seg seg-full">
              {SIZES.map((s) => (
                <button key={s.id} aria-pressed={size === s.id} onClick={() => setSize(s.id)}>{s.label}</button>
              ))}
            </div>
            <label class="toggle-row compact">
              <input type="checkbox" checked={clean} onChange={() => setClean(!clean)} />
              Khử nhiễu hạt sau khi render
            </label>
            <button class="btn accent" disabled={!eye} onClick={start}>Bắt đầu render</button>
          </>
        )}
        {phase !== 'idle' && (
          <>
            <canvas ref={preview} class="render-preview" />
            {phase === 'running' && (
              <div class="render-bar">
                <progress max={progress.total} value={progress.s} />
                <span>{progress.s === 0 ? 'Đang chuẩn bị cảnh…' : `${progress.s}/${progress.total} mẫu · ${progress.sec}s`}</span>
                <button class="btn ghost" onClick={() => (cancel.current = true)}>Dừng và lấy ảnh hiện tại</button>
              </div>
            )}
            {phase === 'done' && (
              <div class="render-bar">
                <span>Xong sau {progress.sec}s.</span>
                <button class="btn accent" onClick={download}>Tải PNG</button>
                <button class="btn" onClick={() => setPhase('idle')}>Render lại</button>
              </div>
            )}
            {phase === 'error' && (
              <div class="render-bar">
                <span class="bad">Lỗi: {error}</span>
                <button class="btn" onClick={() => setPhase('idle')}>Thử lại</button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
