/**
 * Export for AI: render mặt bằng có nhãn + các góc nhìn cố định (room.json → views),
 * sinh prompt.md, kèm ảnh vật liệu thật đang dùng và scene.json, nén thành một file .zip.
 */
import { zipSync, strToU8 } from 'fflate';
import { fileStamp } from '../util/stamp';
import * as THREE from 'three';
import type { Scene } from '../data/schema';
import type { DataBundle } from '../data/validate';
import type { Viewer } from '../three/viewer';
import { buildPrompt, type ViewFile } from './prompt';

const VIEW_W = 1600;
const VIEW_H = 1000;

async function canvasToPng(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Không tạo được PNG'))), 'image/png'),
  );
  return new Uint8Array(await blob.arrayBuffer());
}

/** Vẽ nhãn khu, tên tường, kích thước tổng và thước tỉ lệ lên ảnh mặt bằng. */
export function annotatePlan(canvas: HTMLCanvasElement, camera: THREE.Camera, data: DataBundle): void {
  const g = canvas.getContext('2d')!;
  const toPx = (xCm: number, zCm: number) => {
    const v = new THREE.Vector3(xCm / 100, 0, zCm / 100).project(camera);
    return [((v.x + 1) / 2) * canvas.width, ((1 - v.y) / 2) * canvas.height] as const;
  };
  const label = (text: string, x: number, y: number, size = 22, color = '#1f1a17') => {
    g.font = `600 ${size}px system-ui, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineWidth = 5;
    g.strokeStyle = 'rgba(255,255,255,0.85)';
    g.strokeText(text, x, y);
    g.fillStyle = color;
    g.fillText(text, x, y);
  };

  const { room } = data;
  for (const z of room.zones) {
    const [cx, cy] = toPx((z.rect[0] + z.rect[2]) / 2, (z.rect[1] + z.rect[3]) / 2);
    const w = ((z.rect[2] - z.rect[0]) / 100).toFixed(1);
    const d = ((z.rect[3] - z.rect[1]) / 100).toFixed(1);
    label(z.label, cx, cy - 14, z === room.zones[0] ? 30 : 18);
    label(`${w} × ${d} m`, cx, cy + 14, z === room.zones[0] ? 22 : 15, '#5a4a3a');
  }

  // kích thước tổng của khu chính
  const [x0, z0, x1, z1] = room.zones[0].rect;
  const g2 = (xa: number, ya: number, xb: number, yb: number) => {
    g.strokeStyle = '#E07A2F';
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(xa, ya);
    g.lineTo(xb, yb);
    g.stroke();
  };
  const [ax, ay] = toPx(x0, z0 - 45);
  const [bx] = toPx(x1, z0 - 45);
  g2(ax, ay, bx, ay);
  label(`${((x1 - x0) / 100).toFixed(1)} m`, (ax + bx) / 2, ay - 16, 22, '#E07A2F');
  const [lx, ly] = toPx(x0 - 45, z0);
  const [, ly2] = toPx(x0 - 45, z1);
  g2(lx, ly, lx, ly2);
  label(`${((z1 - z0) / 100).toFixed(1)} m`, lx - 30, (ly + ly2) / 2, 22, '#E07A2F');

  // tên tường dài + tường cửa sổ
  const windowWall = room.walls.find((w) => w.from[0] === x0 && w.to[0] === x0);
  if (windowWall) {
    const [wx, wy] = toPx(x0 - 18, (z0 + z1) / 2);
    g.save();
    g.translate(wx, wy);
    g.rotate(-Math.PI / 2);
    label('Cửa sổ', 0, 0, 18);
    g.restore();
  }
  const [rx, ry] = toPx((x0 + x1) / 2, z0 + 22);
  label('Tường phải — phía WC', rx, ry, 16, '#5a4a3a');
  const [qx, qy] = toPx((x0 + x1) / 2, z1 - 22);
  label('Tường trái — phía lối vào', qx, qy, 16, '#5a4a3a');

  // thước tỉ lệ 1 m
  const [sx, sy] = toPx(x0, z1 + 60);
  const [ex] = toPx(x0 + 100, z1 + 60);
  g2(sx, sy, ex, sy);
  label('1 m', (sx + ex) / 2, sy + 18, 16, '#E07A2F');
}

export async function exportForAi(viewer: Viewer, data: DataBundle, scene: Scene): Promise<{ fileName: string; count: number }> {
  const files: Record<string, Uint8Array> = {};
  const views: ViewFile[] = [];

  const plan = viewer.renderStill('plan', VIEW_W, VIEW_H);
  annotatePlan(plan.canvas, plan.camera, data);
  files['views/00_plan.png'] = await canvasToPng(plan.canvas);
  views.push({
    file: 'views/00_plan.png',
    label: 'Mặt bằng (top-down plan)',
    description: 'Orthographic top-down floor plan with zone labels and overall dimensions — use it to understand the layout, not as a camera angle.',
  });

  for (const [i, v] of data.room.views.entries()) {
    const position = v.position.map((n) => n / 100) as [number, number, number];
    const target = v.target.map((n) => n / 100) as [number, number, number];
    const shot = viewer.renderStill({ position, target, fov: v.fov }, VIEW_W, VIEW_H);
    const file = `views/${String(i + 1).padStart(2, '0')}_${v.id}.png`;
    files[file] = await canvasToPng(shot.canvas);
    views.push({ file, label: v.label, description: v.description, position, target });
  }

  // ảnh vật liệu thật của các lớp ốp đang dùng
  const usedFinishes = new Set<string>();
  for (const w of data.room.walls) {
    const o = scene.room.walls[w.id];
    const panel = o?.panel !== undefined ? o.panel : w.panel;
    if (panel) usedFinishes.add(panel.finish);
  }
  for (const id of usedFinishes) {
    const f = data.panels.finishes.find((x) => x.id === id);
    if (!f?.texture) continue;
    const res = await fetch(import.meta.env.BASE_URL + f.texture);
    if (res.ok) files[`materials/${f.id}.jpg`] = new Uint8Array(await res.arrayBuffer());
  }

  files['prompt.md'] = strToU8(buildPrompt(data, scene, views));
  files['scene.json'] = strToU8(JSON.stringify(scene, null, 2));

  const zip = zipSync(files, { level: 0 }); // PNG/JPG đã nén sẵn
  const blob = new Blob([zip as BlobPart], { type: 'application/zip' });
  const url = URL.createObjectURL(blob);
  const stamp = fileStamp();
  const fileName = `junjay-ai-${stamp}.zip`;
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return { fileName, count: views.length };
}

/** Chụp góc nhìn hiện tại ra PNG và tải về. */
export function downloadSnapshot(viewer: Viewer): void {
  const a = document.createElement('a');
  a.href = viewer.snapshot();
  a.download = `junjay-${fileStamp()}.png`;
  a.click();
}
