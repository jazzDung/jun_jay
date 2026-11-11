/**
 * Lưu / nạp cảnh (định dạng scene.json):
 *  - autosave vào localStorage của trình duyệt (mỗi thiết bị một bản riêng),
 *  - Export / Import file JSON,
 *  - Share link: cảnh được nén (deflate) và mã hoá base64url trong URL hash `#s=...`.
 *
 * Mọi thao tác storage đều bọc try/catch: chế độ ẩn danh hoặc bị chặn site data thì
 * app vẫn chạy, chỉ không lưu được.
 */
import type { Scene } from '../data/schema';
import { parseScene, type Refs, type Result } from '../data/validate';
import { fileStamp } from '../util/stamp';

const STORAGE_KEY = 'junjay.scene.v1';
const HASH_KEY = 's';

export type SceneSource = 'shared' | 'local' | 'default';

export interface InitialScene {
  scene: Scene;
  source: SceneSource;
  /** Lỗi khi đọc link chia sẻ / autosave (đã bỏ qua và dùng nguồn kế tiếp). */
  notices: string[];
}

export async function loadInitialScene(defaultScene: Scene, refs: Refs): Promise<InitialScene> {
  const notices: string[] = [];

  const shared = readShareHash();
  if (shared) {
    try {
      const r = parseScene(await decodeScene(shared), refs, 'link chia sẻ');
      if (r.ok) return { scene: r.data, source: 'shared', notices: r.warnings };
      notices.push('Link chia sẻ không hợp lệ:', ...r.errors);
    } catch {
      notices.push('Link chia sẻ bị hỏng hoặc bị cắt mất một phần.');
    }
  }

  const local = readLocal();
  if (local !== undefined) {
    const r = parseScene(local, refs, 'bản tự lưu');
    if (r.ok) return { scene: r.data, source: 'local', notices: [...notices, ...r.warnings] };
    notices.push('Bản tự lưu không còn khớp với dữ liệu phòng/catalog, đã dùng cảnh mặc định:', ...r.errors);
  }

  return { scene: defaultScene, source: 'default', notices };
}

// ---------------------------------------------------------------- autosave

function readLocal(): unknown | undefined {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as unknown) : undefined;
  } catch {
    return undefined;
  }
}

/** Trả về false nếu trình duyệt không cho lưu. */
export function saveLocal(scene: Scene): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(scene));
    return true;
  } catch {
    return false;
  }
}

export function clearLocal(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* bỏ qua */
  }
}

// ---------------------------------------------------------- export / import

export function exportSceneFile(scene: Scene): void {
  const blob = new Blob([JSON.stringify(scene, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const stamp = fileStamp();
  const slug = scene.name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
  a.href = url;
  a.download = `junjay-${slug || 'scene'}-${stamp}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function importSceneFile(file: File, refs: Refs): Promise<Result<Scene>> {
  let raw: unknown;
  try {
    raw = JSON.parse(await file.text());
  } catch {
    return { ok: false, errors: [`${file.name} không phải file JSON hợp lệ.`] };
  }
  return parseScene(raw, refs, file.name);
}

// -------------------------------------------------------------- share link

function readShareHash(): string | null {
  const params = new URLSearchParams(location.hash.slice(1));
  return params.get(HASH_KEY);
}

export function clearShareHash(): void {
  history.replaceState(null, '', location.pathname + location.search);
}

export async function makeShareUrl(scene: Scene): Promise<string> {
  return `${location.origin}${location.pathname}#${HASH_KEY}=${await encodeScene(scene)}`;
}

const canCompress = typeof CompressionStream !== 'undefined' && typeof DecompressionStream !== 'undefined';

/** 'z' + base64url(deflate(json)), hoặc 'j' + base64url(json) nếu trình duyệt không hỗ trợ nén. */
export async function encodeScene(scene: Scene): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(scene));
  if (!canCompress) return 'j' + toBase64Url(bytes);
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  return 'z' + toBase64Url(new Uint8Array(await new Response(stream).arrayBuffer()));
}

export async function decodeScene(encoded: string): Promise<unknown> {
  const kind = encoded[0];
  const bytes = fromBase64Url(encoded.slice(1));
  let json: string;
  if (kind === 'z') {
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    json = await new Response(stream).text();
  } else if (kind === 'j') {
    json = new TextDecoder().decode(bytes);
  } else {
    throw new Error('Định dạng link không xác định');
  }
  return JSON.parse(json) as unknown;
}

function toBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
