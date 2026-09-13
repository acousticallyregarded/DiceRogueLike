"""Extract the latest John attack uploads without altering their frames."""
from pathlib import Path
from PIL import Image, ImageSequence

root = Path(__file__).resolve().parents[1]
assets = root / "artifacts/dicebound/src/assets"
sources = {
    "lightning": ("Idle_custom-The_character_reaches_to_the_r_east_1789337783693.gif", 17),
    "cold": ("Idle_custom-The_character_reaches_behind_t_east_1789337350577.gif", 9),
    "acid": ("Idle_custom-The_character_pulls_a_glass_bo_east_1789337350579.gif", 25),
    "piercing": ("Idle_custom-The_character_swiftly_reaches_east_1789337350580.gif", 21),
    "fire": ("Idle_custom-The_character_reaches_to_his_s_east_1789337350581.gif", 25),
    "bludgeoning": ("Idle_custom-The_character_reaches_back_to_east_1789337350582.gif", 25),
    "takedown": ("Idle_custom-The_character_leans_his_torso_east_1789337350582.gif", 29),
}
for name, (filename, count) in sources.items():
    frames = []
    for source in ImageSequence.Iterator(Image.open(root / "attached_assets" / filename)):
        assert source.info.get("duration") == 200
        frame = source.convert("RGBA")
        assert frame.size == (256, 256)
        assert frame.getpixel((0, 0))[3] == 0
        frames.append(frame)
    assert len(frames) == count
    sheet = Image.new("RGBA", (256 * count, 256))
    for index, frame in enumerate(frames):
        sheet.alpha_composite(frame, (256 * index, 0))
    sheet.save(assets / "sprites" / f"john-{name}.png", optimize=True)
    frames[0].save(assets / "characters" / f"john-{name}.png", optimize=True)
    print(f"{name}: {count} frames, {count * 200}ms")