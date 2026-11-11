# Handoff: Jun Jẩy Cafe Planner (3D)

> Đây là brief khởi tạo dự án cho Claude Code. Đọc hết file trước khi code. Mọi số đo có đánh dấu **(TODO đo)** là số ước lượng — đặt chúng trong file cấu hình để chủ quán sửa sau, không hard-code.

## 1. Bối cảnh

- Chủ dự án: Jazz (data engineer, code Python chính, đọc được TS/JS).
- Dự án: quán cà phê nhỏ **Jun Jẩy**, tầng trên một chung cư cũ ở 89 Nguyễn Du, Q1, TP.HCM.
- Concept: biến quán thành **một phòng khách lớn**, ấm, nhiều màu (tinh thần ảnh editorial của Paul Hempstead + chút Bauhaus): gỗ thông ngả cam, xanh cobalt, cam/đỏ gạch, kem ấm, đèn vàng hắt. Tái sử dụng nhiều đồ trưng bày từ nhà Jazz.
- Khách mục tiêu: sinh viên / freelancer ngồi lâu. Quán chia 2 khu: **phòng khách thấp** (0–4m, cạnh cửa sổ) và **khu làm việc** bàn cao (4–8m).
- Mục đích app: thử bố cục, màu tường, ốp pano vân gỗ, nội thất, đồ treo tường và ánh sáng **đúng tỉ lệ thật**, trước khi mua sắm/thi công.

## 2. Yêu cầu chức năng

1. **Màu tường:** chọn từng mảng tường riêng, đổi màu bằng color wheel hoặc nhập mã hex.
2. **Ốp pano giả vân gỗ:** ốp lên từng mảng tường; chọn loại vân, màu gỗ, bản rộng ván, có/không rãnh V, ốp kín hoặc ốp lửng (chiều cao tuỳ chỉnh).
3. **Đồ đặt sàn:** catalog ở sidebar; thêm/xoá/kéo/xoay bàn ghế, sofa, thảm, kệ, đồ trưng bày trên sàn. Kích thước **đúng tỉ lệ thật (cm)**.
4. **Đồ treo tường:** catalog ở sidebar; treo tranh, vải, kệ, đồng hồ… lên tường theo **grid**. Kích thước đúng tỉ lệ thật.
5. **Ánh sáng (optional nhưng mong muốn):** đèn với nhiệt độ màu và độ sáng chỉnh được; chế độ ngày/đêm.

Ưu tiên xuyên suốt: **dễ thêm bớt nội thất, đèn, tinh chỉnh quán** → catalog và cảnh là dữ liệu JSON, không nằm trong code.

## 3. Tech stack đề xuất

- Vite + TypeScript + Three.js (`OrbitControls`, `TransformControls` hoặc kéo thả tự viết, `RectAreaLight` cho dải LED, `GLTFExporter` cho v5).
- UI: HTML/CSS thuần (hoặc Preact nếu thấy cần), sidebar trái = catalog, panel phải = thuộc tính đối tượng đang chọn. Dùng `<input type="color">` + ô text hex.
- Không backend. Lưu bằng `localStorage` (autosave) + Export/Import JSON + xuất ảnh PNG.
- Deploy tĩnh: GitHub Pages hoặc Vercel.
- **Thiết bị mục tiêu:** desktop + Galaxy Tab S9 (chế độ DeX) + điện thoại → hỗ trợ cả chuột và cảm ứng; bóng đổ có nút bật/tắt để giữ hiệu năng.

## 4. Hệ toạ độ và đơn vị

- Dữ liệu lưu bằng **cm**. Trong scene Three.js dùng mét (scale 0.01) — chọn một quy ước và giữ nhất quán.
- Gốc toạ độ: góc trước–trái (giao tường cửa sổ và tường trên).
  - Trục **x**: theo chiều dài quán, 0 (tường cửa sổ) → 950 (tường sau cùng).
  - Trục **z**: theo chiều ngang, 0 ("tường trên") → 400 ("tường dưới").
  - Trục **y**: chiều cao, 0 = sàn.

