"""Extract the ten supplied Bard GIFs without discarding transparent effects."""
from pathlib import Path
from PIL import Image, ImageSequence

root = Path(__file__).resolve().parents[1]
assets = root / "artifacts/dicebound/src/assets"
sources = {
    "electric": ("Idle_custom-The_rooster_pulls_the_lute_off_east_1789336047757.gif", 41),
    "bludgeoning": ("Idle_custom-The_rooster_pulls_the_lute_nec_east_1789336047758.gif", 21),
    "magic": ("Idle_custom-The_rooster_bobs_its_head_and_east_1789336047758.gif", 29),
    "idle": ("Idle_custom-The_rooster_bard_sways_his_tor_east_1789336047759.gif", 21),
    "hurt": ("Idle_custom-The_rooster_recoils_sharply_j_east_1789336047759.gif", 25),
    "death": ("Idle_custom-The_rooster_bard_begins_the_de_east_1789336047760.gif", 25),
    "walk-south-west": ("Idle_custom-The_rooster_bard_strides_forwa_south-west_1789336047760.gif", 21),
    "walk-north-east": ("Idle_custom-The_rooster_bard_strides_forwa_north-east_1789336047761.gif", 21),
    "walk-north-west": ("Idle_custom-The_rooster_bard_strides_forwa_north-west_1789336047761.gif", 21),
    "walk-south-east": ("Idle_custom-The_rooster_bard_strides_forwa_south-east_(1)_1789336194850.gif", 21),
}
for name, (filename, count) in sources.items():
    frames = []
    for source in ImageSequence.Iterator(Image.open(root / "attached_assets" / filename)):
        assert source.info.get("duration") == 200
        frame = source.convert("RGBA")
        assert frame.getpixel((0, 0))[3] == 0
        canvas = Image.new("RGBA", (188, 188))
        canvas.alpha_composite(frame, ((188 - frame.width) // 2, 188 - frame.height))
        frames.append(canvas)
    assert len(frames) == count
    sheet = Image.new("RGBA", (188 * count, 188))
    for index, frame in enumerate(frames):
        sheet.alpha_composite(frame, (188 * index, 0))
    sheet.save(assets / "sprites" / f"bard-{name}.png", optimize=True)
    frames[0].save(assets / "characters" / f"bard-{name}.png", optimize=True)
    print(f"{name}: {count} frames, {count * 200}ms")