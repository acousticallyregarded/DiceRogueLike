#!/usr/bin/env python3
"""Crop the supplied Poporing sheet into Ochre Jelly animation assets.

The attached sheet is already RGBA with real transparent pixels.  This script
only crops those source pixels; it does not paint, generate, or clean up the
art.  The source sprites are nearest-neighbour scaled by a single factor so
their pixel-art edges stay crisp, then placed on a shared 256px-cell baseline.

The source has labels and a logo alongside the art.  Each crop below is
intentionally hand-bounded around only the requested source sprite/group:
standing and walking use the first four front-facing poses, while the top
hurt/death row supplies the two hurt poses and four breakup groups.  The
original attached file is never written to.
"""

from __future__ import annotations

from pathlib import Path
from typing import Iterable, Sequence

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SOURCE_PATH = (
    ROOT
    / "attached_assets"
    / "PC___Computer_-_Ragnarok_Online_-_Enemies_-_Poporing_1789226736970.png"
)
ASSET_DIR = ROOT / "artifacts" / "dicebound" / "src" / "assets"
SPRITE_DIR = ASSET_DIR / "sprites"

CELL_SIZE = 256
FRAME_COUNT = 8
# Three source pixels per output pixel block keeps every requested breakup
# group within a 256px cell while using the same scale for every pose.
PIXEL_SCALE = 3
BASELINE_Y = 244


Rect = tuple[int, int, int, int]

# Labels are outside all of these source-space boxes.  The first four poses in
# each of these rows are the face/front direction, not the rear-facing poses
# immediately after them.
STANDING_FRONT: tuple[Rect, ...] = (
    (7, 8, 56, 56),
    (63, 9, 114, 57),
    (121, 10, 174, 57),
    (180, 12, 232, 56),
)
WALKING_FRONT: tuple[Rect, ...] = (
    (7, 74, 54, 115),
    (62, 76, 111, 116),
    (115, 75, 166, 115),
    (171, 73, 216, 114),
)

# The requested top hurt/death row: two intact hurt poses followed by four
# breakup groups.  The logo at the far right is deliberately not in any box.
HURT_POSES: tuple[Rect, ...] = (
    (11, 216, 59, 262),  # body centered near x=35
    (69, 216, 120, 263),  # body centered near x=94
)
DEATH_GROUPS: tuple[Rect, ...] = (
    (126, 198, 200, 268),  # breakup group centered near x=165
    (215, 210, 307, 275),  # breakup group centered near x=255
    (326, 199, 422, 275),  # breakup group centered near x=365
    (443, 216, 539, 263),  # breakup group centered near x=485
)


def load_source() -> Image.Image:
    """Load and validate the untouched, user-supplied RGBA source."""

    source = Image.open(SOURCE_PATH).convert("RGBA")
    if source.size != (609, 388):
        raise ValueError(f"unexpected source dimensions: {source.size}; expected (609, 388)")
    if source.getchannel("A").getextrema()[0] != 0:
        raise ValueError("source is expected to contain transparent pixels")
    return source


def crop_art(source: Image.Image, box: Rect) -> Image.Image:
    """Return only visible alpha from a known source-space art crop."""

    patch = source.crop(box)
    visible = patch.getchannel("A").getbbox()
    if visible is None:
        raise ValueError(f"crop contains no art: {box}")
    # Trimming transparent margins makes the placement anchor explicit without
    # changing a single source pixel.
    return patch.crop(visible)


def render_frame(art: Image.Image) -> Image.Image:
    """Scale one source crop with nearest-neighbour and anchor its bottom."""

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
    """Build an eight-frame horizontal sheet from source crops."""

    frames = [render_frame(crop_art(source, box)) for box in crops]
    sheet = Image.new("RGBA", (CELL_SIZE * FRAME_COUNT, CELL_SIZE), (0, 0, 0, 0))
    for index, frame in enumerate(frames):
        sheet.alpha_composite(frame, (index * CELL_SIZE, 0))
    return sheet


def save_png(image: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, format="PNG", optimize=True, compress_level=9)


def repeated(crops: Sequence[Rect], count: int = FRAME_COUNT) -> tuple[Rect, ...]:
    """Repeat source choices to fill the animator's fixed eight-frame sheet."""

    if not crops:
        raise ValueError("cannot repeat an empty crop list")
    return tuple(crops[index % len(crops)] for index in range(count))


def main() -> None:
    source = load_source()

    # The four front-facing standing poses are repeated as a smooth loop;
    # rear-facing source art is intentionally never selected.
    idle_crops = repeated(STANDING_FRONT)
    attack_crops = repeated(WALKING_FRONT)

    # Hurt owns the two intact body poses.  Death owns the four breakup groups,
    # holding the final group for the tail of the eight-frame animation.
    hit_crops = repeated(HURT_POSES)
    death_crops = tuple(
        (*DEATH_GROUPS, DEATH_GROUPS[-1], DEATH_GROUPS[-1], DEATH_GROUPS[-1], DEATH_GROUPS[-1])
    )

    save_png(make_sheet(source, idle_crops), SPRITE_DIR / "ochre-idle.png")
    save_png(make_sheet(source, attack_crops), SPRITE_DIR / "ochre-attack.png")
    save_png(make_sheet(source, hit_crops), SPRITE_DIR / "ochre-hit.png")
    save_png(make_sheet(source, death_crops), SPRITE_DIR / "ochre-death.png")

    # The fallback is one aligned 256px standing frame, not a separately
    # redrawn image.  It uses the same crop, scale, and baseline as the sheet.
    save_png(render_frame(crop_art(source, STANDING_FRONT[0])), ASSET_DIR / "ochre-jelly.png")


if __name__ == "__main__":
    main()