/**
 * Schema cho 3 file dữ liệu: room.json, catalog.json, scene.json.
 *
 * Quy ước chung (xem handoff.md mục 4):
 *  - Mọi số đo lưu bằng cm.
 *  - Mặt bằng: trục x theo chiều dài quán (0 = tường cửa sổ), trục z theo chiều ngang
 *    (0 = "tường trên"), y là chiều cao (0 = sàn).
 *  - Một mảng tường đi từ `from` tới `to` (toạ độ [x, z]). Vị trí trên tường dùng
 *    toạ độ cục bộ: u = khoảng cách dọc tường tính từ `from`, v = độ cao tính từ sàn.
 */
import { z } from 'zod';

export const Hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'mã màu phải dạng #RRGGBB');
export const Vec2 = z.tuple([z.number(), z.number()]);
export const Range = z
  .tuple([z.number(), z.number()])
  .refine(([a, b]) => b > a, 'khoảng [a, b] phải có b > a');
/** Danh sách chú thích những số còn là ước lượng, cần đo lại. */
const Todo = z.array(z.string()).optional();

// ---------------------------------------------------------------- room.json

/** Ốp pano / lam sóng lên một mảng tường. Profile và màu gỗ tra trong panels.json. */
export const Panel = z.object({
  /** id profile trong panels.json (vd 'lam5' = lam sóng 5 sóng). */
  profile: z.string().default('lam5'),
  /** id màu gỗ trong panels.json (vd 'lam_teak'). */
  finish: z.string(),
  /** Màu nhuộm nhân thêm lên texture; null = giữ màu gốc. */
  tone: Hex.nullable().default(null),
  sheen: z.enum(['matte', 'satin', 'gloss']).default('matte'),
  /** full = kín từ sàn tới trần; wainscot = ốp lửng tới `wainscotHeight`. */
  coverage: z.enum(['full', 'wainscot']).default('full'),
  wainscotHeight: z.number().positive().default(120),
  /** Đoạn ốp dọc tường (u, cm); null = cả tường. */
  uRange: Range.nullable().default(null),
});
export type Panel = z.infer<typeof Panel>;

/** Lớp ốp có sẵn trong quán (không phải pano người dùng chọn). */
export const Cladding = z.object({
  id: z.string(),
  type: z.enum(['pvc_vgroove', 'pvc_hstripe']),
  color: Hex,
  u: Range,
  v: Range,
  todo: Todo,
});

/** Phào chỉ khung tranh: chia đoạn uRange thành `bays` ô, mỗi ô có khung trên + khung dưới. */
export const Mouldings = z.object({
  enabled: z.boolean(),
  /** null = cùng màu tường. */
  color: Hex.nullable().default(null),
  uRange: Range,
  bays: z.number().int().positive(),
  upper: Range,
  lower: Range,
  /** Khoảng cách giữa các ô và tới mép đoạn. */
  gap: z.number().nonnegative(),
  profileWidth: z.number().positive(),
  baseboardHeight: z.number().nonnegative(),
  todo: Todo,
});

export const Wall = z.object({
  id: z.string(),
  label: z.string(),
  /** Tên tiếng Anh dùng trong prompt Export for AI. */
  en: z.string().optional(),
  from: Vec2,
  to: Vec2,
  /** Vùng (zone) mà mặt tường này nhìn vào. */
  faces: z.string(),
  thickness: z.number().positive(),
  color: Hex,
  panel: Panel.nullable(),
  claddings: z.array(Cladding).default([]),
  mouldings: Mouldings.nullable().default(null),
  todo: Todo,
});
export type Wall = z.infer<typeof Wall>;

export const WindowFrame = z.object({
  /** Toạ độ u trên tường (tuyệt đối, không phải tương đối với ô cửa). */
  u: Range,
  cols: z.number().int().positive(),
  rows: z.number().int().positive(),
  sliding: z.boolean().default(true),
});

export const Opening = z.object({
  id: z.string(),
  label: z.string(),
  /** Tên tiếng Anh dùng trong prompt Export for AI. */
  en: z.string().optional(),
  wall: z.string(),
  type: z.enum(['door', 'doorway', 'window', 'passthrough']),
  u: Range,
  sill: z.number().nonnegative(),
  height: z.number().positive(),
  /** Cánh cửa: bản lề ở đầu `start` hay `end` của ô (theo chiều u), mở vào zone nào. */
  door: z
    .object({
      hinge: z.enum(['start', 'end']),
      opensInto: z.string(),
      color: Hex.default('#F2EFE8'),
    })
    .optional(),
  frames: z.array(WindowFrame).optional(),
  todo: Todo,
});
export type Opening = z.infer<typeof Opening>;

