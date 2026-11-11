/**
 * Viewer real-time (giữ đơn giản, ảnh đẹp sẽ làm bằng path tracer riêng):
 * phòng dựng từ room.json, áp màu/ghi đè từ scene, chọn bề mặt bằng chạm/click,
 * camera orbit + top-down, tự ẩn tường chắn, bật/tắt trần.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { Panel, Panels, Room, Scene } from '../data/schema';
import { buildPanel } from './room/panel';
import { buildRoom, type PickTarget, type RoomBuild } from './room/buildRoom';

export type CameraMode = 'orbit' | 'top';
export type { PickTarget };

const SELECT_COLOR = '#E07A2F';
/** Chạm/click được tính là "chọn" nếu con trỏ di chuyển ít hơn ngần này (px) — còn lại là xoay camera. */
const TAP_SLOP = 6;

export class Viewer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  /** Gọi khi người dùng chạm/click chọn (null = chạm vào chỗ trống). */
  onPick: (target: PickTarget | null) => void = () => {};

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

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(host);
    this.resize();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  setRoom(room: Room, panels: Panels): void {
    this.panels = panels;
    this.panelMeshes.clear();
    this.scene.remove(this.roomGroup);
    disposeTree(this.roomGroup);
    this.built = buildRoom(room);
    this.roomGroup = this.built.group;
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
    this.updateSelectionBox();
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

  /** Chụp khung hình hiện tại ra PNG (dùng cho Export for AI ở lát sau). */
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
  private updateVisibility(): void {
    const b = this.built;
    if (!b) return;
    const active = this.cutawayEnabled && this.mode === 'orbit';
    const cam = this.persp.position;
    for (const w of b.cutaway) {
      // camera ở phía sau mặt trong của tường (cách > 30 cm) → tường đang chắn
      const behind = this.tmp.copy(cam).sub(w.mid).dot(w.normal) < -0.3;
      w.group.visible = !(active && behind);
    }
    // phông ngoài cửa sổ chỉ hiện khi camera đã xuống dưới trần (đang ở trong phòng)
    const inside = this.mode === 'orbit' && cam.y < this.bounds.max.y;
    b.backdrop.visible = inside;
    // trần: luôn hiện nếu bật nút "Trần" hoặc đang chọn trần; ngoài ra tự hiện khi camera ở trong phòng
    b.ceiling.visible = this.ceilingVisible || inside || this.selection?.kind === 'ceiling';
    const sel = this.selectionObject();
    this.selectionBox.visible = !!sel && isVisible(sel);
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
