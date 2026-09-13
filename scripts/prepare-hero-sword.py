"""The earlier supplied 'idle' GIF actually contains the hero sword swing."""
from pathlib import Path
from PIL import Image, ImageSequence

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "artifacts/dicebound/src/assets"
source = Image.open(ROOT / "attached_assets/Idle_custom-The_character_stands_firmly_in_east_1789228253872.gif")
frames = []
for original in ImageSequence.Iterator(source):
    assert original.info.get("duration") == 200
    frame = original.convert("RGBA")
    frame.putdata([(r, g, b, 0) if g > 140 and g > r * 1.7 and g > b * 1.7 else (r, g, b, a)
                   for r, g, b, a in frame.getdata()])
    frames.append(frame)
assert len(frames) == 13
sheet = Image.new("RGBA", (256 * len(frames), 256))
for i, frame in enumerate(frames):
    sheet.alpha_composite(frame, (256 * i, 0))
sheet.save(OUT / "sprites/custom-hero-sword.png", optimize=True)