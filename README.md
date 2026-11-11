# Jun Jẩy Planner

App 3D trên trình duyệt để thử bố cục quán cà phê Jun Jẩy (89 Nguyễn Du, Q1) **đúng tỉ lệ thật**:
màu tường, ốp lam sóng, đồ đặt sàn, đồ treo tường, ánh sáng. Brief đầy đủ: [`handoff.md`](handoff.md).

Stack: Vite + TypeScript + Three.js + Preact. Không backend — dữ liệu là JSON trong `public/data/`.

## Chạy local

Cần Node 20+.

```bash
npm install
npm run dev          # http://localhost:5173
npm run dev:lan      # mở cho máy khác cùng Wi-Fi (Tab S9, Mac) — xem địa chỉ "Network" trong terminal
```

Lệnh khác:

| Lệnh | Việc |
|---|---|
| `npm run validate-data` | Kiểm tra `public/data/*.json` (schema, id trùng, tham chiếu tường/zone…). Chạy sau mỗi lần sửa tay. |
| `npm run typecheck` | Kiểm tra kiểu TypeScript |
| `npm run build` | Build ra `dist/` |
| `npm run preview` | Xem bản build |

## Dữ liệu

Mọi số đo bằng **cm**. Hệ toạ độ (xem `handoff.md` mục 4):

```
x: 0 (tường cửa sổ) → 950 (tường sau cùng)     z: 0 ("tường trên") → 400 ("tường dưới")     y: 0 = sàn
```

| File | Nội dung |
|---|---|
| `public/data/room.json` | Hiện trạng phòng: zone, mảng tường, ô cửa, phào chỉ, ốp có sẵn, máy lạnh, đèn trần |
| `public/data/catalog.json` | Danh mục đồ có thể đặt vào quán |
| `public/data/scene.json` | Cảnh mặc định (bố cục người dùng tạo ra cũng lưu theo định dạng này) |

Schema chi tiết (có chú thích từng trường): [`src/data/schema.ts`](src/data/schema.ts).
Số nào còn là ước lượng thì ghi trong mảng `todo` của mục đó — `npm run validate-data` đếm số TODO còn lại.

Vị trí trên tường dùng toạ độ cục bộ: **u** = khoảng cách dọc tường tính từ điểm `from`, **v** = độ cao tính từ sàn.

### Thêm một món vào catalog

Thêm một object vào `items` trong `public/data/catalog.json` — **không cần sửa code**:

```json
{
  "id": "sofa_low_240",
  "name": "Sofa thấp 2.4m",
  "category": "seating",
  "mount": "floor",
  "shape": "sofa",
  "size": { "w": 240, "d": 85, "h": 70 },
  "params": { "seatHeight": 40 },
  "materials": { "body": { "type": "fabric", "color": "#B5462E" } },
  "owned": false,
  "source": { "url": "https://...", "store": "...", "price": 8900000 },
  "todo": ["kích thước theo mẫu thật"]
}
```

- `id`: chữ thường, số, `_`; không trùng.
- `mount`: `floor` | `wall` | `ceiling`. Đồ tròn: `w = d = đường kính`. Đồ treo tường: `d` = độ dày nhô ra.
- `category`, `materials.*.type`: xem các giá trị hợp lệ trong `schema.ts`.
- `light`: thêm nếu món là đèn (`type`, `kelvin` hoặc `color`, `intensity`).
- `ref`: ảnh gốc trong `ref/` (chỉ ở máy local, không deploy).

Sau đó chạy `npm run validate-data`.

## Ốp lam sóng

- Chọn một mảng tường → mục **Ốp lam sóng**. "Tường trái/phải" tính khi **đứng ở cửa vào nhìn ra cửa sổ**:
  tường trái = phía lối vào (z=400), tường phải = phía WC (z=0).
- Thông số tấm và danh sách màu gỗ ở `public/data/panels.json` — có thông số thật từ bên thi công thì sửa
  `profiles[].width / ridges / ridgeWidth / ridgeDepth / base`.
