"""Split the generated six-panel battle art into individual environments."""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
image = Image.open(ROOT / "attached_assets/generated-battle-backdrops.png")
out = ROOT / "artifacts/dicebound/src/assets/battles"
out.mkdir(parents=True, exist_ok=True)
# The generated sheet has two columns and three rows.
for name, col, row in [
    ("forest", 0, 0), ("camp", 1, 0), ("cavern", 0, 1),
    ("crypt", 1, 1), ("frost", 0, 2), ("throne", 1, 2),
]:
    x0, y0 = col * image.width // 2, row * image.height // 3
    x1, y1 = (col + 1) * image.width // 2, (row + 1) * image.height // 3
    image.crop((x0 + 4, y0 + 4, x1 - 4, y1 - 4)).save(out / f"{name}.webp", quality=92)