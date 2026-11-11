"""
Tạo texture vân gỗ cho tấm lam sóng từ ảnh chụp mẫu (ref/wood_panel/*.png).

Ảnh mẫu: một tấm lam sóng nằm dọc trên tấm nền trắng, chụp chéo (gần to, xa nhỏ).
Các bước:
  1. Mỗi hàng ảnh: từ cột giữa, loang sang trái/phải để tìm mép tấm (pixel không trắng).
  2. Nắn phẳng: kéo mỗi hàng [mép trái, mép phải] về cùng bề rộng → khử phối cảnh ngang.
  3. Bỏ rãnh: tìm các mặt sóng (dải cột sáng) và ghép các mặt sóng cạnh nhau, để
     rãnh/bóng do app tự dựng bằng hình khối 3D thay vì bị "in" sẵn trong ảnh.
  4. Khử chênh sáng do đèn chụp (chia cho bản làm mờ) → texture đều màu, lặp được.
  5. Ghi public/textures/lam/<id>.jpg và in ra màu trung bình + kích thước thật của
     một ô texture để điền vào public/data/panels.json.

Chạy:  python tools/make_panel_textures.py ref/wood_panel public/textures/lam
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

# ảnh nguồn → id texture. Ảnh nào không có trong bảng sẽ bị bỏ qua.
SOURCES = {
    "img.png": "lam_teak",
    "img_1.png": "lam_oak_red",
    "img_2.png": "lam_ash_gray",
    "img_3.png": "lam_oak_gold",
    "img_4.png": "lam_white",
    "img_5.png": "lam_beech",
}
PLANK_WIDTH_CM = 20.4  # bề rộng tấm thật (thông số phổ biến, TODO xác nhận với bên thi công)
OUT_W, OUT_H = 512, 1024
WHITE_LUMA = 205  # pixel sáng hơn mức này và ít màu → coi là nền trắng
MAX_GAP = 8  # cho phép bấy nhiêu pixel "trắng" liên tiếp (vệt sáng mép sóng) khi loang


def is_background(px: np.ndarray) -> np.ndarray:
    luma = px.mean(axis=-1)
    sat = px.max(axis=-1) - px.min(axis=-1)
    return (luma > WHITE_LUMA) & (sat < 28)


def find_edges(img: np.ndarray) -> list[tuple[int, int, int]]:
    """Trả về [(hàng, mép trái, mép phải)] cho các hàng có tấm."""
    h, w, _ = img.shape
    bg = is_background(img.astype(np.int32))
    cx = w // 2
    rows = []
    for y in range(h):
        if bg[y, cx]:
            continue

        def grow(step: int) -> int:
            x, gap, last = cx, 0, cx
            while 0 < x < w - 1:
                x += step
                if bg[y, x]:
                    gap += 1
                    if gap > MAX_GAP:
                        break
                else:
                    gap, last = 0, x
            return last

        left, right = grow(-1), grow(1)
        if right - left > w * 0.08:
            rows.append((y, left, right))
    return rows


def rectify(img: np.ndarray, rows: list[tuple[int, int, int]], width: int) -> np.ndarray:
    """Khớp mép trái/phải thành đường thẳng theo y (phối cảnh là tuyến tính) rồi kéo mỗi
    hàng về cùng bề rộng; thu vào 4% mỗi bên để bỏ viền nền."""
    ys = np.array([r[0] for r in rows], dtype=np.float64)
    fit_l = np.polyfit(ys, [r[1] for r in rows], 1)
    fit_r = np.polyfit(ys, [r[2] for r in rows], 1)
    out = np.zeros((len(rows), width, 3), dtype=np.float32)
    cols = np.arange(img.shape[1])
    for i, (y, _, _) in enumerate(rows):
        l, r = np.polyval(fit_l, y), np.polyval(fit_r, y)
        inset = (r - l) * 0.04
        src = np.linspace(l + inset, r - inset, width)
        for c in range(3):
            out[i, :, c] = np.interp(src, cols, img[y, :, c].astype(np.float32))
    return out


def ridge_faces(strip: np.ndarray, ridges: int = 5) -> np.ndarray:
    """Tìm rãnh (cực tiểu độ sáng theo cột), lấy phần giữa của từng mặt sóng giữa các rãnh
    (bỏ vệt sáng mép sóng và bóng trong rãnh) rồi ghép cạnh nhau."""
    w = strip.shape[1]
    luma = np.convolve(strip.mean(axis=(0, 2)), np.ones(3) / 3, mode="same")
    pitch = w / ridges
    # rãnh: cực tiểu sâu nhất trong mỗi cửa sổ quanh ranh giới dự kiến giữa 2 sóng
    grooves = []
    for k in range(1, ridges):
        a, b = int((k - 0.4) * pitch), int((k + 0.4) * pitch)
        grooves.append(a + int(np.argmin(luma[a:b])))
    bounds = [0, *grooves, w]
    faces = []
    for a, b in zip(bounds[:-1], bounds[1:]):
        trim = int((b - a) * 0.22)
        faces.append(strip[:, a + trim : b - trim])
    return np.concatenate(faces, axis=1)


def flatten_lighting(img: np.ndarray) -> np.ndarray:
    """Chia cho bản làm mờ mạnh để khử chênh sáng, giữ màu trung bình."""
    pil = Image.fromarray(np.clip(img, 0, 255).astype(np.uint8))
    blur = np.asarray(pil.filter(ImageFilter.GaussianBlur(radius=max(img.shape[:2]) // 6)), dtype=np.float32)
    mean = img.reshape(-1, 3).mean(axis=0)
    return img / np.maximum(blur, 1) * mean


def process(path: Path, out_dir: Path, tex_id: str) -> dict:
    img = np.asarray(Image.open(path).convert("RGB"))
    rows = find_edges(img)
    if len(rows) < img.shape[0] * 0.3:
        raise RuntimeError("không tìm thấy tấm lam trong ảnh")
    # bỏ 1/3 trên (xa, méo nhiều) và 10% cuối (đầu tấm lộ lõi nhựa)
    rows = rows[len(rows) // 3 : int(len(rows) * 0.9)]
    widths = [r - l for _, l, r in rows]
    px_per_cm = float(np.median(widths)) / PLANK_WIDTH_CM
    strip = rectify(img, rows, int(np.median(widths)))
    faces = ridge_faces(strip)
    faces = flatten_lighting(faces)
    tex = Image.fromarray(np.clip(faces, 0, 255).astype(np.uint8)).resize((OUT_W, OUT_H), Image.LANCZOS)
    out_dir.mkdir(parents=True, exist_ok=True)
    out = out_dir / f"{tex_id}.jpg"
    tex.save(out, quality=88)
    avg = np.asarray(tex, dtype=np.float32).reshape(-1, 3).mean(axis=0)
    return {
        "id": tex_id,
        "file": f"textures/lam/{tex_id}.jpg",
        "color": "#{:02X}{:02X}{:02X}".format(*[int(round(v)) for v in avg]),
        # kích thước thật (cm) mà một ô texture phủ
        "period": {"w": round(faces.shape[1] / px_per_cm, 1), "h": round(faces.shape[0] / px_per_cm, 1)},
    }


def main() -> None:
    src_dir = Path(sys.argv[1] if len(sys.argv) > 1 else "ref/wood_panel")
    out_dir = Path(sys.argv[2] if len(sys.argv) > 2 else "public/textures/lam")
    results = []
    for name, tex_id in SOURCES.items():
        p = src_dir / name
        if not p.exists():
            print(f"! bỏ qua {name}: không có file", file=sys.stderr)
            continue
        try:
            info = process(p, out_dir, tex_id)
            results.append(info)
            print(f"✓ {name} → {info['file']}  màu {info['color']}  ô {info['period']['w']}×{info['period']['h']} cm")
        except Exception as e:  # noqa: BLE001
            print(f"✗ {name}: {e}", file=sys.stderr)
    print(json.dumps(results, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
