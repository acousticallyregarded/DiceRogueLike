"""Extract the supplied Mummy GIFs, preserving original poses and timing."""
from pathlib import Path
from PIL import Image, ImageSequence

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "artifacts/dicebound/src/assets"
FILES = {
    "idle": "Idle_custom-The_mummy_stands_centered_sli_west_1789255745452.gif",
    "attack": "Idle_custom-The_mummy_leans_back_to_wind_u_west_1789255745452.gif",
    "hit": "Idle_custom-The_mummy_staggers_backward_to_west_1789255745453.gif",
    "death": "Idle_custom-The_mummy_reels_backward_its_west_1789255745453.gif",
}
for action, filename in FILES.items():
    frames = []
    for source in ImageSequence.Iterator(Image.open(ROOT / "attached_assets" / filename)):
        frame = source.convert("RGBA")
        frame.putdata([
            (0, 0, 0, 0) if g > 200 and r < 80 and b < 80 else (r, g, b, a)
            for r, g, b, a in frame.getdata()
        ])
        assert frame.size == (100, 100) and source.info.get("duration") == 200
        frames.append(frame)
    assert len(frames) == 9
    sheet = Image.new("RGBA", (100 * len(frames), 100))
    for index, frame in enumerate(frames):
        sheet.alpha_composite(frame, (index * 100, 0))
    sheet.save(ASSETS / "sprites" / f"custom-mummy-{action}.png", optimize=True)
    if action == "idle":
        frames[0].save(ASSETS / "custom-mummy.png", optimize=True)
    print(f"Mummy {action}: 9 transparent 100px frames, 1800ms")