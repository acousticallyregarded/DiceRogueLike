"""Key only the bright green screen, preserving the goblin's muted green skin."""
from pathlib import Path
from PIL import Image, ImageSequence

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "artifacts/dicebound/src/assets"
FILES = {
    "idle": "Idle_custom-The_goblin_stands_with_a_sligh_west_1789255608247.gif",
    "attack": "Idle_custom-The_goblin_winds_up_by_pulling_west_1789255608248.gif",
    "hit": "Idle_custom-The_green_goblin_recoils_sharp_west_1789255608248.gif",
    "death": "Idle_custom-The_goblin_clutches_its_chest_west_1789255608249.gif",
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
    sheet.save(ASSETS / "sprites" / f"custom-goblin-{action}.png", optimize=True)
    if action == "idle":
        frames[0].save(ASSETS / "custom-goblin.png", optimize=True)
    print(f"Goblin {action}: 9 transparent 96px frames, 1800ms")