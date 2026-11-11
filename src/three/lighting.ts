/**
 * Ánh sáng: đổi Kelvin → màu, tạo nguồn sáng Three.js cho đèn trong catalog / thiết bị
 * hiện trạng, và hằng số ánh sáng ngày / đêm.
 *
 * Quy ước: `intensity` trong dữ liệu là tương đối (1 ≈ bóng 60 W ấm). Đổi sang đơn vị
 * vật lý của Three.js (candela cho point/spot, nit cho RectAreaLight) bằng các hệ số dưới.
 */
import * as THREE from 'three';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import type { LightOverride, LightSpec } from '../data/schema';
import { cm } from './units';

RectAreaLightUniformsLib.init();

const CANDELA_POINT = 2.6;
const CANDELA_SPOT = 7;
/** RectAreaLight: nit / m² mặt phát sáng — đèn tuýp hẹp nên cần lớn. */
const NITS_TUBE = 14;

/** Kelvin → màu RGB tuyến tính (thuật toán Tanner Helland, đủ dùng 1000–40000 K). */
export function kelvinToColor(k: number): THREE.Color {
  const t = k / 100;
  let r: number;
  let g: number;
  let b: number;
  if (t <= 66) {
    r = 255;
    g = 99.4708025861 * Math.log(t) - 161.1195681661;
    b = t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307;
  } else {
    r = 329.698727446 * Math.pow(t - 60, -0.1332047592);
    g = 288.1221695283 * Math.pow(t - 60, -0.0755148492);
    b = 255;
  }
  const c = (v: number) => Math.min(255, Math.max(0, v)) / 255;
  return new THREE.Color().setRGB(c(r), c(g), c(b), THREE.SRGBColorSpace);
}

export interface Resolved {
  on: boolean;
  color: THREE.Color;
  intensity: number;
  kelvin: number | null;
}

/** Gộp thông số mặc định của đèn với ghi đè trong cảnh. */
export function resolveLight(spec: LightSpec, o: LightOverride | undefined): Resolved {
  const kelvin = o?.kelvin ?? spec.kelvin ?? null;
  const color = spec.color && o?.kelvin === undefined ? new THREE.Color(spec.color) : kelvinToColor(kelvin ?? 2700);
  return { on: o?.on ?? true, color, intensity: o?.intensity ?? spec.intensity, kelvin: spec.color && o?.kelvin === undefined ? null : kelvin };
}

/**
 * Tạo nguồn sáng cục bộ (gốc = gốc món / thiết bị). `facing` là hướng phát chính trong toạ độ
 * cục bộ: +z cho đồ treo tường, −y cho downlight.
 */
export function createLight(spec: LightSpec, size: { w: number; h: number; d: number }, facing: 'forward' | 'down' = 'forward'): THREE.Object3D {
  const g = new THREE.Group();
  g.name = 'light';
  const at = spec.at ? new THREE.Vector3(cm(spec.at[0]), cm(spec.at[1]), cm(spec.at[2])) : new THREE.Vector3(0, cm(size.h) / 2, 0);
  let light: THREE.Light;
  if (spec.type === 'spot') {
    const s = new THREE.SpotLight('#ffffff', 1, 8, facing === 'down' ? THREE.MathUtils.degToRad(42) : THREE.MathUtils.degToRad(55), 0.65, 2);
    s.position.copy(at);
    s.target.position.copy(at).add(facing === 'down' ? new THREE.Vector3(0, -1, 0) : new THREE.Vector3(0, -0.35, 1));
    g.add(s.target);
    light = s;
  } else if (spec.type === 'tube' || spec.type === 'area') {
    const w = Math.max(cm(size.w), 0.1);
    const r = new THREE.RectAreaLight('#ffffff', 1, w, 0.05);
    r.position.copy(at).add(new THREE.Vector3(0, 0, cm(size.d) / 2 + 0.002));
    // hướng ra trước, chúc nhẹ xuống
    r.lookAt(r.position.clone().add(new THREE.Vector3(0, -0.4, 1)));
    light = r;
  } else {
    const p = new THREE.PointLight('#ffffff', 1, 9, 2);
    p.position.copy(at);
    p.shadow.mapSize.set(512, 512);
    p.shadow.bias = -0.002;
    light = p;
  }
  light.userData.kind = spec.type;
  g.add(light);
  return g;
}

/** Áp trạng thái (bật/tắt, màu, độ sáng) lên nguồn sáng đã tạo bằng createLight. */
export function updateLight(holder: THREE.Object3D, r: Resolved): void {
  holder.traverse((o) => {
    const l = o as THREE.Light;
    if (!l.isLight) return;
    l.visible = r.on;
    l.color.copy(r.color);
    const k = l.userData.kind as LightSpec['type'];
    if (l instanceof THREE.RectAreaLight) l.intensity = NITS_TUBE * r.intensity * (0.05 / Math.max(l.height, 0.01));
    else l.intensity = (k === 'spot' ? CANDELA_SPOT : CANDELA_POINT) * r.intensity;
  });
}

/** Áp trạng thái đèn lên vật liệu tự phát sáng (chao giấy, mica, đèn tuýp) của món. */
export function updateGlow(root: THREE.Object3D, r: Resolved): void {
  root.traverse((o) => {
    const mat = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
    if (!mat || Array.isArray(mat) || !mat.userData?.glow) return;
    mat.emissive.copy(r.color);
    mat.emissiveIntensity = r.on ? 0.25 + 0.9 * Math.min(r.intensity, 2) : 0;
  });
}

// ------------------------------------------------------------- ngày / đêm

export interface Ambient {
  hemi: number;
  sun: number;
  fill: number;
  ceilingGlow: number;
  backdrop: THREE.Color;
}

export const AMBIENT: Record<'day' | 'night', Ambient> = {
  day: { hemi: 1.1, sun: 1.5, fill: 0.3, ceilingGlow: 0.3, backdrop: new THREE.Color('#ffffff') },
  night: { hemi: 0.12, sun: 0, fill: 0, ceilingGlow: 0.03, backdrop: new THREE.Color('#1b2233') },
};