## 5. Mặt bằng (đã chốt với chủ quán)

```
x: 0 ─────────────── 800 ──── 950
z=0   ┌────────────────────┬──────┐
      │                    │  WC  │ z 0–100
      │  Không gian chính  ├──────┤
      │  4 × 8 m (32 m²)   │ Pha  │ z 100–300
      │                    │ chế  │
      │                    ├──────┤
      │                    │ Lối  │ z 300–400  ← cửa vào ở tường x=950
z=400 └────────────────────┴──────┘
   ↑ cửa sổ phủ hết tường x=0
```

- **Không gian chính:** x 0–800, z 0–400.
- **Dải phía sau** (sâu 150 cm, x 800–950):
  - WC: z 0–100. Cửa WC trên mặt x=800, rộng ~70 cm **(TODO đo)**, bản lề ở góc z=0, **mở ra không gian chính, cánh áp vào tường trên** (z=0). Vùng quét cửa ~70×70 cm phải để trống.
  - Phòng pha chế: z 100–300 (hiện là bếp cũ, ảnh `ref/space/img_2.png`). Mặt x=800 hiện là tường đặc; **sẽ đập một ô chữ nhật** thông ra không gian chính (ô giao đồ / quầy). Vị trí, bề rộng, cao bậu, chiều cao ô **(TODO)** — mặc định z 130–270, bậu 90, cao 100. **Cửa vào phòng pha chế nằm trên mặt z=300**, mở ra hành lang lối vào **(TODO vị trí, rộng ~70)**.
  - Lối vào / hành lang: z 300–400, chạy song song với phòng pha chế từ **cửa ra vào** trên tường x=950 (rộng 100 cm) tới ô cửa mở thông ra không gian chính ở x=800 (ô có khung cửa, rộng ~85 **(TODO đo)**).
- **Cửa sổ (tường x=0)** — theo ảnh `ref/space/img_1.png`:
  - Dưới bậu: ốp **PVC trắng rãnh dọc**, cao ~90 **(TODO đo)**.
  - Kính: từ ~90 tới ~200 **(TODO đo)**, 2 cụm cửa kéo; cụm trái 2 cánh trơn, cụm phải 2 cánh chia 4 ô.
  - Trên kính: dải tường sơn xanh đậm, có **máy lạnh Daikin** (~80 × 28, sâu 20) lệch trái; ống đồng bọc trắng chạy dọc mép trái xuống sàn.
  - Hai mảng tường bên ngay cạnh cửa sổ (đầu tường trên/dưới, sâu ~50 **(TODO)**) ốp **PVC trắng sọc ngang**.
- **Trần:** trần thả tấm **60 × 60**, 3 hàng đèn downlight âm trần, đèn tuýp chạy dọc 2 tường dài sát trần. Gần cửa sổ có dầm/bậc trần **(TODO đo)**. Chiều cao trần 260 **(TODO đo, khoảng 250–280)**. Trần thấp là một ràng buộc thiết kế quan trọng.
- **Tường hiện tại:** xanh xám ngả sage, mặc định `#9DB4AA` **(TODO lấy mã thật)**. Tường trên, tường dưới, tường sau đều có **phào chỉ khung tranh** (hàng ô lớn phía trên, hàng ô thấp phía dưới, chân tường ~10). Dựng phào dưới dạng dữ liệu cho từng tường, có thể ẩn khi ốp pano.
- **Sàn:** vinyl vân sồi xám-be, ván chạy dọc theo trục x.
- Ổ điện / công tắc: thấy trong ảnh ở chân tường trên, tường dưới, tường sau **(TODO vị trí chính xác)** — đặt như đồ treo tường.

### Các mảng tường (wall surfaces) cần chọn được riêng

