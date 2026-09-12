"""Extract the supplied Skeleton GIFs with transparent backgrounds."""
from pathlib import Path
from PIL import Image, ImageSequence

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "artifacts/dicebound/src/assets"
FILES = {
    "idle": "Idle_custom-The_skeleton_bobs_its_torso_up_west_1789255705302.gif",
    "attack": "Idle_custom-The_skeleton_winds_up_by_pulli_west_1789255705303.gif",
    "hit": "Idle_custom-The_skeleton_reels_backward_as_west_1789255705303.gif",
    "death": "Idle_custom-The_skeleton_hunches_its_shoul_west_1789255705304.gif",
}
for action, filename in FILES.items():
    frames = []
    for source in ImageSequence.Iterator(Image.open(ROOT / "attached_assets" / filename)):
        frame = source.convert("RGBA")
        frame.putdata([
            (0, 0, 0, 0) if g > 200 and r < 80 and b < 80 else (r, g, b, a)
            for r, g, b, a in frame.getdata()
        ])
        assert frame.size == (96, 96) and source.info.get("duration") == 200
        frames.append(frame)
    assert len(frames) == 9
    sheet = Image.new("RGBA", (96 * len(frames), 96))
    for index, frame in enumerate(frames):
        sheet.alpha_composite(frame, (index * 96, 0))
    sheet.save(ASSETS / "sprites" / f"custom-skeleton-{action}.png", optimize=True)
    if action == "idle":
        frames[0].save(ASSETS / "custom-skeleton.png", optimize=True)
    print(f"Skeleton {action}: 9 transparent 96px frames, 1800ms")