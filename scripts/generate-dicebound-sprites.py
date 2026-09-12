#!/usr/bin/env python3
"""Build Dicebound's transparent 8-frame sprite sheets.

The source art is intentionally left untouched.  This generator uses Pillow's
alpha masks to cut out major articulated parts (weapons, paws, legs, tails,
and shields), rotates/translates those parts around hand or joint pivots, and
then downsamples each pose into a 256px cell.  The result is a deterministic
rigged cutout animation rather than eight copies of a translated still.

Every output sheet is eight 256x256 frames in one horizontal row.  Frames use
the source subject's alpha bounding-box bottom as a common baseline, so the
feet/platform pivot stays at the bottom-center of each cell.
"""

from __future__ import annotations

import math
from pathlib import Path
from typing import Callable, Iterable, Sequence

from PIL import Image, ImageChops, ImageDraw, ImageFilter


ROOT = Path(__file__).resolve().parents[1]
SOURCE_DIR = ROOT / "artifacts" / "dicebound" / "src" / "assets"
OUTPUT_DIR = SOURCE_DIR / "sprites"
SIZE = 1024
CELL = 256
FRAMES = 8
RESAMPLE = Image.Resampling.BICUBIC
LANCZOS = Image.Resampling.LANCZOS
Point = tuple[float, float]


def load(name: str) -> Image.Image:
    """Load one of the original art files without modifying it."""

    return Image.open(SOURCE_DIR / f"{name}.png").convert("RGBA")


def alpha_bbox(image: Image.Image, threshold: int = 10) -> tuple[int, int, int, int]:
    alpha = image.getchannel("A").point(lambda value: 255 if value > threshold else 0)
    bbox = alpha.getbbox()
    if bbox is None:
        raise ValueError("sprite has no visible alpha")
    return bbox


def polygon_mask(
    size: tuple[int, int],
    points: Sequence[Point],
    feather: float = 0.0,
) -> Image.Image:
    """Return a soft mask in source-image coordinates."""

    mask = Image.new("L", size, 0)
    draw = ImageDraw.Draw(mask)
    draw.polygon([(round(x), round(y)) for x, y in points], fill=255)
    if feather:
        mask = mask.filter(ImageFilter.GaussianBlur(feather))
    return mask


def ellipse_mask(
    size: tuple[int, int],
    box: tuple[float, float, float, float],
    feather: float = 0.0,
) -> Image.Image:
    mask = Image.new("L", size, 0)
    ImageDraw.Draw(mask).ellipse(tuple(round(v) for v in box), fill=255)
    if feather:
        mask = mask.filter(ImageFilter.GaussianBlur(feather))
    return mask


def combine_masks(*masks: Image.Image) -> Image.Image:
    result = Image.new("L", masks[0].size, 0)
    for mask in masks:
        result = ImageChops.lighter(result, mask)
    return result


def masked_layer(source: Image.Image, mask: Image.Image) -> Image.Image:
    """Keep source alpha only where the articulated-piece mask is present."""

    layer = source.copy()
    layer.putalpha(ImageChops.multiply(source.getchannel("A"), mask))
    return layer


def remove_from(source: Image.Image, mask: Image.Image) -> Image.Image:
    base = source.copy()
    base.putalpha(ImageChops.subtract(source.getchannel("A"), mask))
    return base


def move_layer(
    layer: Image.Image,
    angle: float = 0.0,
    pivot: Point = (512, 512),
    dx: float = 0.0,
    dy: float = 0.0,
) -> Image.Image:
    """Rotate a full-canvas cutout around a source-space joint and move it."""

    result = layer
    if angle:
        result = result.rotate(
            angle,
            resample=RESAMPLE,
            center=(round(pivot[0]), round(pivot[1])),
            expand=False,
        )
    if dx or dy:
        # PIL's affine coefficients map output coordinates back to input.
        result = result.transform(
            result.size,
            Image.Transform.AFFINE,
            (1, 0, -dx, 0, 1, -dy),
            resample=RESAMPLE,
        )
    return result


