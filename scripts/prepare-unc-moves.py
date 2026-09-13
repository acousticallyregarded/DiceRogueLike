"""Preserve Unc's supplied transparent frames, effects, and 200ms timing."""
from pathlib import Path
from PIL import Image, ImageSequence

root = Path(__file__).resolve().parents[1]
assets = root / "artifacts/dicebound/src/assets"
sources = {
    "poison": ("Idle_custom-Bend_over_and_release_a_noxiou_west_1789333806342.gif", 25),
    "punch": ("Idle_custom-The_man_winds_up_by_pulling_hi_east_1789333806343.gif", 17),
    "wind": ("Idle_custom-The_character_pulls_an_industr_east_1789333806343.gif", 25),
    "acid": ("Idle_custom-The_man_lifts_a_glass_to_his_l_east_1789333806344.gif", 9),
    "cold": ("Idle_custom-The_man_reaches_to_his_side_to_east_1789333806344.gif", 25),
    "fire": ("Idle_custom-The_man_winds_up_by_pulling_an_east_1789333806345.gif", 25),
    "walk-south-west": ("Idle_custom-The_bald_man_in_the_white_tank_south-west_1789333806345.gif", 13),
    "walk-north-west": ("Idle_custom-The_bald_man_in_the_white_tank_north-west_1789333806346.gif", 13),
    "walk-north-east": ("Idle_custom-The_bald_man_in_the_white_tank_north-east_1789333806346.gif", 13),
    "walk-south-east": ("Idle_custom-The_bald_man_in_the_white_tank_south-east_1789333806347.gif", 13),
}
for name, (filename, expected_count) in sources.items():
    frames = []
    for source in ImageSequence.Iterator(Image.open(root / "attached_assets" / filename)):
        assert source.info.get("duration") == 200
        frame = source.convert("RGBA")
        # These GIFs already have alpha. Chroma-keying again would erase
        # the green acid/poison effects. Keep their existing transparency.
        assert frame.getpixel((0, 0))[3] == 0
        canvas = Image.new("RGBA", (172, 172))
        canvas.alpha_composite(frame, ((172 - frame.width) // 2, 172 - frame.height))
        frames.append(canvas)
    assert len(frames) == expected_count
    sheet = Image.new("RGBA", (172 * len(frames), 172))
    for index, frame in enumerate(frames):
        sheet.alpha_composite(frame, (172 * index, 0))
    sheet.save(assets / "sprites" / f"unc-{name}.png", optimize=True)
    frames[0].save(assets / "characters" / f"unc-{name}.png", optimize=True)
    print(f"{name}: {len(frames)} frames, {len(frames) * 200}ms")