| id | Mô tả | Kích thước |
|---|---|---|
| `wall_window` | Tường cửa sổ x=0 (phần đặc quanh khung kính, nếu có) | 400 × trần |
| `wall_top` | Tường trên z=0, x 0–800 | 800 × trần |
| `wall_bottom` | Tường dưới z=400, x 0–800 | 800 × trần |
| `wall_back_wc` | Mặt x=800 của WC (trừ ô cửa) | 100 × trần |
| `wall_back_bar` | Mặt x=800 của phòng pha chế (trừ ô thông chữ nhật) | 200 × trần |
| `ceiling` | Trần (cho phép đổi màu) | — |
| `floor` | Sàn (chọn màu/vật liệu đơn giản) | — |

WC, phòng pha chế và lối vào chỉ cần dựng khối + ô cửa (không cần nội thất bên trong ở v1).

## 6. Mô hình dữ liệu

Ba file JSON trong `src/data/` (hoặc `public/data/`), nạp lúc khởi động; scene người dùng tạo được lưu/đọc bằng cùng định dạng.

### `room.json`
```json
{
  "units": "cm",
  "ceilingHeight": 270,
  "walls": [
    { "id": "wall_top", "from": [0, 0], "to": [800, 0], "color": "#CFE0E6",
      "panel": null }
  ],
  "openings": [
    { "id": "door_wc", "wall": "x800", "z": [0, 70], "height": 200, "type": "door",
      "swing": { "hinge": [800, 0], "opensInto": "main", "radius": 70 } },
    { "id": "window_front", "wall": "x0", "z": [0, 400], "sill": 0, "height": 220, "type": "window" }
  ]
}
```

### `panel` (ốp pano trên một mảng tường)
```json
{
  "grain": "pine_knotty",
  "tone": "#C9813F",
  "plankWidth": 15,
  "vGroove": true,
  "finish": "matte",
  "coverage": "full",
  "wainscotHeight": 120
}
```
- `grain`: `pine_knotty` | `pine_clear` | `oak` | `walnut` | `slat` (lam sóng nổi 3D).
- **Vật liệu thật sẽ dùng: tấm lam sóng PVC 5 sóng** (ảnh `ref/wood_panel/`), 6 màu: teak, sồi đỏ nâu, xám tro, sồi vàng, trắng, beech/mật ong. Bản rộng, độ dày, chiều dài tấm **(TODO hỏi bên thi công)**. Texture lấy từ chính ảnh chụp (script Python trong `tools/` cắt + nắn phẳng + làm liền mạch), biên dạng sóng dựng bằng geometry thật.
- `coverage`: `full` | `wainscot` (dùng `wainscotHeight`).
- Vân gỗ **tạo bằng code** (canvas texture từ noise + mắt gỗ), đổi tham số là cập nhật ngay. Ván **dọc**. `slat` dựng bằng geometry thật để có bóng đổ.

### `catalog.json`
```json
{
  "id": "sofa_low_240",
  "name": "Sofa thấp 2.4m",
  "category": "seating",
  "mount": "floor",
  "size": { "w": 240, "d": 85, "h": 70 },
  "seatHeight": 40,
  "color": "#B5462E",
  "shape": "sofa",
  "owned": false,
  "notes": ""
}
```
- `mount`: `floor` | `wall` | `ceiling`.
- `shape`: chọn từ bộ hình khối dựng sẵn (box, sofa, chair, stool, table_round, table_oval, rug, frame, clock, panel, shelf, lamp…), v5 có thể thêm `model: "path/to.glb"`.
- `owned: true` = đồ Jazz đang có ở nhà (hiển thị badge riêng trong catalog).

