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
- [ ] Lát 5 — Export for AI (bộ ảnh góc nhìn + prompt cho Gemini), deploy

### Future improvements

- Máy nhà chạy dev server, truy cập từ Tab/Mac qua Tailscale.
- Server nhỏ lưu cảnh thành file trong repo để đồng bộ giữa các thiết bị.
- Danh sách mua sắm + tổng chi phí theo phương án.
