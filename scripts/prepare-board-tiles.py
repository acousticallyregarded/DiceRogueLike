"""Prepare the user's tile artwork with consistent transparent bounds."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageChops

ROOT = Path(__file__).resolve().parents[1]
FILES = {
    "green": "ChatGPT_Image_Sep_12,_2026,_12_38_14_PM_1789231138669.png",
    "red": "ChatGPT_Image_Sep_12,_2026,_12_38_04_PM_(2)_1789231138669.png",
    "orange": "ChatGPT_Image_Sep_12,_2026,_12_38_04_PM_(3)_1789231138669.png",
    "cream": "ChatGPT_Image_Sep_12,_2026,_12_38_05_PM_(4)_1789231138670.png",
    "purple": "ChatGPT_Image_Sep_12,_2026,_12_38_04_PM_(1)_1789231138670.png",
}
out = ROOT / "artifacts/dicebound/src/assets/tiles"
out.mkdir(parents=True, exist_ok=True)
for color, filename in FILES.items():
    image = Image.open(ROOT / "attached_assets" / filename).convert("RGBA")
    alpha = image.getchannel("A")
    # Keep the solid tile, discarding disconnected export speckles.
    mask = alpha.point(lambda value: 255 if value >= 160 else 0)
    ImageDraw.floodfill(mask, (image.width // 2, image.height // 2), 128)
    connected = mask.point(lambda value: 255 if value == 128 else 0)
    bounds = connected.getbbox()
    if bounds is None:
        raise ValueError(f"No tile found in {filename}")
    image.putalpha(ImageChops.multiply(alpha, connected))
    # Artwork is already isometric. Fit its top face to the existing 2:1
    # board projection; the remaining pixels supply the raised front edge.
    image = image.crop(bounds).resize((256, 152), Image.Resampling.LANCZOS)
    image.save(out / f"{color}.png", optimize=True)
    print(color, bounds, image.size)