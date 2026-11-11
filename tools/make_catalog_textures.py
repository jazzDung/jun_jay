"""
Tạo ảnh texture cho các món catalog có hình in / mặt trang trí:
  - cắt + nắn phẳng (perspective) tranh / poster / thảm từ ảnh chụp trong ref/objects,
  - vẽ lại bằng code những món hình học đơn giản (tranh ô vuông đồng tâm, mặt đồng hồ,
    tấm inox xước, pegboard) — sắc nét hơn ảnh chụp nghiêng.
Kết quả: public/images/catalog/<id>.jpg (id trùng id trong catalog.json).

Chạy:  python tools/make_catalog_textures.py ref/objects public/images/catalog
"""
from __future__ import annotations

import math
import random
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

# ảnh nguồn, 4 góc (trái-trên, phải-trên, phải-dưới, trái-dưới) theo pixel, kích thước ra
QUADS = {
    "poster_karma_cat": (
        "blue_square_art_100x100cm__karma_cat_poster_30x40cm__mosaic_table__plants.png",
        [(1270, 112), (1527, 72), (1500, 588), (1222, 562)],
        (600, 800),
    ),
    # phần dưới bị máy tính bảng che → chỉ lấy phần trên
    "art_flower_pink": (
        "pegboard_40x60cm_x2__flower_art__torch_lamp__desk_chair.png",
        [(310, 1150), (588, 1129), (588, 1330), (310, 1335)],
        (840, 600),
    ),
    "art_flower_blue": (
        "pegboard_40x60cm_x2__flower_art__torch_lamp__desk_chair.png",
        [(602, 1046), (791, 1046), (791, 1393), (602, 1394)],
        (600, 840),
    ),
    "art_flower_cream": (
        "pegboard_40x60cm_x2__flower_art__torch_lamp__desk_chair.png",
        [(817, 1221), (1018, 1226), (1018, 1393), (817, 1387)],
        (840, 600),
    ),
    "art_flower_green": (
        "pegboard_40x60cm_x2__flower_art__torch_lamp__desk_chair.png",
        [(423, 1370), (594, 1346), (602, 1442), (434, 1455)],
        (840, 600),
    ),
    "tiger_rug": ("tiger_rug_140x200cm.png", [(213, 228), (782, 238), (800, 800), (0, 800)], (700, 1000)),
}


def warp(src: Image.Image, quad: list[tuple[int, int]], size: tuple[int, int]) -> Image.Image:
    # PIL QUAD: 8 số = góc trái-trên, trái-dưới, phải-dưới, phải-trên của vùng nguồn
    tl, tr, br, bl = quad
    data = [*tl, *bl, *br, *tr]
    return src.transform(size, Image.QUAD, data, resample=Image.BICUBIC)


def blue_squares(size: int = 1000) -> Image.Image:
    """Tranh ô vuông đồng tâm: xanh nhạt ở giữa → navy đậm ra ngoài."""
    im = Image.new("RGB", (size, size))
    d = ImageDraw.Draw(im)
    steps = 9
    c0 = (14, 22, 66)  # navy ngoài cùng
    c1 = (150, 185, 235)  # xanh nhạt trong cùng
    for i in range(steps):
        t = i / (steps - 1)
        col = tuple(int(a + (b - a) * t) for a, b in zip(c0, c1))
        m = int(size * 0.5 * i / steps)
        # lệch nhẹ lên trên như bản gốc
        d.rectangle([m, m * 0.85, size - m, size - m * 1.12], fill=col)
    return im


