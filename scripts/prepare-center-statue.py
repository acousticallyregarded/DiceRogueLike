"""Prepare pedestal and aligned statue poses without changing the uploads."""
from pathlib import Path
from PIL import Image, ImageSequence

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "artifacts/dicebound/src/assets"
pedestal = Image.open(ROOT / "attached_assets/ChatGPT_Image_Sep_12,_2026,_08_51_48_PM_1789260737790.png").convert("RGBA")
bounds = pedestal.getchannel("A").point(lambda a: 255 if a > 128 else 0).getbbox()
pedestal.crop(bounds).save(OUT / "center-pedestal.png")
still = Image.open(ROOT / "attached_assets/south-west_1789260746540.png").convert("RGBA")
aligned = Image.new("RGBA", (148, 148))
aligned.alpha_composite(still, (10, 10))
aligned.save(OUT / "center-statue.png")
for name, filename, count in [
    ("center-statue-alert", "Idle_custom-The_skeleton_king_stands_firml_south-west_(1)_1789260802904.gif", 13),
    ("center-statue-ready", "Idle_custom-raises_the_sword_into_the_air_south-west_1789260866922.gif", 17),
]:
    frames = []
    for source in ImageSequence.Iterator(Image.open(ROOT / "attached_assets" / filename)):
        assert source.info.get("duration") == 200
        frame = source.convert("RGBA")
        frame.putdata([(0, 0, 0, 0) if g > 200 and r < 80 and b < 80 else (r, g, b, a)
                       for r, g, b, a in frame.getdata()])
        frames.append(frame)
    assert len(frames) == count
    sheet = Image.new("RGBA", (148 * count, 148))
    for i, frame in enumerate(frames):
        sheet.alpha_composite(frame, (148 * i, 0))
    sheet.save(OUT / "sprites" / f"{name}.png", optimize=True)