def transform_whole(
    image: Image.Image,
    pivot: Point,
    scale_x: float = 1.0,
    scale_y: float = 1.0,
    angle: float = 0.0,
    dx: float = 0.0,
    dy: float = 0.0,
) -> Image.Image:
    """Scale/tilt an entire pose around a stable joint or feet pivot."""

    px, py = pivot
    # output = pivot + (source - pivot) * scale + delta
    coefficients = (
        1.0 / scale_x,
        0,
        px - px / scale_x - dx / scale_x,
        0,
        1.0 / scale_y,
        py - py / scale_y - dy / scale_y,
    )
    result = image.transform(image.size, Image.Transform.AFFINE, coefficients, resample=RESAMPLE)
    if angle:
        result = result.rotate(
            angle,
            resample=RESAMPLE,
            center=(round(px + dx), round(py + dy)),
            expand=False,
        )
    return result


def articulated(
    source: Image.Image,
    parts: Iterable[tuple[Image.Image, Point, float, float, float]],
    whole: tuple[Point, float, float, float, float, float] | None = None,
) -> Image.Image:
    """Cut parts out of a source, pose them, and composite them back."""

    prepared = [(masked_layer(source, mask), pivot, angle, dx, dy, mask) for mask, pivot, angle, dx, dy in parts]
    removed = combine_masks(*(item[-1] for item in prepared)) if prepared else Image.new("L", source.size, 0)
    result = remove_from(source, removed)
    for layer, pivot, angle, dx, dy, _ in prepared:
        result = Image.alpha_composite(result, move_layer(layer, angle, pivot, dx, dy))
    if whole:
        pivot, sx, sy, angle, dx, dy = whole
        result = transform_whole(result, pivot, sx, sy, angle, dx, dy)
    return result


