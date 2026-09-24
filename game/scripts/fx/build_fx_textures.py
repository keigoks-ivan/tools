"""Procedurally paints the combat FX textures used by game/3d-next/combat-fx.js.

Everything is generated here from math + seeded noise (no downloaded or copied art):

  game/assets/fx/fx-particles.png   512x512, 4x4 cells of 128 px, white RGB + alpha shape
  game/assets/fx/fx-strips.png      512x1024: top half 8 horizontal strips of 64 px (u = along, v = across),
                                    bottom half 2x2 ground decal cells of 256 px (one texture -> one draw call)
  game/assets/fx/fx-speedlines.webp 768x768 radial speed lines, clear centre (CSS overlay)
  game/assets/fx/fx-brush.png       1024x256 horizontal ink brush band (CSS mask)
  game/assets/fx/fx-grain.png       512x128 dry-brush streak grain (CSS mask for the title text)
  game/assets/fx/fx-cutin.webp      eye-band crop of a local render of our own heroine model (真・無雙 cut-in card);
                                    only rebuilt when --cutin-src <render.png> is given (the render is not kept in the repo)

Run:  python3 game/scripts/fx/build_fx_textures.py [--cutin-src path/to/heroine_face_render.png]
The layout constants must match PARTICLE_CELLS / STRIP_ROWS / DECAL_CELLS in combat-fx.js.
"""
from pathlib import Path

import numpy as np
from PIL import Image

OUT = Path(__file__).resolve().parents[2] / 'assets' / 'fx'
rng = np.random.default_rng(20260924)


def smooth(x):
    x = np.clip(x, 0, 1)
    return x * x * (3 - 2 * x)


