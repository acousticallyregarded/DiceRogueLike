"""Extract the supplied combat hit reaction with transparent backgrounds."""
from pathlib import Path
from PIL import Image, ImageSequence

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "artifacts/dicebound/src/assets"
source = Image.open(ROOT / "attached_assets/Idle_custom-The_character_flinches_sharply_east_1789232628896.gif")
frames = []
for source_frame in ImageSequence.Iterator(source):
    frame = source_frame.convert("RGBA")
    pixels = []
    for r, g, b, a in frame.getdata():
        pixels.append((0, 0, 0, 0) if g > 140 and g > r * 1.7 and g > b * 1.7 else (r, g, b, a))
    frame.putdata(pixels)
    assert frame.size == (256, 256)
    assert source_frame.info.get("duration") == 200
    frames.append(frame)
assert len(frames) == 9
sheet = Image.new("RGBA", (256 * len(frames), 256))
for index, frame in enumerate(frames):
    sheet.alpha_composite(frame, (index * 256, 0))
sheet.save(ASSETS / "sprites/custom-hero-hit.png", optimize=True)
frames[0].save(ASSETS / "custom-hero-hit.png", optimize=True)
print("Hit reaction: 9 transparent frames, 1800ms")