"""
Sinh 5 phương án thiết kế mẫu → public/scenes/<id>.json + public/scenes/index.json.
Mỗi phương án phối Bauhaus × phương Đông theo một hướng khác nhau, đều có:
  - khu trò chuyện (conversation hub) ở nửa gần cửa sổ (x 0–400),
  - khu làm việc với laptop ở nửa trong (x 400–800),
  - lối đi ≥ 80 cm từ lối vào tới cửa WC, ô thông pha chế và khu cửa sổ.
Toạ độ cm: x từ tường cửa sổ, z từ tường phải (phía WC). rot: 0 = mặt trước hướng +z (về tường
trái), 180 = hướng về tường phải, 90 = hướng về cửa sổ, 270 = quay lưng về cửa sổ.

Chạy:  python tools/make_designs.py   rồi   npm run check-scenes
"""
import json
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "public" / "scenes"


class Scene:
    def __init__(self, id, name, description, mode="day"):
        self.id, self.name, self.description, self.mode = id, name, description, mode
        self.items, self.walls, self.n = [], {}, 0
        self.hidden = ["tube_top", "tube_bottom"]  # bỏ 2 đèn tuýp trắng lạnh
        self.fixture_lights = {"downlight": {"on": True, "kelvin": 3000, "intensity": 0.7}}
        self.ceiling = None

    def _uid(self):
        self.n += 1
        return f"{self.id[:2]}{self.n}"

    def F(self, cid, x, z, rot=0, y=None, light=None):
        e = {"uid": self._uid(), "catalogId": cid, "x": x, "z": z, "rot": rot}
        if y:
            e["y"] = y
        if light:
            e["light"] = light
        self.items.append(e)

    def C(self, cid, x, z, drop=30, light=None):
        e = {"uid": self._uid(), "catalogId": cid, "x": x, "z": z, "rot": 0, "drop": drop}
        if light:
            e["light"] = light
        self.items.append(e)

    def W(self, cid, wall, u, v, light=None):
        e = {"uid": self._uid(), "catalogId": cid, "wall": wall, "u": u, "v": v}
        if light:
            e["light"] = light
        self.items.append(e)

    def wall(self, wid, color=None, mouldings=None, panel=None):
        o = self.walls.setdefault(wid, {})
        if color:
            o["color"] = color
        if mouldings is not None:
            o["mouldings"] = mouldings
        if panel:
            o["panel"] = panel

    def colors(self, long, window, back, mouldings=None):
        for w in ("wall_top", "wall_bottom"):
            self.wall(w, long, mouldings)
        self.wall("wall_window", window)
        for w in ("wall_back_wc", "wall_back_bar", "wall_back_hall"):
            self.wall(w, back, mouldings if w == "wall_back_bar" else None)

    def dump(self):
        room = {"walls": self.walls, "hiddenFixtures": self.hidden, "fixtureLights": self.fixture_lights}
        if self.ceiling:
            room["ceilingColor"] = self.ceiling
        return {"version": 1, "name": self.name, "room": room, "items": self.items, "lights": [], "mode": self.mode, "shadows": True}


def panel(finish, coverage="full", height=120, u=None):
    return {"profile": "lam5", "finish": finish, "tone": None, "sheen": "matte", "coverage": coverage, "wainscotHeight": height, "uRange": u}


def table_pair(s, table, chair, x, z):
    """Bàn 2 người sát tường phải: 2 ghế đối diện theo trục x."""
    s.F(table, x, z)
    s.F(chair, x - 54, z, 270)  # ghế lùa 10 cm dưới mép bàn
    s.F(chair, x + 54, z, 90)


