"""Extract the user's Ogre GIFs, retaining green skin and original poses."""
from pathlib import Path
from PIL import Image, ImageSequence

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "artifacts/dicebound/src/assets"
FILES = {
    "idle": "Idle_custom-The_orc_stands_with_its_weight_west_1789255875432.gif",
    "attack": "Idle_custom-The_orc_begins_the_attack_by_p_west_1789255875433.gif",
    "hit": "Idle_custom-The_orc_flinches_violently_as_west_1789255875433.gif",
    "death": "Idle_custom-The_green_orc_staggers_back_an_west_1789255875433.gif",
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
    sheet.save(ASSETS / "sprites" / f"custom-ogre-{action}.png", optimize=True)
    if action == "idle":
        frames[0].save(ASSETS / "custom-ogre.png", optimize=True)
    print(f"Ogre {action}: 9 transparent 100px frames, 1800ms")