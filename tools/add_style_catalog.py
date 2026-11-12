"""
Thêm các món phong cách Bauhaus / phương Đông vào public/data/catalog.json (chạy một lần;
chạy lại sẽ bỏ qua món đã có). Số đo lấy từ trang nhà bán / bảo tàng ghi ở `source.url`;
món không có nguồn là kích thước phổ biến của loại đồ đó.

Chạy:  python tools/add_style_catalog.py
"""
import json
from pathlib import Path

P = Path(__file__).resolve().parent.parent / "public" / "data" / "catalog.json"

CHROME = {"type": "chrome", "color": "#C8C8C8"}
BLACK_LEATHER = {"type": "leather", "color": "#1F1C1A"}
TAN_LEATHER = {"type": "leather", "color": "#B97A45"}
CANE = {"type": "rattan", "color": "#C9A66B", "texture": "gen:cane:#D9B98A,#8A6A3A"}
OAK = {"type": "wood", "color": "#C9A66B"}
DARK_WOOD = {"type": "wood", "color": "#4A2F22"}
BRASS = {"type": "metal", "color": "#C9A24B"}


def item(id, name, category, mount, shape, w, d, h, materials, style, *, params=None, light=None, designer=None, url=None, store=None, notes=""):
    e = {"id": id, "name": name, "category": category, "mount": mount, "shape": shape,
         "size": {"w": w, "d": d, "h": h}, "params": params or {}, "materials": materials, "style": style}
    if light:
        e["light"] = light
    if designer:
        e["designer"] = designer
    if url:
        e["source"] = {"url": url, **({"store": store} if store else {})}
    if notes:
        e["notes"] = notes
    return e


def warm(intensity, at, kelvin=2700, type="point"):
    return {"type": type, "kelvin": kelvin, "intensity": intensity, "at": at}