def clock_face(size: int = 1024) -> Image.Image:
    """Mặt đồng hồ: nền trắng ngà, số đen mảnh, chấm phút, cỏ 4 lá xanh cobalt ở giữa."""
    im = Image.new("RGB", (size, size), (245, 243, 238))
    d = ImageDraw.Draw(im)
    c = size / 2
    try:
        font = ImageFont.truetype("arial.ttf", int(size * 0.11))
    except OSError:
        font = ImageFont.load_default()
    # cỏ 4 lá
    r = size * 0.13
    for a in range(4):
        ang = a * math.pi / 2 + math.pi / 4
        x = c + math.cos(ang) * r * 0.95
        y = c + math.sin(ang) * r * 0.95
        d.ellipse([x - r, y - r, x + r, y + r], fill=(31, 47, 208))
    # chấm phút
    for i in range(60):
        ang = i / 60 * 2 * math.pi
        rr = size * 0.455
        x, y = c + math.sin(ang) * rr, c - math.cos(ang) * rr
        s = size * (0.008 if i % 5 else 0.012)
        d.ellipse([x - s, y - s, x + s, y + s], fill=(25, 25, 25))
    # số
    for n in range(1, 13):
        ang = n / 12 * 2 * math.pi
        rr = size * 0.36
        x, y = c + math.sin(ang) * rr, c - math.cos(ang) * rr
        d.text((x, y), str(n), fill=(20, 20, 20), font=font, anchor="mm")
    # kim (10:10)
    for ang, length, width in ((math.radians(-60), 0.24, 14), (math.radians(60), 0.34, 9)):
        d.line([c, c, c + math.sin(ang) * size * length, c - math.cos(ang) * size * length], fill=(15, 15, 15), width=width)
    d.ellipse([c - 12, c - 12, c + 12, c + 12], fill=(190, 150, 60))
    return im


def brushed_steel(w: int = 600, h: int = 600) -> Image.Image:
    rnd = random.Random(5)
    im = Image.new("L", (w, h), 178)
    d = ImageDraw.Draw(im)
    for _ in range(2200):
        y = rnd.uniform(0, h)
        v = int(rnd.gauss(178, 16))
        d.line([0, y, w, y + rnd.uniform(-2, 2)], fill=max(120, min(235, v)), width=1)
    im = im.filter(ImageFilter.GaussianBlur(0.6))
    # vệt phản chiếu sáng chéo
    glow = Image.new("L", (w, h), 0)
    gd = ImageDraw.Draw(glow)
    gd.polygon([(0, h * 0.35), (w, h * 0.15), (w, h * 0.3), (0, h * 0.5)], fill=40)
    im = Image.composite(Image.new("L", (w, h), 230), im, glow.filter(ImageFilter.GaussianBlur(40)))
    return Image.merge("RGB", (im, im, im.point(lambda p: min(255, p + 6))))


def pegboard(w: int = 900, h: int = 600) -> Image.Image:
    """Pegboard trắng 60 × 40 cm, lỗ ô van dọc so le (kiểu SKÅDIS)."""
    im = Image.new("RGB", (w, h), (242, 242, 240))
    d = ImageDraw.Draw(im)
    px = w / 60  # px / cm
    for row, y in enumerate(range(int(3 * px), h, int(4 * px))):
        off = 2 * px if row % 2 else 0
        x = 3 * px + off
        while x < w - 2 * px:
            d.rounded_rectangle([x - 0.25 * px, y - 1.0 * px, x + 0.25 * px, y + 1.0 * px], radius=0.25 * px, fill=(70, 70, 70))
            x += 4 * px
    return im


GENERATED = {
    "art_blue_squares": blue_squares,
    "clock_clover": clock_face,
    "magnet_steel_30": brushed_steel,
    "pegboard_60x40": pegboard,
}


def main() -> None:
    src_dir = Path(sys.argv[1] if len(sys.argv) > 1 else "ref/objects")
    out_dir = Path(sys.argv[2] if len(sys.argv) > 2 else "public/images/catalog")
    out_dir.mkdir(parents=True, exist_ok=True)
    for tex_id, (name, quad, size) in QUADS.items():
        p = src_dir / name
        if not p.exists():
            print(f"! bỏ qua {tex_id}: thiếu {name}", file=sys.stderr)
            continue
        warp(Image.open(p).convert("RGB"), quad, size).save(out_dir / f"{tex_id}.jpg", quality=88)
        print(f"✓ {tex_id} ← {name}")
    for tex_id, fn in GENERATED.items():
        fn().save(out_dir / f"{tex_id}.jpg", quality=90)
        print(f"✓ {tex_id} (vẽ bằng code)")


if __name__ == "__main__":
    main()
