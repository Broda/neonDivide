"""Low-level pixel drawing helpers.

Everything works on a `PIL.PixelAccess` object plus explicit bounds, so the same
routines serve 16x16 tiles and 16x24 actor frames without knowing which is which.
All randomness is seeded per-call so regenerating assets is byte-reproducible.
"""

import random

from PIL import Image


def new_image(w, h):
    return Image.new('RGBA', (w, h), (0, 0, 0, 0))


def blend_px(px, x, y, color, w, h):
    """Alpha-composite a single pixel, respecting bounds."""
    if not (0 <= x < w and 0 <= y < h):
        return
    a = color[3]
    if a == 0:
        return
    if a == 255:
        px[x, y] = color
        return
    dst = px[x, y]
    t = a / 255.0
    px[x, y] = (
        int(color[0] * t + dst[0] * (1 - t)),
        int(color[1] * t + dst[1] * (1 - t)),
        int(color[2] * t + dst[2] * (1 - t)),
        max(dst[3], a),
    )


def put(px, x, y, color, w=10_000, h=10_000):
    blend_px(px, x, y, color, w, h)


def rect(px, x0, y0, x1, y1, color, w=10_000, h=10_000):
    """Filled rectangle, inclusive bounds."""
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            blend_px(px, x, y, color, w, h)


def frame_rect(px, x0, y0, x1, y1, color, w=10_000, h=10_000):
    """Rectangle outline, inclusive bounds."""
    for x in range(x0, x1 + 1):
        blend_px(px, x, y0, color, w, h)
        blend_px(px, x, y1, color, w, h)
    for y in range(y0, y1 + 1):
        blend_px(px, x0, y, color, w, h)
        blend_px(px, x1, y, color, w, h)


def hline(px, x0, x1, y, color, w=10_000, h=10_000):
    for x in range(x0, x1 + 1):
        blend_px(px, x, y, color, w, h)


def vline(px, x, y0, y1, color, w=10_000, h=10_000):
    for y in range(y0, y1 + 1):
        blend_px(px, x, y, color, w, h)


def line(px, x0, y0, x1, y1, color, w=10_000, h=10_000):
    """Bresenham line."""
    dx, dy = abs(x1 - x0), -abs(y1 - y0)
    sx = 1 if x0 < x1 else -1
    sy = 1 if y0 < y1 else -1
    err = dx + dy
    while True:
        blend_px(px, x0, y0, color, w, h)
        if x0 == x1 and y0 == y1:
            break
        e2 = 2 * err
        if e2 >= dy:
            err += dy
            x0 += sx
        if e2 <= dx:
            err += dx
            y0 += sy


def disc(px, cx, cy, r, color, w=10_000, h=10_000):
    """Filled circle, chunky enough to read at 16px."""
    rr = r * r + r
    for y in range(cy - r, cy + r + 1):
        for x in range(cx - r, cx + r + 1):
            if (x - cx) ** 2 + (y - cy) ** 2 <= rr:
                blend_px(px, x, y, color, w, h)


def ring(px, cx, cy, r, color, w=10_000, h=10_000):
    rr_out = r * r + r
    rr_in = (r - 1) * (r - 1) + (r - 1)
    for y in range(cy - r, cy + r + 1):
        for x in range(cx - r, cx + r + 1):
            d = (x - cx) ** 2 + (y - cy) ** 2
            if rr_in < d <= rr_out:
                blend_px(px, x, y, color, w, h)


def speckle(px, x0, y0, x1, y1, color, density, seed, w=10_000, h=10_000):
    """Scatter noise pixels through a region. Density is 0..1."""
    rng = random.Random(seed)
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            if rng.random() < density:
                blend_px(px, x, y, color, w, h)


def dither(px, x0, y0, x1, y1, color, w=10_000, h=10_000, parity=0):
    """Ordered 50% checkerboard fill - reads as a half-tone shade."""
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            if (x + y) % 2 == parity:
                blend_px(px, x, y, color, w, h)


def bevel(px, x0, y0, x1, y1, light, dark, w=10_000, h=10_000):
    """1px top/left highlight and bottom/right shadow on a box."""
    hline(px, x0, x1, y0, light, w, h)
    vline(px, x0, y0, y1, light, w, h)
    hline(px, x0, x1, y1, dark, w, h)
    vline(px, x1, y0, y1, dark, w, h)


def glow(px, cx, cy, color, radius, w=10_000, h=10_000):
    """Cheap radial emissive falloff - the workhorse for neon."""
    for y in range(cy - radius, cy + radius + 1):
        for x in range(cx - radius, cx + radius + 1):
            d = ((x - cx) ** 2 + (y - cy) ** 2) ** 0.5
            if d > radius:
                continue
            t = 1.0 - (d / (radius + 0.001))
            a = int(color[3] * t * t)
            if a > 4:
                blend_px(px, x, y, (color[0], color[1], color[2], a), w, h)


def paste_grid(sheet, tile_img, index, cols, tw, th):
    """Drop a generated cell into its slot on a sheet."""
    cx = (index % cols) * tw
    cy = (index // cols) * th
    sheet.paste(tile_img, (cx, cy))
