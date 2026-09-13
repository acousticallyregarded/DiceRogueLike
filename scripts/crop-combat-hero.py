"""Extract the user's green-screen idle GIF without altering the upload."""
from pathlib import Path
from PIL import Image, ImageSequence

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "attached_assets/Idle_custom-The_character_stands_centered_east_1789261653450.gif"
ASSETS = ROOT / "artifacts/dicebound/src/assets"
gif = Image.open(SOURCE)
frames = []
for source_frame in ImageSequence.Iterator(gif):
    frame = source_frame.convert("RGBA")
    pixels = []
    for r, g, b, a in frame.getdata():
        # Key only strongly green screen pixels, preserving the teal clothing.
        if g > 140 and g > r * 1.7 and g > b * 1.7:
            a = 0
        pixels.append((r, g, b, a))
    frame.putdata(pixels)
    assert source_frame.info.get("duration") == 200
    frames.append(frame)
assert len(frames) == 9
sheet = Image.new("RGBA", (256 * len(frames), 256))
for i, frame in enumerate(frames):
    sheet.alpha_composite(frame, (256 * i, 0))
sheet.save(ASSETS / "sprites/custom-hero-idle.png", optimize=True)
frames[0].save(ASSETS / "custom-combat-hero.png", optimize=True)
print("Extracted 9 transparent 256px frames, 200ms each.")