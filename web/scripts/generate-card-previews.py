"""Generate the 5-second pixel-art hub previews."""

from math import sin, pi
from pathlib import Path
from random import Random

from PIL import Image, ImageDraw


OUT = Path(__file__).resolve().parents[1] / "public/assets/asteroids/card-preview.gif"
STILL = OUT.with_name("card-preview-still.png")
W, H = 160, 70
FRAMES = 50
random = Random(7)
stars = [(random.randrange(W), random.randrange(H), random.choice(("#34536e", "#567c99", "#a4d8dd"))) for _ in range(58)]


def rock(draw, x, y, r):
    points = [(x-r, y-r//3), (x-r//2, y-r), (x+r//3, y-r), (x+r, y-r//3),
              (x+r-r//4, y+r//2), (x+r//4, y+r), (x-r//2, y+r-r//5), (x-r, y+r//3)]
    draw.polygon(points, fill="#596577", outline="#a0aab2")
    draw.polygon([(x-r+3, y), (x-r//3, y+r//2), (x+r//3, y+r//3), (x+r-r//4, y+r//2),
                  (x+r//4, y+r), (x-r//2, y+r-r//5)], fill="#394758")
    draw.rectangle((x-r//3, y-r//2, x+1, y-r//2+2), fill="#313d4f")
    draw.rectangle((x+r//3, y+1, x+r//3+2, y+3), fill="#263345")


def ship(draw, x, y, flame):
    draw.polygon([(x-2, y+6), (x, y+11+flame), (x+2, y+6)], fill="#fb923c")
    draw.rectangle((x-1, y+7, x+1, y+11+flame), fill="#fef08a")
    draw.polygon([(x, y-12), (x+4, y-4), (x+11, y+4), (x+12, y+9), (x+4, y+5),
                  (x, y+7), (x-4, y+5), (x-12, y+9), (x-11, y+4), (x-4, y-4)],
                 fill="#223649", outline="#75e9f0")
    draw.polygon([(x, y-10), (x+3, y-1), (x+4, y+5), (x, y+3), (x-4, y+5),
                  (x-3, y-1)], fill="#dd534e")
    draw.rectangle((x-2, y-4, x+2, y), fill="#b8f8ff")
    draw.point((x-9, y+5), fill="#fb923c")
    draw.point((x+9, y+5), fill="#fb923c")


frames = []
for i in range(FRAMES):
    im = Image.new("RGB", (W, H), "#070d1b")
    d = ImageDraw.Draw(im)
    d.rectangle((0, 0, W, 7), fill="#0b1829")
    for n, (x, y, color) in enumerate(stars):
        sy = (y + i * (1 + n % 3) // 3) % H
        d.point((x, sy), fill=color)
        if n % 11 == 0:
            d.line((x, sy, x, min(H-1, sy+2)), fill="#476c88")

    # Rocks enter from the top and travel behind the ship.
    for x0, y0, speed, radius in ((25, -11, 1.0, 11), (127, 4, 0.75, 15),
                                  (67, -34, 1.15, 8), (149, -47, 0.9, 7)):
        y = int((y0 + i * speed) % (H + 2*radius) - radius)
        x = x0 + int(3 * sin((i + x0) * pi / 25))
        rock(d, x, y, radius)

    sx = 81 + round(6 * sin(i * 2*pi/FRAMES))
    sy = 52 + round(2 * sin(i * 4*pi/FRAMES))
    # Continuous rapid fire, with each shot naturally leaving the frame.
    for step in range(4):
        by = sy - 14 - ((i * 5 + step * 20) % 95)
        if 0 <= by < H:
            d.rectangle((sx-1, by-5, sx+1, by), fill="#8dfaff")
            d.point((sx, by-6), fill="#ffffff")
    ship(d, sx, sy, i % 3)

    # A target explodes once per loop; the opening and closing frames match.
    if 22 <= i < 35:
        age = i - 22
        cx, cy = 82, 17
        for dx, dy in ((-1, 0), (1, 0), (0, -1), (0, 1), (-1, -1), (1, 1), (1, -1), (-1, 1)):
            dist = 2 + age
            color = "#fff4af" if age < 4 else "#fb923c" if age < 9 else "#9a4c42"
            d.rectangle((cx+dx*dist, cy+dy*dist, cx+dx*dist+1, cy+dy*dist+1), fill=color)
        if age < 4:
            d.rectangle((cx-3, cy-3, cx+3, cy+3), fill="#fff4af")

    frames.append(im.resize((320, 140), Image.Resampling.NEAREST))

OUT.parent.mkdir(parents=True, exist_ok=True)
frames[0].save(STILL)
frames[0].save(OUT, save_all=True, append_images=frames[1:], duration=100,
               loop=0, optimize=True, disposal=2)
with Image.open(OUT) as gif:
    assert gif.n_frames == FRAMES
    assert sum(gif.seek(n) or gif.info["duration"] for n in range(FRAMES)) == 5000
print(OUT)


PONG_OUT = OUT.parents[1] / "pong-card-preview.gif"
pong_frames = []
for i in range(FRAMES):
    angle = i * 2*pi / FRAMES
    im = Image.new("RGB", (W, H), "#08101c")
    d = ImageDraw.Draw(im)
    d.rectangle((5, 6, W-6, H-7), outline="#315269")
    for y in range(10, H-8, 9):
        d.rectangle((79, y, 80, y+4), fill="#2c5262")
    d.text((61, 8), "02", fill="#79e8a0")
    d.text((87, 8), "01", fill="#f196ab")

    bx = round(80 + 61*sin(angle))
    by = round(36 + 13*sin(2*angle + 0.45))
    left_y = round(36 + 13*sin(2*angle + 0.25))
    right_y = round(36 + 13*sin(2*angle + 0.65))
    d.rectangle((11, left_y-9, 14, left_y+9), fill="#55df83")
    d.rectangle((12, left_y-7, 13, left_y+7), fill="#c0ffce")
    d.rectangle((145, right_y-9, 148, right_y+9), fill="#ea7390")
    d.rectangle((146, right_y-7, 147, right_y+7), fill="#ffd0df")

    for lag, color in ((4, "#234956"), (3, "#2c6977"), (2, "#429eaa"), (1, "#66d9e2")):
        a = (i-lag) * 2*pi / FRAMES
        tx = round(80 + 61*sin(a))
        ty = round(36 + 13*sin(2*a + 0.45))
        d.rectangle((tx-1, ty-1, tx+1, ty+1), fill=color)
    d.rectangle((bx-3, by-3, bx+3, by+3), fill="#67dce9")
    d.rectangle((bx-2, by-2, bx+2, by+2), fill="#ffffff")

    if abs(bx-80) > 59:
        hit_x = 18 if bx < 80 else 141
        for dx, dy in ((-4, -3), (-4, 3), (4, -3), (4, 3)):
            d.rectangle((hit_x+dx, by+dy, hit_x+dx+1, by+dy+1), fill="#fef08a")

    pong_frames.append(im.resize((320, 140), Image.Resampling.NEAREST))

pong_frames[0].save(PONG_OUT.with_name("pong-card-preview-still.png"))
pong_frames[0].save(PONG_OUT, save_all=True, append_images=pong_frames[1:],
                    duration=100, loop=0, optimize=True, disposal=2)
with Image.open(PONG_OUT) as gif:
    assert gif.n_frames == FRAMES
    assert sum(gif.seek(n) or gif.info["duration"] for n in range(FRAMES)) == 5000
print(PONG_OUT)
