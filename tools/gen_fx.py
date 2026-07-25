"""Generates combat FX, pickup icons, dialogue portraits and the UI panel.

Icons are 16x16 and share indices with src/data/items.js via the emitted
fx_manifest.json, so an item's `icon` name resolves to a frame number at runtime.
"""

import json

from PIL import Image

from palette import *
from pixel import (disc, frame_rect, glow, hline, line, new_image, paste_grid,
                   put, rect, ring, speckle, vline)


# ------------------------------------------------------------------ slash arc

def build_slash(path):
    """4-frame crescent that sweeps clockwise; drawn facing right, rotated in-game."""
    W = H = 24
    sheet = Image.new('RGBA', (W * 4, H), (0, 0, 0, 0))
    spans = [(-50, 10), (-30, 40), (-10, 65), (15, 80)]
    alphas = [170, 255, 220, 120]
    radii = [7, 9, 10, 11]

    for i, ((a0, a1), alpha, r) in enumerate(zip(spans, alphas, radii)):
        img = new_image(W, H)
        px = img.load()
        cx, cy = 6, 12
        steps = 26
        for s_ in range(steps):
            t = s_ / (steps - 1)
            ang = (a0 + (a1 - a0) * t) * 3.14159 / 180.0
            import math
            for rr in (r - 1, r, r + 1):
                x = int(cx + math.cos(ang) * rr)
                y = int(cy + math.sin(ang) * rr)
                col = CYAN_L if rr == r else CYAN
                put(px, x, y, with_alpha(col, alpha), W, H)
            x = int(cx + math.cos(ang) * (r + 2))
            y = int(cy + math.sin(ang) * (r + 2))
            put(px, x, y, with_alpha(CYAN_D, alpha // 2), W, H)
        glow(px, cx + r - 2, cy, with_alpha(CYAN, alpha // 3), 8, W, H)
        paste_grid(sheet, img, i, 4, W, H)
    sheet.save(path)


# ------------------------------------------------------------------- muzzle fx

def build_muzzle(path):
    W = H = 12
    sheet = Image.new('RGBA', (W * 3, H), (0, 0, 0, 0))
    for i, (r, col) in enumerate(((3, AMBER_L), (4, AMBER), (2, AMBER_D))):
        img = new_image(W, H)
        px = img.load()
        cx, cy = 4, 6
        disc(px, cx, cy, r - 1, col, W, H)
        for d in (-1, 0, 1):
            line(px, cx, cy, cx + r + 2, cy + d * 2, with_alpha(col, 200), W, H)
        glow(px, cx, cy, with_alpha(AMBER, 190), r + 3, W, H)
        paste_grid(sheet, img, i, 3, W, H)
    sheet.save(path)


def build_bullet(path):
    W = H = 6
    img = new_image(W, H)
    px = img.load()
    disc(px, 3, 3, 1, AMBER_L, W, H)
    put(px, 1, 3, AMBER, W, H)
    put(px, 0, 3, with_alpha(AMBER_D, 180), W, H)
    glow(px, 3, 3, with_alpha(AMBER, 150), 3, W, H)
    img.save(path)


def build_impact(path):
    W = H = 12
    sheet = Image.new('RGBA', (W * 3, H), (0, 0, 0, 0))
    for i, r in enumerate((2, 4, 5)):
        img = new_image(W, H)
        px = img.load()
        a = 255 - i * 70
        ring(px, 6, 6, r, with_alpha(CYAN_L, a), W, H)
        for ang in range(0, 360, 45):
            import math
            rad = ang * 3.14159 / 180
            x = int(6 + math.cos(rad) * (r + 1))
            y = int(6 + math.sin(rad) * (r + 1))
            put(px, x, y, with_alpha(WHITE, a), W, H)
        paste_grid(sheet, img, i, 3, W, H)
    sheet.save(path)


# ----------------------------------------------------------------------- icons

ICONS = []


def icon(name):
    def deco(fn):
        ICONS.append({'name': name, 'fn': fn})
        return fn
    return deco


@icon('nuyen')
def i_nuyen(px):
    rect(px, 2, 5, 13, 11, mix(LIME_D, VOID, 0.3), 16, 16)
    frame_rect(px, 2, 5, 13, 11, LIME, 16, 16)
    hline(px, 5, 10, 7, LIME_L, 16, 16)
    hline(px, 5, 10, 9, LIME_L, 16, 16)
    vline(px, 7, 6, 10, LIME_L, 16, 16)
    glow(px, 8, 8, with_alpha(LIME, 70), 6, 16, 16)


@icon('medkit')
def i_medkit(px):
    rect(px, 2, 4, 13, 12, WHITE, 16, 16)
    frame_rect(px, 2, 4, 13, 12, mix(WHITE, VOID, 0.4), 16, 16)
    rect(px, 7, 6, 8, 10, RED, 16, 16)
    rect(px, 5, 7, 10, 8, RED, 16, 16)
    hline(px, 6, 9, 3, METAL, 16, 16)


@icon('ammo')
def i_ammo(px):
    rect(px, 4, 3, 11, 13, AMBER_D, 16, 16)
    rect(px, 5, 4, 10, 12, AMBER, 16, 16)
    hline(px, 5, 10, 6, AMBER_L, 16, 16)
    hline(px, 5, 10, 9, AMBER_L, 16, 16)
    rect(px, 6, 1, 9, 3, METAL_L, 16, 16)


@icon('keycard')
def i_keycard(px):
    rect(px, 2, 4, 13, 12, RED_D, 16, 16)
    frame_rect(px, 2, 4, 13, 12, RED, 16, 16)
    rect(px, 4, 6, 7, 8, mix(RED_L, WHITE, 0.4), 16, 16)
    hline(px, 4, 11, 10, RED_L, 16, 16)
    vline(px, 12, 5, 11, AMBER, 16, 16)
    glow(px, 8, 8, with_alpha(RED, 60), 6, 16, 16)


@icon('credstick')
def i_credstick(px):
    rect(px, 3, 6, 12, 10, METAL_D, 16, 16)
    hline(px, 3, 12, 6, METAL_L, 16, 16)
    rect(px, 10, 7, 12, 9, CYAN, 16, 16)
    hline(px, 4, 8, 8, CYAN_D, 16, 16)
    glow(px, 11, 8, with_alpha(CYAN, 90), 5, 16, 16)


@icon('cyberdeck')
def i_cyberdeck(px):
    rect(px, 1, 5, 14, 12, METAL_D, 16, 16)
    frame_rect(px, 1, 5, 14, 12, METAL, 16, 16)
    rect(px, 3, 7, 9, 10, mix(VOID, CYAN_D, 0.5), 16, 16)
    hline(px, 4, 8, 8, CYAN, 16, 16)
    hline(px, 4, 7, 9, CYAN_D, 16, 16)
    rect(px, 11, 7, 12, 8, LIME, 16, 16)
    line(px, 13, 6, 15, 2, CYAN, 16, 16)
    glow(px, 6, 9, with_alpha(CYAN, 80), 6, 16, 16)


@icon('wetwire')
def i_wetwire(px):
    rect(px, 2, 4, 13, 12, mix(VIOLET_D, VOID, 0.4), 16, 16)
    frame_rect(px, 2, 4, 13, 12, VIOLET, 16, 16)
    hline(px, 2, 13, 8, VIOLET_L, 16, 16)
    rect(px, 6, 2, 9, 4, METAL, 16, 16)
    disc(px, 8, 10, 1, MAGENTA, 16, 16)
    glow(px, 8, 10, with_alpha(MAGENTA, 110), 6, 16, 16)


@icon('stimpack')
def i_stimpack(px):
    rect(px, 6, 2, 9, 9, mix(LIME_D, VOID, 0.3), 16, 16)
    rect(px, 7, 3, 8, 8, LIME, 16, 16)
    rect(px, 5, 9, 10, 11, METAL, 16, 16)
    vline(px, 8, 12, 14, METAL_L, 16, 16)
    glow(px, 8, 6, with_alpha(LIME, 80), 5, 16, 16)


@icon('datachip')
def i_datachip(px):
    rect(px, 4, 4, 11, 11, mix(VOID, LIME_D, 0.4), 16, 16)
    frame_rect(px, 4, 4, 11, 11, LIME, 16, 16)
    for i in range(5, 11, 2):
        hline(px, 1, 3, i, METAL_L, 16, 16)
        hline(px, 12, 14, i, METAL_L, 16, 16)
    rect(px, 6, 6, 9, 9, LIME_D, 16, 16)
    glow(px, 8, 8, with_alpha(LIME, 70), 5, 16, 16)


def build_icons(path, manifest):
    cols = 8
    rows = (len(ICONS) + cols - 1) // cols
    sheet = Image.new('RGBA', (cols * 16, rows * 16), (0, 0, 0, 0))
    for i, entry in enumerate(ICONS):
        img = new_image(16, 16)
        entry['fn'](img.load())
        paste_grid(sheet, img, i, cols, 16, 16)
        manifest['icons'][entry['name']] = i
    sheet.save(path)


# ------------------------------------------------------------------- portraits

PORTRAITS = []


def portrait(name, skin, hair, coat, accent, shades=False, hover=False,
             hair_style='short'):
    PORTRAITS.append(dict(name=name, skin=skin, hair=hair, coat=coat,
                          accent=accent, shades=shades, hover=hover,
                          hair_style=hair_style))


def _draw_portrait(px, p):
    W = H = 32
    skin_d, skin, skin_l = p['skin']
    hair_d, hair, hair_l = p['hair']
    coat_d, coat, coat_l = p['coat']

    # backdrop with a neon rim
    rect(px, 0, 0, 31, 31, mix(VOID, coat_d, 0.5), W, H)
    speckle(px, 0, 0, 31, 31, mix(VOID, p['accent'], 0.25), 0.08, 7, W, H)
    glow(px, 16, 26, with_alpha(p['accent'], 60), 16, W, H)

    if p['hover']:
        disc(px, 16, 16, 9, coat, W, H)
        disc(px, 16, 14, 7, coat_l, W, H)
        ring(px, 16, 16, 9, coat_d, W, H)
        disc(px, 16, 18, 3, VOID, W, H)
        disc(px, 16, 18, 2, RED, W, H)
        glow(px, 16, 18, with_alpha(RED, 170), 9, W, H)
        for sx in (3, 28):
            rect(px, sx - 2, 14, sx + 2, 16, METAL_D, W, H)
            hline(px, sx - 3, sx + 3, 13, METAL_L, W, H)
        return

    # shoulders
    rect(px, 3, 26, 28, 31, coat, W, H)
    hline(px, 3, 28, 26, coat_l, W, H)
    rect(px, 13, 26, 18, 31, mix(coat_d, VOID, 0.3), W, H)
    vline(px, 12, 26, 31, p['accent'], W, H)
    vline(px, 19, 26, 31, p['accent'], W, H)

    # neck + head
    rect(px, 13, 23, 18, 26, skin_d, W, H)
    rect(px, 8, 8, 23, 25, skin, W, H)
    rect(px, 9, 6, 22, 8, skin, W, H)
    vline(px, 8, 9, 24, skin_d, W, H)
    vline(px, 23, 9, 24, skin_d, W, H)
    hline(px, 10, 21, 25, skin_d, W, H)
    rect(px, 11, 9, 20, 12, skin_l, W, H)

    # hair
    if p['hair_style'] == 'bald':
        rect(px, 9, 5, 22, 8, skin_l, W, H)
        hline(px, 11, 20, 4, skin, W, H)
    elif p['hair_style'] == 'mohawk':
        rect(px, 13, 0, 18, 8, hair_l, W, H)
        rect(px, 9, 6, 22, 8, hair_d, W, H)
    else:
        rect(px, 8, 3, 23, 9, hair, W, H)
        hline(px, 10, 21, 2, hair_l, W, H)
        rect(px, 8, 9, 9, 14, hair_d, W, H)
        rect(px, 22, 9, 23, 14, hair_d, W, H)
        if p['hair_style'] == 'long':
            rect(px, 6, 8, 8, 26, hair_d, W, H)
            rect(px, 23, 8, 25, 26, hair_d, W, H)

    # eyes
    if p['shades']:
        rect(px, 9, 14, 22, 17, VOID, W, H)
        hline(px, 9, 22, 13, mix(METAL, VOID, 0.3), W, H)
        rect(px, 10, 15, 13, 16, p['accent'], W, H)
        rect(px, 18, 15, 21, 16, mix(p['accent'], VOID, 0.35), W, H)
        glow(px, 12, 15, with_alpha(p['accent'], 90), 5, W, H)
    else:
        rect(px, 11, 15, 13, 16, WHITE, W, H)
        rect(px, 18, 15, 20, 16, WHITE, W, H)
        put(px, 12, 16, VOID, W, H)
        put(px, 19, 16, VOID, W, H)
        hline(px, 10, 13, 13, hair_d, W, H)
        hline(px, 18, 21, 13, hair_d, W, H)

    # nose + mouth
    vline(px, 16, 18, 19, skin_d, W, H)
    hline(px, 13, 18, 21, skin_d, W, H)


def build_portraits(path, manifest):
    cols = 4
    rows = (len(PORTRAITS) + cols - 1) // cols
    sheet = Image.new('RGBA', (cols * 32, rows * 32), (0, 0, 0, 0))
    for i, p in enumerate(PORTRAITS):
        img = new_image(32, 32)
        _draw_portrait(img.load(), p)
        paste_grid(sheet, img, i, cols, 32, 32)
        manifest['portraits'][p['name']] = i
    sheet.save(path)


portrait('runner', (SKIN_D, SKIN, SKIN_L), (MAGENTA_D, MAGENTA, MAGENTA_L),
         (CLOTH_D, CLOTH, CLOTH_L), CYAN, shades=True)
portrait('kaz', (SKIN2_D, SKIN2, SKIN2_L), (VOID, ASPHALT_D, CONCRETE),
         (mix(VOID, VIOLET_D, 0.7), VIOLET_D, VIOLET), AMBER,
         shades=True, hair_style='bald')
portrait('vex', (SKIN_D, SKIN, SKIN_L), (CYAN_D, CYAN, CYAN_L),
         (mix(VOID, CYAN_D, 0.5), CYAN_D, CYAN), LIME, hair_style='long')
portrait('guard', (SKIN_D, SKIN, SKIN_L), (VOID, ASPHALT_D, ASPHALT),
         (mix(VOID, METAL_D, 0.6), METAL_D, METAL), CYAN, shades=True)
portrait('boss', (SKIN2_D, SKIN2, SKIN2_L), (RED_D, RED, RED_L),
         (mix(VOID, RED_D, 0.6), RED_D, RED), RED_L,
         shades=True, hair_style='mohawk')
portrait('drone', (METAL_D, METAL, METAL_L), (METAL_D, METAL, METAL_L),
         (METAL_D, METAL, METAL_L), RED, hover=True)
portrait('civ', (SKIN_D, SKIN, SKIN_L), (RUST, RUST_L, AMBER_L),
         (CONCRETE_D, CONCRETE, CONCRETE_L), CONCRETE_L)
portrait('rival', (SKIN2_D, SKIN2, SKIN2_L), (LIME_D, LIME, LIME_L),
         (mix(VOID, LIME_D, 0.6), SLUDGE_D, SLUDGE), LIME,
         shades=True, hair_style='mohawk')


# -------------------------------------------------------------------- UI panel

def build_panel(path):
    """24x24 nine-slice source: 8px corners, 8px stretchable middles."""
    W = H = 24
    img = new_image(W, H)
    px = img.load()
    rect(px, 0, 0, 23, 23, UI_BG, W, H)
    frame_rect(px, 0, 0, 23, 23, UI_EDGE_D, W, H)
    frame_rect(px, 1, 1, 22, 22, UI_EDGE, W, H)
    frame_rect(px, 2, 2, 21, 21, mix(UI_BG, UI_EDGE_D, 0.5), W, H)
    # corner ticks so the frame reads as a HUD element at any size
    for (cx, cy) in ((1, 1), (22, 1), (1, 22), (22, 22)):
        put(px, cx, cy, CYAN_L, W, H)
    img.save(path)


def build_heart(path):
    """3 frames: full, half, empty - a chunky hex 'cell' rather than a heart."""
    W = H = 10
    sheet = Image.new('RGBA', (W * 3, H), (0, 0, 0, 0))
    fills = [
        (CYAN, CYAN_L, 255),
        (CYAN_D, CYAN, 255),
        (None, None, 0),
    ]
    for i, (fill, hi, _a) in enumerate(fills):
        img = new_image(W, H)
        px = img.load()
        pts = [(3, 1), (6, 1), (8, 4), (6, 8), (3, 8), (1, 4)]
        for j in range(len(pts)):
            x0, y0 = pts[j]
            x1, y1 = pts[(j + 1) % len(pts)]
            line(px, x0, y0, x1, y1, METAL_L if fill is None else CYAN_D, W, H)
        if fill is not None:
            rect(px, 3, 2, 6, 7, fill, W, H)
            rect(px, 2, 3, 7, 6, fill, W, H)
            hline(px, 3, 5, 2, hi, W, H)
            glow(px, 4, 4, with_alpha(fill, 70), 5, W, H)
        paste_grid(sheet, img, i, 3, W, H)
    sheet.save(path)


def build_all(outdir, manifest):
    build_slash(outdir / 'fx_slash.png')
    build_muzzle(outdir / 'fx_muzzle.png')
    build_bullet(outdir / 'fx_bullet.png')
    build_impact(outdir / 'fx_impact.png')
    build_icons(outdir / 'ui_icons.png', manifest)
    build_portraits(outdir / 'ui_portraits.png', manifest)
    build_panel(outdir / 'ui_panel.png')
    build_heart(outdir / 'ui_cell.png')