### `scene.json`
```json
{
  "version": 1,
  "room": { "...ghi đè màu/pano từng tường..." : "" },
  "items": [
    { "uid": "a1", "catalogId": "sofa_low_240", "x": 92, "z": 42, "rot": 0 },
    { "uid": "b7", "catalogId": "art_blue_square", "wall": "wall_bottom", "u": 120, "v": 150 }
  ],
  "lights": [
    { "uid": "l1", "type": "led_strip", "wall": "wall_top", "kelvin": 2700, "intensity": 0.8 }
  ]
}
```
- Đồ sàn: `x`, `z` = tâm vật (cm), `rot` = độ.
- Đồ tường: `u` = vị trí ngang dọc theo tường (cm), `v` = độ cao tâm vật tính từ sàn (cm).

## 7. Catalog khởi tạo

Tất cả là số **ước lượng (TODO đo)**, đánh dấu đồ đang có bằng `owned: true`.

**Đồ đặt sàn**
| Món | w × d × h (cm) | Ghi chú |
|---|---|---|
| Sofa thấp | 240 × 85 × 70 | ngồi cao 40 |
| Ghế bành thấp | 75 × 75 × 70 | |
| Băng ngồi cửa sổ có đệm | 400 × 45 × 40 | khách tựa lưng vào kính |
| Ghế booth lưng thấp | 200 × 60 × 80 | ngồi cao 40, bọc da PU |
| Bàn trà oval | 100 × 55 × 40 | owned (bàn gỗ oval ở nhà) |
| Đệm ngồi bệt | Ø45 × 12 | |
| Thảm hổ nền đỏ | 140 × 200 × 1 | owned, `ref/objects/tiger_rug_140x200cm.png` (in hoạ tiết làm texture) |
| Thảm chữ nhật | 200 × 300 × 1 | |
| Tủ thấp trưng bày | 180 × 40 × 55 | |
| Bàn làm việc vuông | 60 × 60 × 75 | |
| Ghế ăn/làm việc | 45 × 50 × 80 | ngồi cao 45 |
| Băng ghế tường | 150 × 45 × 45 | |
| Counter cao | 200 × 45 × 105 | |
| Ghế stool quầy | Ø35 × 75 | |
| Ghế stool thấp | Ø32 × 45 | |
| Quầy order | 120 × 60 × 100 | |
| Tủ mát đứng | 60 × 60 × 190 | bán đồ đóng chai giai đoạn đầu |
| Kệ giày | 80 × 30 × 40 | nếu cho khách cởi giày ở khu thảm |
| Đèn sàn | Ø30 × 150 | |
| Chậu cây | Ø40 × 90 | |
| Xe đẩy thép 3 tầng xanh lá | 55 × 30 × 50 | owned, `trolley_green_55x30x50cm.png` |
| Xe đẩy thép 3 tầng đỏ | 67 × 37 × 65 | owned, `trolley_red_67x37x65cm.png` |
| Đèn bút bi BIC (ống LED, nắp xanh) | dài 150, Ø~8 | owned, là đèn; đặt dựng nghiêng sát tường **hoặc** treo ngang bằng dây (`bic_pen_lamp_L150cm.png`) |
| Hộp đèn mica sóng xanh lá | 25 × 25 × 25 | owned, là đèn (xanh lá) |
| Đèn lồng giấy trắng tròn | Ø~35 (TODO) | owned, là đèn, treo trần |
| Đèn chiếu gợn nước (xanh ngọc) | ~10 × 10 × 15 (TODO) | owned, là đèn |
| Đèn đuốc lục giác đỏ (treo tường) | ~12 × 40 (TODO) | owned, là đèn, treo tường |
| Bàn/kệ thấp mặt gạch mosaic nâu đỏ | ~100 × 35 × 45 (TODO) | owned |
| Giỏ cói + đôn gỗ (chậu cây) | Ø~35 × 70 (TODO) | owned |
| Chậu cây lá lớn (sứ trắng) | Ø~25 × 60 (TODO) | owned |
| Bình hoa / cây trang trí các loại | — (TODO) | owned, nhóm đồ nhỏ |
| Bàn làm việc gỗ tối chân sắt đen | ~120 × 60 × 75 (TODO) | owned |
| Ghế công thái học trắng | ~65 × 65 × 120 (TODO) | owned |