export const Surface = z.object({
  color: Hex,
  material: z.string(),
});

export const Zone = z.object({
  id: z.string(),
  label: z.string(),
  /** Tên tiếng Anh dùng trong prompt Export for AI. */
  en: z.string().optional(),
  /** [x0, z0, x1, z1] */
  rect: z.tuple([z.number(), z.number(), z.number(), z.number()]),
  floor: Surface,
  /** Màu tường bên trong các phòng phụ (WC, pha chế, hành lang) — dựng tự động. */
  interiorWallColor: Hex.optional(),
});
export type Zone = z.infer<typeof Zone>;

export const Fixture = z.object({
  id: z.string(),
  type: z.enum(['ac_unit', 'tube_light', 'downlight', 'outlet', 'switch']),
  label: z.string(),
  /** Tên tiếng Anh dùng trong prompt Export for AI. */
  en: z.string().optional(),
  /** Gắn tường: wall + u + v (tâm). Gắn trần: x + z. */
  wall: z.string().optional(),
  u: z.number().optional(),
  v: z.number().optional(),
  x: z.number().optional(),
  z: z.number().optional(),
  size: z.object({ w: z.number(), h: z.number(), d: z.number() }),
  color: Hex.optional(),
  todo: Todo,
});

/** Góc camera cố định (cm) — dùng cho Export for AI và các preset góc nhìn. */
export const CameraView = z.object({
  id: z.string().regex(/^[a-z0-9_]+$/),
  label: z.string(),
  /** Mô tả bằng tiếng Anh cho prompt (Gemini hiểu tốt nhất). */
  description: z.string(),
  position: z.tuple([z.number(), z.number(), z.number()]),
  target: z.tuple([z.number(), z.number(), z.number()]),
  fov: z.number().min(20).max(100).default(62),
});
export type CameraView = z.infer<typeof CameraView>;

export const Room = z.object({
  units: z.literal('cm'),
  ceilingHeight: z.number().positive(),
  ceiling: z.object({
    type: z.enum(['drop_tile', 'flat']),
    color: Hex,
    tile: z.number().positive().optional(),
  }),
  zones: z.array(Zone).min(1),
  walls: z.array(Wall).min(1),
  openings: z.array(Opening),
  fixtures: z.array(Fixture),
  views: z.array(CameraView).default([]),
  todo: Todo,
});
export type Room = z.infer<typeof Room>;

// -------------------------------------------------------------- panels.json

export const PanelProfile = z.object({
  id: z.string(),
  name: z.string(),
  style: z.enum(['fluted', 'planks']),
  /** Bề rộng một tấm (cm). */
  width: z.number().positive(),
  /** Số sóng trên một tấm (planks: 1). */
  ridges: z.number().int().positive(),
  /** Bề rộng mặt sóng (cm); rãnh = width/ridges − ridgeWidth. */
  ridgeWidth: z.number().positive(),
  /** Độ nhô của sóng so với đáy rãnh (cm). */
  ridgeDepth: z.number().nonnegative(),
  /** Độ dày phần đế (cm). */
  base: z.number().positive(),
  todo: Todo,
});
export type PanelProfile = z.infer<typeof PanelProfile>;

export const PanelFinish = z.object({
  id: z.string(),
  name: z.string(),
  /** Ảnh vân gỗ trong public/ (không có = màu trơn). */
  texture: z.string().optional(),
  color: Hex,
  /** Kích thước thật (cm) mà một ô texture phủ. */
  period: z.object({ w: z.number().positive(), h: z.number().positive() }).optional(),
});
export type PanelFinish = z.infer<typeof PanelFinish>;

export const Panels = z.object({
  version: z.literal(1),
  profiles: z.array(PanelProfile).min(1),
  finishes: z.array(PanelFinish).min(1),
});
export type Panels = z.infer<typeof Panels>;

// ------------------------------------------------------------- catalog.json

