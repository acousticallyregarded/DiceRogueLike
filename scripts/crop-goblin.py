#!/usr/bin/env python3
"""Crop the uploaded axe-goblin sheet into aligned pixel sprite assets.

The source sheet is an RGBA palette PNG.  The character rows and the weapon
row are cropped independently so that none of the purple labels or guides can
reach an output sprite.  Axe parts are composited onto every character pose
before the pixels are scaled, because the supplied character rows do not carry
their detached weapon art.  All scaling is nearest-neighbour and every output
frame shares the same feet baseline.
"""

from __future__ import annotations

from pathlib import Path
from typing import Sequence

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SOURCE_PATH = (
    ROOT
    / "attached_assets"
    / "PC___Computer_-_Ragnarok_Online_-_Enemies_-_Goblin_(Axe)_1789227334422.png"
)
ASSET_DIR = ROOT / "artifacts" / "dicebound" / "src" / "assets"
SPRITE_DIR = ASSET_DIR / "sprites"

CELL_SIZE = 256
FRAME_COUNT = 8
PIXEL_SCALE = 3
BASELINE_Y = 235

Rect = tuple[int, int, int, int]
Attachment = tuple[Image.Image, int, int]


# The seven left-facing standing poses are the first row.  Each box stops
# before the next pose and before the "Standing" guide at the right.
STANDING_LEFT: tuple[Rect, ...] = (
    (22, 15, 58, 75),
    (98, 15, 142, 75),
    (179, 18, 220, 72),
    (259, 15, 301, 75),
    (338, 19, 382, 71),
    (419, 15, 461, 75),
    (498, 17, 542, 73),
)

# The first walk row is the matching frontal/left-facing group.  The row below
# it is a rear-facing group and is intentionally not selected.
WALK_LEFT: tuple[Rect, ...] = (
    (16, 210, 57, 264),
    (97, 213, 137, 261),
    (178, 216, 215, 258),
    (260, 211, 293, 262),
    (340, 211, 374, 262),
    (418, 213, 456, 261),
    (497, 214, 537, 260),
    (576, 210, 618, 264),
)

# Only the first four attack poses face the hero.  The four poses starting at
# x=339 face away and are deliberately outside these boxes.
ATTACK_LEFT: tuple[Rect, ...] = (
    (19, 402, 55, 460),
    (100, 404, 133, 457),
    (178, 410, 215, 452),
    (258, 409, 295, 452),
)

# The first bottom-row character is the frontal hurt pose.  The fallen pose at
# x=190 is the left-facing death finish; the similar x=270 pose faces away.
HURT_LEFT: Rect = (21, 509, 61, 559)
FALLEN_LEFT: Rect = (166, 516, 219, 554)

# Six detached axe poses along the bottom row.  These boxes are above the
# horizontal guide and to the left of the "Axes" label.
AXES: tuple[Rect, ...] = (
    (12, 598, 30, 631),
    (62, 600, 86, 631),
    (111, 601, 133, 625),
    (169, 606, 177, 626),
    (203, 606, 216, 625),
    (243, 605, 265, 629),
)

# Two pale slash flashes at the bottom-right of the source.  They are used
# only on the impact portion of the attack strip.
ATTACK_EFFECTS: tuple[Rect, ...] = (
    (516, 595, 539, 640),
    (563, 597, 586, 642),
)


def load_source() -> Image.Image:
    """Load and validate the untouched, user-supplied source sheet."""

    source = Image.open(SOURCE_PATH).convert("RGBA")
    if source.size != (693, 651):
        raise ValueError(
            f"unexpected source dimensions: {source.size}; expected (693, 651)"
        )
    if source.getchannel("A").getextrema() != (0, 255):
        raise ValueError(
            "source is expected to contain both transparent and opaque pixels"
        )
    return source


def crop_art(source: Image.Image, box: Rect) -> Image.Image:
    """Return only visible source pixels from a hand-bounded art box."""

    patch = source.crop(box)
    visible = patch.getchannel("A").getbbox()
    if visible is None:
        raise ValueError(f"crop contains no art: {box}")
    return patch.crop(visible)


def compose_art(
    body: Image.Image,
    attachments: Sequence[Attachment],
) -> Image.Image:
    """Overlay source art at local offsets, retaining all opaque pixels."""

    parts: list[tuple[Image.Image, int, int]] = [(body, 0, 0), *attachments]
    min_x = min(x for image, x, _ in parts)
    min_y = min(y for image, _, y in parts)
    max_x = max(x + image.width for image, x, _ in parts)
    max_y = max(y + image.height for image, _, y in parts)
    canvas = Image.new("RGBA", (max_x - min_x, max_y - min_y), (0, 0, 0, 0))
    for image, x, y in parts:
        canvas.alpha_composite(image, (x - min_x, y - min_y))
    visible = canvas.getchannel("A").getbbox()
    if visible is None:
        raise ValueError("composited art contains no opaque pixels")
    return canvas.crop(visible)


