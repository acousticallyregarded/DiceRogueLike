"""Convert the five supplied animation GIFs into transparent runtime sheets."""
from pathlib import Path
from PIL import Image, ImageSequence

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "artifacts/dicebound/src/assets"
FILES = {
    "custom-walk-south-east": "Idle_custom-The_character_runs_in_place_c_south-east_1789231281512.gif",
    "custom-walk-north-west": "Idle_custom-The_character_runs_in_place_c_north-west_1789231281513.gif",
    "custom-walk-south-west": "Idle_custom-The_character_runs_in_place_c_south-west_1789231281513.gif",
    "custom-walk-north-east": "Idle_custom-The_character_runs_in_place_c_north-east_1789231281514.gif",
    "custom-drink-potion": "Idle_custom-The_character_pulls_a_red_heal_south_1789231281513.gif",
}

for name, filename in FILES.items():
    source = Image.open(ROOT / "attached_assets" / filename)
    frames = []
    for source_frame in ImageSequence.Iterator(source):
        frame = source_frame.convert("RGBA")
        pixels = []
        for r, g, b, a in frame.getdata():
            if g > 140 and g > r * 1.7 and g > b * 1.7:
                pixels.append((0, 0, 0, 0))
            else:
                pixels.append((r, g, b, a))
        frame.putdata(pixels)
        assert frame.size == (256, 256)
        assert source_frame.info.get("duration") == 200
        frames.append(frame)
    assert len(frames) == 9
    sheet = Image.new("RGBA", (256 * len(frames), 256))
    for index, frame in enumerate(frames):
        sheet.alpha_composite(frame, (index * 256, 0))
    sheet.save(ASSETS / "sprites" / f"{name}.png", optimize=True)
    frames[0].save(ASSETS / f"{name}.png", optimize=True)
    print(f"{name}: {len(frames)} frames, 1800ms")