- Thêm màu gỗ mới từ ảnh chụp: đặt ảnh (tấm lam nằm dọc trên nền trắng) vào `ref/wood_panel/`, thêm dòng vào
  `SOURCES` trong `tools/make_panel_textures.py`, chạy `python tools/make_panel_textures.py`, rồi chép màu +
  `period` in ra vào `panels.json`.

## Đặt đồ

- **+ Thêm đồ** → chọn món (lọc theo loại, ★ Đồ có sẵn, tìm không dấu) → món xuất hiện giữa khung nhìn.
- Kéo món để di chuyển (chuột hoặc 1 ngón; 2 ngón vẫn xoay/zoom camera). **Lưới 5 cm** bật/tắt ở thanh trên.
- Panel món: vị trí tâm (cm, tính từ tường cửa sổ và tường phải), xoay, khoảng cách mép tới 4 tường, cảnh báo, nhân bản, xoá.
- Cảnh báo (viền đỏ + danh sách trong panel Cảnh): chồng lấn (ghế/sofa với bàn và thảm được miễn), xuyên tường,
  nằm trong vùng quét cửa, lối đi chính < 80 cm từ lối vào tới cửa WC / ô thông / khu cửa sổ
  (điểm và bề rộng chỉnh ở `circulation` trong `room.json`).
- Phím tắt: `Ctrl+Z` / `Ctrl+Y` hoàn tác / làm lại · `Delete` xoá · `Ctrl+D` nhân bản · `R` / `Shift+R` xoay 90° ·
  `Q` / `E` xoay 15° · `Esc` bỏ chọn.
- Thêm hình khối mới: viết hàm trong `src/three/shapes/index.ts`, đăng ký vào `SHAPES`; catalog chỉ cần ghi tên `shape`.
  `size` của món luôn là hộp bao thật (w ngang × d sâu × h cao, cm).

## Treo đồ lên tường

- Chạm chọn một mảng tường (hiện lưới 10 cm, vạch đậm mỗi 50 cm) → **+ Thêm đồ** → chọn món "treo tường".
  Món được treo ở độ cao mặc định (`params.defaultHeight`, vd tranh 150, đồng hồ 180, máy lạnh 228) và tự né đồ đã treo.
  Chưa chọn tường thì treo lên tường đang hướng về camera.
- Kéo món để dời dọc / lên xuống theo lưới 10 cm (tắt "Lưới" để kéo tự do). Panel món: đổi tường, vị trí dọc tường,
  độ cao tâm; hiện mép dưới cách sàn, mép trên cách trần, khoảng tới hai đầu tường.
- Ảnh in cho tranh / poster / thảm / mặt đồng hồ: `materials.<phần>.texture` trong catalog trỏ tới `public/images/catalog/`.
  Ảnh cắt + nắn từ ảnh chụp (hoặc vẽ bằng code) bằng `python tools/make_catalog_textures.py` — thêm món mới: khai báo
  4 góc trong `QUADS` của script.

## Xuất cho AI (Gemini)

Panel **Cảnh** → **Xuất cho AI** tải về một file `.zip`:

| File | Nội dung |
|---|---|
| `views/00_plan.png` | Mặt bằng nhìn từ trên, có tên khu, kích thước, thước 1 m |
| `views/01…06_*.png` | 6 góc nhìn cố định (từ cửa vào, từ cửa sổ, 2 góc chéo, 2 góc ngồi 110 cm) |
| `materials/*.jpg` | Ảnh vân gỗ thật của lớp ốp đang dùng |
| `prompt.md` | Mô tả bằng tiếng Anh: kích thước, ô cửa, màu từng tường (mã hex + tên màu), lớp ốp, thiết bị, đồ đạc, ánh sáng, vị trí camera từng ảnh |
| `scene.json` | Cảnh gốc |

Cách dùng: mở Gemini → đính kèm một ảnh trong `views/` (và ảnh `materials/` nếu có) → dán nội dung `prompt.md`
→ thêm câu ở mục *Per-image request* cuối file.

Thêm / sửa góc nhìn: mảng `views` trong `public/data/room.json` (toạ độ cm, `description` tiếng Anh).

## Lưu cảnh