def held_axe(
    source: Image.Image,
    axe_index: int,
    body: Image.Image,
    *,
    x: int = -4,
    bottom_gap: int = 4,
) -> Image.Image:
    """Put a detached axe into the character's forward hand."""

    axe = crop_art(source, AXES[axe_index])
    y = body.height - axe.height - bottom_gap
    return compose_art(body, ((axe, x, y),))


def held_fallen_axe(source: Image.Image, body: Image.Image) -> Image.Image:
    """Keep the axe visible in the hand of the fallen left-facing pose."""

    axe = crop_art(source, AXES[5])
    return compose_art(body, ((axe, -4, max(2, body.height - axe.height - 6)),))


def attack_frame(
    source: Image.Image,
    body_box: Rect,
    axe_index: int,
    effect_index: int | None = None,
) -> Image.Image:
    """Build one left-facing attack pose, optionally with its source flash."""

    body = crop_art(source, body_box)
    axe = crop_art(source, AXES[axe_index])
    attachments: list[Attachment] = [
        (axe, -4, body.height - axe.height - 4),
    ]
    if effect_index is not None:
        effect = crop_art(source, ATTACK_EFFECTS[effect_index])
        # The slash is in front of the raised weapon, to the left of this
        # left-facing goblin.  Its full source shape remains in the crop.
        attachments.append((effect, -27, max(-2, body.height - effect.height + 2)))
    return compose_art(body, attachments)


def render_frame(art: Image.Image) -> Image.Image:
    """Nearest-neighbour scale one pose and anchor its feet at the baseline."""

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


def make_sheet(frames: Sequence[Image.Image]) -> Image.Image:
    """Build a horizontal eight-frame sheet from aligned source poses."""

    if len(frames) != FRAME_COUNT:
        raise ValueError(f"expected {FRAME_COUNT} frames, got {len(frames)}")
    sheet = Image.new("RGBA", (CELL_SIZE * FRAME_COUNT, CELL_SIZE), (0, 0, 0, 0))
    for index, art in enumerate(frames):
        sheet.alpha_composite(render_frame(art), (index * CELL_SIZE, 0))
    return sheet


def save_png(image: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, format="PNG", optimize=True, compress_level=9)


def main() -> None:
    source = load_source()

    # Seven source standing poses make a smooth front-facing idle cycle.
    idle_art = [
        held_axe(source, 0, crop_art(source, box))
        for box in (
            STANDING_LEFT[0],
            STANDING_LEFT[1],
            STANDING_LEFT[2],
            STANDING_LEFT[3],
            STANDING_LEFT[4],
            STANDING_LEFT[5],
            STANDING_LEFT[6],
            STANDING_LEFT[5],
        )
    ]

    attack_specs = (
        (ATTACK_LEFT[0], 0, None),
        (ATTACK_LEFT[1], 1, None),
        (ATTACK_LEFT[2], 2, None),
        (ATTACK_LEFT[3], 3, 0),
        (ATTACK_LEFT[3], 4, 1),
        (ATTACK_LEFT[2], 5, 1),
        (ATTACK_LEFT[1], 4, None),
        (ATTACK_LEFT[0], 2, None),
    )
    attack_art = [
        attack_frame(source, body_box, axe_index, effect_index)
        for body_box, axe_index, effect_index in attack_specs
    ]

    hurt_body = held_axe(source, 0, crop_art(source, HURT_LEFT))
    fallen_body = held_fallen_axe(source, crop_art(source, FALLEN_LEFT))
    hit_art = [hurt_body] * FRAME_COUNT
    death_art = [hurt_body, fallen_body, fallen_body, fallen_body,
                 fallen_body, fallen_body, fallen_body, fallen_body]

    save_png(make_sheet(idle_art), SPRITE_DIR / "goblin-pixel-idle.png")
    save_png(make_sheet(attack_art), SPRITE_DIR / "goblin-pixel-attack.png")
    save_png(make_sheet(hit_art), SPRITE_DIR / "goblin-pixel-hit.png")
    save_png(make_sheet(death_art), SPRITE_DIR / "goblin-pixel-death.png")

    # The standalone fallback is the first aligned, armed idle frame.
    save_png(render_frame(idle_art[0]), ASSET_DIR / "goblin-pixel.png")


if __name__ == "__main__":
    main()