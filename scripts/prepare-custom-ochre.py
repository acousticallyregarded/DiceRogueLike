"""Extract the supplied orange Ochre Jelly animations, preserving originals."""
from pathlib import Path
from PIL import Image, ImageSequence

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "artifacts/dicebound/src/assets"
FILES = {
    "idle": "Idle_custom-The_orange_blob_sways_its_body_west_1789255652066.gif",
    "attack": "Idle_custom-The_orange_slime_creature_wind_west_1789255652066.gif",
    "hit": "Idle_custom-The_orange_slime_jolts_violent_west_1789255652067.gif",
    "death": "Idle_custom-The_orange_slime_creature_shud_west_1789255652067.gif",
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
    sheet.save(ASSETS / "sprites" / f"custom-ochre-{action}.png", optimize=True)
    if action == "idle":
        frames[0].save(ASSETS / "custom-ochre.png", optimize=True)
    print(f"Ochre Jelly {action}: 9 transparent 96px frames, 1800ms")