**Đồ treo tường**
| Món | w × h (cm) | Ghi chú |
|---|---|---|
| Tranh vuông xanh (ô vuông đồng tâm) | 100 × 100 | owned, ảnh làm texture |
| Tranh hoa kiểu cắt giấy (hồng/xanh/kem/xanh lá) | 50 × 70 (TODO) | ×4 — trong ảnh đang là hình nền màn hình, chưa chắc có bản in |
| Poster "karma is a cat" (nền đỏ, mèo đen, khung gỗ) | 30 × 40 | owned |
| Đồng hồ cỏ ba lá xanh cobalt, viền đen | Ø30 | owned |
| Tấm inox nam châm | 30 × 30 | owned, ×6 |
| Pegboard trắng (+ đàn phím MIDI, tai nghe) | 60 × 40 | owned, ×2 (ảnh cho thấy đặt ngang, ghép cạnh nhau) |
| Kệ treo | 80 × 20 | sâu 20 |
| Vải treo / tapestry | 100 × 150 | |
| Đèn tường tròn cam | Ø25 | là đèn (xem mục 9) |
| Máy lạnh | 80 × 28 | sâu 20 |

## 8. Tương tác

- **Chọn:** chạm/click vào tường, đồ vật, đèn → panel thuộc tính bên phải.
- **Đồ sàn:** kéo thả trên mặt sàn, bắt lưới 5 cm (bật/tắt); xoay 90° và xoay tự do (bước 15°); nhân bản; xoá.
- **Đồ tường:** khi chọn một tường thì hiện lưới 10 cm trên tường; kéo vật theo lưới; hiển thị độ cao tâm vật so với sàn.
- **Hiển thị kích thước** của vật đang chọn và khoảng cách tới tường gần nhất.
- **Cảnh báo:** vật chồng lấn (AABB); lối đi chính < 80 cm; vật nằm trong vùng quét cửa WC.
- **Undo/redo** (nên có từ v2).
- Hỗ trợ cảm ứng: kéo 1 ngón = di chuyển vật, 2 ngón = xoay/zoom camera.

## 9. Ánh sáng

- Loại đèn: bóng đèn trần (point), đèn lồng giấy (point + mesh cầu phát sáng), đèn tường tròn (spot/point), dải LED hắt (RectAreaLight hoặc chuỗi point light), đèn bàn/đèn sàn.
- Thuộc tính: `kelvin` 2200–6500 (hàm chuyển Kelvin → RGB), `intensity`, bật/tắt.
- **Ngày/đêm:** ngày = ánh sáng trời qua cửa sổ x=0 (directional + hemisphere); đêm = chỉ đèn trong quán + ambient rất thấp.
- Tone mapping ACES, sRGB output. Bóng đổ bật/tắt được.

## 10. Camera

- **Top-down** (orthographic) để xếp đồ.
- **Orbit** tự do.
- **Tầm mắt**: người ngồi (110 cm) và người đứng (160 cm), đi lại bằng phím/joystick ảo — để kiểm tra góc chụp ảnh.
- Nút xuất ảnh PNG từ góc nhìn hiện tại.

## 11. Lộ trình

Mỗi bản phải chạy được và deploy được để chủ quán dùng thử trên tablet.

- **v1 — Phòng:** dựng mặt bằng mục 5 đúng kích thước, cửa sổ, các ô cửa, vùng quét cửa WC; chọn từng mảng tường → đổi màu (wheel + hex); ốp pano với đủ tham số mục 6; camera top-down + orbit; autosave + export/import JSON.
- **v2 — Đồ sàn:** catalog sidebar (lọc theo category, badge `owned`), kéo/xoay/nhân bản/xoá, snap, kích thước, cảnh báo, undo/redo.
- **v3 — Đồ tường:** lưới trên tường, catalog đồ tường, kéo theo lưới, hiển thị độ cao.
- **v4 — Ánh sáng:** các loại đèn mục 9, Kelvin, ngày/đêm, camera tầm mắt, xuất PNG.
- **v5 — Chuốt:** hình khối chi tiết hơn cho đồ, hỗ trợ `model` GLTF, `GLTFExporter` để sang Blender render ảnh đẹp, preset bố cục.

