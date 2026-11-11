import { useEffect, useRef, useState } from 'preact/hooks';
import { loadDefaultData } from '../data/load';
import type { DataBundle } from '../data/validate';
import { Viewer, type CameraMode } from '../three/viewer';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; errors: string[] }
  | { status: 'ready'; data: DataBundle; warnings: string[] };

export function App() {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Viewer | null>(null);
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [camera, setCamera] = useState<CameraMode>('orbit');

  useEffect(() => {
    loadDefaultData().then((r) =>
      setState(r.ok ? { status: 'ready', data: r.data, warnings: r.warnings } : { status: 'error', errors: r.errors }),
    );
  }, []);

  useEffect(() => {
    if (state.status !== 'ready' || !hostRef.current) return;
    const viewer = new Viewer(hostRef.current);
    viewer.setRoom(state.data.room);
    viewerRef.current = viewer;
    return () => {
      viewer.dispose();
      viewerRef.current = null;
    };
  }, [state]);

  const switchCamera = (mode: CameraMode) => {
    setCamera(mode);
    viewerRef.current?.setCameraMode(mode);
  };

  return (
    <div class="app">
      <header class="topbar">
        <h1>Jun Jẩy Planner</h1>
        <div class="seg" role="group" aria-label="Camera">
          <button aria-pressed={camera === 'orbit'} onClick={() => switchCamera('orbit')}>3D</button>
          <button aria-pressed={camera === 'top'} onClick={() => switchCamera('top')}>Mặt bằng</button>
        </div>
      </header>
      <main class="stage">
        <div class="viewport" ref={hostRef} />
        {state.status === 'loading' && <div class="overlay">Đang tải dữ liệu…</div>}
        {state.status === 'error' && (
          <div class="overlay error">
            <strong>Dữ liệu có lỗi</strong>
            <ul>{state.errors.map((e) => <li key={e}>{e}</li>)}</ul>
          </div>
        )}
        {state.status === 'ready' && (
          <footer class="status">
            {state.data.room.walls.length} tường · {state.data.room.openings.length} ô cửa ·{' '}
            {state.data.catalog.items.length} món catalog
            {state.warnings.length > 0 && ` · ${state.warnings.length} cảnh báo`}
          </footer>
        )}
      </main>
    </div>
  );
}