def draw_attack_flash(
    image: Image.Image,
    center: Point,
    radius: float,
    color: tuple[int, int, int, int],
    phase: float,
) -> Image.Image:
    """Add a restrained, transparent impact glint to hit/attack poses."""

    overlay = Image.new("RGBA", image.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    cx, cy = center
    points: list[tuple[int, int]] = []
    for index in range(12):
        angle = phase + (math.pi * 2 * index / 12)
        length = radius if index % 2 == 0 else radius * 0.34
        points.append((round(cx + math.cos(angle) * length), round(cy + math.sin(angle) * length)))
    draw.polygon(points, fill=color)
    return Image.alpha_composite(image, overlay)


def fit_cell(
    pose: Image.Image,
    source_box: tuple[int, int, int, int],
    target_height: int,
    center_x: float,
    baseline_y: int = 244,
    cleanup_minimum: int | None = None,
) -> Image.Image:
    """Scale a source-resolution pose into one 256px cell with a common pivot."""

    left, top, right, bottom = source_box
    source_height = max(1, bottom - top)
    scale = target_height / source_height
    resized = pose.resize(
        (round(pose.width * scale), round(pose.height * scale)),
        resample=LANCZOS,
    )
    canvas = Image.new("RGBA", (CELL, CELL), (0, 0, 0, 0))
    # Use the unwarped source bbox as the stable feet/platform anchor.
    source_center_x = (left + right) / 2
    x = round(CELL / 2 - source_center_x * scale + (center_x - source_center_x) * scale)
    y = round(baseline_y - bottom * scale)
    canvas.alpha_composite(resized, (x, y))
    if cleanup_minimum is not None:
        canvas = remove_small_components(canvas, cleanup_minimum)
    return canvas


def remove_small_components(image: Image.Image, minimum: int) -> Image.Image:
    """Remove detached antialiased mask scraps, retaining intentional art."""

    alpha = image.getchannel("A")
    pixels = alpha.load()
    width, height = image.size
    visited: set[tuple[int, int]] = set()
    remove: list[tuple[int, int]] = []
    for y in range(height):
        for x in range(width):
            if pixels[x, y] < 20 or (x, y) in visited:
                continue
            stack = [(x, y)]
            visited.add((x, y))
            component: list[tuple[int, int]] = []
            while stack:
                point = stack.pop()
                component.append(point)
                px, py = point
                for neighbor in ((px - 1, py), (px + 1, py), (px, py - 1), (px, py + 1)):
                    nx, ny = neighbor
                    if (
                        0 <= nx < width
                        and 0 <= ny < height
                        and neighbor not in visited
                        and pixels[nx, ny] >= 20
                    ):
                        visited.add(neighbor)
                        stack.append(neighbor)
            if len(component) < minimum:
                remove.extend(component)
    if remove:
        cleaned = image.copy()
        cleaned_alpha = cleaned.getchannel("A")
        for x, y in remove:
            cleaned_alpha.putpixel((x, y), 0)
        cleaned.putalpha(cleaned_alpha)
        return cleaned
    return image


def sheet(
    poses: Sequence[Image.Image],
    source: Image.Image,
    target_height: int,
    center_x: float | None = None,
    cleanup_minimum: int | None = None,
) -> Image.Image:
    if len(poses) != FRAMES:
        raise ValueError(f"expected {FRAMES} poses, got {len(poses)}")
    source_box = alpha_bbox(source)
    if center_x is None:
        center_x = (source_box[0] + source_box[2]) / 2
    cells = [fit_cell(pose, source_box, target_height, center_x, cleanup_minimum=cleanup_minimum) for pose in poses]
    result = Image.new("RGBA", (CELL * FRAMES, CELL), (0, 0, 0, 0))
    for index, cell in enumerate(cells):
        result.alpha_composite(cell, (index * CELL, 0))
    return result


def hero_walk(source: Image.Image) -> list[Image.Image]:
    left_leg = polygon_mask(source.size, [(396, 724), (510, 728), (511, 921), (387, 926)])
    right_leg = polygon_mask(source.size, [(535, 726), (658, 730), (670, 914), (548, 925)])
    sword = polygon_mask(
        source.size,
        [(150, 298), (204, 276), (327, 512), (368, 536), (352, 575), (315, 576), (300, 641),
         (269, 648), (269, 590), (230, 555), (170, 499)],
    )
    cape = polygon_mask(source.size, [(594, 501), (814, 573), (814, 796), (703, 824), (589, 731)])
    poses: list[Image.Image] = []
    stride = [(-13, 6), (-8, 1), (8, -5), (14, -1), (8, 5), (-8, 2), (-14, -4), (0, 0)]
    sword_angles = [-5, -1, 7, 12, 6, -4, -10, -5]
    for index in range(FRAMES):
        left_dx, left_dy = stride[index]
        right_dx, right_dy = (-left_dx, -left_dy)
        parts = [
            (left_leg, (450, 750), -index % 2 * 2 + (5 if index in (1, 2, 3) else -4), left_dx, left_dy),
            (right_leg, (592, 750), (5 if index in (5, 6, 7) else -4), right_dx, right_dy),
            (sword, (315, 582), sword_angles[index], round(left_dx * 0.35), round(left_dy * 0.35)),
            (cape, (646, 590), [-3, -6, -2, 4, 7, 4, -3, -1][index], 0, [2, 0, -2, -3, -1, 2, 4, 1][index]),
        ]
        pose = articulated(source, parts, whole=((512, 914), 1.0, 1.0 + (0.012 if index in (2, 6) else 0), 0, 0, 0))
        poses.append(pose)
    return poses


def hero_attack(source: Image.Image) -> list[Image.Image]:
    left_leg = polygon_mask(source.size, [(396, 724), (510, 728), (511, 921), (387, 926)])
    right_leg = polygon_mask(source.size, [(535, 726), (658, 730), (670, 914), (548, 925)])
    sword = polygon_mask(
        source.size,
        [(150, 298), (204, 276), (327, 512), (368, 536), (352, 575), (315, 576), (300, 641),
         (269, 648), (269, 590), (230, 555), (170, 499)],
    )
    cape = polygon_mask(source.size, [(594, 501), (814, 573), (814, 796), (703, 824), (589, 731)])
    swing = [-12, -32, -58, -78, -49, -12, 26, 48]
    poses: list[Image.Image] = []
    for index, angle in enumerate(swing):
        parts = [
            (left_leg, (450, 750), [7, 9, 4, -2, -7, -10, -5, 2][index], [-8, -10, -3, 4, 10, 6, -2, -5][index], [3, 0, -3, -4, -1, 2, 4, 2][index]),
            (right_leg, (592, 750), [-6, -8, -2, 5, 9, 7, 1, -4][index], [8, 10, 4, -4, -10, -6, 2, 5][index], [0, -3, -5, -2, 2, 4, 2, 0][index]),
            (sword, (315, 582), angle, [0, -2, -8, -14, -9, 2, 10, 14][index], [0, -2, -7, -10, -4, 4, 8, 5][index]),
            (cape, (646, 590), [-2, -7, -11, -5, 5, 10, 5, -1][index], 0, [-1, -4, -7, -4, 2, 6, 4, 1][index]),
        ]
        pose = articulated(source, parts)
        if index in (2, 3, 4, 5):
            pose = draw_attack_flash(pose, (347 + index * 14, 440 + index * 13), 55 + (index % 2) * 14, (248, 202, 69, 62), -0.7)
        poses.append(pose)
    return poses


def hero_hit(source: Image.Image) -> list[Image.Image]:
    sword = polygon_mask(
        source.size,
        [(150, 298), (204, 276), (327, 512), (368, 536), (352, 575), (315, 576), (300, 641),
         (269, 648), (269, 590), (230, 555), (170, 499)],
    )
    cape = polygon_mask(source.size, [(594, 501), (814, 573), (814, 796), (703, 824), (589, 731)])
    recoil = [-2, -9, -15, -10, 0, 8, 12, 4]
    poses: list[Image.Image] = []
    for index, angle in enumerate(recoil):
        parts = [
            (sword, (315, 582), [6, 16, 28, 18, 5, -8, -15, -5][index], [0, -3, -9, -7, 1, 8, 10, 3][index], [0, 3, 6, 3, -1, -4, -6, -2][index]),
            (cape, (646, 590), [0, 6, 13, 8, -1, -8, -10, -3][index], 0, [0, 4, 7, 4, -2, -5, -6, -1][index]),
        ]
        pose = articulated(source, parts, whole=((512, 914), 1.0, 1.0 - (0.018 if index in (2, 3, 4) else 0), angle, [0, -4, -8, -4, 3, 7, 5, 1][index], 0))
        pose = draw_attack_flash(pose, (760 - index * 30, 505 + index * 12), 32 + (index % 3) * 9, (235, 76, 82, 58), 0.4 + index * 0.2)
        poses.append(pose)
    return poses


def wolf_idle(source: Image.Image) -> list[Image.Image]:
    front_leg = polygon_mask(source.size, [(478, 588), (650, 614), (674, 901), (492, 907)])
    rear_leg = polygon_mask(source.size, [(675, 602), (822, 610), (836, 882), (700, 891)])
    poses: list[Image.Image] = []
    for index in range(FRAMES):
        poses.append(
            articulated(
                source,
                [
                    (front_leg, (558, 650), [2, 4, 2, -3, -5, -3, 1, 3][index], [0, -2, -4, -2, 2, 3, 1, 0][index], [0, -1, -3, -2, 1, 2, 1, 0][index]),
                    (rear_leg, (744, 648), [-3, -2, 2, 5, 4, 1, -3, -4][index], [0, 1, 3, 3, 1, -2, -3, -1][index], [1, 1, 0, -2, -2, 0, 1, 2][index]),
                ],
            )
        )
    return poses


def wolf_attack(source: Image.Image) -> list[Image.Image]:
    head = polygon_mask(source.size, [(112, 140), (616, 140), (638, 607), (220, 650), (110, 504)])
    front_leg = polygon_mask(source.size, [(478, 588), (650, 614), (674, 901), (492, 907)])
    poses: list[Image.Image] = []
    for index in range(FRAMES):
        head_angle = [0, -3, -7, -10, -6, 2, 8, 4][index]
        pose = articulated(
            source,
            [
                (head, (385, 522), head_angle, [0, -2, -5, -6, -3, 2, 5, 2][index], [0, 2, 7, 11, 6, -2, -6, -2][index]),
                (front_leg, (558, 650), [0, 4, 8, 3, -6, -9, -4, 1][index], [0, -4, -8, -3, 4, 8, 4, 0][index], [0, -2, -6, -5, -1, 4, 5, 1][index]),
            ],
        )
        if index in (2, 3, 4, 5):
            pose = draw_attack_flash(pose, (238 + index * 16, 496 - index * 6), 30 + (index == 3) * 20, (255, 182, 58, 56), 0.15)
        poses.append(pose)
    return poses


def slime_idle(source: Image.Image) -> list[Image.Image]:
    poses: list[Image.Image] = []
    squash = [(0.98, 1.02), (1.00, 1.00), (1.03, 0.97), (1.06, 0.94), (1.03, 0.97), (1.00, 1.00), (0.98, 1.02), (0.97, 1.03)]
    for index, (sx, sy) in enumerate(squash):
        poses.append(transform_whole(source, (512, 806), sx, sy, [-1, 0, 1, 0, -1, 0, 1, 0][index], 0, [1, 0, -1, -2, -1, 0, 1, 1][index]))
    return poses


def slime_attack(source: Image.Image) -> list[Image.Image]:
    # Squashing, springing, and a lifted front edge create a readable slime lunge.
    settings = [
        (1.02, 0.98, 0, 0, 0),
        (1.08, 0.92, -2, -4, -3),
        (1.16, 0.84, -4, -7, -6),
        (1.20, 0.77, -2, -2, -15),
        (1.12, 0.88, 4, 7, -14),
        (1.03, 0.98, 7, 10, -6),
        (0.98, 1.04, 4, 5, 1),
        (1.00, 1.00, 0, 0, 0),
    ]
    poses: list[Image.Image] = []
    for index, (sx, sy, angle, dx, dy) in enumerate(settings):
        pose = transform_whole(source, (512, 806), sx, sy, angle, dx * 2, dy * 3)
        if index in (3, 4, 5):
            pose = draw_attack_flash(pose, (515 + dx * 2, 282 + dy * 3), 27 + index * 3, (198, 247, 80, 66), -0.6)
        poses.append(pose)
    return poses


def goblin_idle(source: Image.Image) -> list[Image.Image]:
    mace = polygon_mask(source.size, [(72, 220), (292, 224), (390, 667), (300, 757), (172, 690), (72, 510)])
    poses: list[Image.Image] = []
    for index in range(FRAMES):
        poses.append(
            articulated(
                source,
                [(mace, (302, 612), [4, 1, -4, -7, -4, 1, 6, 3][index], [0, -1, -2, -1, 1, 2, 1, 0][index], [1, 0, -1, -2, -1, 1, 2, 1][index])],
                whole=((512, 866), 1.0, 1.0 + (0.01 if index in (2, 6) else 0), 0, 0, 0),
            )
        )
    return poses


def goblin_attack(source: Image.Image) -> list[Image.Image]:
    mace = polygon_mask(source.size, [(72, 220), (292, 224), (390, 667), (300, 757), (172, 690), (72, 510)])
    arm = polygon_mask(source.size, [(261, 479), (442, 509), (448, 722), (285, 712)])
    swing = [-10, -30, -57, -73, -49, -13, 22, 43]
    poses: list[Image.Image] = []
    for index, angle in enumerate(swing):
        pose = articulated(
            source,
            [
                (mace, (302, 612), angle, [0, -4, -10, -15, -8, 1, 9, 12][index], [0, -4, -9, -12, -5, 3, 8, 5][index]),
                (arm, (358, 604), angle * 0.24, [0, -2, -4, -4, -2, 1, 3, 3][index], [0, -1, -3, -4, -2, 1, 2, 1][index]),
            ],
        )
        if index in (2, 3, 4, 5):
            pose = draw_attack_flash(pose, (278 + index * 12, 402 + index * 5), 37 + (index == 3) * 16, (251, 164, 69, 58), -0.4)
        poses.append(pose)
    return poses


def skeleton_idle(source: Image.Image) -> list[Image.Image]:
    sword = polygon_mask(source.size, [(180, 390), (278, 380), (407, 596), (399, 700), (330, 692), (260, 612)])
    shield = ellipse_mask(source.size, (588, 500, 790, 762))
    poses: list[Image.Image] = []
    for index in range(FRAMES):
        poses.append(
            articulated(
                source,
                [
                    (sword, (356, 613), [4, 1, -4, -6, -3, 2, 6, 3][index], 0, [1, 0, -1, -2, -1, 1, 2, 1][index]),
                    (shield, (684, 630), [-3, -1, 2, 4, 2, -1, -4, -2][index], [0, 1, 2, 1, -1, -2, -1, 0][index], 0),
                ],
            )
        )
    return poses


def skeleton_attack(source: Image.Image) -> list[Image.Image]:
    sword = polygon_mask(source.size, [(180, 390), (278, 380), (407, 596), (399, 700), (330, 692), (260, 612)])
    arm = polygon_mask(source.size, [(303, 528), (450, 525), (470, 704), (337, 714)])
    shield = ellipse_mask(source.size, (588, 500, 790, 762))
    swing = [-8, -30, -58, -78, -51, -15, 22, 48]
    poses: list[Image.Image] = []
    for index, angle in enumerate(swing):
        pose = articulated(
            source,
            [
                (sword, (356, 613), angle, [0, -3, -9, -14, -8, 1, 9, 13][index], [0, -2, -7, -10, -4, 4, 8, 5][index]),
                (arm, (385, 611), angle * 0.22, [0, -1, -4, -6, -3, 1, 4, 5][index], [0, -1, -3, -5, -2, 2, 4, 2][index]),
                (shield, (684, 630), [-2, -4, -3, 1, 4, 5, 2, -1][index], [0, 0, -2, -2, 0, 2, 3, 1][index], [0, 1, 2, 1, -1, -2, -1, 0][index]),
            ],
        )
        if index in (2, 3, 4, 5):
            pose = draw_attack_flash(pose, (316 + index * 15, 430 + index * 10), 30 + (index == 3) * 18, (235, 220, 154, 56), -0.7)
        poses.append(pose)
    return poses


def boss_idle(source: Image.Image) -> list[Image.Image]:
    sword = polygon_mask(source.size, [(420, 552), (952, 645), (953, 846), (765, 870), (516, 757)])
    wing = polygon_mask(source.size, [(82, 301), (451, 299), (514, 702), (89, 694)])
    poses: list[Image.Image] = []
    for index in range(FRAMES):
        poses.append(
            articulated(
                source,
                [
                    (sword, (501, 691), [3, 1, -2, -5, -3, 1, 5, 3][index], [0, -1, -2, -1, 1, 2, 1, 0][index], [0, 0, -1, -2, -1, 1, 2, 1][index]),
                    (wing, (343, 498), [0, -2, -4, -1, 3, 5, 2, -1][index], 0, [0, -2, -4, -2, 2, 4, 2, 0][index]),
                ],
            )
        )
    return poses


def boss_attack(source: Image.Image) -> list[Image.Image]:
    sword = polygon_mask(source.size, [(420, 552), (952, 645), (953, 846), (765, 870), (516, 757)])
    arm = polygon_mask(source.size, [(380, 430), (608, 494), (651, 742), (472, 784), (407, 649)])
    wing = polygon_mask(source.size, [(82, 301), (451, 299), (514, 702), (89, 694)])
    swing = [-2, -8, -15, -20, -12, -2, 16, 28]
    poses: list[Image.Image] = []
    for index, angle in enumerate(swing):
        pose = articulated(
            source,
            [
                (sword, (501, 691), angle, [0, -2, -4, -5, -3, 2, 7, 10][index], [0, -1, -2, -3, -2, 2, 6, 5][index]),
                (arm, (510, 634), angle * 0.18, [0, -1, -2, -3, -2, 1, 4, 5][index], [0, -1, -2, -2, -1, 1, 4, 3][index]),
                (wing, (343, 498), [0, -3, -6, -4, 2, 7, 5, 1][index], 0, [0, -2, -5, -4, 2, 5, 4, 1][index]),
            ],
        )
        if index in (2, 3, 4, 5):
            pose = draw_attack_flash(pose, (631 + index * 23, 569 + index * 10), 46 + (index == 3) * 20, (246, 67, 74, 66), -0.25)
        poses.append(pose)
    return poses


def save_sheet(
    name: str,
    source_name: str,
    builder: Callable[[Image.Image], list[Image.Image]],
    target_height: int,
    cleanup_minimum: int | None = None,
) -> None:
    source = load(source_name)
    poses = builder(source)
    result = sheet(poses, source, target_height, cleanup_minimum=cleanup_minimum)
    result.save(OUTPUT_DIR / f"{name}.png", "PNG", optimize=True)


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    jobs = [
        ("hero-walk", "hero", hero_walk, 216, 140),
        ("hero-attack", "hero", hero_attack, 216, 140),
        ("hero-hit", "hero", hero_hit, 216),
        ("wolf-idle", "wolf", wolf_idle, 211),
        ("wolf-attack", "wolf", wolf_attack, 211),
        ("slime-idle", "slime", slime_idle, 170),
        ("slime-attack", "slime", slime_attack, 170),
        ("goblin-idle", "goblin", goblin_idle, 215),
        ("goblin-attack", "goblin", goblin_attack, 200, 140),
        ("skeleton-idle", "skeleton", skeleton_idle, 215),
        ("skeleton-attack", "skeleton", skeleton_attack, 215, 140),
        ("boss-idle", "boss", boss_idle, 208),
        ("boss-attack", "boss", boss_attack, 188),
    ]
    for name, source_name, builder, target_height, *cleanup in jobs:
        save_sheet(name, source_name, builder, target_height, cleanup[0] if cleanup else None)
        print(f"wrote {name}.png ({CELL * FRAMES}x{CELL}, 8 frames)")


if __name__ == "__main__":
    main()