# =============================================================== 1. Salon Marrakech – Dessau
def design_1():
    s = Scene("salon-marrakech-dessau", "1 · Salon Marrakech – Dessau",
              "Kem ấm + đỏ gạch + cobalt. Khu trò chuyện ngồi bệt kiểu majlis quanh mâm đồng; khu làm việc bàn zellige và bàn ống thép với ghế Cesca.")
    s.colors("#EFE3CC", "#2B4BD9", "#B5462E")
    for w in ("wall_top", "wall_bottom"):
        s.wall(w, panel=panel("lam_teak", "wainscot", 110, [50, 400]))
    # --- khu trò chuyện
    s.F("persian_rug_round_200", 190, 200)
    s.F("majlis_sofa_200", 215, 358, 180)
    s.F("majlis_sofa_140_blue", 190, 42, 0)
    s.F("brass_tray_table", 190, 185)
    s.F("moroccan_pouf_terracotta", 300, 120)
    s.F("moroccan_pouf_cobalt", 70, 130)
    s.F("moroccan_pouf_tan", 330, 290)
    s.F("kentia_palm", 50, 345)
    s.F("garden_stool_blue_white", 330, 40)
    s.F("wagenfeld_lamp", 330, 40, y=46)
    s.C("moroccan_lantern", 190, 185, 35)
    s.C("moroccan_lantern", 80, 260, 45)
    s.W("suzani_hanging", "wall_bottom", 215, 178)
    s.W("kilim_hanging", "wall_top", 190, 185)
    s.W("arch_mirror_brass", "wall_top", 330, 170)
    # --- khu làm việc
    table_pair(s, "zellige_cafe_table", "cesca_chair", 465, 45)
    table_pair(s, "zellige_cafe_table", "cesca_chair", 640, 45)
    for x in (480, 630):
        s.F("tube_work_desk_120", x, 368)
        s.F("cesca_chair", x - 28, 312, 0)
        s.F("cesca_chair", x + 28, 312, 0)
        s.C("pendant_dome_black", x, 368, 75)
    s.F("kilim_runner_80x300", 560, 200, 90)
    s.W("bauhaus_poster_a", "wall_bottom", 480, 160)
    s.W("bauhaus_poster_b", "wall_bottom", 630, 165)
    s.W("opal_wall_globe", "wall_top", 465, 175)
    s.W("opal_wall_globe", "wall_top", 640, 175)
    s.F("terracotta_vase_tall", 730, 375)
    return s


# =============================================================== 2. Bauhaus Werkstatt
def design_2():
    s = Scene("bauhaus-werkstatt", "2 · Xưởng Bauhaus",
              "Trắng ngà + đen + ba màu cơ bản. Sofa da và ghế Wassily quanh bàn Laccio trên thảm hình học; bàn chung dài cho người làm việc, chút phương Đông ở đôn sứ và pouf.")
    s.colors("#F4F1EA", "#F2C230", "#D7262B", mouldings=False)
    s.ceiling = "#FFFFFF"
    # --- khu trò chuyện
    s.F("bauhaus_rug_200x300", 200, 215, 90)
    s.F("tubular_sofa_160", 190, 358, 180)
    s.F("wassily_chair", 130, 60, 0)
    s.F("wassily_chair_tan", 250, 60, 0)
    s.F("laccio_coffee_table", 190, 265)
    s.F("albers_nesting_tables", 330, 372, 180)
    s.F("garden_stool_blue_white", 60, 372)
    s.F("wagenfeld_lamp", 60, 372, y=46)
    s.F("moroccan_pouf_cobalt", 320, 235)
    s.F("moroccan_pouf_terracotta", 50, 230)
    s.F("e1027_table", 190, 40)
    s.F("plant_pot_40", 40, 40)
    s.C("akari_55a", 190, 215, 25)
    s.W("bauhaus_poster_b", "wall_bottom", 190, 170)
    s.W("bauhaus_poster_a", "wall_top", 130, 165)
    s.W("clock_clover", "wall_top", 250, 185)
    # --- ngăn khu + làm việc
    s.F("bauhaus_bookshelf", 420, 338, 90)
    s.F("communal_table_220", 590, 215)
    for x in (510, 590, 670):
        s.F("cesca_chair", x, 150, 0)
        s.F("cesca_chair", x, 280, 180)
    for x in (520, 660):
        s.C("pendant_dome_black", x, 215, 70)
    s.F("kaiser_idell_lamp", 590, 215, y=75)
    s.F("bauhaus_low_shelf", 560, 20, 0)
    s.F("ginger_jar", 500, 20, y=90)
    s.F("kaiser_idell_lamp", 620, 20, y=90)
    s.W("opal_wall_globe", "wall_bottom", 520, 180)
    s.W("opal_wall_globe", "wall_bottom", 660, 180)
    s.W("art_blue_squares", "wall_top", 560, 165)
    return s


