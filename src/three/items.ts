/**
 * Lớp đồ trong cảnh: đồng bộ scene.items → object 3D.
 *  - Đồ đặt sàn / treo trần: con của `group`, toạ độ thế giới.
 *  - Đồ treo tường: con của group cục bộ của tường (ẩn theo tường khi bị cắt), đặt theo
 *    (u, v) và lùi ra trước lớp ốp lam nếu có.
 * Hình khối chỉ dựng lại khi đổi loại (catalogId); đổi vị trí chỉ cập nhật transform.
 */
import * as THREE from 'three';
import type { CatalogItem, ItemPlacement, Placement, Scene, WallPlacement } from '../data/schema';
import { createLight, resolveLight, updateGlow, updateLight, type Resolved } from './lighting';
import type { WallFrame } from './room/wallFrame';
import { buildShape } from './shapes';
import { cm } from './units';

export interface WallHost {
  group: THREE.Object3D;
  frame: WallFrame;
  /** Khoảng lùi (m) khỏi mặt tường cho món có khoảng u0..u1, mép dưới v (cm): lớp ốp / phào chỉ. */
  offsetAt: (u0: number, u1: number, vBottom: number) => number;
}

export interface ItemObject {
  root: THREE.Group;
  catalogId: string;
  wallId: string | null;
  /** Nguồn sáng của món (nếu là đèn) + trạng thái hiện tại. */
  light: THREE.Object3D | null;
  resolved: Resolved | null;
}

export class ItemLayer {
  readonly group = new THREE.Group();
  readonly objects = new Map<string, ItemObject>();

  constructor(
    private readonly catalog: Map<string, CatalogItem>,
    private readonly ceilingHeight: number,
    private readonly walls: (id: string) => WallHost | undefined,
  ) {
    this.group.name = 'items';
  }

  sync(scene: Scene): void {
    const alive = new Set<string>();
    for (const p of scene.items) {
      const item = this.catalog.get(p.catalogId);
      if (!item) continue;
      const wallId = 'wall' in p ? p.wall : null;
      const parent = wallId ? this.walls(wallId)?.group : this.group;
      if (!parent) continue;
      alive.add(p.uid);
      let obj = this.objects.get(p.uid);
      if (!obj || obj.catalogId !== p.catalogId) {
        if (obj) this.remove(p.uid);
        const root = new THREE.Group();
        root.name = `item:${p.uid}`;
        root.add(buildShape(item));
        root.traverse((o) => {
          o.userData.pick = { kind: 'item', uid: p.uid };
          const m = o as THREE.Mesh;
          if (m.isMesh) m.castShadow = m.receiveShadow = true;
        });
        const light = item.light ? createLight(item.light, item.size, 'forward') : null;
        if (light) root.add(light);
        obj = { root, catalogId: p.catalogId, wallId, light, resolved: null };
        this.objects.set(p.uid, obj);
      }
      if (obj.root.parent !== parent) parent.add(obj.root);
      obj.wallId = wallId;
      this.place(obj.root, p, item);
      if (item.light && obj.light) {
        obj.resolved = resolveLight(item.light, p.light);
        updateLight(obj.light, obj.resolved);
        updateGlow(obj.root, obj.resolved);
      }
    }
    for (const uid of [...this.objects.keys()]) if (!alive.has(uid)) this.remove(uid);
  }

  /** Cập nhật transform (dùng cả khi kéo thả trực tiếp, chưa ghi vào scene). */
  place(root: THREE.Object3D, p: Placement, item: CatalogItem): void {
    if ('wall' in p) return this.placeOnWall(root, p, item);
    const ip = p as ItemPlacement;
    const y = item.mount === 'ceiling' ? cm(this.ceilingHeight - (ip.drop ?? 30) - item.size.h) : cm(ip.y ?? 0);
    root.position.set(cm(ip.x), y, cm(ip.z));
    root.rotation.set(0, -THREE.MathUtils.degToRad(ip.rot), 0); // rot dương = theo chiều kim đồng hồ nhìn từ trên
  }

  private placeOnWall(root: THREE.Object3D, p: WallPlacement, item: CatalogItem): void {
    const host = this.walls(p.wall);
    if (!host) return;
    // gốc shape ở tâm đáy, sâu từ −d/2 → +d/2 → lùi d/2 để mặt sau áp vào tường / lớp ốp
    const off = host.offsetAt(p.u - item.size.w / 2, p.u + item.size.w / 2, p.v - item.size.h / 2);
    root.position.set(host.frame.uToX(p.u), cm(p.v - item.size.h / 2), cm(item.size.d) / 2 + off + 0.002);
    root.rotation.set(0, 0, 0);
  }

  private remove(uid: string): void {
    const obj = this.objects.get(uid);
    if (!obj) return;
    obj.root.removeFromParent();
    obj.root.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      const mat = m.material;
      // texture dùng chung trong cache của shapes → chỉ huỷ material
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
      else mat?.dispose();
    });
    this.objects.delete(uid);
  }
}
