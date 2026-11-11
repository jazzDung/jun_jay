/**
 * Viewer real-time (giữ đơn giản, ảnh đẹp sẽ làm bằng path tracer riêng):
 * phòng dựng từ room.json, camera orbit + top-down, bật/tắt trần.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { Room } from '../data/schema';
import { buildRoom, type RoomBuild } from './room/buildRoom';

export type CameraMode = 'orbit' | 'top';

export class Viewer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  private readonly persp: THREE.PerspectiveCamera;
  private readonly ortho: THREE.OrthographicCamera;
  private readonly controls: OrbitControls;
  private mode: CameraMode = 'orbit';
  private roomGroup = new THREE.Group();
  private ceiling: THREE.Object3D | null = null;
  private ceilingVisible = false;
  private cutaway: RoomBuild['cutaway'] = [];
  private cutawayEnabled = true;
  private backdrop: THREE.Object3D | null = null;
  private bounds = new THREE.Box3();
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
    this.scene.add(key, fill);
    this.scene.add(this.roomGroup);

    this.persp = new THREE.PerspectiveCamera(50, 1, 0.05, 100);
    this.ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.05, 100);
    this.controls = new OrbitControls(this.persp, this.renderer.domElement);
    this.controls.enableDamping = true;

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(host);
    this.resize();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  setRoom(room: Room): void {
    this.scene.remove(this.roomGroup);
    disposeTree(this.roomGroup);
    const built = buildRoom(room);
    this.roomGroup = built.group;
    this.ceiling = built.ceiling;
    this.ceiling.visible = this.ceilingVisible;
    this.cutaway = built.cutaway;
    this.backdrop = built.backdrop;
    this.scene.add(this.roomGroup);
    this.bounds.copy(built.bounds);
    this.setCameraMode(this.mode, true);
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
        const dist = radius / Math.sin(THREE.MathUtils.degToRad(this.persp.fov / 2)) * 0.8;
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
    if (this.ceiling) this.ceiling.visible = visible;
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
    this.controls.dispose();
    disposeTree(this.roomGroup);
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  private readonly tmp = new THREE.Vector3();
  private updateCutaway(): void {
    const active = this.cutawayEnabled && this.mode === 'orbit';
    const cam = this.persp.position;
    for (const w of this.cutaway) {
      // camera ở phía sau mặt trong của tường (cách > 30 cm) → tường đang chắn
      const behind = this.tmp.copy(cam).sub(w.mid).dot(w.normal) < -0.3;
      w.group.visible = !(active && behind);
    }
    // phông ngoài cửa sổ chỉ hiện khi camera đã xuống dưới trần (đang ở trong phòng)
    const inside = this.mode === 'orbit' && cam.y < this.bounds.max.y;
    if (this.backdrop) this.backdrop.visible = inside;
    // trần: luôn hiện nếu bật nút "Trần", ngoài ra tự hiện khi camera ở trong phòng
    if (this.ceiling) this.ceiling.visible = this.ceilingVisible || inside;
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
    this.updateCutaway();
    this.renderer.render(this.scene, this.activeCamera());
  }
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