# =============================================================== 3. Trà thất Indigo
def design_3():
    s = Scene("tra-that-indigo", "3 · Trà thất Indigo",
              "Chàm + gỗ sồi vàng + giấy washi. Ngồi bệt quanh bàn trà thấp dưới đèn Akari, băng ngồi cửa sổ; bình phong ngăn sang quầy laptop cao và bàn đôi yên tĩnh.")
    s.colors("#F1EADB", "#1F3A8A", "#1F3A8A", mouldings=False)
    s.wall("wall_top", panel=panel("lam_oak_gold", "full"))
    s.wall("wall_bottom", panel=panel("lam_oak_gold", "wainscot", 100, [50, 800]))
    # --- khu trò chuyện
    s.F("window_bench_400", 24, 200, 270)
    s.F("kilim_rug_170x240", 215, 200, 0)
    s.F("low_tea_table_round", 215, 120)
    s.F("low_tea_table_round", 215, 300)
    for dx, dz in ((-75, 0), (75, 0), (0, -72)):
        s.F("floor_cushion_kilim", 215 + dx, 120 + dz)
    for dx, dz in ((-75, 0), (75, 0), (0, 68)):
        s.F("floor_cushion_stripe", 215 + dx, 300 + dz)
    s.F("garden_stool_green", 105, 40)
    s.F("ginger_jar", 105, 40, y=46)
    s.C("akari_55a", 215, 120, 20)
    s.C("akari_55a", 215, 300, 35)
    s.C("paper_lantern_white", 90, 215, 45)
    s.W("mashrabiya_panel", "wall_bottom", 215, 190)
    s.W("mashrabiya_panel", "wall_bottom", 320, 190)
    # --- ngăn khu
    s.F("folding_screen_lattice", 405, 318, 90)
    s.F("terracotta_vase_tall", 372, 380)
    # --- khu làm việc
    s.F("high_counter_200", 580, 24, 0)
    for x in (510, 580, 650):
        s.F("cesca_bar_stool", x, 78, 180)
    s.C("fabric_drum_pendant", 520, 30, 60)
    s.C("fabric_drum_pendant", 640, 30, 60)
    for x in (500, 650):
        s.F("work_table_60", x, 368)
        s.F("ming_chair", x, 310, 0)
        s.F("wagenfeld_lamp", x + 14, 380, y=75)
    s.F("bauhaus_rug_round_180", 575, 215)
    s.W("bauhaus_poster_a", "wall_bottom", 575, 185)
    return s


# =============================================================== 4. Tiệm Đỏ Gạch
def design_4():
    s = Scene("tiem-do-gach", "4 · Tiệm Đỏ Gạch",
              "Cam mơ + xanh rêu + gỗ sồi đỏ ốp lửng. Booth da và ghế Barcelona quanh thảm Ba Tư, ghế mây lưng quạt ở góc; khu trong là bàn làm việc ống thép và bàn zellige dưới đèn lồng đồng.")
    s.colors("#D98A5F", "#4E6B4A", "#EFE3CC")
    for w in ("wall_top", "wall_bottom"):
        s.wall(w, panel=panel("lam_oak_red", "wainscot", 95, [50, 800]))
    # --- khu trò chuyện
    s.F("persian_rug_200x300", 215, 215, 90)
    s.F("booth_200", 215, 368, 180)
    s.F("barcelona_chair", 150, 62, 0)
    s.F("barcelona_chair", 280, 62, 0)
    s.F("brass_tray_table", 215, 200)
    s.F("peacock_chair", 62, 140, 270)
    s.F("moroccan_pouf_tan", 345, 180)
    s.F("moroccan_pouf_terracotta", 60, 262)
    s.F("kentia_palm", 52, 345)
    s.F("e1027_table", 215, 40)
    s.F("kaiser_idell_lamp", 215, 40, y=62)
    s.C("moroccan_lantern", 215, 200, 30)
    s.C("moroccan_lantern", 120, 120, 45)
    s.C("moroccan_lantern", 310, 300, 40)
    s.W("arch_mirror_brass", "wall_bottom", 120, 165)
    s.W("suzani_hanging", "wall_bottom", 250, 180)
    s.W("mashrabiya_panel", "wall_top", 215, 185)
    # --- khu làm việc
    for x in (470, 620):
        s.F("tube_work_desk_120", x, 32, 0)
        s.F("mr10_chair", x - 28, 98, 180)
        s.F("mr10_chair", x + 28, 98, 180)
        s.W("wall_light_round_orange", "wall_top", x, 185)
    for x in (470, 640):
        s.F("zellige_cafe_table", x, 362)
        s.F("cesca_chair", x - 54, 362, 270)
        s.F("cesca_chair", x + 54, 362, 90)
        s.C("fabric_drum_pendant", x, 362, 65)
    s.F("garden_stool_blue_white", 745, 375)
    s.F("terracotta_vase_tall", 745, 375, y=46)
    return s


