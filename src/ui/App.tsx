import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { analyze, footprint, wallDistances } from '../analysis/checks';
import { loadDefaultData } from '../data/load';
import type { ItemPlacement, Placement, Scene, WallPlacement } from '../data/schema';
import type { DataBundle } from '../data/validate';
import { downloadSnapshot, exportForAi } from '../export/exportAi';
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
import { Catalog } from './Catalog';
import { Sidebar, type ItemActions } from './Sidebar';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; errors: string[] }
  | { status: 'ready'; data: DataBundle; warnings: string[] };

type Toast = { kind: 'info' | 'error'; lines: string[]; copyText?: string };

const AUTOSAVE_DELAY = 400;
/** Các thay đổi cùng tag trong khoảng này (ms) gộp thành một bước undo (kéo màu, kéo thanh trượt…). */
const MERGE_WINDOW = 1200;
const HISTORY_LIMIT = 100;

const newUid = () => `i${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const isItem = (p: Scene['items'][number]): p is ItemPlacement => !('wall' in p);

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
  const [snap, setSnap] = useState(true);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const [exporting, setExporting] = useState(false);
  const history = useRef({ past: [] as Scene[], future: [] as Scene[], tag: undefined as string | undefined, at: 0 });

  // ------------------------------------------------------------ history

  /** Mọi thay đổi cảnh của người dùng đi qua đây để undo/redo được. */
  const commit = (fn: (prev: Scene) => Scene, tag?: string) =>
    setScene((prev) => {
      if (!prev) return prev;
      const next = fn(prev);
      if (next === prev) return prev;
      const h = history.current;
      const now = performance.now();
      if (!(tag && h.tag === tag && now - h.at < MERGE_WINDOW)) {
        h.past.push(prev);
        if (h.past.length > HISTORY_LIMIT) h.past.shift();
      }
      h.future = [];
      h.tag = tag;
      h.at = now;
      return next;
    });

  const undo = () =>
    setScene((prev) => {
      const h = history.current;
      if (!prev || !h.past.length) return prev;
      h.future.push(prev);
      h.tag = undefined;
      return h.past.pop()!;
    });

  const redo = () =>
    setScene((prev) => {
      const h = history.current;
      if (!prev || !h.future.length) return prev;
      h.past.push(prev);
      h.tag = undefined;
      return h.future.pop()!;
    });

  const resetHistory = () => (history.current = { past: [], future: [], tag: undefined, at: 0 });

  // ------------------------------------------------------------ items

  const updateItems = (fn: (items: Scene['items']) => Scene['items'], tag?: string) =>
    commit((prev) => ({ ...prev, items: fn(prev.items) }), tag);

  const itemActions: ItemActions = {
    update: (uid, patch, tag) => updateItems((items) => items.map((p) => (p.uid === uid ? ({ ...p, ...patch } as Placement) : p)), tag && `${tag}:${uid}`),
    rotate: (uid, delta) =>
      updateItems((items) => items.map((p) => (p.uid === uid && isItem(p) ? { ...p, rot: (((p.rot + delta) % 360) + 360) % 360 } : p))),
    duplicate: (uid) => {
      const uidNew = newUid();
      updateItems((items) => {
        const src = items.find((p) => p.uid === uid);
        if (!src) return items;
        if (!isItem(src)) {
          // đồ treo tường: đặt cạnh bên phải, cách 10 cm
          const w = catalogMap.get(src.catalogId)?.size.w ?? 30;
          return [...items, { ...src, uid: uidNew, u: src.u + w + 10 }];
        }
        return [...items, { ...src, uid: uidNew, x: src.x + 20, z: src.z + 20 }];
      });
      setSelection({ kind: 'item', uid: uidNew });
    },
    remove: (uid) => {
      updateItems((items) => items.filter((p) => p.uid !== uid));
      setSelection(null);
    },
  };

  const addItem = (catalogId: string) => {
    const viewer = viewerRef.current;
    if (!viewer || state.status !== 'ready') return;
    const item = state.data.catalog.items.find((i) => i.id === catalogId);
    if (!item) return;
    const uid = newUid();
    let p: Placement;
    if (item.mount === 'wall') {
      // treo lên tường đang chọn / tường của món treo đang chọn / tường hướng về camera
      const sel = selection;
      const selItem = sel?.kind === 'item' ? scene?.items.find((x) => x.uid === sel.uid) : undefined;
      const wallId = sel?.kind === 'wall' ? sel.id : selItem && 'wall' in selItem ? selItem.wall : null;
      const target = wallId ? { wallId, u: (viewer.wallForView()?.wallId === wallId && viewer.wallForView()?.u) || 0 } : viewer.wallForView();
      const wall = target && state.data.room.walls.find((w) => w.id === target.wallId);
      if (!target || !wall) {
        setToast({ kind: 'error', lines: ['Chạm chọn một mảng tường trước, rồi thêm đồ treo tường.'] });
        return;
      }
      const L = Math.hypot(wall.to[0] - wall.from[0], wall.to[1] - wall.from[1]);
      const v = typeof item.params.defaultHeight === 'number' ? item.params.defaultHeight : 150;
      const half = item.size.w / 2;
      const clampU = (u: number) => Math.min(Math.max(u, half), L - half);
      // tránh chồng lên đồ đã treo cùng tường (cùng dải độ cao): dò sang phải rồi sang trái theo bước 10 cm
      const others = (scene?.items ?? []).filter((x): x is WallPlacement => 'wall' in x && x.wall === wall.id).flatMap((x) => {
        const it = catalogMap.get(x.catalogId);
        return it ? [{ u0: x.u - it.size.w / 2, u1: x.u + it.size.w / 2, v0: x.v - it.size.h / 2, v1: x.v + it.size.h / 2 }] : [];
      });
      const free = (u: number) =>
        !others.some((o) => u - half < o.u1 + 5 && o.u0 - 5 < u + half && v - item.size.h / 2 < o.v1 && o.v0 < v + item.size.h / 2);
      const start = Math.round(clampU(target.u || L / 2) / 10) * 10;
      let u = start;
      for (let d = 0; d <= L; d += 10) {
        if (start + d <= L - half && free(start + d)) { u = start + d; break; }
        if (start - d >= half && free(start - d)) { u = start - d; break; }
      }
      p = { uid, catalogId, wall: wall.id, u: clampU(u), v } satisfies WallPlacement;
    } else {
      const [x, z] = viewer.viewCenterCm();
      p = { uid, catalogId, x, z, rot: 0, ...(item.mount === 'ceiling' ? { drop: 30 } : {}) } satisfies ItemPlacement;
    }
    updateItems((items) => [...items, p]);
    setSelection({ kind: 'item', uid });
    if (window.matchMedia('(max-width: 720px)').matches) setCatalogOpen(false);
  };

  // ------------------------------------------------------------ data / viewer

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

  const catalogMap = useMemo(
    () => new Map(state.status === 'ready' ? state.data.catalog.items.map((i) => [i.id, i]) : []),
    [state],
  );

  // 2. Tạo viewer một lần khi dữ liệu sẵn sàng
  useEffect(() => {
    if (state.status !== 'ready' || !hostRef.current) return;
    const { room, panels, catalog } = state.data;
    const viewer = new Viewer(hostRef.current);
    viewer.setRoom(room, panels, catalog.items);
    viewer.onPick = (t) => setSelection(t);
    viewer.onItemMove = (uid, patch) => updateItems((items) => items.map((p) => (p.uid === uid ? ({ ...p, ...patch } as Placement) : p)));
    viewer.labelFor = (_uid, p) => {
      const item = catalogMap.get(p.catalogId);
      if (!item) return '';
      if ('wall' in p) return `${item.size.w} × ${item.size.h} cm · tâm cao ${Math.round(p.v)} cm · mép dưới ${Math.round(p.v - item.size.h / 2)} cm`;
      const size = `${item.size.w} × ${item.size.d} cm`;
      if (item.mount !== 'floor') return size;
      const dist = wallDistances(room, { placement: p, item, rect: footprint(p, item) });
      if (!dist) return size;
      const nearest = dist.reduce((a, b) => (b.cm < a.cm ? b : a));
      return `${size} · cách ${nearest.label.toLowerCase()} ${Math.round(nearest.cm)} cm`;
    };
    viewerRef.current = viewer;
    // Dev: điều khiển viewer từ console để kiểm tra góc nhìn.
    if (import.meta.env.DEV) (window as unknown as { __viewer: Viewer }).__viewer = viewer;
    return () => {
      viewer.dispose();
      viewerRef.current = null;
    };
  }, [state]);

  const analysis = useMemo(
    () => (state.status === 'ready' && scene ? analyze(state.data.room, scene, catalogMap) : { items: [], warnings: [] }),
    [scene, state, catalogMap],
  );

  // 3. Áp cảnh lên viewer + tự lưu (không tự lưu khi đang xem link chia sẻ)
  useEffect(() => {
    if (!scene) return;
    viewerRef.current?.applyScene(scene);
    viewerRef.current?.setWarnings([...new Set(analysis.warnings.flatMap((w) => w.uids))]);
    if (source === 'shared') return;
    setSaveState('pending');
    const t = setTimeout(() => setSaveState(saveLocal(scene) ? 'saved' : 'unavailable'), AUTOSAVE_DELAY);
    return () => clearTimeout(t);
  }, [scene, source, state, analysis]);

  useEffect(() => viewerRef.current?.setSelection(selection), [selection, state]);
  useEffect(() => viewerRef.current?.setSnap(snap ? 5 : 0), [snap, state]);

  // món đang chọn bị xoá (undo, nhập cảnh khác…) → bỏ chọn
  useEffect(() => {
    if (selection?.kind === 'item' && scene && !scene.items.some((p) => p.uid === selection.uid)) setSelection(null);
  }, [scene, selection]);

  // Phím tắt
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest('input, textarea, select, [contenteditable]')) return;
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      if (mod && k === 'z' && !e.shiftKey) return e.preventDefault(), undo();
      if (mod && (k === 'y' || (k === 'z' && e.shiftKey))) return e.preventDefault(), redo();
      if (k === 'escape') return setSelection(null);
      if (selection?.kind !== 'item') return;
      const uid = selection.uid;
      if (k === 'delete' || k === 'backspace') return e.preventDefault(), itemActions.remove(uid);
      if (mod && k === 'd') return e.preventDefault(), itemActions.duplicate(uid);
      if (!mod && k === 'r') return itemActions.rotate(uid, e.shiftKey ? -90 : 90);
      // (xoay chỉ áp dụng cho đồ sàn — itemActions.rotate bỏ qua đồ treo tường)
      if (!mod && k === 'q') return itemActions.rotate(uid, -15);
      if (!mod && k === 'e') return itemActions.rotate(uid, 15);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

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
    resetHistory();
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
    commit(() => r.data);
    setSelection(null);
    setToast({ kind: 'info', lines: [`Đã nhập "${r.data.name}".`, ...r.warnings] });
  };

  const exportAi = async () => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    setExporting(true);
    try {
      const r = await exportForAi(viewer, state.data, scene);
      setToast({ kind: 'info', lines: [`Đã xuất ${r.fileName} (mặt bằng + ${r.count - 1} góc nhìn + prompt.md).`] });
    } catch (e) {
      setToast({ kind: 'error', lines: ['Xuất cho AI thất bại:', (e as Error).message] });
    } finally {
      setExporting(false);
    }
  };

  const reset = () => {
    clearLocal();
    if (source === 'shared') clearShareHash();
    setSource('local');
    commit(() => state.data.scene);
    setSelection(null);
  };

  const h = history.current;

  return (
    <div class="app">
      <header class="topbar">
        <h1>Jun Jẩy Planner</h1>
        <button class="btn accent" aria-pressed={catalogOpen} onClick={() => setCatalogOpen(!catalogOpen)}>
          + Thêm đồ
        </button>
        <div class="seg" role="group" aria-label="Hoàn tác">
          <button onClick={undo} disabled={!h.past.length} title="Hoàn tác (Ctrl+Z)" aria-label="Hoàn tác">↶</button>
          <button onClick={redo} disabled={!h.future.length} title="Làm lại (Ctrl+Y)" aria-label="Làm lại">↷</button>
        </div>
        <div class="seg" role="group" aria-label="Camera">
          <button aria-pressed={camera === 'orbit'} onClick={() => switchCamera('orbit')}>3D</button>
          <button aria-pressed={camera === 'top'} onClick={() => switchCamera('top')}>Mặt bằng</button>
        </div>
        <div class="seg">
          <button aria-pressed={snap} onClick={() => setSnap(!snap)} title="Bắt lưới 5 cm khi kéo đồ">Lưới 5 cm</button>
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

      <main class={`stage${catalogOpen ? ' catalog-open' : ''}`}>
        <div class="viewport" ref={hostRef} />
        {catalogOpen && <Catalog items={catalog.items} scene={scene} onAdd={addItem} onClose={() => setCatalogOpen(false)} />}
        <Sidebar
          room={room}
          panels={state.data.panels}
          scene={scene}
          selection={selection}
          saveState={saveState}
          catalog={catalogMap}
          warnings={analysis.warnings}
          itemActions={itemActions}
          onScene={(next, tag) => commit(() => next, tag)}
          onSelect={setSelection}
          onClearSelection={() => setSelection(null)}
          onExport={() => exportSceneFile(scene)}
          onImport={importFile}
          onShare={share}
          onReset={reset}
          onExportAi={exportAi}
          onSnapshot={() => viewerRef.current && downloadSnapshot(viewerRef.current)}
          exporting={exporting}
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
          {scene.items.length} món đồ · {analysis.warnings.length} cảnh báo · {catalog.items.length} món catalog
          {state.warnings.length > 0 && ` · ${state.warnings.length} cảnh báo dữ liệu`}
        </footer>
      </main>
    </div>
  );
}
