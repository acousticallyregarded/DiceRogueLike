"""Extract Winter Wolf animations without altering the uploaded GIFs."""
from pathlib import Path
from PIL import Image, ImageSequence

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "artifacts/dicebound/src/assets"
FILES = {
    "idle": "Idle_custom-The_ice_wolf_stands_firmly_wit_west_1789255784434.gif",
    "attack": "Idle_custom-The_ice_wolf_lunges_forward_p_west_1789255784435.gif",
    "hit": "Idle_custom-The_ice_wolf_flinches_as_its_b_west_1789255784435.gif",
    "death": "Idle_custom-The_icy_wolf_cub_collapses_by_west_1789255784435.gif",
}
for action, filename in FILES.items():
    frames = []
    for source in ImageSequence.Iterator(Image.open(ROOT / "attached_assets" / filename)):
        frame = source.convert("RGBA")
        frame.putdata([
            (0, 0, 0, 0) if g > 200 and r < 80 and b < 80 else (r, g, b, a)
            for r, g, b, a in frame.getdata()
        ])
        assert frame.size == (128, 128) and source.info.get("duration") == 200
        frames.append(frame)
    assert len(frames) == 9
    sheet = Image.new("RGBA", (128 * len(frames), 128))
    for index, frame in enumerate(frames):
        sheet.alpha_composite(frame, (index * 128, 0))
    sheet.save(ASSETS / "sprites" / f"custom-winter-wolf-{action}.png", optimize=True)
    if action == "idle":
        frames[0].save(ASSETS / "custom-winter-wolf.png", optimize=True)
    print(f"Winter Wolf {action}: 9 transparent 128px frames, 1800ms")