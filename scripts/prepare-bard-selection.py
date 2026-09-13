"""Prepare Alan-a-Dale's selection animation without changing its source GIF."""
from pathlib import Path
from PIL import Image, ImageSequence

root = Path(__file__).resolve().parents[1]
source = root / "attached_assets/Idle_custom-The_rooster_bard_sways_his_tor_south_1789333774085.gif"
assets = root / "artifacts/dicebound/src/assets"
frames = []
for frame in ImageSequence.Iterator(Image.open(source)):
    assert frame.info.get("duration") == 200
    image = frame.convert("RGBA")
    image.putdata([
        (0, 0, 0, 0) if g > 200 and r < 80 and b < 80 else (r, g, b, a)
        for r, g, b, a in image.getdata()
    ])
    frames.append(image)
assert len(frames) == 21
boxes = [frame.getchannel("A").getbbox() for frame in frames]
left, top = min(b[0] for b in boxes), min(b[1] for b in boxes)
right, bottom = max(b[2] for b in boxes), max(b[3] for b in boxes)
size = max(right - left, bottom - top) + 8
x, y = (left + right - size) // 2, (top + bottom - size) // 2
frames = [frame.crop((x, y, x + size, y + size)) for frame in frames]
sheet = Image.new("RGBA", (size * len(frames), size))
for index, frame in enumerate(frames):
    sheet.alpha_composite(frame, (index * size, 0))
sheet.save(assets / "sprites/bard-selection.png", optimize=True)
frames[0].save(assets / "characters/bard-selection.png", optimize=True)
print(f"Bard selection: {len(frames)} frames, {size}px, 4200ms")