export const Material = z.object({
  type: z.enum(['fabric', 'leather', 'wood', 'metal', 'chrome', 'glass', 'acrylic', 'ceramic', 'plastic', 'paper', 'plant', 'rattan', 'tile', 'print']),
  color: Hex,
  /** Ảnh làm texture, đường dẫn trong public/ (vd 'images/catalog/tiger_rug.jpg'). */
  texture: z.string().optional(),
});

export const LightSpec = z.object({
  type: z.enum(['point', 'spot', 'tube', 'area']),
  kelvin: z.number().min(1000).max(10000).optional(),
  /** Màu cố định cho đèn màu (RGB/LED màu); ưu tiên hơn kelvin. */
  color: Hex.optional(),
  intensity: z.number().nonnegative(),
});

export const CatalogItem = z.object({
  id: z.string().regex(/^[a-z0-9_]+$/, 'id chỉ gồm a-z, 0-9, _'),
  name: z.string(),
  category: z.enum(['seating', 'table', 'storage', 'rug', 'decor', 'lighting', 'plant', 'appliance', 'wall_art', 'wall_storage', 'fixture']),
  mount: z.enum(['floor', 'wall', 'ceiling']),
  /** Hình khối dựng sẵn trong src/shapes (từ v2). */
  shape: z.string(),
  /** w = ngang, d = sâu, h = cao. Đồ tròn: w = d = đường kính. Đồ treo tường: d = độ dày nhô ra. */
  size: z.object({ w: z.number().positive(), d: z.number().positive(), h: z.number().positive() }),
  params: z.record(z.string(), z.unknown()).default({}),
  materials: z.record(z.string(), Material).default({}),
  light: LightSpec.optional(),
  owned: z.boolean().default(false),
  qty: z.number().int().positive().default(1),
  /** Ảnh tham chiếu gốc trong ref/ (chỉ có ở máy local, không deploy). */
  ref: z.string().optional(),
  source: z
    .object({ url: z.string().optional(), store: z.string().optional(), price: z.number().optional() })
    .optional(),
  notes: z.string().default(''),
  todo: Todo,
});
export type CatalogItem = z.infer<typeof CatalogItem>;

export const Catalog = z.object({
  version: z.literal(1),
  items: z.array(CatalogItem),
});
export type Catalog = z.infer<typeof Catalog>;

// --------------------------------------------------------------- scene.json

export const FloorPlacement = z.object({
  uid: z.string(),
  catalogId: z.string(),
  x: z.number(),
  z: z.number(),
  rot: z.number().default(0),
});

export const WallPlacement = z.object({
  uid: z.string(),
  catalogId: z.string(),
  wall: z.string(),
  u: z.number(),
  v: z.number(),
});

export const CeilingPlacement = z.object({
  uid: z.string(),
  catalogId: z.string(),
  x: z.number(),
  z: z.number(),
  /** Khoảng thả từ trần xuống tới đỉnh vật. */
  drop: z.number().nonnegative().default(0),
  rot: z.number().default(0),
});

export const Placement = z.union([WallPlacement, CeilingPlacement, FloorPlacement]);

export const SceneLight = z.object({
  uid: z.string(),
  type: z.enum(['point', 'spot', 'led_strip']),
  wall: z.string().optional(),
  x: z.number().optional(),
  y: z.number().optional(),
  z: z.number().optional(),
  kelvin: z.number().min(1000).max(10000),
  intensity: z.number().nonnegative(),
  on: z.boolean().default(true),
});

export const WallOverride = z.object({
  color: Hex.optional(),
  panel: Panel.nullable().optional(),
  mouldings: z.boolean().optional(),
});

export const Scene = z.object({
  version: z.literal(1),
  name: z.string().default('Chưa đặt tên'),
  room: z
    .object({
      walls: z.record(z.string(), WallOverride).default({}),
      ceilingColor: Hex.optional(),
      // Sàn gỗ hiện trạng giữ nguyên — không có ghi đè màu sàn.
      /** id thiết bị hiện trạng (room.json fixtures) đang bị ẩn — vd tháo đèn tuýp. */
      hiddenFixtures: z.array(z.string()).default([]),
    })
    .default({ walls: {}, hiddenFixtures: [] }),
  items: z.array(Placement).default([]),
  lights: z.array(SceneLight).default([]),
  mode: z.enum(['day', 'night']).default('day'),
});
export type Scene = z.infer<typeof Scene>;