- **Tự lưu** vào trình duyệt của từng thiết bị (Tab và Mac lưu riêng).
- **Xuất JSON / Nhập JSON**: chuyển cảnh giữa các thiết bị hoặc giữ nhiều phương án.
- **Chia sẻ link**: cảnh được nén vào chính URL (`#s=...`), không cần server. Người mở link thấy banner
  "cảnh được chia sẻ" — thay đổi không ghi đè cảnh của họ cho đến khi bấm "Lưu thành cảnh của tôi".
- Sàn gỗ hiện trạng giữ nguyên, không đổi màu được.

## Ảnh tham chiếu

`ref/` (ảnh mặt bằng, đồ ở nhà, mẫu lam sóng, ảnh cảm hứng) **không commit** — có ảnh nhà riêng và người.
Texture / ảnh tranh đã xử lý để app dùng sẽ nằm trong `public/` và được commit.
Tên ảnh đồ vật ghi kèm kích thước, vd `tiger_rug_140x200cm.png`, `clover_clock_d30cm.png`.

## Deploy (GitHub Pages)

1. Tạo repo trên GitHub, push nhánh `main`.
2. Repo → **Settings → Pages → Source: GitHub Actions**.
3. Mỗi lần push `main`, workflow [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) build và deploy lên
   `https://<user>.github.io/<repo>/`.

Trên Tab S9 có thể "Thêm vào màn hình chính" để mở như app.

## Lộ trình

Xem `handoff.md` mục 11. Đang ở **v1 — Phòng**:

- [x] Lát 1 — scaffold, schema dữ liệu, `room.json` / `catalog.json` theo hiện trạng, viewer thô (sàn + khối tường), camera 3D / mặt bằng
- [x] Lát 2 — dựng phòng đầy đủ: khoét ô cửa, cửa sổ, cánh cửa + vùng quét, phào chỉ, ốp PVC, trần thả, máy lạnh, đèn; tự ẩn tường chắn tầm nhìn
- [x] Lát 3 — chọn tường/trần → đổi màu (color picker + hex + bảng màu concept), bật/tắt phào chỉ, autosave, Export/Import JSON, Share link
- [x] Lát 4 — ốp lam sóng: texture từ ảnh mẫu thật, biên dạng sóng 3D, ốp cả tường / nửa tường / tuỳ chỉnh, kín trần / ốp lửng, cả 2 tường dài; ẩn/hiện đèn & thiết bị hiện trạng
- [x] Lát 5 — Export for AI (mặt bằng có nhãn + 6 góc nhìn + prompt.md + ảnh vật liệu, .zip), chụp ảnh PNG, deploy GitHub Pages

**v2 — Đồ đặt sàn** ✓

- [x] 24 hình khối tham số theo catalog (`src/three/shapes`), catalog sidebar (lọc loại, đồ có sẵn, tìm kiếm)
- [x] Kéo thả (chuột / 1 ngón), bắt lưới 5 cm, xoay ±15°/±90°, nhân bản, xoá, nhập vị trí bằng số
- [x] Nhãn kích thước + khoảng cách tới tường; cảnh báo chồng lấn, xuyên tường, vùng quét cửa, lối đi < 80 cm
- [x] Undo/redo

**v3 — Đồ treo tường** ✓

- [x] Catalog đồ treo tường (tranh, poster, đồng hồ, tấm inox, pegboard, kệ, vải treo, đèn tường, đèn đuốc, máy lạnh, đèn tuýp)
- [x] Texture thật cho đồ owned (`tools/make_catalog_textures.py`), thảm hổ có hình in
- [x] Lưới 10 cm trên tường đang chọn, kéo theo lưới, hiển thị độ cao tâm / mép dưới / mép trên
- [x] Tự tìm chỗ trống khi treo, đồ lùi ra trước lớp ốp lam / phào chỉ; cảnh báo che cửa, chồng thiết bị, tràn tường

**Tiếp theo:** v4 ánh sáng + camera tầm mắt → v5 chuốt (GLTF, path tracer).

### Future improvements

- Máy nhà chạy dev server, truy cập từ Tab/Mac qua Tailscale.
- Server nhỏ lưu cảnh thành file trong repo để đồng bộ giữa các thiết bị.
- Danh sách mua sắm + tổng chi phí theo phương án.
