"""Flatten the existing alabaster tile's top face for vertical wall cladding."""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
tiles = ROOT / "artifacts/dicebound/src/assets/tiles"
source = Image.open(tiles / "cream.png").convert("RGBA")
# Inset from the bevel: top, left, bottom, right of the isometric surface.
face = source.transform(
    (128, 128), Image.Transform.QUAD,
    (128, 8, 12, 67, 128, 122, 244, 67),
    resample=Image.Resampling.BICUBIC,
)
backing = Image.new("RGBA", face.size, "#e7dfc7")
backing.alpha_composite(face)
backing.convert("RGB").save(tiles / "alabaster-wall.png", optimize=True)