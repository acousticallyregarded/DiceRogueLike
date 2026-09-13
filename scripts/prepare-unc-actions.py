"""Extract Unc's support, special, death, hurt, and idle animations."""
from pathlib import Path
from PIL import Image, ImageSequence

root = Path(__file__).resolve().parents[1]
assets = root / "artifacts/dicebound/src/assets"
sources = {
    "guard": ("Idle_custom-The_man_reaches_his_hands_towa_south_1789334002944.gif", 25),
    "health": ("Idle_custom-The_man_reaches_his_right_hand_south_1789334002944.gif", 21),
    "special": ("Idle_custom-The_man_reaches_into_his_pocke_east_1789334002944.gif", 41),
    "death": ("Idle_custom-The_man_clutches_his_chest_wit_east_1789334002945.gif", 41),
    "hurt": ("Idle_custom-The_man_winces_and_hunches_his_east_1789334002945.gif", 21),
    "idle": ("Idle_custom-The_man_shifts_his_weight_dra_east_1789334002946.gif", 17),
}
for name, (filename, count) in sources.items():
    frames = []
    for source in ImageSequence.Iterator(Image.open(root / "attached_assets" / filename)):
        assert source.info.get("duration") == 200
        frame = source.convert("RGBA")
        assert frame.getpixel((0, 0))[3] == 0
        canvas = Image.new("RGBA", (172, 172))
        canvas.alpha_composite(frame, ((172 - frame.width) // 2, 172 - frame.height))
        frames.append(canvas)
    assert len(frames) == count
    sheet = Image.new("RGBA", (172 * count, 172))
    for index, frame in enumerate(frames):
        sheet.alpha_composite(frame, (172 * index, 0))
    sheet.save(assets / "sprites" / f"unc-{name}.png", optimize=True)
    frames[0].save(assets / "characters" / f"unc-{name}.png", optimize=True)
    print(f"{name}: {count} frames, {count * 200}ms")