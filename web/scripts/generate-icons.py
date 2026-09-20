"""Generate install icons from the existing neon lightning visual language."""

from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"
BASE = 1024


def render(size: int, filename: str) -> None:
    scale = BASE / 512
    points = [
        (118, 32), (442, 32), (324, 190), (478, 190),
        (236, 480), (236, 330), (66, 330), (188, 174), (32, 174),
    ]
    points = [(round(x * scale), round(y * scale)) for x, y in points]

    image = Image.new("RGBA", (BASE, BASE), "#080a10")
    glow = Image.new("RGBA", image.size, (0, 0, 0, 0))
    glow_draw = ImageDraw.Draw(glow)
    glow_draw.polygon(points, fill=(126, 20, 255, 235))
    glow = glow.filter(ImageFilter.GaussianBlur(48))
    image.alpha_composite(glow)

    bolt = Image.new("RGBA", image.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(bolt)
    draw.polygon(points, fill="#863bff")
    highlight = [(x, y - 12) for x, y in points[:4]] + [(x, y) for x, y in reversed(points[4:])]
    draw.line(highlight[:5], fill="#47bfff", width=18, joint="curve")
    image.alpha_composite(bolt)

    image.resize((size, size), Image.Resampling.LANCZOS).convert("RGB").save(
        PUBLIC / filename, "PNG", optimize=True
    )


if __name__ == "__main__":
    render(192, "icon-192.png")
    render(512, "icon-512.png")
    render(180, "apple-touch-icon.png")
