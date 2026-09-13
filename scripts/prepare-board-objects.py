"""Preserve uploaded board animation frames and key only bright green."""
from pathlib import Path
from PIL import Image, ImageSequence

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "artifacts/dicebound/src/assets/board-objects"
OUT.mkdir(parents=True, exist_ok=True)
FILES = {
    "rest": "Idle_custom-The_tent_body_compresses_sligh_south_1789258007259.gif",
    "shop": "Idle_custom-The_bag_rhythmically_bobs_up_a_south_1789258007260.gif",
    "event": "Idle_custom-The_golden_triangular_frame_bo_south_1789258007260.gif",
    "enemy": "Idle_custom-The_magic_sword_gently_bobs_up_south_1789258007260.gif",
    "elite": "Idle_custom-the_flames_flicker_like_a_real_south_1789258007261.gif",
}
for kind, filename in FILES.items():
    frames = []
    for source in ImageSequence.Iterator(Image.open(ROOT / "attached_assets" / filename)):
        assert source.info.get("duration") == 200
        frame = source.convert("RGBA")
        frame.putdata([
            (0, 0, 0, 0) if g > 200 and r < 80 and b < 80 else (r, g, b, a)
            for r, g, b, a in frame.getdata()
        ])
        frames.append(frame)
    width, height = frames[0].size
    sheet = Image.new("RGBA", (width * len(frames), height))
    for i, frame in enumerate(frames):
        sheet.alpha_composite(frame, (i * width, 0))
    sheet.save(OUT / f"{kind}.png", optimize=True)
    print(kind, len(frames), width, height)