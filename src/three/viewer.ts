/**
 * Viewer real-time (giữ đơn giản, ảnh đẹp sẽ làm bằng path tracer riêng):
 * phòng dựng từ room.json, áp màu/ghi đè từ scene, chọn bề mặt bằng chạm/click,
 * camera orbit + top-down, tự ẩn tường chắn, bật/tắt trần.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { CatalogItem, ItemPlacement, Panel, Panels, Room, Scene } from '../data/schema';
import { ItemLayer } from './items';
import { buildPanel } from './room/panel';
import { buildRoom, type PickTarget, type RoomBuild } from './room/buildRoom';

export type CameraMode = 'orbit' | 'top';
export type { PickTarget };

const SELECT_COLOR = '#E07A2F';
const WARN_COLOR = '#E5533D';
/** Chạm/click được tính là "chọn" nếu con trỏ di chuyển ít hơn ngần này (px) — còn lại là xoay camera. */
const TAP_SLOP = 6;

export class Viewer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  /** Gọi khi người dùng chạm/click chọn (null = chạm vào chỗ trống). */
  onPick: (target: PickTarget | null) => void = () => {};
  /** Gọi khi kéo xong một món (vị trí mới, cm). */
  onItemMove: (uid: string, x: number, z: number) => void = () => {};
  /** Nội dung nhãn nổi trên món đang chọn (gọi lại liên tục khi đang kéo). */
  labelFor: (uid: string, p: ItemPlacement) => string = () => '';

  private readonly persp: THREE.PerspectiveCamera;
  private readonly ortho: THREE.OrthographicCamera;
  private readonly controls: OrbitControls;
  private mode: CameraMode = 'orbit';
  private built: RoomBuild | null = null;
  private roomGroup = new THREE.Group();
  private ceilingVisible = false;
  private cutawayEnabled = true;
  private bounds = new THREE.Box3();
  private selection: PickTarget | null = null;
  private panels: Panels | null = null;
  /** Lớp ốp đang dựng trên mỗi tường + khoá JSON để biết khi nào cần dựng lại. */
  private readonly panelMeshes = new Map<string, { key: string; mesh: THREE.Mesh | null }>();
  private readonly selectionBox = new THREE.Box3Helper(new THREE.Box3(), SELECT_COLOR);
  private readonly raycaster = new THREE.Raycaster();
  private pointerDown: { x: number; y: number; id: number } | null = null;
  private items: ItemLayer | null = null;
  private catalog = new Map<string, CatalogItem>();
  private placements = new Map<string, ItemPlacement>();
  private snapCm = 5;
  private drag: {
    uid: string;
    pointerId: number;
    offset: THREE.Vector2;
    screen: THREE.Vector2;
    moved: boolean;
    current: ItemPlacement;
  } | null = null;
  private readonly floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private readonly warnBoxes: THREE.Box3Helper[] = [];
  private warnUids: string[] = [];
  private readonly label: HTMLDivElement;
  private readonly resizeObserver: ResizeObserver;
  private disposed = false;

  constructor(private readonly host: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.appendChild(this.renderer.domElement);

    this.scene.background = new THREE.Color('#1f1a17');
    // Ánh sáng real-time đơn giản: trời + sàn hắt, một đèn chính từ trong phòng, một đèn phụ từ phía cửa sổ.
    this.scene.add(new THREE.HemisphereLight('#fff8ee', '#bcae9c', 1.7));
    const key = new THREE.DirectionalLight('#fff3e2', 0.9);
    key.position.set(7, 9, 5);
    const fill = new THREE.DirectionalLight('#eef4ff', 0.45);
    fill.position.set(-3, 4, 1.5);
    this.scene.add(key, fill, this.roomGroup);

    const boxMat = this.selectionBox.material as THREE.LineBasicMaterial;
    boxMat.depthTest = false;
    boxMat.transparent = true;
    this.selectionBox.renderOrder = 10;
    this.selectionBox.visible = false;
    this.scene.add(this.selectionBox);

    this.persp = new THREE.PerspectiveCamera(50, 1, 0.05, 100);
    this.ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.05, 100);
    this.controls = new OrbitControls(this.persp, this.renderer.domElement);
    this.controls.enableDamping = true;

    const canvas = this.renderer.domElement;
    canvas.addEventListener('pointerdown', this.handlePointerDown);
    canvas.addEventListener('pointerup', this.handlePointerUp);
    // kéo thả đồ: bắt sự kiện ở pha capture trên host để chặn trước OrbitControls
    host.addEventListener('pointerdown', this.handleDragDown, { capture: true });
    host.addEventListener('pointermove', this.handleDragMove, { capture: true });
    host.addEventListener('pointerup', this.handleDragUp, { capture: true });
    host.addEventListener('pointercancel', this.handleDragUp, { capture: true });

    this.label = document.createElement('div');
    this.label.className = 'item-label';
    this.label.hidden = true;
    host.appendChild(this.label);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(host);
    this.resize();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  setRoom(room: Room, panels: Panels, catalog: CatalogItem[]): void {
    this.panels = panels;
    this.catalog = new Map(catalog.map((c) => [c.id, c]));
    this.panelMeshes.clear();
    this.scene.remove(this.roomGroup);
    disposeTree(this.roomGroup);
    this.built = buildRoom(room);
    this.roomGroup = this.built.group;
    this.items = new ItemLayer(this.catalog, room.ceilingHeight);
    this.roomGroup.add(this.items.group);
    this.scene.add(this.roomGroup);
    this.bounds.copy(this.built.bounds);
    this.setCameraMode(this.mode, true);
  }

  /** Áp các ghi đè của cảnh (màu tường, phào chỉ, màu trần) lên phòng đã dựng — không dựng lại. */
  applyScene(scene: Scene): void {
    const b = this.built;
    if (!b) return;
    for (const [id, w] of b.walls) {
      const o = scene.room.walls[id];
      const color = o?.color ?? w.baseColor;
      w.surface.color.set(color);
      for (const f of w.followers) f.color.set(color);
      if (w.mouldings) w.mouldings.visible = o?.mouldings ?? w.baseMouldings;
      this.applyPanel(id, o?.panel !== undefined ? o.panel : w.wall.panel);
    }
    const hidden = new Set(scene.room.hiddenFixtures);
    for (const [id, obj] of b.fixtures) obj.visible = !hidden.has(id);
    const ce = b.ceilingSurface;
    const ceilingColor = scene.room.ceilingColor;
    // trần có texture lưới: nhân màu vào texture (trắng = giữ nguyên)
    ce.mat.color.set(ceilingColor ?? (ce.mat.map ? '#ffffff' : ce.baseColor));
    ce.mat.emissive.set(ceilingColor ?? (ce.mat.map ? '#ffffff' : ce.baseColor));

    this.placements = new Map(scene.items.filter((p): p is ItemPlacement => !('wall' in p)).map((p) => [p.uid, p]));
    if (!this.drag) this.items?.sync(scene);
    this.updateSelectionBox();
  }

  /** Bước bắt lưới khi kéo (cm); 0 = tắt. */
  setSnap(cm: number): void {
    this.snapCm = cm;
  }

  /** Viền đỏ quanh các món đang có cảnh báo. */
  setWarnings(uids: string[]): void {
    this.warnUids = uids;
    while (this.warnBoxes.length < uids.length) {
      const h = new THREE.Box3Helper(new THREE.Box3(), WARN_COLOR);
      const m = h.material as THREE.LineBasicMaterial;
      m.depthTest = false;
      m.transparent = true;
      h.renderOrder = 9;
      this.scene.add(h);
      this.warnBoxes.push(h);
    }
  }

  /** Dựng lại lớp ốp của một tường nếu cấu hình đổi. */
  private applyPanel(wallId: string, panel: Panel | null): void {
    const w = this.built?.walls.get(wallId);
    if (!w || !this.panels) return;
    const key = panel ? JSON.stringify(panel) : '';
    const prev = this.panelMeshes.get(wallId);
    if (prev?.key === key) return;
    if (prev?.mesh) {
      prev.mesh.removeFromParent();
      prev.mesh.geometry.dispose();
      (prev.mesh.material as THREE.Material).dispose(); // texture dùng chung, giữ lại trong cache
    }
    let mesh: THREE.Mesh | null = null;
    if (panel) {
      const profile = this.panels.profiles.find((p) => p.id === panel.profile);
      const finish = this.panels.finishes.find((f) => f.id === panel.finish);
      if (profile && finish) {
        mesh = buildPanel(w.frame, panel, profile, finish, w.openings, import.meta.env.BASE_URL);
        mesh.userData.pick = { kind: 'wall', id: wallId } satisfies PickTarget;
        w.group.add(mesh);
      }
    }
    this.panelMeshes.set(wallId, { key, mesh });

    // ẩn phào chỉ / len nằm dưới lớp ốp (chúng nhô qua rãnh lam)
    if (w.mouldings) {
      let area: { x0: number; x1: number; y1: number } | null = null;
      if (panel) {
        const [x0, x1] = panel.uRange ? w.frame.rangeToX(panel.uRange) : [0, w.frame.length];
        const y1 = panel.coverage === 'full' ? w.frame.height : panel.wainscotHeight / 100;
        area = { x0, x1, y1 };
      }
      for (const part of w.mouldings.children) {
        const r = part.userData.rect as { x0: number; x1: number; y0: number; y1: number } | undefined;
        if (!r) continue;
        part.visible = !(area && r.x0 < area.x1 - 1e-4 && r.x1 > area.x0 + 1e-4 && r.y0 < area.y1 - 1e-4);
      }
    }
  }

  setSelection(target: PickTarget | null): void {
    this.selection = target;
    this.updateSelectionBox();
  }

  setCameraMode(mode: CameraMode, reset = false): void {
    const changed = mode !== this.mode;
    this.mode = mode;
    const center = this.bounds.getCenter(new THREE.Vector3());
    const size = this.bounds.getSize(new THREE.Vector3());
    if (mode === 'top') {
      this.ortho.position.set(center.x, 20, center.z);
      this.ortho.up.set(0, 0, -1);
      this.ortho.lookAt(center.x, 0, center.z);
      this.controls.object = this.ortho;
      this.controls.target.set(center.x, 0, center.z);
      this.controls.enableRotate = false;
      this.fitOrtho(size);
    } else {
      if (reset || changed) {
        // Từ phía tường dưới, lệch về cửa sổ, nhìn chéo xuống — khung vừa toàn bộ phòng.
        const radius = size.length() / 2;
        const dist = (radius / Math.sin(THREE.MathUtils.degToRad(this.persp.fov / 2))) * 0.8;
        const dir = new THREE.Vector3(-0.45, 0.85, 0.75).normalize();
        this.controls.target.set(center.x, 0.6, center.z);
        this.persp.position.copy(this.controls.target).addScaledVector(dir, dist);
      }
      this.controls.object = this.persp;
      this.controls.enableRotate = true;
    }
    this.controls.update();
  }

  /** Đặt camera 3D (m) — dùng cho preset góc nhìn và kiểm tra. */
  lookFrom(position: [number, number, number], target: [number, number, number]): void {
    if (this.mode !== 'orbit') this.setCameraMode('orbit');
    this.persp.position.set(...position);
    this.controls.target.set(...target);
    this.controls.update();
  }

  /** Ẩn tường nằm giữa camera và phòng (chỉ ở chế độ 3D). */
  setCutaway(enabled: boolean): void {
    this.cutawayEnabled = enabled;
  }

  setCeilingVisible(visible: boolean): void {
    this.ceilingVisible = visible;
  }

  /**
   * Render một góc nhìn ra canvas riêng ở kích thước cố định, không đổi camera đang dùng.
   * 'plan' = mặt bằng nhìn thẳng từ trên (không trần, đủ tường); trả kèm camera để
   * chiếu toạ độ khi vẽ nhãn.
   */
  renderStill(
    view: 'plan' | { position: [number, number, number]; target: [number, number, number]; fov: number },
    width: number,
    height: number,
  ): { canvas: HTMLCanvasElement; camera: THREE.Camera } {
    const prevSize = this.renderer.getSize(new THREE.Vector2());
    const prevRatio = this.renderer.getPixelRatio();
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(width, height, false);

    let camera: THREE.Camera;
    if (view === 'plan') {
      const center = this.bounds.getCenter(new THREE.Vector3());
      const size = this.bounds.getSize(new THREE.Vector3());
      const aspect = width / height;
      let halfW = (size.x * 1.22) / 2;
      let halfH = (size.z * 1.25) / 2;
      if (halfW / halfH > aspect) halfH = halfW / aspect;
      else halfW = halfH * aspect;
      const ortho = new THREE.OrthographicCamera(-halfW, halfW, halfH, -halfH, 0.05, 100);
      ortho.position.set(center.x, 20, center.z);
      ortho.up.set(0, 0, -1);
      ortho.lookAt(center.x, 0, center.z);
      camera = ortho;
      this.updateVisibility(ortho.position, 'top');
    } else {
      const persp = new THREE.PerspectiveCamera(view.fov, width / height, 0.05, 100);
      persp.position.set(...view.position);
      persp.lookAt(...view.target);
      camera = persp;
      this.updateVisibility(persp.position, 'orbit');
    }
    camera.updateMatrixWorld();
    this.selectionBox.visible = false;
    this.renderer.render(this.scene, camera);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    canvas.getContext('2d')!.drawImage(this.renderer.domElement, 0, 0);

    this.renderer.setPixelRatio(prevRatio);
    this.renderer.setSize(prevSize.x, prevSize.y, false);
    this.updateVisibility();
    return { canvas, camera };
  }

  /** Chụp khung hình hiện tại ra PNG. */
  snapshot(): string {
    this.renderer.render(this.scene, this.activeCamera());
    return this.renderer.domElement.toDataURL('image/png');
  }

  dispose(): void {
    this.disposed = true;
    this.renderer.setAnimationLoop(null);
    this.resizeObserver.disconnect();
    const canvas = this.renderer.domElement;
    canvas.removeEventListener('pointerdown', this.handlePointerDown);
    canvas.removeEventListener('pointerup', this.handlePointerUp);
    this.host.removeEventListener('pointerdown', this.handleDragDown, { capture: true });
    this.host.removeEventListener('pointermove', this.handleDragMove, { capture: true });
    this.host.removeEventListener('pointerup', this.handleDragUp, { capture: true });
    this.host.removeEventListener('pointercancel', this.handleDragUp, { capture: true });
    this.label.remove();
    this.controls.dispose();
    disposeTree(this.roomGroup);
    this.renderer.dispose();
    canvas.remove();
  }

  // ------------------------------------------------------------- picking

  private readonly handlePointerDown = (e: PointerEvent) => {
    if (!e.isPrimary) return;
    this.pointerDown = { x: e.clientX, y: e.clientY, id: e.pointerId };
  };

  private readonly handlePointerUp = (e: PointerEvent) => {
    const start = this.pointerDown;
    this.pointerDown = null;
    if (!start || start.id !== e.pointerId) return;
    if (Math.hypot(e.clientX - start.x, e.clientY - start.y) > TAP_SLOP) return; // đang kéo xoay camera
    this.onPick(this.pick(e.clientX, e.clientY));
  };

  private pick(clientX: number, clientY: number): PickTarget | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.activeCamera());
    for (const hit of this.raycaster.intersectObject(this.roomGroup, true)) {
      if (!isVisible(hit.object)) continue; // tường đang bị cắt, trần đang ẩn…
      const target = hit.object.userData.pick as PickTarget | undefined;
      if (target) return target;
      // chạm vào vật không chọn được (kính, phông nền) → xét vật phía sau
      if (hit.object.name.startsWith('backdrop') || isGlass(hit.object)) continue;
      return null;
    }
    return null;
  }

  private selectionObject(): THREE.Object3D | null {
    const b = this.built;
    const s = this.selection;
    if (!b || !s) return null;
    if (s.kind === 'item') return this.items?.objects.get(s.uid)?.root ?? null;
    if (s.kind === 'wall') return b.walls.get(s.id)?.group.getObjectByName(`wallSurface:${s.id}`) ?? null;
    return b.ceilingSurface.mesh;
  }

  private updateSelectionBox(): void {
    const obj = this.selectionObject();
    this.selectionBox.visible = !!obj;
    if (obj) this.selectionBox.box.setFromObject(obj);
  }

  // ------------------------------------------------------------- frame

  private readonly tmp = new THREE.Vector3();
  private updateVisibility(cam: THREE.Vector3 = this.persp.position, mode: CameraMode = this.mode): void {
    const b = this.built;
    if (!b) return;
    const active = this.cutawayEnabled && mode === 'orbit';
    for (const w of b.cutaway) {
      // camera ở phía sau mặt trong của tường (cách > 30 cm) → tường đang chắn
      const behind = this.tmp.copy(cam).sub(w.mid).dot(w.normal) < -0.3;
      w.group.visible = !(active && behind);
    }
    // phông ngoài cửa sổ chỉ hiện khi camera đã xuống dưới trần (đang ở trong phòng)
    const inside = mode === 'orbit' && cam.y < this.bounds.max.y;
    b.backdrop.visible = inside;
    // trần: luôn hiện nếu bật nút "Trần" hoặc đang chọn trần; ngoài ra tự hiện khi camera ở trong phòng
    b.ceiling.visible = this.ceilingVisible || inside || this.selection?.kind === 'ceiling';
    const sel = this.selectionObject();
    this.selectionBox.visible = !!sel && isVisible(sel);
    if (sel && this.selection?.kind === 'item') this.selectionBox.box.setFromObject(sel);
    this.warnBoxes.forEach((h, i) => {
      const obj = i < this.warnUids.length ? this.items?.objects.get(this.warnUids[i])?.root : undefined;
      h.visible = !!obj;
      if (obj) h.box.setFromObject(obj);
    });
    this.updateLabel();
  }

  private updateLabel(): void {
    const s = this.selection;
    const obj = s?.kind === 'item' ? this.items?.objects.get(s.uid)?.root : undefined;
    const p = s?.kind === 'item' ? (this.drag?.uid === s.uid ? this.drag.current : this.placements.get(s.uid)) : undefined;
    if (!obj || !p || !isVisible(obj) || s?.kind !== 'item') {
      this.label.hidden = true;
      return;
    }
    const top = new THREE.Box3().setFromObject(obj);
    const v = new THREE.Vector3((top.min.x + top.max.x) / 2, top.max.y, (top.min.z + top.max.z) / 2).project(this.activeCamera());
    if (v.z > 1) {
      this.label.hidden = true;
      return;
    }
    const text = this.labelFor(s.uid, p);
    if (this.label.textContent !== text) this.label.textContent = text;
    this.label.hidden = !text;
    this.label.style.transform = `translate(${((v.x + 1) / 2) * this.host.clientWidth}px, ${((1 - v.y) / 2) * this.host.clientHeight}px) translate(-50%, calc(-100% - 10px))`;
  }

  // ------------------------------------------------------------- dragging

  private floorPoint(clientX: number, clientY: number): THREE.Vector3 | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.activeCamera());
    return this.raycaster.ray.intersectPlane(this.floorPlane, new THREE.Vector3());
  }

  private readonly handleDragDown = (e: PointerEvent) => {
    if (!e.isPrimary || e.button > 0 || e.target !== this.renderer.domElement) return;
    const target = this.pick(e.clientX, e.clientY);
    if (target?.kind !== 'item') return;
    const p = this.placements.get(target.uid);
    const hit = this.floorPoint(e.clientX, e.clientY);
    if (!p || !hit) return;
    e.stopPropagation(); // OrbitControls không nhận → camera đứng yên khi kéo đồ
    this.host.setPointerCapture(e.pointerId);
    this.drag = {
      uid: target.uid,
      pointerId: e.pointerId,
      offset: new THREE.Vector2(p.x / 100 - hit.x, p.z / 100 - hit.z),
      screen: new THREE.Vector2(e.clientX, e.clientY),
      moved: false,
      current: { ...p },
    };
    this.onPick(target);
  };

  private readonly handleDragMove = (e: PointerEvent) => {
    const d = this.drag;
    if (!d || e.pointerId !== d.pointerId) return;
    e.stopPropagation();
    if (!d.moved && Math.hypot(e.clientX - d.screen.x, e.clientY - d.screen.y) < TAP_SLOP) return;
    d.moved = true;
    const hit = this.floorPoint(e.clientX, e.clientY);
    if (!hit) return;
    const snap = (v: number) => (this.snapCm > 0 ? Math.round(v / this.snapCm) * this.snapCm : Math.round(v));
    // giữ tâm trong phạm vi các khu của phòng
    const b = this.bounds;
    d.current.x = snap(THREE.MathUtils.clamp((hit.x + d.offset.x) * 100, b.min.x * 100, b.max.x * 100));
    d.current.z = snap(THREE.MathUtils.clamp((hit.z + d.offset.y) * 100, b.min.z * 100, b.max.z * 100));
    const obj = this.items?.objects.get(d.uid);
    const item = this.catalog.get(d.current.catalogId);
    if (obj && item) this.items!.place(obj.root, d.current, item);
  };

  private readonly handleDragUp = (e: PointerEvent) => {
    const d = this.drag;
    if (!d || e.pointerId !== d.pointerId) return;
    e.stopPropagation();
    this.drag = null;
    if (this.host.hasPointerCapture(e.pointerId)) this.host.releasePointerCapture(e.pointerId);
    if (d.moved) this.onItemMove(d.uid, d.current.x, d.current.z);
  };

  /** Toạ độ sàn (cm) ở giữa khung nhìn — chỗ đặt món mới thêm. */
  viewCenterCm(): [number, number] {
    const t = this.controls.target;
    const b = this.bounds;
    const x = THREE.MathUtils.clamp(t.x, b.min.x + 0.5, Math.min(b.max.x, 8) - 0.5);
    const z = THREE.MathUtils.clamp(t.z, b.min.z + 0.5, b.max.z - 0.5);
    return [Math.round(x * 20) * 5, Math.round(z * 20) * 5];
  }

  private activeCamera(): THREE.Camera {
    return this.mode === 'top' ? this.ortho : this.persp;
  }

  private fitOrtho(size: THREE.Vector3): void {
    const { clientWidth: w, clientHeight: h } = this.host;
    const aspect = w / Math.max(h, 1);
    const margin = 1.15;
    let halfW = (size.x * margin) / 2;
    let halfH = (size.z * margin) / 2;
    if (halfW / halfH > aspect) halfH = halfW / aspect;
    else halfW = halfH * aspect;
    Object.assign(this.ortho, { left: -halfW, right: halfW, top: halfH, bottom: -halfH, zoom: 1 });
    this.ortho.updateProjectionMatrix();
  }

  private resize(): void {
    const { clientWidth: w, clientHeight: h } = this.host;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.persp.aspect = w / h;
    this.persp.updateProjectionMatrix();
    if (this.mode === 'top') this.fitOrtho(this.bounds.getSize(new THREE.Vector3()));
  }

  private frame(): void {
    if (this.disposed) return;
    this.controls.update();
    this.updateVisibility();
    this.renderer.render(this.scene, this.activeCamera());
  }
}

function isVisible(obj: THREE.Object3D): boolean {
  for (let o: THREE.Object3D | null = obj; o; o = o.parent) if (!o.visible) return false;
  return true;
}

function isGlass(obj: THREE.Object3D): boolean {
  const mat = (obj as THREE.Mesh).material as THREE.Material | undefined;
  return !!mat && !Array.isArray(mat) && mat.transparent && mat.opacity < 0.5;
}

function disposeTree(obj: THREE.Object3D): void {
  obj.traverse((o) => {
    const mesh = o as THREE.Mesh;
    mesh.geometry?.dispose();
    const mat = mesh.material;
    if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
    else mat?.dispose();
  });
}
