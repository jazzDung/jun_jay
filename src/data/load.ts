import { validateBundle, type DataBundle, type Result } from './validate';

const FILES = ['room', 'catalog', 'scene', 'panels'] as const;

/** Nạp room/catalog/scene/panels mặc định từ public/data/. */
export async function loadDefaultData(): Promise<Result<DataBundle>> {
  const base = import.meta.env.BASE_URL;
  try {
    const [room, catalog, scene, panels] = await Promise.all(
      FILES.map(async (name) => {
        const res = await fetch(`${base}data/${name}.json`, { cache: 'no-cache' });
        if (!res.ok) throw new Error(`Không tải được data/${name}.json (HTTP ${res.status})`);
        try {
          return (await res.json()) as unknown;
        } catch {
          throw new Error(`data/${name}.json không phải JSON hợp lệ (thừa/thiếu dấu phẩy?)`);
        }
      }),
    );
    return validateBundle({ room, catalog, scene, panels });
  } catch (e) {
    return { ok: false, errors: [(e as Error).message] };
  }
}