ITEMS = [
    # ------------------------------------------------------------- Bauhaus
    item("wassily_chair", "Ghế Wassily B3", "seating", "floor", "tube_lounge", 79, 69, 73,
         {"frame": CHROME, "seat": BLACK_LEATHER}, "bauhaus", params={"seatHeight": 42},
         designer="Marcel Breuer, 1925", url="https://www.connox.com/products/knoll-wassily-chair-leather", store="Knoll",
         notes="Khung ống thép mạ chrome, đai da."),
    item("wassily_chair_tan", "Ghế Wassily B3 — da bò", "seating", "floor", "tube_lounge", 79, 69, 73,
         {"frame": CHROME, "seat": TAN_LEATHER}, "bauhaus", params={"seatHeight": 42},
         designer="Marcel Breuer, 1925", url="https://www.connox.com/products/knoll-wassily-chair-leather", store="Knoll"),
    item("cesca_chair", "Ghế Cesca mây", "seating", "floor", "cantilever_chair", 46, 58, 80,
         {"frame": CHROME, "seat": CANE, "back": CANE}, "bauhaus", params={"seatHeight": 46},
         designer="Marcel Breuer, 1928", url="https://www.scp.co.uk/products/cesca-chair", store="Knoll",
         notes="Ghế cantilever ống thép, mặt và lưng đan mây — hợp bàn làm việc / bàn ăn."),
    item("cesca_bar_stool", "Ghế quầy Cesca", "seating", "floor", "cantilever_chair", 46, 50, 107,
         {"frame": CHROME, "seat": CANE, "back": CANE}, "bauhaus", params={"seatHeight": 74},
         designer="Marcel Breuer", url="https://scp.co.uk/products/cesca-bar-stool", store="Knoll"),
    item("mr10_chair", "Ghế MR10 cantilever", "seating", "floor", "cantilever_chair", 47, 72, 79,
         {"frame": CHROME, "seat": BLACK_LEATHER, "back": BLACK_LEATHER}, "bauhaus", params={"seatHeight": 44},
         designer="Mies van der Rohe, 1927", url="https://knoll.com/design-plan/product/mr-chair", store="Knoll"),
    item("barcelona_chair", "Ghế Barcelona", "seating", "floor", "x_lounge", 75, 77, 77,
         {"frame": CHROME, "seat": {"type": "leather", "color": "#6B3A22"}}, "bauhaus", params={"seatHeight": 43},
         designer="Mies van der Rohe & Lilly Reich, 1929", url="https://www.knoll-int.com/home/by-designer/classic-designers/ludwig-mies-van-der-rohe/barcelona-relax", store="Knoll",
         notes="Khung thép chữ X, nệm da chần."),
    item("barcelona_daybed", "Đi-văng Barcelona", "seating", "floor", "x_lounge", 196, 98, 62,
         {"frame": CHROME, "seat": {"type": "leather", "color": "#6B3A22"}, "base": DARK_WOOD}, "bauhaus", params={"seatHeight": 44, "daybed": True},
         designer="Mies van der Rohe, 1930", url="https://scp.co.uk/products/barcelona-daybed", store="Knoll",
         notes="Nằm / ngồi 3–4 người, có gối ống ở đầu."),
    item("tubular_sofa_160", "Sofa 2 chỗ khung thép da đen", "seating", "floor", "sofa", 160, 80, 72,
         {"body": BLACK_LEATHER, "legs": CHROME}, "bauhaus", params={"seatHeight": 42, "armWidth": 14, "cushions": 2, "legHeight": 14},
         notes="Kiểu sofa khối vuông Bauhaus; kích thước phổ biến."),
    item("wagenfeld_lamp", "Đèn bàn Wagenfeld WG24", "lighting", "floor", "globe_lamp", 18, 18, 36,
         {"shade": {"type": "paper", "color": "#F6F2E8"}, "stand": CHROME, "base": {"type": "glass", "color": "#DFE7E8"}}, "bauhaus",
         light=warm(0.5, [0, 28, 0]), designer="Wilhelm Wagenfeld, 1924",
         url="https://www.architonic.com/en/p/wg24-bauhaus-table-lamp-1005535", store="Tecnolumen",
         notes="Đèn bàn Bauhaus: chao bán cầu thuỷ tinh opal. Đặt trên bàn: nhập 'Cao độ đáy'."),
    item("kaiser_idell_lamp", "Đèn bàn Kaiser Idell 6556", "lighting", "floor", "dome_lamp", 21, 28, 47,
         {"body": {"type": "metal", "color": "#1C1C1C"}, "stand": {"type": "metal", "color": "#B08D3C"}, "shade": {"type": "paper", "color": "#FFF1D0"}}, "bauhaus",
         light=warm(0.45, [0, 34, 3], type="spot"), designer="Christian Dell, 1931",
         url="https://www.architonic.com/en/product/fritz-hansen-kaiser-idell-6556-t-table-lamp-black/1466436", store="Fritz Hansen"),
    item("e1027_table", "Bàn bên E1027", "table", "floor", "ring_table", 52, 52, 62,
         {"frame": CHROME, "top": {"type": "glass", "color": "#BFD9E0"}}, "bauhaus",
         designer="Eileen Gray, 1927", url="https://www.salonemilano.it/en/prodotti/classicon/adjustable-table-e1027", store="ClassiCon",
         notes="Mặt kính tròn Ø52, cao chỉnh 64–102 cm."),
    item("albers_nesting_tables", "Bộ 4 bàn lồng Albers", "table", "floor", "nesting_tables", 60, 44, 62.5,
         {"frame": OAK}, "bauhaus", params={"colors": ["#7FB6D9", "#E4572E", "#F2C230", "#2A9D8F"]},
         designer="Josef Albers, 1926", url="https://en.smow.ch/home/nesting-tables.html", store="Klein & More",
         notes="4 bàn 42/48/54/60 cm, mặt kính sơn xanh nhạt – đỏ cam – vàng – ngọc."),
    item("laccio_side_table", "Bàn bên Laccio", "table", "floor", "sled_table", 55, 48, 45,
         {"frame": CHROME, "top": {"type": "plastic", "color": "#1C1C1C"}}, "bauhaus",
         designer="Marcel Breuer, 1925", url="https://www.einrichten-design.com/laccio-1-small-coffee-table-knoll-international.html", store="Knoll"),
    item("laccio_coffee_table", "Bàn trà Laccio dài", "table", "floor", "sled_table", 136, 48, 34,
         {"frame": CHROME, "top": {"type": "plastic", "color": "#F4F1EA"}}, "bauhaus",
         designer="Marcel Breuer, 1925", url="https://www.dimensions.com/element/laccio-table-large", store="Knoll"),
    item("tube_work_desk_120", "Bàn làm việc khung ống thép 1.2m", "table", "floor", "sled_table", 120, 60, 74,
         {"frame": CHROME, "top": OAK}, "bauhaus", notes="Bàn laptop 2 người ngồi đối diện; kích thước phổ biến."),
    item("communal_table_220", "Bàn chung dài 2.2m", "table", "floor", "table_rect", 220, 80, 75,
         {"top": OAK, "legs": {"type": "metal", "color": "#1C1C1C"}}, "bauhaus", notes="Bàn làm việc chung 6–8 chỗ."),
    item("bauhaus_bookshelf", "Kệ sách hở 5 tầng", "storage", "floor", "bookshelf", 120, 32, 180,
         {"body": OAK}, "bauhaus", params={"shelves": 5, "books": True}, notes="Kệ ngăn khu / trưng bày sách, đĩa."),
    item("bauhaus_low_shelf", "Kệ thấp trưng bày 3 tầng", "storage", "floor", "bookshelf", 160, 35, 90,
         {"body": {"type": "wood", "color": "#1C1C1C"}}, "bauhaus", params={"shelves": 3, "books": True}),
    item("bauhaus_rug_200x300", "Thảm hình học Bauhaus 2×3m", "rug", "floor", "rug", 200, 300, 1,
         {"body": {"type": "print", "color": "#EFE3CC", "texture": "gen:bauhaus:#EFE3CC,#D7262B,#2B4BD9,#F2C230,#1C1C1C"}}, "bauhaus",
         notes="Hoạ tiết khối cơ bản đỏ – xanh – vàng (sinh bằng code, tinh thần thảm xưởng dệt Bauhaus)."),
    item("bauhaus_rug_round_180", "Thảm tròn hình học Ø180", "rug", "floor", "rug_round", 180, 180, 1,
         {"body": {"type": "print", "color": "#EFE3CC", "texture": "gen:bauhaus:#F4F1EA,#E07A2F,#2B4BD9,#1C1C1C"}}, "bauhaus"),
    item("checker_rug_160x230", "Thảm ca-rô kem – đen", "rug", "floor", "rug", 160, 230, 1,
         {"body": {"type": "print", "color": "#EFE3CC", "texture": "gen:checker:#EFE3CC,#1C1C1C"}}, "bauhaus"),
    item("bauhaus_poster_a", "Poster hình học Bauhaus — đỏ/xanh/vàng", "wall_art", "wall", "frame", 50, 2, 70,
         {"art": {"type": "print", "color": "#EFE3CC", "texture": "gen:bauhaus:#F4F1EA,#D7262B,#2B4BD9,#F2C230"}, "frame": {"type": "wood", "color": "#1C1C1C"}}, "bauhaus",
         params={"frame": 1.5, "defaultHeight": 150}),
    item("bauhaus_poster_b", "Poster hình học Bauhaus — cam/đen", "wall_art", "wall", "frame", 70, 2, 100,
         {"art": {"type": "print", "color": "#EFE3CC", "texture": "gen:bauhaus:#EFE3CC,#E07A2F,#1C1C1C,#C9813F"}, "frame": OAK}, "bauhaus",
         params={"frame": 2, "defaultHeight": 150}),
    item("pendant_dome_black", "Đèn thả chao vòm đen Ø40", "lighting", "ceiling", "pendant", 40, 40, 22,
         {"body": {"type": "metal", "color": "#1C1C1C"}, "shade": {"type": "paper", "color": "#FFF1D0"}}, "bauhaus", params={"style": "dome"},
         light=warm(0.9, [0, 4, 0], type="spot"), notes="Chao vòm kim loại kiểu xưởng Bauhaus; thả trên bàn làm việc."),
    item("opal_wall_globe", "Đèn tường quả cầu opal Ø20", "lighting", "wall", "wall_light", 20, 12, 20,
         {"shade": {"type": "paper", "color": "#F6F2E8"}, "base": CHROME}, "bauhaus", params={"defaultHeight": 175},
         light=warm(0.5, [0, 10, 7])),

    # --------------------------------------------------------- Phương Đông
    item("moroccan_pouf_tan", "Pouf da Ma-rốc — nâu da bò", "seating", "floor", "pouf", 50, 50, 33,
         {"body": TAN_LEATHER, "top": {"type": "leather", "color": "#E8D2A8"}}, "oriental",
         url="https://www.moroccancorridor.com/products/moroccan-leather-pouf-turquoise", store="Moroccan Corridor",
         notes="Da khâu tay, Ø50 × 30–35 cm. Ghế phụ / gác chân."),
    item("moroccan_pouf_cobalt", "Pouf da Ma-rốc — xanh cobalt", "seating", "floor", "pouf", 50, 50, 33,
         {"body": {"type": "leather", "color": "#2B4BD9"}, "top": {"type": "leather", "color": "#EFE3CC"}}, "oriental",
         url="https://www.moroccancorridor.com/products/moroccan-leather-pouf-turquoise", store="Moroccan Corridor"),
    item("moroccan_pouf_terracotta", "Pouf da Ma-rốc — đỏ gạch", "seating", "floor", "pouf", 50, 50, 33,
         {"body": {"type": "leather", "color": "#B5462E"}, "top": {"type": "leather", "color": "#EFE3CC"}}, "oriental",
         url="https://www.moroccancorridor.com/products/moroccan-leather-pouf-turquoise", store="Moroccan Corridor"),
    item("brass_tray_table", "Bàn mâm đồng chân xếp", "table", "floor", "tray_table", 60, 60, 50,
         {"top": BRASS, "legs": DARK_WOOD}, "oriental",
         url="https://madeinatlas.com/moroccan-tea-table-with-folding-base", store="Made in Atlas",
         notes="Mâm đồng chạm Ø60 trên chân gỗ xếp — bàn trà cho cụm ngồi thấp."),
    item("garden_stool_blue_white", "Đôn sứ xanh trắng", "seating", "floor", "drum_stool", 33, 33, 46,
         {"body": {"type": "ceramic", "color": "#F4F4F0", "texture": "gen:lattice:#1F3A8A,#F4F4F0"}}, "oriental",
         url="https://www.1stdibs.com/furniture/asian-art-furniture/ceramics/chinese-blue-white-porcelain-garden-stool/id-f_11918903", store="1stDibs",
         notes="Đôn sứ Trung Hoa hình trống, dùng làm ghế phụ hoặc bàn bên."),
    item("garden_stool_green", "Đôn sứ men xanh ngọc", "seating", "floor", "drum_stool", 33, 33, 46,
         {"body": {"type": "ceramic", "color": "#3F8F7B"}}, "oriental",
         url="https://www.1stdibs.com/furniture/asian-art-furniture/ceramics/chinese-blue-white-porcelain-garden-stool/id-f_11918903", store="1stDibs"),
    item("ginger_jar", "Bình gốm xanh trắng", "decor", "floor", "vase", 28, 28, 45,
         {"body": {"type": "ceramic", "color": "#F4F4F0", "texture": "gen:lattice:#1F3A8A,#F4F4F0"}}, "oriental", params={"neck": 0.5},
         notes="Bình gừng trang trí; đặt sàn hoặc trên kệ (nhập 'Cao độ đáy')."),
    item("terracotta_vase_tall", "Bình đất nung cổ cao", "decor", "floor", "vase", 30, 30, 70,
         {"body": {"type": "ceramic", "color": "#B5562E"}}, "oriental", params={"neck": 0.3}),
    item("folding_screen_lattice", "Bình phong gỗ chạm 4 cánh", "storage", "floor", "folding_screen", 160, 30, 170,
         {"frame": DARK_WOOD, "body": {"type": "wood", "color": "#8A5A2B", "texture": "gen:lattice:#C9A66B,#3A2418"}}, "oriental", params={"panels": 4},
         url="https://www.diy.com/departments/berkfield-hand-carved-4-panel-room-divider-white-160x165-cm-solid-mango-wood/7719883817941_BQ.prd", store="Berkfield",
         notes="Ngăn mềm giữa khu trò chuyện và khu làm việc mà không chắn sáng hẳn."),
    item("peacock_chair", "Ghế mây lưng quạt (peacock)", "seating", "floor", "peacock_chair", 110, 75, 145,
         {"body": {"type": "rattan", "color": "#C9A66B", "texture": "gen:cane:#D9B98A,#8A6A3A"}, "cushion": {"type": "fabric", "color": "#B5462E"}}, "oriental", params={"seatHeight": 42},
         url="https://www.vente-unique.co.uk/p/peacock-chair-emmanuelle-rattan-white", store="Vente-unique",
         notes="Ghế 'ngai' mây — điểm nhấn chụp ảnh."),
    item("ming_chair", "Ghế gỗ kiểu Minh", "seating", "floor", "chair", 56, 48, 95,
         {"frame": DARK_WOOD, "seat": DARK_WOOD}, "oriental", params={"seatHeight": 48}, notes="Ghế gỗ lưng cao kiểu Trung Hoa; kích thước phổ biến."),
    item("majlis_sofa_200", "Sofa bệt majlis 2m", "seating", "floor", "majlis", 200, 80, 62,
         {"body": {"type": "fabric", "color": "#B5462E"}, "cushion": {"type": "fabric", "color": "#EFE3CC", "texture": "gen:kilim:#EFE3CC,#B5462E,#1F3A8A,#D9A441"}}, "oriental", params={"seatHeight": 26},
         notes="Đệm ngồi sát sàn kiểu Trung Đông với gối tựa thổ cẩm — cụm trò chuyện."),
    item("majlis_sofa_140_blue", "Sofa bệt majlis 1.4m — cobalt", "seating", "floor", "majlis", 140, 80, 62,
         {"body": {"type": "fabric", "color": "#2B4BD9"}, "cushion": {"type": "fabric", "color": "#EFE3CC", "texture": "gen:kilim:#EFE3CC,#2B4BD9,#E07A2F,#1C1C1C"}}, "oriental", params={"seatHeight": 26}),
    item("floor_cushion_kilim", "Đệm sàn thổ cẩm 60×60", "seating", "floor", "cushion_sq", 60, 60, 15,
         {"body": {"type": "fabric", "color": "#B5462E", "texture": "gen:kilim:#B5462E,#EFE3CC,#1F3A8A,#D9A441"}}, "oriental"),
    item("floor_cushion_stripe", "Đệm sàn sọc 60×60", "seating", "floor", "cushion_sq", 60, 60, 15,
         {"body": {"type": "fabric", "color": "#D9A441", "texture": "gen:stripes:#D9A441,#EFE3CC,#B5462E,#EFE3CC"}}, "oriental"),
    item("low_tea_table_round", "Bàn trà thấp tròn Ø80", "table", "floor", "table_round", 80, 80, 32,
         {"top": DARK_WOOD, "legs": DARK_WOOD}, "oriental", notes="Bàn thấp kiểu chabudai cho khách ngồi đệm sàn."),
    item("zellige_side_table", "Bàn bên mặt gạch zellige", "table", "floor", "table_rect", 45, 45, 50,
         {"top": {"type": "tile", "color": "#2A9D8F", "texture": "gen:zellige:#2A9D8F,#1F6F66,#3FB3A3,#EFE3CC"}, "legs": {"type": "metal", "color": "#1C1C1C"}}, "oriental"),
    item("zellige_cafe_table", "Bàn cafe vuông mặt zellige 70", "table", "floor", "table_rect", 70, 70, 74,
         {"top": {"type": "tile", "color": "#2B4BD9", "texture": "gen:zellige:#2B4BD9,#1F3A8A,#EFE3CC,#5B7BE0"}, "legs": {"type": "metal", "color": "#1C1C1C"}}, "oriental",
         notes="Bàn 2 người; mặt gạch men thủ công."),
    item("kilim_rug_170x240", "Thảm kilim 170×240", "rug", "floor", "rug", 170, 240, 1,
         {"body": {"type": "print", "color": "#B5462E", "texture": "gen:kilim:#B5462E,#EFE3CC,#1F3A8A,#D9A441,#2A1A14"}}, "oriental"),
    item("kilim_runner_80x300", "Thảm kilim dài 80×300", "rug", "floor", "rug", 80, 300, 1,
         {"body": {"type": "print", "color": "#1F3A8A", "texture": "gen:kilim:#EFE3CC,#1F3A8A,#B5462E,#D9A441,#2A1A14"}}, "oriental", notes="Thảm dài cho lối đi / dưới bàn dài."),
    item("persian_rug_200x300", "Thảm Ba Tư đỏ 2×3m", "rug", "floor", "rug", 200, 300, 1,
         {"body": {"type": "print", "color": "#8E2B22", "texture": "gen:persian:#8E2B22,#EFE3CC,#1F3A8A,#D9A441"}}, "oriental"),
    item("persian_rug_round_200", "Thảm Ba Tư tròn Ø200 — xanh", "rug", "floor", "rug_round", 200, 200, 1,
         {"body": {"type": "print", "color": "#1F3A8A", "texture": "gen:persian:#1F3A8A,#EFE3CC,#B5462E,#D9A441"}}, "oriental"),
    item("moroccan_lantern", "Đèn lồng đồng Ma-rốc", "lighting", "ceiling", "pendant", 30, 30, 50,
         {"body": {"type": "metal", "color": "#B08D3C"}, "shade": {"type": "acrylic", "color": "#FFB84D"}}, "oriental", params={"style": "moroccan"},
         light=warm(0.6, [0, 22, 0], kelvin=2200), notes="Lồng đồng đục lỗ 6 cạnh, ánh sáng vàng ấm."),
    item("akari_55a", "Đèn giấy Akari 55A", "lighting", "ceiling", "lantern", 55, 55, 55,
         {"shade": {"type": "paper", "color": "#F6F1E6"}}, "oriental", params={"ribs": True},
         light=warm(0.9, [0, 27, 0]), designer="Isamu Noguchi, 1951",
         url="https://www.finnishdesignshop.com/en-us/product/akari-55a-pendant", store="Vitra",
         notes="Đèn giấy washi Nhật Ø55."),
    item("fabric_drum_pendant", "Đèn thả trụ vải Ø45", "lighting", "ceiling", "pendant", 45, 45, 28,
         {"shade": {"type": "paper", "color": "#E8C79A"}}, "neutral", params={"style": "cylinder"}, light=warm(0.8, [0, 14, 0])),
    item("kentia_palm", "Cây cọ kentia", "plant", "floor", "palm", 90, 90, 180,
         {"pot": {"type": "ceramic", "color": "#B5562E"}, "leaves": {"type": "plant", "color": "#3F6B35"}}, "oriental",
         notes="Cây cọ lớn — chất 'nhà kính thuộc địa' của phong cách phương Đông."),
    item("arch_mirror_brass", "Gương vòm viền đồng", "decor", "wall", "arch_mirror", 60, 3, 110,
         {"frame": BRASS, "glass": {"type": "chrome", "color": "#CFD8DC"}}, "oriental", params={"defaultHeight": 130},
         notes="Gương cổng vòm kiểu Moorish."),
    item("mashrabiya_panel", "Tấm gỗ mashrabiya treo tường", "wall_art", "wall", "frame", 80, 3, 120,
         {"art": {"type": "wood", "color": "#8A5A2B", "texture": "gen:lattice:#C9A66B,#3A2418"}, "frame": DARK_WOOD}, "oriental",
         params={"frame": 3, "defaultHeight": 140}, notes="Lưới gỗ hình sao 8 cánh."),
    item("suzani_hanging", "Vải thêu suzani treo tường", "wall_art", "wall", "tapestry", 120, 1, 160,
         {"body": {"type": "fabric", "color": "#8E2B22", "texture": "gen:persian:#EFE3CC,#B5462E,#1F3A8A,#D9A441"}}, "oriental", params={"defaultHeight": 150}),
    item("kilim_hanging", "Thảm kilim treo tường", "wall_art", "wall", "tapestry", 90, 1, 140,
         {"body": {"type": "fabric", "color": "#B5462E", "texture": "gen:kilim:#EFE3CC,#B5462E,#2B4BD9,#D9A441,#1C1C1C"}}, "oriental", params={"defaultHeight": 150}),
]


def main() -> None:
    data = json.loads(P.read_text(encoding="utf8"))
    have = {i["id"] for i in data["items"]}
    new = [i for i in ITEMS if i["id"] not in have]
    if not new:
        print("Không có món mới.")
        return
    text = P.read_text(encoding="utf8").rstrip()
    assert text.endswith("]\n}") or text.endswith("]}") or text.endswith("]\n}".strip()), "định dạng catalog.json lạ"
    cut = text.rindex("]")
    body = text[:cut].rstrip()
    lines = ",\n\n" + ",\n".join("    " + json.dumps(i, ensure_ascii=False) for i in new) + "\n  ]\n}\n"
    P.write_text(body + lines, encoding="utf8", newline="\n")
    print(f"Đã thêm {len(new)} món ({sum(1 for i in new if i['style'] == 'bauhaus')} Bauhaus, {sum(1 for i in new if i['style'] == 'oriental')} phương Đông).")


if __name__ == "__main__":
    main()
