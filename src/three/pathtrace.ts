/**
 * Render một lần chất lượng cao bằng path tracing (three-gpu-pathtracer): ánh sáng dội
 * giữa các mặt, bóng mềm, nắng qua cửa sổ. Dùng chung scene với viewer real-time; trước khi
 * render tạm thời chuyển scene sang "chế độ vật lý" rồi khôi phục lại:
 *  - hiện đủ tường + trần (phòng kín), ẩn lưới / khung chọn / vùng quét cửa / kính,
 *  - phông ngoài cửa sổ + bầu trời thành nguồn sáng (ngày) hoặc tối (đêm),
 *  - đèn nằm trong chao (đèn lồng, đèn sàn, hộp mica…): tắt point light, thay bằng chính
 *    chao đèn phát sáng với quang thông tương đương — nếu không, chao sẽ che mất bóng đèn.
 */
import * as THREE from 'three';
import { GradientEquirectTexture, WebGLPathTracer } from 'three-gpu-pathtracer';

export interface PathTraceOptions {
  width: number;
  height: number;
  samples: number;
  bounces?: number;
  mode: 'day' | 'night';
  onProgress?: (samples: number, total: number, canvas: HTMLCanvasElement) => void;
  shouldCancel?: () => boolean;
}

export interface TraceContext {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  /** Nguồn sáng nền của real-time (hemisphere, fill) — tắt khi path trace. */
  rasterOnly: THREE.Object3D[];
  sun: THREE.DirectionalLight;
  backdrop: THREE.Object3D;
  ceiling: THREE.Object3D;
  ceilingMat: THREE.MeshStandardMaterial;
  /** Group tường (để hiện lại tường đang bị cắt). */
  walls: THREE.Object3D[];
  /** Helper cần ẩn (khung chọn, lưới, viền cảnh báo…). */
  helpers: THREE.Object3D[];
  /** Đèn của món: holder chứa Light, root để tìm vật liệu phát sáng, cường độ (candela). */
  itemLights: { holder: THREE.Object3D; root: THREE.Object3D; on: boolean; color: THREE.Color; candela: number; enclosed: boolean }[];
}

/** Bầu trời (gradient) là nguồn sáng qua cửa sổ — được lấy mẫu trực tiếp nên ít nhiễu. */
const SKY = {
  day: { top: '#cfe0f7', bottom: '#8fae7c', env: 3.0, sun: 3.0 },
  night: { top: '#0a0e1a', bottom: '#141826', env: 0.05, sun: 0 },
};

/** Diện tích chiếu trung bình (m²) của các mesh phát sáng trong một món. */
function glowArea(root: THREE.Object3D): { mats: THREE.MeshStandardMaterial[]; area: number } {
  const mats: THREE.MeshStandardMaterial[] = [];
  let area = 0;
  const size = new THREE.Vector3();
  root.updateWorldMatrix(true, true);
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    const mat = m.material as THREE.MeshStandardMaterial | undefined;
    if (!m.isMesh || !mat || Array.isArray(mat) || !mat.userData?.glow) return;
    new THREE.Box3().setFromObject(m).getSize(size);
    area += (size.x * size.y + size.y * size.z + size.x * size.z) / 3;
    mats.push(mat);
  });
  return { mats, area };
}

/**
 * Đợi GPU chạy xong mọi lệnh đã gửi rồi nhường luồng chính. Đọc 1 pixel buộc trình duyệt
 * đồng bộ với GPU (fence sync không báo xong khi cửa sổ bị che trong Chrome).
 */
const pixel = new Uint8Array(4);
function gpuIdle(gl: WebGL2RenderingContext): Promise<void> {
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
  return new Promise((resolve) => setTimeout(resolve, 0));
}

