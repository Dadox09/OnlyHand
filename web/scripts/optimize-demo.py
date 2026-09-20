"""Convert the repository gameplay GIF to a smaller animated WebP for onboarding."""

from pathlib import Path
from PIL import Image, ImageSequence

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "images" / "demo.gif"
TARGET = ROOT / "web" / "public" / "demo.webp"


def main() -> None:
    image = Image.open(SOURCE)
    frames = [frame.convert("RGB") for frame in ImageSequence.Iterator(image)]
    durations = [frame.info.get("duration", image.info.get("duration", 70)) for frame in ImageSequence.Iterator(image)]
    frames[0].save(
        TARGET,
        "WEBP",
        save_all=True,
        append_images=frames[1:],
        duration=durations,
        loop=0,
        quality=72,
        method=6,
    )
    print(f"{SOURCE.name}: {SOURCE.stat().st_size} bytes")
    print(f"{TARGET.name}: {TARGET.stat().st_size} bytes")


if __name__ == "__main__":
    main()
