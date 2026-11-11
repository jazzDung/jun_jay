/**
 * Hệ toạ độ cục bộ của một mảng tường (đơn vị m):
 *   x = dọc tường, y = độ cao từ sàn, z = pháp tuyến hướng VÀO zone mà tường nhìn vào.
 * Mặt trong của tường nằm ở z = 0, khối tường chiếm z ∈ [-thickness, 0].
 *
 * Để hệ (x, y, z) luôn thuận tay phải, chiều x có thể ngược với from→to; khi đó
 * toạ độ u của dữ liệu được đổi qua `uToX()`.
 */
import * as THREE from 'three';
import type { Room, Wall, Zone } from '../../data/schema';
import { cm } from '../units';

export class WallFrame {
  readonly length: number; // m
  readonly thickness: number; // m
  readonly height: number; // m
  /** true nếu trục x cục bộ cùng chiều from→to. */
  readonly forward: boolean;
  readonly origin: THREE.Vector3;
  readonly quaternion: THREE.Quaternion;
  /** Pháp tuyến (thế giới) hướng vào zone. */
  readonly normal: THREE.Vector3;

  constructor(
    readonly wall: Wall,
    room: Room,
    zones: Map<string, Zone>,
  ) {
    const [ax, az] = wall.from;
    const [bx, bz] = wall.to;
    const lenCm = Math.hypot(bx - ax, bz - az);
    this.length = cm(lenCm);
    this.thickness = cm(wall.thickness);
    this.height = cm(room.ceilingHeight);

    const d = new THREE.Vector3((bx - ax) / lenCm, 0, (bz - az) / lenCm);
    const zone = zones.get(wall.faces)!;
    const center = new THREE.Vector3(cm((zone.rect[0] + zone.rect[2]) / 2), 0, cm((zone.rect[1] + zone.rect[3]) / 2));
    const mid = new THREE.Vector3(cm((ax + bx) / 2), 0, cm((az + bz) / 2));
    const n = new THREE.Vector3(-d.z, 0, d.x);
    if (n.dot(center.sub(mid)) < 0) n.negate();
    this.normal = n;

    // x' × y = z  ⇒  x' = (n.z, 0, -n.x)
    const xAxis = new THREE.Vector3(n.z, 0, -n.x);
    this.forward = xAxis.dot(d) > 0;
    this.origin = this.forward
      ? new THREE.Vector3(cm(ax), 0, cm(az))
      : new THREE.Vector3(cm(bx), 0, cm(bz));
    const basis = new THREE.Matrix4().makeBasis(xAxis, new THREE.Vector3(0, 1, 0), n);
    this.quaternion = new THREE.Quaternion().setFromRotationMatrix(basis);
  }

  /** u (cm, tính từ `from`) → x cục bộ (m). */
  uToX(u: number): number {
    return this.forward ? cm(u) : this.length - cm(u);
  }

  /** Khoảng u (cm) → [x0, x1] cục bộ (m), x0 < x1. */
  rangeToX(u: readonly [number, number]): [number, number] {
    const a = this.uToX(u[0]);
    const b = this.uToX(u[1]);
    return a < b ? [a, b] : [b, a];
  }

  /** Group đặt sẵn transform của tường; con của nó dùng toạ độ cục bộ. */
  makeGroup(name: string): THREE.Group {
    const g = new THREE.Group();
    g.name = name;
    g.position.copy(this.origin);
    g.quaternion.copy(this.quaternion);
    return g;
  }
}