### Bổ sung đã chốt (2026-11-11)

- **Hosting:** repo GitHub cá nhân (public), deploy GitHub Pages. Mỗi thiết bị lưu `localStorage` riêng + Export/Import JSON + nút **Share link** (nén cảnh vào URL hash).
- **Chất lượng hình:** mục tiêu ngang Sweet Home 3D, ưu tiên texture và ánh sáng. Real-time: PBR + texture từ ảnh thật, ACES, SSAO, bloom, env map, preset chất lượng (Tab = Medium, Mac = High). Ảnh tĩnh: nút "Render đẹp" bằng `three-gpu-pathtracer`.
- **Export for AI:** một nút xuất `.zip` gồm bộ ảnh các góc nhìn cố định (top-down có nhãn kích thước, từ cửa vào, ra cửa sổ, 2 góc chéo, tầm mắt ngồi ở 2 khu), `prompt.md` sinh tự động (phòng, vật liệu, từng món: kích thước/màu/chất liệu/vị trí bằng số và bằng câu, đèn, phong cách, chỉ dẫn giữ bố cục), ảnh thật của đồ owned, và `scene.json`. Có từ v1 (phòng trống), đầy dần theo các bản sau.
- **Phong cách tham chiếu** (`ref/inspiration/`): tường lam gỗ teak, booth da đất nung, ghế ống chrome đệm da bò, đèn lồng giấy vàng, đèn tường tròn cam, gạch thẻ xanh rêu, kệ ô có LED hắt.
- `ref/` không commit (ảnh nhà riêng, có người); chỉ commit texture/ảnh đã xử lý mà app cần.

### Future improvements

- Lớp 2: máy Windows ở nhà chạy dev server, truy cập từ Tab/Mac qua Tailscale (`tailscale serve` cho HTTPS).
- Lớp 3: server Node nhỏ lưu cảnh thành file `scenes/*.json` trong repo để đồng bộ giữa các thiết bị.
- Danh sách mua sắm + tổng chi phí theo phương án (từ `source.price` trong catalog).

## 12. Ngoài phạm vi

- Không cần render chân thực như ảnh chụp (real-time stylized là đủ; ảnh đẹp sẽ làm bằng Blender ở v5).
- Không cần đăng nhập, backend, nhiều người cùng sửa.

## 13. Cần chủ quán cung cấp (TODO)

1. Chiều cao trần chính xác.
2. Cửa sổ: cao bậu, chiều cao kính, khung chia ô.
3. Bề rộng cửa vào, 2 cửa phòng pha chế, cửa WC (và vị trí chính xác của 2 cửa pha chế).
4. Vị trí máy lạnh, ổ điện, công tắc.
5. Kích thước thật các món `owned` (thảm hổ, tranh, tấm inox, pegboard, bàn trà, xe đẩy).
6. Mã màu tường hiện tại.
7. Thông số tấm lam sóng (bản rộng, dày, dài) — hỏi bên thi công.
8. Ô thông chữ nhật phòng pha chế: vị trí, rộng, cao bậu, cao ô; vị trí + bề rộng cửa phòng pha chế trên mặt z=300.
9. Kích thước các món owned còn ghi TODO ở mục 7 (đèn lồng, bàn mosaic, bàn làm việc, ghế…).

## 14. Cách làm việc

- Bắt đầu bằng việc scaffold repo + v1, rồi dừng lại để chủ quán kiểm tra trước khi sang v2.
- Giữ catalog/room/scene là dữ liệu; thêm một món mới vào catalog không được phải sửa code.
- Viết README ngắn: cách chạy local, cách thêm món vào catalog, cách deploy.