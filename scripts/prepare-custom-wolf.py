"""Extract the user's four Wolf GIFs without resizing their pixel art."""
from pathlib import Path
from PIL import Image, ImageSequence

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "artifacts/dicebound/src/assets"
FILES = {
    "idle": "Idle_custom-The_wolf_stands_with_its_weigh_west_1789255546613.gif",
    "attack": "Idle_custom-The_wolf_lunges_forward_lower_west_1789255546614.gif",
    "hit": "Idle_custom-The_wolf_flinches_sharply_tuc_west_1789255546614.gif",
    "death": "Idle_custom-The_wolf_collapses_to_the_left_west_1789255546614.gif",
}
for action, filename in FILES.items():
    source = Image.open(ROOT / "attached_assets" / filename)
    frames = []
    for source_frame in ImageSequence.Iterator(source):
        frame = source_frame.convert("RGBA")
        pixels = []
        for r, g, b, a in frame.getdata():
            pixels.append((0, 0, 0, 0) if g > 140 and g > r * 1.7 and g > b * 1.7 else (r, g, b, a))
        frame.putdata(pixels)
        assert frame.size == (132, 132)
        assert source_frame.info.get("duration") == 200
        frames.append(frame)
    assert len(frames) == 9
    sheet = Image.new("RGBA", (132 * len(frames), 132))
    for index, frame in enumerate(frames):
        sheet.alpha_composite(frame, (index * 132, 0))
    sheet.save(ASSETS / "sprites" / f"custom-wolf-{action}.png", optimize=True)
    if action == "idle":
        frames[0].save(ASSETS / "custom-wolf.png", optimize=True)
    print(f"Wolf {action}: 9 transparent 132px frames, 1800ms")