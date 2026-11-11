/**
 * Viewer tối thiểu cho lát 1: sàn từng zone, tường dạng khối thô (chưa khoét cửa),
 * camera orbit + top-down. Lát 2 sẽ thay buildRoughRoom() bằng bộ dựng phòng đầy đủ.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { Room } from '../data/schema';
import { cm } from './units';

export type CameraMode = 'orbit' | 'top';

export class Viewer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  private readonly persp: THREE.PerspectiveCamera;
  private readonly ortho: THREE.OrthographicCamera;
  private readonly controls: OrbitControls;
  private mode: CameraMode = 'orbit';
  private roomGroup = new THREE.Group();
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
    this.scene.add(new THREE.HemisphereLight('#fff6e8', '#5a4a3a', 1.4));
    const sun = new THREE.DirectionalLight('#fff1dc', 1.2);
    sun.position.set(-4, 6, 2);
    this.scene.add(sun);
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
    this.roomGroup = buildRoughRoom(room);
    this.scene.add(this.roomGroup);
    this.bounds.setFromObject(this.roomGroup);
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
        // Đứng ngoài góc tường dưới – cửa sổ, nhìn chéo vào trong quán.
        this.persp.position.set(center.x - size.x * 0.65, size.y * 2.6, center.z + size.z * 1.6);
        this.controls.target.set(center.x, 0.8, center.z);
      }
      this.controls.object = this.persp;
      this.controls.enableRotate = true;
    }
    this.controls.update();
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
    this.renderer.render(this.scene, this.activeCamera());
  }
}

function buildRoughRoom(room: Room): THREE.Group {
  const group = new THREE.Group();
  group.name = 'room';

  for (const zone of room.zones) {
    const [x0, z0, x1, z1] = zone.rect;
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(cm(x1 - x0), cm(z1 - z0)),
      new THREE.MeshStandardMaterial({ color: zone.floor.color, roughness: 0.85 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(cm((x0 + x1) / 2), 0, cm((z0 + z1) / 2));
    floor.name = `floor:${zone.id}`;
    group.add(floor);
  }

  const h = cm(room.ceilingHeight);
  for (const wall of room.walls) {
    const [ax, az] = wall.from;
    const [bx, bz] = wall.to;
    const len = Math.hypot(bx - ax, bz - az);
    const geo = new THREE.BoxGeometry(cm(len), h, cm(wall.thickness));
    const mesh = new THREE.Mesh(
      geo,
      new THREE.MeshStandardMaterial({ color: wall.color, roughness: 0.9, transparent: true, opacity: 0.85 }),
    );
    mesh.position.set(cm((ax + bx) / 2), h / 2, cm((az + bz) / 2));
    mesh.rotation.y = -Math.atan2(bz - az, bx - ax);
    mesh.name = `wall:${wall.id}`;
    group.add(mesh);
  }

  // Lưới 50 cm trên sàn để kiểm tra tỉ lệ.
  const box = new THREE.Box3().setFromObject(group);
  const size = box.getSize(new THREE.Vector3());
  const span = Math.ceil(Math.max(size.x, size.z) / 0.5) * 0.5;
  const grid = new THREE.GridHelper(span, span / 0.5, '#6b5a4a', '#3a302a');
  grid.position.set(span / 2, 0.002, span / 2);
  group.add(grid);
  return group;
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