# =============================================================== 5. Đêm Cobalt — đồ sẵn có
def design_5():
    s = Scene("dem-cobalt", "5 · Đêm Cobalt (đồ sẵn có)",
              "Buổi tối: tường cobalt sẫm, lam teak, chỉ đèn ấm. Dùng tối đa đồ Jazz đang có — thảm hổ, bàn trà oval, tranh xanh, poster mèo, đồng hồ, tấm inox, pegboard, đèn BIC, hộp mica — thêm sofa thấp và bàn làm việc nhỏ.",
              mode="night")
    s.colors("#24357F", "#B5462E", "#24357F")
    s.fixture_lights = {"downlight": {"on": True, "kelvin": 2700, "intensity": 0.35}}
    s.wall("wall_bottom", panel=panel("lam_teak", "full", u=[50, 400]))
    s.wall("wall_top", panel=panel("lam_teak", "wainscot", 100, [50, 800]))
    # --- khu trò chuyện
    s.F("tiger_rug", 200, 215, 90)
    s.F("sofa_low_240", 200, 355, 180)
    s.F("armchair_low", 130, 55, 0)
    s.F("armchair_low", 270, 55, 0)
    s.F("coffee_table_oval", 200, 255)
    s.F("moroccan_pouf_tan", 345, 215)
    s.F("bic_pen_lamp", 40, 372, 180)
    s.F("trolley_red", 372, 372, 0)
    s.F("cube_lamp_green", 372, 372, y=65)
    s.F("rattan_plant_stand", 45, 45)
    s.C("paper_lantern_white", 200, 235, 25)
    s.W("art_blue_squares", "wall_top", 200, 180)
    s.W("wall_light_round_orange", "wall_top", 100, 180)
    s.W("wall_light_round_orange", "wall_top", 300, 180)
    s.W("poster_karma_cat", "wall_bottom", 345, 175)
    s.W("clock_clover", "wall_bottom", 60, 190)
    # --- khu làm việc
    for x in (460, 620):
        s.F("work_table_60", x, 40)
        s.F("work_chair", x - 50, 40, 270)
        s.F("work_chair", x + 50, 40, 90)
    s.F("tube_work_desk_120", 480, 368)
    s.F("work_chair", 452, 312, 0)
    s.F("work_chair", 508, 312, 0)
    s.F("bauhaus_low_shelf", 640, 380, 180)
    s.F("wagenfeld_lamp", 600, 380, y=90)
    s.F("ginger_jar", 700, 380, y=90)
    s.C("pendant_dome_black", 480, 368, 70)
    s.C("moroccan_lantern", 540, 60, 45)
    for i, (du, dv) in enumerate(((0, 0), (40, 0), (80, 0), (0, -40), (40, -40), (80, -40))):
        s.W("magnet_steel_30", "wall_top", 480 + du, 190 + dv)
    s.W("pegboard_60x40", "wall_bottom", 620, 175)
    s.W("pegboard_60x40", "wall_bottom", 682, 175)
    s.W("led_strip_200", "wall_bottom", 560, 240)
    return s


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    index = []
    for make in (design_1, design_2, design_3, design_4, design_5):
        s = make()
        (OUT / f"{s.id}.json").write_text(json.dumps(s.dump(), ensure_ascii=False, indent=1), encoding="utf8", newline="\n")
        index.append({"id": s.id, "name": s.name, "description": s.description, "file": f"scenes/{s.id}.json"})
        print(f"✓ {s.id}: {len(s.items)} món")
    (OUT / "index.json").write_text(json.dumps(index, ensure_ascii=False, indent=1), encoding="utf8", newline="\n")


if __name__ == "__main__":
    main()