def value_noise(h, w, cells, seed, octaves=4):
    """Tileable-ish fractal value noise in [0,1]."""
    r = np.random.default_rng(seed)
    out = np.zeros((h, w))
    amp, total = 1.0, 0.0
    for o in range(octaves):
        cy, cx = max(2, int(cells[0] * 2 ** o)), max(2, int(cells[1] * 2 ** o))
        grid = r.random((cy + 1, cx + 1))
        ys = np.linspace(0, cy, h, endpoint=False)
        xs = np.linspace(0, cx, w, endpoint=False)
        y0, x0 = ys.astype(int), xs.astype(int)
        fy, fx = smooth(ys - y0)[:, None], smooth(xs - x0)[None, :]
        a = grid[y0][:, x0]; b = grid[y0][:, x0 + 1]; c = grid[y0 + 1][:, x0]; d = grid[y0 + 1][:, x0 + 1]
        out += amp * ((a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy)
        total += amp
        amp *= 0.5
    return out / total


def to_img(alpha, rgb=None):
    alpha = np.clip(alpha, 0, 1)
    h, w = alpha.shape
    if rgb is None:
        rgb = np.ones((h, w, 3))
    arr = np.concatenate([np.clip(rgb, 0, 1), alpha[..., None]], axis=2)
    return Image.fromarray((arr * 255 + 0.5).astype(np.uint8))


def grid(n):
    c = (np.arange(n) + 0.5) / n * 2 - 1
    return np.meshgrid(c, c)  # x, y in [-1, 1], y down


# ---------------------------------------------------------------------------
# Particle atlas: 4x4 cells of 128 px. Cells must keep a few px of clear border for mipmaps.
# ---------------------------------------------------------------------------
N = 128


def cell_glow():
    x, y = grid(N)
    r = np.hypot(x, y)
    a = np.exp(-(r / 0.36) ** 2) * 0.85 + np.exp(-(r / 0.13) ** 2) * 0.6
    return a * smooth((0.98 - r) / 0.2)


def cell_flare():
    x, y = grid(N)
    r = np.hypot(x, y)
    core = np.exp(-(r / 0.12) ** 2)
    halo = np.exp(-(r / 0.42) ** 2) * 0.35
    ray_h = np.exp(-(y / 0.022) ** 2) * np.clip(1 - np.abs(x), 0, 1) ** 1.6
    ray_v = np.exp(-(x / 0.03) ** 2) * np.clip(1 - np.abs(y) / 0.75, 0, 1) ** 2.0 * 0.8
    diag = (np.exp(-(((x - y) / 1.414) / 0.02) ** 2) + np.exp(-(((x + y) / 1.414) / 0.02) ** 2)) * np.clip(1 - r / 0.5, 0, 1) ** 2 * 0.35
    a = core + halo + ray_h + ray_v + diag
    return np.clip(a, 0, 1) * smooth((0.99 - np.maximum(np.abs(x), np.abs(y))) / 0.04)


def cell_streak():
    # Head at the top (y = -1 in image rows == +v), tapered tail downwards.
    x, y = grid(N)
    along = (1 - y) / 2  # 1 at the top row, 0 at the bottom
    width = 0.10 + 0.20 * along ** 0.5
    a = np.exp(-(x / width) ** 2) * along ** 1.4
    a += np.exp(-(x / 0.05) ** 2) * np.exp(-((y + 0.78) / 0.14) ** 2) * 0.7  # hot head
    return np.clip(a, 0, 1) * smooth((0.97 - np.abs(y)) / 0.05)


def cell_shard():
    x, y = grid(N)
    # long diamond: |x|/0.28 + |y|/0.92 <= 1, slightly asymmetric for a chipped crystal look
    d = np.abs(x + 0.06 * y) / 0.3 + np.abs(y) / 0.92
    body = smooth((1 - d) / 0.06)
    facet = np.exp(-((x + 0.06 * y) / 0.035) ** 2) * (1 - np.abs(y))  # bright ridge
    return np.clip(body * 0.78 + facet * 0.5, 0, 1)


def cell_dust(seed):
    x, y = grid(N)
    r = np.hypot(x, y)
    n = value_noise(N, N, (3, 3), seed, 5)
    edge = r + (n - 0.5) * 0.55
    a = smooth((0.82 - edge) / 0.45) * (0.55 + 0.6 * n)
    return np.clip(a, 0, 1)


def cell_ring():
    x, y = grid(N)
    r = np.hypot(x, y)
    return np.exp(-((r - 0.78) / 0.07) ** 2) + np.exp(-((r - 0.78) / 0.2) ** 2) * 0.25


def cell_ember():
    x, y = grid(N)
    r = np.hypot(x, y)
    return np.clip(smooth((0.16 - r) / 0.06) + np.exp(-(r / 0.4) ** 2) * 0.45, 0, 1) * smooth((1 - r) / 0.15)


def cell_cutline():
    x, y = grid(N)
    taper = np.clip(1 - np.abs(x), 0, 1) ** 0.7
    a = np.exp(-(y / (0.03 * taper + 0.004)) ** 2) * taper
    a += np.exp(-(y / (0.12 * taper + 0.01)) ** 2) * taper * 0.35
    return np.clip(a, 0, 1) * smooth((0.99 - np.abs(x)) / 0.05)


def cell_flame(seed):
    """Soft teardrop flame: round base, wobbling tapered tip, brighter core."""
    x, y = grid(N)
    along = (1 - y) / 2  # 0 bottom .. 1 top
    n = value_noise(N, N, (2, 3), seed, 3)
    sway = (n - 0.5) * 0.5 * along ** 1.5
    xs = x + sway
    base = np.hypot(xs / 0.5, (along - 0.3) / 0.3)             # round bulb near the bottom
    tail_w = 0.5 * np.clip(1 - (along - 0.3) / 0.68, 0, 1) ** 1.4
    tail = np.where(along > 0.3, np.abs(xs) / np.maximum(tail_w, 1e-3), 9)
    d = np.minimum(base, tail)
    body = smooth((1 - d) / 0.55)
    core = smooth((0.55 - d) / 0.4) * 0.5
    return np.clip((body * 0.75 + core) * (0.75 + 0.35 * n), 0, 1) * smooth(along / 0.05) * smooth((0.99 - along) / 0.05)


def cell_twinkle():
    x, y = grid(N)
    r = np.hypot(x, y)
    rays = np.exp(-(y / 0.035) ** 2) * np.clip(1 - np.abs(x), 0, 1) ** 3 + np.exp(-(x / 0.035) ** 2) * np.clip(1 - np.abs(y), 0, 1) ** 3
    return np.clip(rays + np.exp(-(r / 0.12) ** 2), 0, 1)


def cell_rock(seed):
    x, y = grid(N)
    r_ = np.random.default_rng(seed)
    ang = np.arctan2(y, x)
    radius = np.full_like(ang, 0.62)
    for k in range(3, 7):
        radius += r_.uniform(-0.09, 0.09) * np.cos(k * ang + r_.uniform(0, 6.28))
    r = np.hypot(x, y)
    return smooth((radius - r) / 0.04)


def cell_impact(seed=77):
    """Anime hit spark: sharp spikes of uneven length around a hot core."""
    x, y = grid(N)
    r = np.hypot(x, y)
    ang = np.arctan2(y, x)
    r_ = np.random.default_rng(seed)
    a = np.zeros_like(r)
    for k in range(11):
        a0 = k / 11 * 2 * np.pi + r_.uniform(-0.2, 0.2)
        length = r_.uniform(0.55, 0.97) if k % 2 == 0 else r_.uniform(0.3, 0.55)
        d = np.abs(np.angle(np.exp(1j * (ang - a0))))
        half = 0.3 * np.clip(1 - r / length, 0, 1) ** 1.2    # wedge narrows to a sharp tip
        a = np.maximum(a, smooth((half - d) / 0.03) * (r < length))
    core = smooth((0.2 - r) / 0.1)
    halo = np.exp(-(r / 0.45) ** 2) * 0.35
    return np.clip(np.maximum(a, core) + halo, 0, 1) * smooth((1 - r) / 0.05)


def cell_disc():
    x, y = grid(N)
    return smooth((0.8 - np.hypot(x, y)) / 0.08)


def cell_noise_ring(seed):
    x, y = grid(N)
    r = np.hypot(x, y)
    n = value_noise(N, N, (4, 4), seed, 3)
    return np.clip(np.exp(-((r - 0.74 + (n - 0.5) * 0.12) / 0.1) ** 2) * (0.6 + 0.6 * n), 0, 1)


def build_particles():
    cells = [
        cell_glow(), cell_flare(), cell_streak(), cell_shard(),
        cell_dust(11), cell_dust(23) * 0.85, cell_ring(), cell_ember(),
        cell_cutline(), cell_flame(5), cell_twinkle(), cell_rock(9),
        cell_impact(), cell_disc(), cell_noise_ring(31), cell_flame(17),
    ]
    atlas = np.zeros((512, 512))
    for i, c in enumerate(cells):
        row, col = divmod(i, 4)
        atlas[row * N:(row + 1) * N, col * N:(col + 1) * N] = np.clip(c, 0, 1)
    to_img(atlas).save(OUT / 'fx-particles.png', optimize=True)


# ---------------------------------------------------------------------------
# Strip atlas: 8 rows of 512x64. Row image-y 0 == v = 1 (outer edge / blade tip).
# RGB carries the colour ramp (white-hot edge into violet), A the shape.
# ---------------------------------------------------------------------------
W, H = 512, 64


def strip_coords():
    u = (np.arange(W) + 0.5) / W
    v = 1 - (np.arange(H) + 0.5) / H
    return np.meshgrid(u, v)  # u along (0 tail .. 1 head), v across (0 inner .. 1 outer)


def ramp(t, stops):
    t = np.clip(t, 0, 1)
    out = np.zeros(t.shape + (3,))
    for i in range(len(stops) - 1):
        (t0, c0), (t1, c1) = stops[i], stops[i + 1]
        m = (t >= t0) & (t <= t1)
        f = ((t - t0) / max(1e-6, t1 - t0))[m][:, None]
        out[m] = np.array(c0) * (1 - f) + np.array(c1) * f
    return out


def strip_slash(heavy=False, seed=3):
    u, v = strip_coords()
    streaks = value_noise(H, W, (10, 1), seed, 3)  # varies across v, constant-ish along u -> speed streaks
    streaks = 0.55 + 0.9 * (streaks - 0.5)
    head = u ** (1.3 if heavy else 1.8)
    edge = np.exp(-((v - 0.9) / (0.07 if heavy else 0.05)) ** 2)
    body = smooth((v - 0.05) / 0.5) * smooth((1.0 - v) / 0.06)
    a = np.clip((body * (0.55 + 0.45 * v) * streaks + edge * 1.2) * head, 0, 1)
    a *= smooth(u / 0.05) * smooth((1 - u) / 0.04)
    heat = np.clip(edge * 1.1 + v ** 3 * 0.5 + (u > 0.85) * (u - 0.85) * 3 * v, 0, 1)
    if heavy:
        rgb = ramp(heat, [(0, (0.62, 0.26, 1.0)), (0.45, (1.0, 0.62, 0.9)), (0.75, (1.0, 0.88, 0.62)), (1, (1, 1, 1))])
    else:
        rgb = ramp(heat, [(0, (0.46, 0.2, 1.0)), (0.5, (0.78, 0.55, 1.0)), (1, (1, 1, 1))])
    return a, rgb


def strip_ring(seed=7):
    u, v = strip_coords()
    n = value_noise(H, W, (2, 24), seed, 3)
    a = np.exp(-((v - 0.6) / 0.08) ** 2) + np.exp(-((v - 0.55) / 0.3) ** 2) * 0.45 * (0.6 + 0.8 * n)
    a *= smooth(v / 0.1) * smooth((1 - v) / 0.1)
    heat = np.exp(-((v - 0.6) / 0.06) ** 2)
    rgb = ramp(heat, [(0, (0.55, 0.3, 1.0)), (0.6, (0.9, 0.75, 1.0)), (1, (1, 1, 1))])
    return np.clip(a, 0, 1), rgb


def strip_trail(seed=13):
    # u: 0 = oldest (tail) .. 1 = newest (head); v: 0 = blade root .. 1 = tip.
    u, v = strip_coords()
    streaks = value_noise(H, W, (14, 1), seed, 3)
    tip = np.exp(-((v - 0.86) / 0.08) ** 2)
    body = smooth((v - 0.02) / 0.55) * smooth((1 - v) / 0.1)
    age = u ** 1.25
    a = (body * (0.3 + 0.5 * v) * (0.6 + 0.8 * streaks) + tip * 1.1) * age
    a *= smooth((1 - u) / 0.03)
    heat = np.clip(tip * 1.1 * (0.4 + 0.6 * u) + v ** 4 * 0.4 * u, 0, 1)
    rgb = ramp(heat, [(0, (0.42, 0.18, 0.95)), (0.5, (0.8, 0.52, 1.0)), (1, (1, 0.97, 1))])
    return np.clip(a, 0, 1), rgb


def strip_dust(seed=19):
    u, v = strip_coords()
    n = value_noise(H, W, (3, 30), seed, 5)
    a = smooth((v - 0.05) / 0.35) * smooth((0.95 - v) / 0.3) * (0.35 + 0.9 * n)
    return np.clip(a, 0, 1), None


def strip_wind(seed=29):
    u, v = strip_coords()
    r_ = np.random.default_rng(seed)
    a = np.zeros_like(u)
    for _ in range(9):
        c = r_.uniform(0.1, 0.9)
        start, length = r_.uniform(0.0, 0.5), r_.uniform(0.35, 0.7)
        seg = smooth((u - start) / 0.08) * smooth((start + length - u) / 0.2)
        a += np.exp(-((v - c) / r_.uniform(0.012, 0.03)) ** 2) * seg * r_.uniform(0.5, 1)
    a *= u ** 0.6
    return np.clip(a, 0, 1), None


def strip_pillar(seed=37):
    # Light column: u wraps around the cylinder (tileable streaks), v = height (0 base .. 1 top).
    u, v = strip_coords()
    r_ = np.random.default_rng(seed)
    streak = np.zeros_like(u)
    for k in range(1, 7):  # sum of integer-frequency sines along u -> seamless wrap
        streak += np.sin(2 * np.pi * (k * 3 * u + r_.uniform(0, 1))) * r_.uniform(0.3, 1) / k
    streak = 0.5 + 0.5 * streak / 1.6
    ragged = 0.55 + 0.45 * np.sin(2 * np.pi * (5 * u + 0.3)) * np.sin(2 * np.pi * (7 * u + 0.1))
    a = (1 - v) ** 1.3 * (0.35 + 0.9 * np.clip(streak, 0, 1)) * smooth((ragged - v) / 0.25 + 0.6)
    a += np.exp(-((v - 0.04) / 0.035) ** 2) * 0.9
    heat = np.clip(np.exp(-((v - 0.04) / 0.06) ** 2) + (1 - v) ** 3 * 0.5 * streak, 0, 1)
    rgb = ramp(heat, [(0, (0.55, 0.28, 1.0)), (0.6, (0.9, 0.7, 1.0)), (1, (1, 1, 1))])
    return np.clip(a, 0, 1), rgb


def build_strips_and_decals():
    rows = [strip_slash(False, 3), strip_slash(True, 5), strip_ring(), strip_trail(),
            strip_dust(), strip_wind(), strip_pillar(), strip_slash(False, 41)]
    alpha = np.zeros((1024, 512))
    rgb = np.ones((1024, 512, 3))
    for i, (a, c) in enumerate(rows):
        a = a.copy()
        a[:2] = 0; a[-2:] = 0  # clear border so mipmaps of neighbouring rows never bleed
        alpha[i * H:(i + 1) * H] = a
        if c is not None:
            rgb[i * H:(i + 1) * H] = c
    for i, c in enumerate([decal_cracks(), decal_scorch(), decal_rune(), decal_burst()]):
        row, col = divmod(i, 2)
        c = c.copy(); c[:2] = 0; c[-2:] = 0; c[:, :2] = 0; c[:, -2:] = 0
        alpha[512 + row * D:512 + (row + 1) * D, col * D:(col + 1) * D] = c
    to_img(alpha, rgb).save(OUT / 'fx-strips.png', optimize=True)


# ---------------------------------------------------------------------------
# Ground decals: 2x2 cells of 256 px.
# ---------------------------------------------------------------------------
D = 256


def decal_cracks(seed=51):
    """Shattered-ground impact: jagged radial cracks, a broken web ring and a bright crater core."""
    from PIL import ImageDraw, ImageFilter
    r_ = np.random.default_rng(seed)
    S = D * 4
    img = Image.new('L', (S, S), 0)
    draw = ImageDraw.Draw(img)
    c = S / 2

    def crack(x, y, ang, length, width, depth):
        travelled = 0
        while travelled < length:
            seg = r_.uniform(28, 60)
            ang += r_.uniform(-0.28, 0.28)
            nx, ny = x + np.cos(ang) * seg, y + np.sin(ang) * seg
            draw.line([(x, y), (nx, ny)], fill=255, width=max(2, int(width)))
            x, y, travelled = nx, ny, travelled + seg
            width *= 0.9
            if depth < 1 and r_.random() < 0.16:
                crack(x, y, ang + r_.choice([-1, 1]) * r_.uniform(0.4, 0.8), length * 0.3, width * 0.7, depth + 1)
        return x, y

    spokes = 9
    ends = []
    for k in range(spokes):
        base = k / spokes * 2 * np.pi + r_.uniform(-0.18, 0.18)
        crack(c + np.cos(base) * 60, c + np.sin(base) * 60, base, r_.uniform(S * 0.26, S * 0.45), r_.uniform(30, 44), 0)
        ends.append(base)
    # broken web rings between spokes
    for radius, keep in ((S * 0.2, 0.7),):
        for k in range(spokes):
            if r_.random() > keep:
                continue
            a0 = ends[k]
            a1 = ends[(k + 1) % spokes] + (2 * np.pi if k == spokes - 1 else 0)
            pts = []
            for t in np.linspace(0, 1, 5):
                a = a0 + (a1 - a0) * t
                rr = radius * r_.uniform(0.9, 1.1)
                pts.append((c + np.cos(a) * rr, c + np.sin(a) * rr))
            draw.line(pts, fill=230, width=int(r_.uniform(9, 14)))
    # crater: irregular bright polygon
    poly = [(c + np.cos(a) * r_.uniform(50, 95), c + np.sin(a) * r_.uniform(50, 95)) for a in np.linspace(0, 2 * np.pi, 13)[:-1]]
    draw.polygon(poly, fill=255)
    lines = np.asarray(img.resize((D, D), Image.LANCZOS)) / 255.0
    glow = np.asarray(img.filter(ImageFilter.GaussianBlur(26)).resize((D, D), Image.LANCZOS)) / 255.0
    x, y = grid(D)
    fade = smooth((1 - np.hypot(x, y)) / 0.3)
    return np.clip(lines * 1.2 + glow * 1.5, 0, 1) * fade


def decal_scorch(seed=53):
    x, y = grid(D)
    r = np.hypot(x, y)
    n = value_noise(D, D, (5, 5), seed, 5)
    return np.clip(smooth((0.78 - r + (n - 0.5) * 0.4) / 0.4) * (0.55 + 0.5 * n), 0, 1)


def decal_rune():
    x, y = grid(D)
    r = np.hypot(x, y)
    ang = np.arctan2(y, x)
    ring = lambda rad, w: np.exp(-((r - rad) / w) ** 2)
    a = ring(0.93, 0.012) + ring(0.86, 0.008) + ring(0.52, 0.01) + ring(0.44, 0.006) * 0.8
    ticks = (np.abs(np.sin(ang * 36)) > 0.93) * smooth((r - 0.87) / 0.01) * smooth((0.92 - r) / 0.01)
    a += ticks * 0.9
    # eight-point star made of two overlaid squares, drawn as thin lines
    for rot in (0, np.pi / 4):
        xr = x * np.cos(rot) - y * np.sin(rot)
        yr = x * np.sin(rot) + y * np.cos(rot)
        sq = np.maximum(np.abs(xr), np.abs(yr))
        a += np.exp(-((sq - 0.62) / 0.008) ** 2) * (r < 0.9)
    # small orbiting glyph dots between the two outer rings
    for k in range(12):
        t = k / 12 * 2 * np.pi
        a += np.exp(-(((x - np.cos(t) * 0.69) ** 2 + (y - np.sin(t) * 0.69) ** 2) / 0.0012)) * 0.9
        a += np.exp(-(((x - np.cos(t + 0.26) * 0.69) ** 2 + (y - np.sin(t + 0.26) * 0.69) ** 2) / 0.0004)) * 0.6
    a += np.exp(-(r / 0.2) ** 2) * 0.25
    return np.clip(a, 0, 1) * smooth((0.99 - r) / 0.03)


def decal_burst(seed=57):
    x, y = grid(D)
    r = np.hypot(x, y)
    ang = np.arctan2(y, x)
    r_ = np.random.default_rng(seed)
    spikes = np.zeros_like(r)
    for _ in range(22):
        a0 = r_.uniform(-np.pi, np.pi)
        w = r_.uniform(0.02, 0.06)
        d = np.angle(np.exp(1j * (ang - a0)))
        spikes += np.exp(-(d / w) ** 2) * np.clip(1 - r / r_.uniform(0.6, 1.0), 0, 1)
    return np.clip(spikes * 0.9 + np.exp(-(r / 0.25) ** 2), 0, 1) * smooth((1 - r) / 0.1)


# ---------------------------------------------------------------------------
# CSS overlays
# ---------------------------------------------------------------------------
def build_speedlines(size=768, seed=61):
    r_ = np.random.default_rng(seed)
    x, y = np.meshgrid(np.linspace(-1, 1, size), np.linspace(-1, 1, size))
    r = np.hypot(x, y)
    ang = np.arctan2(y, x)
    a = np.zeros_like(r)
    for _ in range(150):
        a0 = r_.uniform(-np.pi, np.pi)
        width = r_.uniform(0.0015, 0.007)
        start = r_.uniform(0.45, 0.9)
        d = np.angle(np.exp(1j * (ang - a0)))
        # wedge that is thin near the centre and widens outwards, like inked speed lines
        w = width * (0.3 + r)
        a += np.exp(-(d / w) ** 2) * smooth((r - start) / 0.25) * r_.uniform(0.45, 1)
    a = np.clip(a, 0, 1)
    to_img(a).save(OUT / 'fx-speedlines.webp', quality=82, method=6)


def build_brush(seed=67):
    w, h = 1024, 256
    r_ = np.random.default_rng(seed)
    u = np.linspace(0, 1, w)[None, :]
    v = np.linspace(-1, 1, h)[:, None]
    # stroke thickness: fat entry (left), dry thin exit (right), with a wobbly centre line
    centre = 0.08 * np.sin(u * 5.1 + 0.7) + 0.05 * np.sin(u * 13.0)
    thick = 0.78 * (smooth(u / 0.06) * (1 - 0.55 * u ** 1.6)) + 0.02
    body = smooth((thick - np.abs(v - centre)) / 0.05)
    bristles = np.zeros((h, w))
    for _ in range(90):
        c = r_.uniform(-0.9, 0.9)
        dry_from = r_.uniform(0.35, 1.0)
        gap = np.exp(-((v - centre - c * thick) / r_.uniform(0.004, 0.018)) ** 2) * smooth((u - dry_from) / 0.1)
        bristles += gap * r_.uniform(0.5, 1)
    n = value_noise(h, w, (4, 20), seed, 4)
    a = body * np.clip(1 - bristles * 0.9, 0, 1) * (0.75 + 0.35 * n)
    a *= smooth((0.99 - u) / 0.12 + (1 - body) * 0)  # tapered exit
    to_img(np.clip(a, 0, 1)).save(OUT / 'fx-brush.png', optimize=True)


def build_grain(seed=71):
    w, h = 512, 128
    r_ = np.random.default_rng(seed)
    v = np.linspace(0, 1, h)[:, None]
    u = np.linspace(0, 1, w)[None, :]
    a = np.ones((h, w))
    for _ in range(40):
        c = r_.uniform(0, 1)
        start = r_.uniform(0.2, 0.9)
        a -= np.exp(-((v - c) / r_.uniform(0.003, 0.012)) ** 2) * smooth((u - start) / 0.15) * r_.uniform(0.5, 1)
    n = value_noise(h, w, (6, 24), seed, 3)
    a *= 0.82 + 0.3 * n
    to_img(np.clip(a, 0, 1)).save(OUT / 'fx-grain.png', optimize=True)


def build_cutin(src):
    """Eye band of the heroine render: keyed flat background, violet-graded shadows, soft band edges."""
    im = Image.open(src).convert('RGBA')
    w, h = im.size
    band = im.crop((int(w * 0.06), int(h * 0.33), int(w * 0.94), int(h * 0.6)))
    arr = np.asarray(band).astype(float) / 255
    rgb = arr[..., :3]
    bg = np.median(np.concatenate([rgb[:4].reshape(-1, 3), rgb[:, :4].reshape(-1, 3), rgb[:, -4:].reshape(-1, 3)]), axis=0)
    dist = np.linalg.norm(rgb - bg, axis=2)
    alpha = smooth((dist - 0.035) / 0.08)
    lum = rgb[..., 0] * 0.3 + rgb[..., 1] * 0.55 + rgb[..., 2] * 0.15
    shadow = np.clip(1 - lum * 1.6, 0, 1)[..., None]
    graded = np.clip((rgb - 0.5) * 1.25 + 0.5, 0, 1) * (1 - 0.45 * shadow) + np.array([0.32, 0.08, 0.5]) * 0.45 * shadow
    hh, ww = alpha.shape
    yy = np.linspace(-1, 1, hh)[:, None]
    xx = np.linspace(-1, 1, ww)[None, :]
    alpha *= smooth((1 - np.abs(xx)) / 0.18) * smooth((1 - np.abs(yy)) / 0.25)
    out = Image.fromarray((np.concatenate([graded, alpha[..., None]], axis=2) * 255 + 0.5).astype(np.uint8))
    out = out.resize((ww * 2 // 2, hh * 2 // 2), Image.LANCZOS)
    out.save(OUT / 'fx-cutin.webp', quality=84, method=6)


if __name__ == '__main__':
    import sys
    if '--cutin-src' in sys.argv:
        build_cutin(sys.argv[sys.argv.index('--cutin-src') + 1])
    OUT.mkdir(parents=True, exist_ok=True)
    build_particles()
    build_strips_and_decals()
    build_speedlines()
    build_brush()
    build_grain()
    for path in sorted(OUT.iterdir()):
        print(f'{path.name:24s} {path.stat().st_size:8d} bytes')
