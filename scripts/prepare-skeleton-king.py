"""Extract supplied boss animation frames, retaining their original timing."""
from pathlib import Path
from PIL import Image, ImageSequence

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "artifacts/dicebound/src/assets"
FILES = {
    "death": ("Idle_custom-The_skeleton_king_collapses_to_west_1789260995265.gif", 25),
    "hit": ("Idle_custom-The_skeletal_king_recoils_shar_west_1789260995266.gif", 9),
    "fireball": ("Idle_custom-The_skeleton_knight_pulls_his_west_1789260995266.gif", 21),
    "idle": ("Idle_custom-The_skeleton_king_stands_firml_west_1789260995267.gif", 13),
    "sword": ("Idle_custom-The_skeletal_warrior_shifts_it_west_1789260995267.gif", 9),
}
for action, (filename, count) in FILES.items():
    frames = []
    for source in ImageSequence.Iterator(Image.open(ROOT / "attached_assets" / filename)):
        assert source.info.get("duration") == 200
        frame = source.convert("RGBA")
        frame.putdata([(0, 0, 0, 0) if g > 200 and r < 80 and b < 80 else (r, g, b, a)
                       for r, g, b, a in frame.getdata()])
        frames.append(frame)
    assert len(frames) == count
    sheet = Image.new("RGBA", (140 * count, 140))
    for i, frame in enumerate(frames):
        sheet.alpha_composite(frame, (140 * i, 0))
    sheet.save(OUT / "sprites" / f"king-{action}.png", optimize=True)
    if action == "idle":
        frames[0].save(OUT / "skeleton-king.png")