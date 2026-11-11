import { useEffect, useRef, useState } from 'preact/hooks';
import { loadDefaultData } from '../data/load';
import type { Scene } from '../data/schema';
import type { DataBundle } from '../data/validate';
import {
  clearLocal,
  clearShareHash,
  exportSceneFile,
  importSceneFile,
  loadInitialScene,
  makeShareUrl,
  saveLocal,
  type SceneSource,
} from '../state/sceneStore';
import { Viewer, type CameraMode, type PickTarget } from '../three/viewer';
import { Sidebar } from './Sidebar';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; errors: string[] }
  | { status: 'ready'; data: DataBundle; warnings: string[] };

type Toast = { kind: 'info' | 'error'; lines: string[]; copyText?: string };

const AUTOSAVE_DELAY = 400;

export function App() {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Viewer | null>(null);
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [scene, setScene] = useState<Scene | null>(null);
  const [source, setSource] = useState<SceneSource>('default');
  const [saveState, setSaveState] = useState<'saved' | 'pending' | 'unavailable' | 'shared'>('saved');
  const [selection, setSelection] = useState<PickTarget | null>(null);
  const [camera, setCamera] = useState<CameraMode>('orbit');
  const [cutaway, setCutaway] = useState(true);
  const [ceiling, setCeiling] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);

  // 1. Nạp dữ liệu + chọn cảnh ban đầu (link chia sẻ → bản tự lưu → mặc định)
  useEffect(() => {
    (async () => {
      const r = await loadDefaultData();
      if (!r.ok) return setState({ status: 'error', errors: r.errors });
      const init = await loadInitialScene(r.data.scene, r.data);
      setState({ status: 'ready', data: r.data, warnings: r.warnings });
      setScene(init.scene);
      setSource(init.source);
      if (init.source === 'shared') setSaveState('shared');
      if (init.notices.length) setToast({ kind: 'error', lines: init.notices });
    })();
  }, []);

  // Dán link chia sẻ vào tab đang mở app chỉ đổi hash, trình duyệt không tải lại → tự tải lại.
  useEffect(() => {
    const onHash = () => {
      if (new URLSearchParams(location.hash.slice(1)).has('s')) location.reload();
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  // 2. Tạo viewer một lần khi dữ liệu sẵn sàng
  useEffect(() => {
    if (state.status !== 'ready' || !hostRef.current) return;
    const viewer = new Viewer(hostRef.current);
    viewer.setRoom(state.data.room, state.data.panels);
    viewer.onPick = (t) => setSelection(t);
    viewerRef.current = viewer;
    // Dev: điều khiển viewer từ console để kiểm tra góc nhìn.
    if (import.meta.env.DEV) (window as unknown as { __viewer: Viewer }).__viewer = viewer;
    return () => {
      viewer.dispose();
      viewerRef.current = null;
    };
  }, [state]);

  // 3. Áp cảnh lên viewer + tự lưu (không tự lưu khi đang xem link chia sẻ)
  useEffect(() => {
    if (!scene) return;
    viewerRef.current?.applyScene(scene);
    if (source === 'shared') return;
    setSaveState('pending');
    const t = setTimeout(() => setSaveState(saveLocal(scene) ? 'saved' : 'unavailable'), AUTOSAVE_DELAY);
    return () => clearTimeout(t);
  }, [scene, source, state]);

  useEffect(() => viewerRef.current?.setSelection(selection), [selection, state]);

  // Thông báo thường tự tắt; thông báo lỗi / có link cần copy thì giữ đến khi người dùng đóng.
  useEffect(() => {
    if (!toast || toast.kind === 'error' || toast.copyText) return;
    const t = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(t);
  }, [toast]);

  if (state.status !== 'ready' || !scene) {
    return (
      <div class="app">
        <header class="topbar"><h1>Jun Jẩy Planner</h1></header>
        <main class="stage">
          {state.status === 'error' ? (
            <div class="overlay error">
              <strong>Dữ liệu có lỗi</strong>
              <ul>{state.errors.map((e) => <li key={e}>{e}</li>)}</ul>
            </div>
          ) : (
            <div class="overlay">Đang tải dữ liệu…</div>
          )}
        </main>
      </div>
    );
  }

  const { room, catalog } = state.data;

  const switchCamera = (mode: CameraMode) => {
    setCamera(mode);
    viewerRef.current?.setCameraMode(mode);
  };

  const adoptShared = () => {
    clearShareHash();
    setSource('local');
    setToast({ kind: 'info', lines: ['Đã lưu cảnh chia sẻ thành cảnh của bạn trên thiết bị này.'] });
  };

  const leaveShared = async () => {
    clearShareHash();
    const init = await loadInitialScene(state.data.scene, state.data);
    setScene(init.scene);
    setSource(init.source);
    setSelection(null);
  };

  const share = async () => {
    const url = await makeShareUrl(scene);
    try {
      // clipboard có thể treo (chờ quyền / tab mất focus) → giới hạn thời gian rồi cho copy tay
      await Promise.race([
        navigator.clipboard.writeText(url),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 1500)),
      ]);
      setToast({ kind: 'info', lines: ['Đã copy link chia sẻ. Người nhận mở link sẽ thấy đúng cảnh này.'] });
    } catch {
      // http qua mạng LAN không có clipboard API → cho copy tay
      setToast({ kind: 'info', lines: ['Copy link dưới đây để chia sẻ:'], copyText: url });
    }
  };

  const importFile = async (file: File) => {
    const r = await importSceneFile(file, state.data);
    if (!r.ok) return setToast({ kind: 'error', lines: ['Không nhập được cảnh:', ...r.errors] });
    if (source === 'shared') clearShareHash();
    setSource('local');
    setScene(r.data);
    setSelection(null);
    setToast({ kind: 'info', lines: [`Đã nhập "${r.data.name}".`, ...r.warnings] });
  };

  const reset = () => {
    clearLocal();
    if (source === 'shared') clearShareHash();
    setSource('local');
    setScene(state.data.scene);
    setSelection(null);
  };

  return (
    <div class="app">
      <header class="topbar">
        <h1>Jun Jẩy Planner</h1>
        <div class="seg" role="group" aria-label="Camera">
          <button aria-pressed={camera === 'orbit'} onClick={() => switchCamera('orbit')}>3D</button>
          <button aria-pressed={camera === 'top'} onClick={() => switchCamera('top')}>Mặt bằng</button>
        </div>
        <div class="seg">
          <button
            aria-pressed={cutaway}
            title="Ẩn tường chắn tầm nhìn"
            onClick={() => {
              setCutaway(!cutaway);
              viewerRef.current?.setCutaway(!cutaway);
            }}
          >
            Cắt tường
          </button>
          <button
            aria-pressed={ceiling}
            onClick={() => {
              setCeiling(!ceiling);
              viewerRef.current?.setCeilingVisible(!ceiling);
            }}
          >
            Trần
          </button>
        </div>
      </header>

      {source === 'shared' && (
        <div class="banner">
          <span>Bạn đang xem cảnh được chia sẻ: <b>{scene.name}</b>. Thay đổi sẽ chưa được lưu.</span>
          <button class="btn" onClick={adoptShared}>Lưu thành cảnh của tôi</button>
          <button class="btn ghost" onClick={leaveShared}>Mở cảnh của tôi</button>
        </div>
      )}

      <main class="stage">
        <div class="viewport" ref={hostRef} />
        <Sidebar
          room={room}
          panels={state.data.panels}
          scene={scene}
          selection={selection}
          saveState={saveState}
          onScene={setScene}
          onClearSelection={() => setSelection(null)}
          onExport={() => exportSceneFile(scene)}
          onImport={importFile}
          onShare={share}
          onReset={reset}
        />
        {toast && (
          <div class={`toast ${toast.kind}`} role="status">
            <div>
              {toast.lines.map((l) => <p key={l}>{l}</p>)}
              {toast.copyText && (
                <input class="copy-input" readOnly value={toast.copyText} onFocus={(e) => (e.currentTarget as HTMLInputElement).select()} />
              )}
            </div>
            <button class="icon-btn" onClick={() => setToast(null)} aria-label="Đóng">×</button>
          </div>
        )}
        <footer class="status">
          {room.walls.length} tường · {room.openings.length} ô cửa · {catalog.items.length} món catalog
          {state.warnings.length > 0 && ` · ${state.warnings.length} cảnh báo`}
        </footer>
      </main>
    </div>
  );
}
