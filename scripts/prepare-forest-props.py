"""Crop transparent padding and optimize the supplied forest decorations."""
from pathlib import Path
from PIL import Image

root = Path(__file__).resolve().parents[1]
output = root / "artifacts/dicebound/src/assets/forest"
output.mkdir(parents=True, exist_ok=True)
sources = sorted((root / "attached_assets").glob("*17892629*.png"))
assert len(sources) == 10, "Expected six rock and four bush source images"
for index, source in enumerate(sources):
    image = Image.open(source).convert("RGBA")
    image = image.crop(image.getchannel("A").getbbox())
    image.thumbnail((256, 256), Image.Resampling.LANCZOS)
    name = f"rock-{index + 1}" if index < 6 else f"bush-{index - 5}"
    image.save(output / f"{name}.webp", quality=90)