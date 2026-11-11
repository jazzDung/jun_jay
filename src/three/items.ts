/**
 * Lớp đồ đặt sàn / treo trần: đồng bộ scene.items → object 3D. Hình khối chỉ dựng lại
 * khi đổi loại (catalogId); đổi vị trí / xoay chỉ cập nhật transform.
 */
import * as THREE from 'three';
import type { CatalogItem, ItemPlacement, Scene } from '../data/schema';
import { buildShape } from './shapes';
import { cm } from './units';

export interface ItemObject {
  root: THREE.Group;
  catalogId: string;
}

export class ItemLayer {
  readonly group = new THREE.Group();
  readonly objects = new Map<string, ItemObject>();

  constructor(
    private readonly catalog: Map<string, CatalogItem>,
    private readonly ceilingHeight: number,
  ) {
    this.group.name = 'items';
  }

  sync(scene: Scene): void {
    const alive = new Set<string>();
    for (const p of scene.items) {
      if ('wall' in p) continue; // đồ treo tường: v3
      const item = this.catalog.get(p.catalogId);
      if (!item) continue;
      alive.add(p.uid);
      let obj = this.objects.get(p.uid);
      if (!obj || obj.catalogId !== p.catalogId) {
        if (obj) this.remove(p.uid);
        const root = new THREE.Group();
        root.name = `item:${p.uid}`;
        root.add(buildShape(item));
        root.traverse((o) => (o.userData.pick = { kind: 'item', uid: p.uid }));
        this.group.add(root);
        obj = { root, catalogId: p.catalogId };
        this.objects.set(p.uid, obj);
      }
      this.place(obj.root, p, item);
    }
    for (const uid of [...this.objects.keys()]) if (!alive.has(uid)) this.remove(uid);
  }

  /** Cập nhật transform (dùng cả khi kéo thả trực tiếp, chưa ghi vào scene). */
  place(root: THREE.Object3D, p: Pick<ItemPlacement, 'x' | 'z' | 'rot' | 'drop'>, item: CatalogItem): void {
    const y = item.mount === 'ceiling' ? cm(this.ceilingHeight - (p.drop ?? 30) - item.size.h) : 0;
    root.position.set(cm(p.x), y, cm(p.z));
    root.rotation.y = -THREE.MathUtils.degToRad(p.rot); // rot dương = theo chiều kim đồng hồ nhìn từ trên
  }

  private remove(uid: string): void {
    const obj = this.objects.get(uid);
    if (!obj) return;
    obj.root.removeFromParent();
    obj.root.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      const mat = m.material;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
      else mat?.dispose();
    });
    this.objects.delete(uid);
  }
}