export async function pathTrace(ctx: TraceContext, opts: PathTraceOptions): Promise<HTMLCanvasElement> {
  const { renderer, scene } = ctx;
  const undo: (() => void)[] = [];
  const set = <T extends object, K extends keyof T>(obj: T, key: K, value: T[K]) => {
    const prev = obj[key];
    obj[key] = value;
    undo.push(() => (obj[key] = prev));
  };
  const sky = SKY[opts.mode];
  const out = document.createElement('canvas');
  out.width = opts.width;
  out.height = opts.height;
  const g = out.getContext('2d', { willReadFrequently: true })!;

  const prevSize = renderer.getSize(new THREE.Vector2());
  const prevRatio = renderer.getPixelRatio();
  let tracer: WebGLPathTracer | null = null;
  const env = new GradientEquirectTexture(64);

  try {
    // ---- scene → chế độ vật lý
    for (const w of ctx.walls) set(w, 'visible', true);
    set(ctx.ceiling, 'visible', true);
    set(ctx.ceilingMat, 'emissiveIntensity', 0);
    for (const h of [...ctx.helpers, ...ctx.rasterOnly]) set(h, 'visible', false);
    scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if ((o as THREE.Line).isLine || (o as THREE.LineSegments).isLineSegments) return set(o, 'visible', false);
      if (!m.isMesh) return;
      const mat = m.material as THREE.Material;
      if (Array.isArray(mat)) return;
      // kính, vùng quét cửa: bỏ khỏi cảnh (ánh sáng đi thẳng qua ô cửa)
      if (m.userData.glass || o.name.startsWith('doorSwing')) return set(o, 'visible', false);
    });
    // phông ảnh ngoài cửa sổ: thay bằng bầu trời (environment)
    set(ctx.backdrop, 'visible', false);
    // Đèn nằm trong chao (đèn lồng, đèn sàn, hộp mica…): giữ bóng đèn làm nguồn sáng trực tiếp,
    // cho chao trong mờ để ánh sáng xuyên qua (nếu không chao sẽ che kín bóng đèn).
    for (const l of ctx.itemLights) {
      if (!l.enclosed) continue;
      for (const m of glowArea(l.root).mats) {
        set(m, 'transparent', true);
        set(m, 'opacity', 0.3);
        set(m, 'emissiveIntensity', l.on ? 2.2 : 0);
        const prev = m.emissive.clone();
        m.emissive.copy(l.color);
        undo.push(() => m.emissive.copy(prev));
      }
    }
    set(ctx.sun, 'visible', sky.sun > 0);
    set(ctx.sun, 'intensity', sky.sun);

    env.topColor.set(sky.top);
    env.bottomColor.set(sky.bottom);
    env.update();
    set(scene, 'environment', env);
    set(scene, 'environmentIntensity', sky.env);
    set(scene, 'background', env);
    set(scene, 'backgroundIntensity', sky.env);

    // ---- path trace
    renderer.setPixelRatio(1);
    renderer.setSize(opts.width, opts.height, false);
    const camera = ctx.camera.clone();
    camera.aspect = opts.width / opts.height;
    camera.updateProjectionMatrix();

    tracer = new WebGLPathTracer(renderer);
    tracer.bounces = opts.bounces ?? 6;
    tracer.filterGlossyFactor = 0.5;
    tracer.renderDelay = 0;
    tracer.minSamples = 1;
    tracer.fadeDuration = 0;
    tracer.rasterizeScene = false;
    tracer.dynamicLowRes = false;
    tracer.tiles.set(2, 2);
    tracer.textureSize.set(1024, 1024);
    await new Promise((r) => setTimeout(r, 30)); // cho UI kịp hiện "đang chuẩn bị"
    tracer.setScene(scene, camera);

    const gl = renderer.getContext() as WebGL2RenderingContext;
    let last = 0;
    while (tracer.samples < opts.samples && !opts.shouldCancel?.()) {
      tracer.renderSample();
      const s = Math.floor(tracer.samples);
      if (s !== last && (s <= 4 || s % 8 === 0)) {
        g.drawImage(renderer.domElement, 0, 0);
        opts.onProgress?.(s, opts.samples, out);
        last = s;
      }
      // chờ GPU xử lý xong mẫu này rồi mới gửi mẫu tiếp — nếu không hàng đợi lệnh phình ra,
      // GPU treo và Chrome reset tiến trình GPU (mất texture, ảnh đen)
      await gpuIdle(gl);
      if (gl.isContextLost()) throw new Error('GPU bị quá tải và đã reset — thử lại với kích thước / chất lượng thấp hơn.');
    }
    g.drawImage(renderer.domElement, 0, 0);
    opts.onProgress?.(Math.floor(tracer.samples), opts.samples, out);
    return out;
  } finally {
    tracer?.dispose();
    for (const u of undo.reverse()) u();
    // path tracer đụng tới trạng thái GL của texture → buộc nạp lại để real-time hiển thị đúng
    renderer.resetState();
    scene.traverse((o) => {
      const mat = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
      if (!mat || Array.isArray(mat)) return;
      for (const t of [mat.map, mat.emissiveMap]) if (t) t.needsUpdate = true;
    });
    env.dispose();
    renderer.setPixelRatio(prevRatio);
    renderer.setSize(prevSize.x, prevSize.y, false);
  }
}
