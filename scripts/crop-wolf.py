#!/usr/bin/env python3
"""Crop the uploaded Ragnarok Online wolf sheet into aligned pixel assets.

The source is a palette PNG whose transparent palette entry is retained as
real RGBA transparency.  Every crop below is hand-bounded around one source
pose; no neighboring pose or label is included.  The source pixels are scaled
with nearest-neighbor sampling and placed on a shared baseline so the sheets
can be used directly as eight-frame sprite strips.
"""

from __future__ import annotations

from pathlib import Path
from typing import Sequence

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SOURCE_PATH = (
    ROOT
    / "attached_assets"
    / "PC___Computer_-_Ragnarok_Online_-_Enemies_-_Wolf_1789227133807.png"
)
ASSET_DIR = ROOT / "artifacts" / "dicebound" / "src" / "assets"
SPRITE_DIR = ASSET_DIR / "sprites"

CELL_SIZE = 256
FRAME_COUNT = 8
PIXEL_SCALE = 2
BASELINE_Y = 235

Rect = tuple[int, int, int, int]

# The attached file is 1018x505 (the visual export has a few transparent
# pixels beyond the described 1023x504 artwork area).  The first five poses
# in the top-left group all face left; the rear/right-facing group starts at
# x=500 and is intentionally never selected.
IDLE_LEFT: tuple[Rect, ...] = (
    (0, 0, 89, 90),
    (89, 0, 189, 90),
    (189, 0, 284, 90),
    (284, 0, 389, 90),
    (389, 0, 490, 90),
)

# The six front/left-facing attack poses occupy the first group of the row
# beginning around y=210.  The remaining art in that row faces away/right.
ATTACK_LEFT: tuple[Rect, ...] = (
    (0, 190, 89, 305),
    (89, 190, 168, 305),
    (168, 190, 263, 305),
    (263, 190, 390, 305),
    (390, 190, 462, 305),
    (462, 190, 560, 305),
)

# On the bottom row the first three poses are the left-facing death sequence:
# standing, death anticipation/hurt, and fallen.  The larger group beginning
# near x=290 faces away/right and is deliberately outside these boxes.
DEATH_LEFT: tuple[Rect, ...] = (
    (0, 400, 89, 505),
    (89, 400, 185, 505),
    (185, 400, 285, 505),
)


def load_source() -> Image.Image:
    """Load and validate the untouched, user-supplied source sheet."""

    source = Image.open(SOURCE_PATH).convert("RGBA")
    if source.size != (1018, 505):
        raise ValueError(
            f"unexpected source dimensions: {source.size}; expected (1018, 505)"
        )
    alpha = source.getchannel("A")
    if alpha.getextrema() != (0, 255):
        raise ValueError(
            "source is expected to contain both transparent and opaque pixels"
        )
    return source


def crop_art(source: Image.Image, box: Rect) -> Image.Image:
    """Return only visible source pixels from a hand-bounded pose box."""

    patch = source.crop(box)
    visible = patch.getchannel("A").getbbox()
    if visible is None:
        raise ValueError(f"crop contains no art: {box}")
    # Trim transparent margins without changing any source art pixels.
    return patch.crop(visible)


def render_frame(art: Image.Image) -> Image.Image:
    """Nearest-neighbor scale one pose and anchor its feet at the baseline."""

    scaled = art.resize(
        (art.width * PIXEL_SCALE, art.height * PIXEL_SCALE),
        Image.Resampling.NEAREST,
    )
    if scaled.width > CELL_SIZE or scaled.height > CELL_SIZE:
        raise ValueError(
            f"scaled crop {scaled.size} does not fit in a {CELL_SIZE}px cell"
        )

    cell = Image.new("RGBA", (CELL_SIZE, CELL_SIZE), (0, 0, 0, 0))
    x = (CELL_SIZE - scaled.width) // 2
    y = BASELINE_Y - scaled.height
    cell.alpha_composite(scaled, (x, y))
    return cell


def make_sheet(source: Image.Image, crops: Sequence[Rect]) -> Image.Image:
    """Build a horizontal eight-frame sheet from source pose boxes."""

    if len(crops) != FRAME_COUNT:
        raise ValueError(f"expected {FRAME_COUNT} frame boxes, got {len(crops)}")
    frames = [render_frame(crop_art(source, box)) for box in crops]
    sheet = Image.new("RGBA", (CELL_SIZE * FRAME_COUNT, CELL_SIZE), (0, 0, 0, 0))
    for index, frame in enumerate(frames):
        sheet.alpha_composite(frame, (index * CELL_SIZE, 0))
    return sheet


def save_png(image: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, format="PNG", optimize=True, compress_level=9)


def main() -> None:
    source = load_source()

    # Use all five left-facing standing poses for a smooth idle loop.
    idle_crops = (
        IDLE_LEFT[0],
        IDLE_LEFT[1],
        IDLE_LEFT[2],
        IDLE_LEFT[3],
        IDLE_LEFT[4],
        IDLE_LEFT[3],
        IDLE_LEFT[2],
        IDLE_LEFT[1],
    )

    # Preserve the complete actual front attack sequence, then hold the final
    # source pose for the tail of the fixed eight-frame strip.
    attack_crops = (*ATTACK_LEFT, ATTACK_LEFT[-1], ATTACK_LEFT[-1])

    # Hit uses the death anticipation pose.  Death ends on the fallen source
    # pose and holds it rather than inventing any in-between art.
    hit_crops = (DEATH_LEFT[1],) * FRAME_COUNT
    death_crops = (
        DEATH_LEFT[0],
        DEATH_LEFT[1],
        DEATH_LEFT[2],
        DEATH_LEFT[2],
        DEATH_LEFT[2],
        DEATH_LEFT[2],
        DEATH_LEFT[2],
        DEATH_LEFT[2],
    )

    save_png(make_sheet(source, idle_crops), SPRITE_DIR / "wolf-pixel-idle.png")
    save_png(make_sheet(source, attack_crops), SPRITE_DIR / "wolf-pixel-attack.png")
    save_png(make_sheet(source, hit_crops), SPRITE_DIR / "wolf-pixel-hit.png")
    save_png(make_sheet(source, death_crops), SPRITE_DIR / "wolf-pixel-death.png")

    # The standalone fallback is the first aligned left-facing idle pose.
    save_png(
        render_frame(crop_art(source, IDLE_LEFT[0])),
        ASSET_DIR / "wolf-pixel.png",
    )


if __name__ == "__main__":
    main()