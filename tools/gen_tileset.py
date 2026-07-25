"""Generates the Neo-Kyoto tilesheet plus its metadata JSON.

Each tile is a small draw function registered with @tile(name, solid=..., tags=[...]).
Registration order defines the tile index, and the emitted JSON is what the game
reads for collision - so a tile can never be visually solid but logically walkable.

Adding a tile: write a draw function, decorate it, re-run. Nothing else to update
except the ASCII legend in src/data/tiles.js if you want to place it by hand.
"""

import json

from PIL import Image

from palette import *
from pixel import (bevel, dither, disc, frame_rect, glow, hline, line,
                   new_image, paste_grid, rect, ring, speckle, vline)

TILE = 16
COLS = 8

_REGISTRY = []


def tile(name, solid=False, tags=()):
    def deco(fn):
        _REGISTRY.append({'name': name, 'solid': solid, 'tags': list(tags), 'fn': fn})
        return fn
    return deco


# --------------------------------------------------------------------- ground

def _asphalt_base(px, seed):
    rect(px, 0, 0, 15, 15, ASPHALT, TILE, TILE)
    speckle(px, 0, 0, 15, 15, ASPHALT_D, 0.16, seed, TILE, TILE)
    speckle(px, 0, 0, 15, 15, ASPHALT_L, 0.07, seed + 1, TILE, TILE)


@tile('asphalt', tags=['floor'])
def t_asphalt(px):
    _asphalt_base(px, 1)


@tile('asphalt_crack', tags=['floor'])
def t_asphalt_crack(px):
    _asphalt_base(px, 2)
    line(px, 2, 12, 9, 5, ASPHALT_D, TILE, TILE)
    line(px, 9, 5, 13, 3, ASPHALT_D, TILE, TILE)
    line(px, 6, 9, 4, 4, ASPHALT_D, TILE, TILE)


@tile('asphalt_drain', tags=['floor'])
def t_asphalt_drain(px):
    _asphalt_base(px, 3)
    rect(px, 3, 4, 12, 11, METAL_D, TILE, TILE)
    bevel(px, 3, 4, 12, 11, METAL, VOID, TILE, TILE)
    for y in range(6, 11, 2):
        hline(px, 5, 10, y, VOID, TILE, TILE)


@tile('road_line', tags=['floor'])
def t_road_line(px):
    _asphalt_base(px, 4)
    rect(px, 7, 0, 8, 15, AMBER_D, TILE, TILE)
    rect(px, 7, 2, 8, 12, AMBER, TILE, TILE)


@tile('crosswalk', tags=['floor'])
def t_crosswalk(px):
    _asphalt_base(px, 5)
    for x in range(1, 15, 5):
        rect(px, x, 0, x + 2, 15, mix(ASPHALT, WHITE, 0.55), TILE, TILE)


@tile('puddle_cyan', tags=['floor', 'wet'])
def t_puddle_cyan(px):
    _asphalt_base(px, 6)
    disc(px, 8, 9, 5, mix(ASPHALT_D, CYAN_D, 0.45), TILE, TILE)
    disc(px, 7, 8, 3, mix(ASPHALT_D, CYAN_D, 0.7), TILE, TILE)
    hline(px, 5, 10, 7, with_alpha(CYAN, 150), TILE, TILE)
    hline(px, 6, 9, 10, with_alpha(CYAN_L, 90), TILE, TILE)


@tile('puddle_magenta', tags=['floor', 'wet'])
def t_puddle_magenta(px):
    _asphalt_base(px, 7)
    disc(px, 7, 8, 5, mix(ASPHALT_D, MAGENTA_D, 0.45), TILE, TILE)
    disc(px, 8, 9, 3, mix(ASPHALT_D, MAGENTA_D, 0.7), TILE, TILE)
    hline(px, 4, 9, 6, with_alpha(MAGENTA, 150), TILE, TILE)
    hline(px, 6, 10, 11, with_alpha(MAGENTA_L, 80), TILE, TILE)


#: Paving is deliberately kept in the floor value band, well below the walls.
#: When both sat at CONCRETE the perimeter read as one continuous grey band and
#: the gaps that are actually the room's exits became invisible.
PAVING = mix(ASPHALT, CONCRETE, 0.3)


@tile('sidewalk', tags=['floor'])
def t_sidewalk(px):
    rect(px, 0, 0, 15, 15, PAVING, TILE, TILE)
    speckle(px, 0, 0, 15, 15, ramp(PAVING, 0.82), 0.14, 11, TILE, TILE)
    speckle(px, 0, 0, 15, 15, ramp(PAVING, 1.18), 0.06, 12, TILE, TILE)
    # Flat slab joints only - no bevel, so this reads as ground, not masonry.
    joint = ramp(PAVING, 0.6)
    hline(px, 0, 15, 0, joint, TILE, TILE)
    vline(px, 0, 0, 15, joint, TILE, TILE)
    hline(px, 8, 15, 8, joint, TILE, TILE)


@tile('sidewalk_curb', tags=['floor'])
def t_sidewalk_curb(px):
    rect(px, 0, 0, 15, 15, PAVING, TILE, TILE)
    speckle(px, 0, 0, 15, 15, ramp(PAVING, 0.82), 0.12, 13, TILE, TILE)
    joint = ramp(PAVING, 0.6)
    hline(px, 0, 15, 0, joint, TILE, TILE)
    # kerb lip along the road edge
    rect(px, 0, 12, 15, 15, ramp(PAVING, 0.7), TILE, TILE)
    hline(px, 0, 15, 12, ramp(PAVING, 1.35), TILE, TILE)


@tile('grate', tags=['floor'])
def t_grate(px):
    rect(px, 0, 0, 15, 15, METAL_D, TILE, TILE)
    for y in range(1, 16, 3):
        hline(px, 0, 15, y, METAL, TILE, TILE)
        hline(px, 0, 15, y + 1, VOID, TILE, TILE)
    vline(px, 0, 0, 15, METAL, TILE, TILE)
    vline(px, 15, 0, 15, METAL, TILE, TILE)


@tile('floor_tile', tags=['floor', 'interior'])
def t_floor_tile(px):
    rect(px, 0, 0, 15, 15, mix(CONCRETE_D, VIOLET_D, 0.25), TILE, TILE)
    rect(px, 0, 0, 7, 7, mix(CONCRETE, VIOLET_D, 0.2), TILE, TILE)
    rect(px, 8, 8, 15, 15, mix(CONCRETE, VIOLET_D, 0.2), TILE, TILE)
    speckle(px, 0, 0, 15, 15, VOID, 0.05, 13, TILE, TILE)


@tile('floor_panel', tags=['floor', 'interior'])
def t_floor_panel(px):
    rect(px, 0, 0, 15, 15, METAL_D, TILE, TILE)
    frame_rect(px, 1, 1, 14, 14, METAL, TILE, TILE)
    speckle(px, 2, 2, 13, 13, mix(METAL_D, METAL, 0.4), 0.1, 14, TILE, TILE)
    disc(px, 3, 3, 0, METAL_L, TILE, TILE)
    disc(px, 12, 12, 0, METAL_L, TILE, TILE)


@tile('floor_neon', tags=['floor', 'interior'])
def t_floor_neon(px):
    rect(px, 0, 0, 15, 15, mix(METAL_D, VOID, 0.4), TILE, TILE)
    hline(px, 0, 15, 7, CYAN_D, TILE, TILE)
    hline(px, 0, 15, 8, CYAN, TILE, TILE)
    glow(px, 8, 8, with_alpha(CYAN, 120), 6, TILE, TILE)


@tile('gravel', tags=['floor', 'roof'])
def t_gravel(px):
    rect(px, 0, 0, 15, 15, mix(CONCRETE_D, RUST, 0.15), TILE, TILE)
    speckle(px, 0, 0, 15, 15, CONCRETE, 0.24, 15, TILE, TILE)
    speckle(px, 0, 0, 15, 15, VOID, 0.14, 16, TILE, TILE)
    speckle(px, 0, 0, 15, 15, CONCRETE_L, 0.05, 17, TILE, TILE)


@tile('rug', tags=['floor', 'interior'])
def t_rug(px):
    rect(px, 0, 0, 15, 15, RED_D, TILE, TILE)
    frame_rect(px, 1, 1, 14, 14, mix(RED, VOID, 0.3), TILE, TILE)
    frame_rect(px, 3, 3, 12, 12, AMBER_D, TILE, TILE)
    speckle(px, 4, 4, 11, 11, mix(RED_D, VOID, 0.3), 0.2, 18, TILE, TILE)


@tile('sludge', tags=['floor', 'hazard'])
def t_sludge(px):
    rect(px, 0, 0, 15, 15, SLUDGE_D, TILE, TILE)
    speckle(px, 0, 0, 15, 15, SLUDGE, 0.3, 19, TILE, TILE)
    disc(px, 5, 6, 2, SLUDGE, TILE, TILE)
    disc(px, 11, 11, 1, SLUDGE_L, TILE, TILE)
    ring(px, 5, 6, 2, SLUDGE_L, TILE, TILE)


# ---------------------------------------------------------------------- walls

def _concrete_wall(px, seed):
    """Raised block-seamed concrete.

    Walls sit a full value step above the paving and carry a lit top edge plus
    a hard shadow along the base. That vertical relief is what makes a wall read
    as an obstacle and, just as importantly, makes a gap in a wall read as a
    doorway rather than more of the same grey.
    """
    rect(px, 0, 0, 15, 15, CONCRETE_L, TILE, TILE)
    speckle(px, 0, 0, 15, 15, ramp(CONCRETE_L, 1.15), 0.12, seed, TILE, TILE)
    speckle(px, 0, 0, 15, 15, CONCRETE, 0.16, seed + 1, TILE, TILE)

    mortar = mix(CONCRETE_D, VOID, 0.35)
    # horizontal courses with a staggered vertical joint
    for y in (1, 9):
        hline(px, 0, 15, y, mortar, TILE, TILE)
        hline(px, 0, 15, y + 1, ramp(CONCRETE_L, 1.25), TILE, TILE)
    vline(px, 4, 2, 8, mortar, TILE, TILE)
    vline(px, 11, 10, 14, mortar, TILE, TILE)

    # lit cap along the top, cast shadow along the base
    hline(px, 0, 15, 0, ramp(CONCRETE_L, 1.4), TILE, TILE)
    hline(px, 0, 15, 14, mix(CONCRETE_D, VOID, 0.6), TILE, TILE)
    hline(px, 0, 15, 15, VOID, TILE, TILE)


@tile('wall', solid=True, tags=['wall'])
def t_wall(px):
    _concrete_wall(px, 21)


def _concrete_wall_v(px, seed):
    """Concrete for a wall that runs vertically (the left/right screen edges).

    Same material as `wall`, but the courses run with the wall instead of
    across it, and there is deliberately no light/shadow banding on the top or
    bottom edge - a horizontal highlight repeated down a column is exactly what
    made side walls look like a stack of misplaced top-wall tiles. The dark
    outer columns instead frame the run continuously from top to bottom.
    """
    rect(px, 0, 0, 15, 15, CONCRETE_L, TILE, TILE)
    speckle(px, 0, 0, 15, 15, ramp(CONCRETE_L, 1.15), 0.12, seed, TILE, TILE)
    speckle(px, 0, 0, 15, 15, CONCRETE, 0.16, seed + 1, TILE, TILE)

    mortar = mix(CONCRETE_D, VOID, 0.35)
    # vertical courses, mirroring the horizontal ones in _concrete_wall
    for x in (5, 11):
        vline(px, x, 0, 15, mortar, TILE, TILE)
        vline(px, x + 1, 0, 15, ramp(CONCRETE_L, 1.25), TILE, TILE)
    # staggered brick ends, kept short so they never band across the tile
    hline(px, 0, 4, 4, mortar, TILE, TILE)
    hline(px, 6, 10, 11, mortar, TILE, TILE)
    hline(px, 12, 15, 6, mortar, TILE, TILE)

    # framing shadow down both sides: works whether this column is the left or
    # the right edge of the room
    vline(px, 0, 0, 15, mix(CONCRETE_D, VOID, 0.6), TILE, TILE)
    vline(px, 1, 0, 15, ramp(CONCRETE_L, 1.35), TILE, TILE)
    vline(px, 14, 0, 15, mix(CONCRETE_D, VOID, 0.6), TILE, TILE)
    vline(px, 15, 0, 15, VOID, TILE, TILE)


@tile('wall_side', solid=True, tags=['wall', 'vertical'])
def t_wall_side(px):
    _concrete_wall_v(px, 61)


@tile('wall_interior_side', solid=True, tags=['wall', 'interior', 'vertical'])
def t_wall_interior_side(px):
    base = mix(CONCRETE_D, VIOLET_D, 0.4)
    rect(px, 0, 0, 15, 15, base, TILE, TILE)
    speckle(px, 0, 0, 15, 15, VOID, 0.07, 62, TILE, TILE)
    vline(px, 0, 0, 15, mix(CONCRETE, VIOLET, 0.3), TILE, TILE)
    vline(px, 11, 0, 15, mix(VOID, VIOLET_D, 0.4), TILE, TILE)
    vline(px, 15, 0, 15, mix(VOID, VIOLET_D, 0.6), TILE, TILE)


@tile('ledge_side', solid=True, tags=['wall', 'roof', 'vertical'])
def t_ledge_side(px):
    rect(px, 0, 0, 15, 15, CONCRETE, TILE, TILE)
    rect(px, 0, 0, 5, 15, ramp(CONCRETE_L, 1.25), TILE, TILE)
    vline(px, 0, 0, 15, ramp(CONCRETE_L, 1.5), TILE, TILE)
    vline(px, 6, 0, 15, mix(CONCRETE_D, VOID, 0.6), TILE, TILE)
    speckle(px, 7, 0, 15, 15, mix(CONCRETE_D, VOID, 0.4), 0.18, 63, TILE, TILE)
    vline(px, 15, 0, 15, VOID, TILE, TILE)


@tile('wall_top', solid=True, tags=['wall'])
def t_wall_top(px):
    _concrete_wall(px, 22)
    # Coping stone: a flat lit slab capping the wall.
    rect(px, 0, 0, 15, 3, ramp(CONCRETE_L, 1.3), TILE, TILE)
    hline(px, 0, 15, 0, ramp(CONCRETE_L, 1.55), TILE, TILE)
    hline(px, 0, 15, 4, mix(CONCRETE_D, VOID, 0.5), TILE, TILE)


@tile('wall_corrugated', solid=True, tags=['wall'])
def t_wall_corrugated(px):
    rect(px, 0, 0, 15, 15, METAL_D, TILE, TILE)
    for x in range(0, 16, 3):
        vline(px, x, 0, 15, METAL, TILE, TILE)
        vline(px, x + 1, 0, 15, mix(METAL_D, VOID, 0.3), TILE, TILE)
    speckle(px, 0, 0, 15, 15, RUST, 0.08, 23, TILE, TILE)


@tile('wall_window_lit', solid=True, tags=['wall'])
def t_wall_window_lit(px):
    _concrete_wall(px, 24)
    rect(px, 3, 3, 12, 11, mix(AMBER_D, VOID, 0.3), TILE, TILE)
    rect(px, 4, 4, 11, 10, AMBER, TILE, TILE)
    rect(px, 4, 4, 7, 6, AMBER_L, TILE, TILE)
    vline(px, 8, 4, 10, AMBER_D, TILE, TILE)
    hline(px, 4, 11, 7, AMBER_D, TILE, TILE)
    glow(px, 8, 7, with_alpha(AMBER, 90), 7, TILE, TILE)


@tile('wall_window_dark', solid=True, tags=['wall'])
def t_wall_window_dark(px):
    _concrete_wall(px, 25)
    rect(px, 3, 3, 12, 11, VOID, TILE, TILE)
    rect(px, 4, 4, 11, 10, mix(VOID, CYAN_D, 0.25), TILE, TILE)
    vline(px, 8, 4, 10, VOID, TILE, TILE)
    hline(px, 4, 11, 7, VOID, TILE, TILE)


@tile('wall_neon', solid=True, tags=['wall'])
def t_wall_neon(px):
    _concrete_wall(px, 26)
    rect(px, 0, 5, 15, 6, MAGENTA_D, TILE, TILE)
    hline(px, 0, 15, 5, MAGENTA, TILE, TILE)
    glow(px, 8, 5, with_alpha(MAGENTA, 110), 6, TILE, TILE)


@tile('wall_interior', solid=True, tags=['wall', 'interior'])
def t_wall_interior(px):
    rect(px, 0, 0, 15, 15, mix(CONCRETE_D, VIOLET_D, 0.4), TILE, TILE)
    hline(px, 0, 15, 0, mix(CONCRETE, VIOLET, 0.3), TILE, TILE)
    hline(px, 0, 15, 11, mix(VOID, VIOLET_D, 0.4), TILE, TILE)
    speckle(px, 0, 0, 15, 15, VOID, 0.07, 27, TILE, TILE)


def _chainlink(px, alpha=170):
    """Sparse diamond mesh - a full 4px lattice reads as solid checkerboard."""
    col = with_alpha(METAL, alpha)
    for y in range(0, 16, 6):
        for x in range(0, 16, 6):
            line(px, x, y + 3, x + 3, y, col, TILE, TILE)
            line(px, x + 3, y, x + 6, y + 3, col, TILE, TILE)
            line(px, x, y + 3, x + 3, y + 6, col, TILE, TILE)
            line(px, x + 3, y + 6, x + 6, y + 3, col, TILE, TILE)


@tile('fence', solid=True, tags=['wall', 'seethrough'])
def t_fence(px):
    _chainlink(px)
    hline(px, 0, 15, 0, METAL_L, TILE, TILE)
    hline(px, 0, 15, 1, METAL_D, TILE, TILE)
    hline(px, 0, 15, 15, METAL_L, TILE, TILE)


@tile('fence_post', solid=True, tags=['wall'])
def t_fence_post(px):
    _chainlink(px, 110)
    rect(px, 6, 0, 9, 15, METAL_D, TILE, TILE)
    vline(px, 6, 0, 15, METAL_L, TILE, TILE)
    vline(px, 9, 0, 15, VOID, TILE, TILE)


@tile('pipe_v', solid=True, tags=['prop'])
def t_pipe_v(px):
    _concrete_wall(px, 28)
    rect(px, 5, 0, 10, 15, METAL_D, TILE, TILE)
    vline(px, 6, 0, 15, METAL_L, TILE, TILE)
    vline(px, 9, 0, 15, VOID, TILE, TILE)
    rect(px, 4, 6, 11, 9, METAL, TILE, TILE)
    bevel(px, 4, 6, 11, 9, METAL_L, VOID, TILE, TILE)


@tile('pipe_h', solid=True, tags=['prop'])
def t_pipe_h(px):
    _concrete_wall(px, 29)
    rect(px, 0, 5, 15, 10, METAL_D, TILE, TILE)
    hline(px, 0, 15, 6, METAL_L, TILE, TILE)
    hline(px, 0, 15, 9, VOID, TILE, TILE)
    rect(px, 6, 4, 9, 11, METAL, TILE, TILE)


@tile('ledge', solid=True, tags=['wall', 'roof'])
def t_ledge(px):
    # Same raised language as the street walls so rooftop edges read as solid.
    rect(px, 0, 0, 15, 15, CONCRETE, TILE, TILE)
    rect(px, 0, 0, 15, 5, ramp(CONCRETE_L, 1.25), TILE, TILE)
    hline(px, 0, 15, 0, ramp(CONCRETE_L, 1.5), TILE, TILE)
    hline(px, 0, 15, 6, mix(CONCRETE_D, VOID, 0.6), TILE, TILE)
    speckle(px, 0, 7, 15, 15, mix(CONCRETE_D, VOID, 0.4), 0.18, 30, TILE, TILE)
    hline(px, 0, 15, 15, VOID, TILE, TILE)


# ---------------------------------------------------------------------- props

@tile('crate', solid=True, tags=['prop'])
def t_crate(px):
    rect(px, 1, 2, 14, 15, RUST, TILE, TILE)
    bevel(px, 1, 2, 14, 15, RUST_L, VOID, TILE, TILE)
    line(px, 2, 3, 13, 14, mix(RUST, VOID, 0.35), TILE, TILE)
    line(px, 13, 3, 2, 14, mix(RUST, VOID, 0.35), TILE, TILE)
    rect(px, 6, 7, 9, 10, AMBER_D, TILE, TILE)


@tile('crate_tech', solid=True, tags=['prop'])
def t_crate_tech(px):
    rect(px, 1, 2, 14, 15, METAL_D, TILE, TILE)
    bevel(px, 1, 2, 14, 15, METAL, VOID, TILE, TILE)
    hline(px, 2, 13, 8, METAL, TILE, TILE)
    rect(px, 5, 4, 10, 6, VOID, TILE, TILE)
    hline(px, 6, 9, 5, CYAN, TILE, TILE)
    glow(px, 7, 5, with_alpha(CYAN, 100), 4, TILE, TILE)


@tile('dumpster_l', solid=True, tags=['prop'])
def t_dumpster_l(px):
    rect(px, 2, 4, 15, 14, mix(SLUDGE_D, METAL_D, 0.5), TILE, TILE)
    hline(px, 2, 15, 4, SLUDGE, TILE, TILE)
    hline(px, 2, 15, 5, mix(SLUDGE_D, METAL, 0.4), TILE, TILE)
    vline(px, 2, 4, 14, METAL, TILE, TILE)
    hline(px, 2, 15, 14, VOID, TILE, TILE)
    speckle(px, 3, 6, 15, 13, VOID, 0.12, 31, TILE, TILE)


@tile('dumpster_r', solid=True, tags=['prop'])
def t_dumpster_r(px):
    rect(px, 0, 4, 13, 14, mix(SLUDGE_D, METAL_D, 0.5), TILE, TILE)
    hline(px, 0, 13, 4, SLUDGE, TILE, TILE)
    hline(px, 0, 13, 5, mix(SLUDGE_D, METAL, 0.4), TILE, TILE)
    vline(px, 13, 4, 14, VOID, TILE, TILE)
    hline(px, 0, 13, 14, VOID, TILE, TILE)
    speckle(px, 0, 6, 12, 13, VOID, 0.12, 32, TILE, TILE)


@tile('barrel', solid=True, tags=['prop'])
def t_barrel(px):
    rect(px, 3, 2, 12, 15, RUST, TILE, TILE)
    vline(px, 3, 2, 15, RUST_L, TILE, TILE)
    vline(px, 12, 2, 15, VOID, TILE, TILE)
    hline(px, 3, 12, 2, RUST_L, TILE, TILE)
    hline(px, 3, 12, 6, mix(RUST, VOID, 0.4), TILE, TILE)
    hline(px, 3, 12, 11, mix(RUST, VOID, 0.4), TILE, TILE)


@tile('barrel_toxic', solid=True, tags=['prop'])
def t_barrel_toxic(px):
    rect(px, 3, 2, 12, 15, SLUDGE_D, TILE, TILE)
    vline(px, 3, 2, 15, SLUDGE, TILE, TILE)
    vline(px, 12, 2, 15, VOID, TILE, TILE)
    hline(px, 3, 12, 2, SLUDGE, TILE, TILE)
    rect(px, 5, 7, 10, 11, LIME_D, TILE, TILE)
    disc(px, 7, 9, 1, LIME, TILE, TILE)
    glow(px, 7, 9, with_alpha(LIME, 90), 5, TILE, TILE)


@tile('vending', solid=True, tags=['prop'])
def t_vending(px):
    rect(px, 1, 0, 14, 15, METAL_D, TILE, TILE)
    bevel(px, 1, 0, 14, 15, METAL, VOID, TILE, TILE)
    rect(px, 3, 2, 12, 10, mix(VOID, CYAN_D, 0.4), TILE, TILE)
    for y in range(3, 10, 3):
        hline(px, 4, 11, y, CYAN_D, TILE, TILE)
        disc(px, 5, y, 0, MAGENTA, TILE, TILE)
        disc(px, 9, y, 0, LIME, TILE, TILE)
    rect(px, 4, 12, 11, 13, VOID, TILE, TILE)
    glow(px, 8, 6, with_alpha(CYAN, 70), 7, TILE, TILE)


@tile('ac_unit', solid=True, tags=['prop', 'roof'])
def t_ac_unit(px):
    rect(px, 0, 3, 15, 15, METAL_D, TILE, TILE)
    bevel(px, 0, 3, 15, 15, METAL, VOID, TILE, TILE)
    ring(px, 7, 9, 4, METAL, TILE, TILE)
    line(px, 4, 6, 11, 12, METAL_L, TILE, TILE)
    line(px, 11, 6, 4, 12, METAL_L, TILE, TILE)
    disc(px, 7, 9, 1, METAL_D, TILE, TILE)


@tile('server_rack', solid=True, tags=['prop', 'interior'])
def t_server_rack(px):
    rect(px, 1, 0, 14, 15, VOID, TILE, TILE)
    bevel(px, 1, 0, 14, 15, METAL, mix(VOID, METAL_D, 0.5), TILE, TILE)
    for y in range(2, 15, 3):
        rect(px, 3, y, 12, y + 1, METAL_D, TILE, TILE)
        disc(px, 4, y, 0, LIME, TILE, TILE)
        disc(px, 6, y, 0, CYAN if y % 2 else LIME_D, TILE, TILE)
    glow(px, 5, 8, with_alpha(LIME, 60), 6, TILE, TILE)


@tile('bench', solid=True, tags=['prop'])
def t_bench(px):
    rect(px, 0, 5, 15, 8, mix(RUST, VOID, 0.35), TILE, TILE)
    hline(px, 0, 15, 5, RUST_L, TILE, TILE)
    rect(px, 2, 9, 4, 14, METAL_D, TILE, TILE)
    rect(px, 11, 9, 13, 14, METAL_D, TILE, TILE)


@tile('planter', solid=True, tags=['prop'])
def t_planter(px):
    rect(px, 1, 7, 14, 15, CONCRETE_D, TILE, TILE)
    bevel(px, 1, 7, 14, 15, CONCRETE, VOID, TILE, TILE)
    disc(px, 8, 5, 4, SLUDGE_D, TILE, TILE)
    speckle(px, 4, 1, 12, 8, SLUDGE, 0.4, 33, TILE, TILE)
    speckle(px, 5, 2, 11, 7, LIME_D, 0.15, 34, TILE, TILE)


@tile('streetlight', solid=True, tags=['prop'])
def t_streetlight(px):
    rect(px, 7, 0, 9, 15, METAL_D, TILE, TILE)
    vline(px, 7, 0, 15, METAL, TILE, TILE)
    rect(px, 4, 0, 12, 2, METAL, TILE, TILE)
    rect(px, 5, 2, 11, 3, AMBER, TILE, TILE)
    glow(px, 8, 3, with_alpha(AMBER, 120), 8, TILE, TILE)


@tile('antenna', solid=True, tags=['prop', 'roof'])
def t_antenna(px):
    rect(px, 6, 10, 9, 15, METAL_D, TILE, TILE)
    vline(px, 8, 1, 10, METAL, TILE, TILE)
    line(px, 8, 4, 4, 1, METAL, TILE, TILE)
    line(px, 8, 4, 12, 1, METAL, TILE, TILE)
    disc(px, 8, 1, 0, RED, TILE, TILE)
    glow(px, 8, 1, with_alpha(RED, 120), 4, TILE, TILE)


# ------------------------------------------------------------- signage (2x2s)

def _billboard_cell(px, tl, tr, bl, br):
    """Shared frame for a 4-tile holo billboard; flags say which edges to draw."""
    rect(px, 0, 0, 15, 15, mix(VOID, VIOLET_D, 0.5), TILE, TILE)
    speckle(px, 0, 0, 15, 15, VIOLET_D, 0.2, 41, TILE, TILE)
    if tl or tr:
        hline(px, 0, 15, 0, VIOLET, TILE, TILE)
    if bl or br:
        hline(px, 0, 15, 15, VIOLET, TILE, TILE)
    if tl or bl:
        vline(px, 0, 0, 15, VIOLET, TILE, TILE)
    if tr or br:
        vline(px, 15, 0, 15, VIOLET, TILE, TILE)


@tile('billboard_tl', solid=True, tags=['wall', 'sign'])
def t_billboard_tl(px):
    _billboard_cell(px, 1, 0, 0, 0)
    rect(px, 4, 5, 12, 7, MAGENTA, TILE, TILE)
    rect(px, 4, 9, 9, 11, MAGENTA_L, TILE, TILE)
    glow(px, 10, 8, with_alpha(MAGENTA, 80), 8, TILE, TILE)


@tile('billboard_tr', solid=True, tags=['wall', 'sign'])
def t_billboard_tr(px):
    _billboard_cell(px, 0, 1, 0, 0)
    rect(px, 0, 5, 8, 7, MAGENTA, TILE, TILE)
    rect(px, 0, 9, 6, 11, MAGENTA_L, TILE, TILE)
    glow(px, 4, 8, with_alpha(MAGENTA, 80), 8, TILE, TILE)


@tile('billboard_bl', solid=True, tags=['wall', 'sign'])
def t_billboard_bl(px):
    _billboard_cell(px, 0, 0, 1, 0)
    rect(px, 4, 3, 11, 5, CYAN, TILE, TILE)
    rect(px, 4, 8, 8, 9, CYAN_L, TILE, TILE)
    glow(px, 9, 5, with_alpha(CYAN, 80), 8, TILE, TILE)


@tile('billboard_br', solid=True, tags=['wall', 'sign'])
def t_billboard_br(px):
    _billboard_cell(px, 0, 0, 0, 1)
    rect(px, 0, 3, 9, 5, CYAN, TILE, TILE)
    rect(px, 0, 8, 5, 9, CYAN_L, TILE, TILE)
    glow(px, 5, 5, with_alpha(CYAN, 80), 8, TILE, TILE)


@tile('neon_sign_l', solid=True, tags=['wall', 'sign'])
def t_neon_sign_l(px):
    _concrete_wall(px, 42)
    rect(px, 2, 3, 15, 12, VOID, TILE, TILE)
    frame_rect(px, 2, 3, 15, 12, LIME_D, TILE, TILE)
    line(px, 5, 6, 5, 10, LIME, TILE, TILE)
    line(px, 5, 6, 9, 6, LIME, TILE, TILE)
    line(px, 5, 8, 8, 8, LIME, TILE, TILE)
    glow(px, 7, 8, with_alpha(LIME, 100), 7, TILE, TILE)


@tile('neon_sign_r', solid=True, tags=['wall', 'sign'])
def t_neon_sign_r(px):
    _concrete_wall(px, 43)
    rect(px, 0, 3, 13, 12, VOID, TILE, TILE)
    frame_rect(px, 0, 3, 13, 12, LIME_D, TILE, TILE)
    line(px, 4, 6, 4, 10, LIME, TILE, TILE)
    line(px, 8, 6, 8, 10, LIME, TILE, TILE)
    line(px, 4, 8, 8, 8, LIME, TILE, TILE)
    glow(px, 6, 8, with_alpha(LIME, 100), 7, TILE, TILE)


# ------------------------------------------------------- doors and interactive

@tile('door', solid=True, tags=['door'])
def t_door(px):
    _concrete_wall(px, 44)
    rect(px, 2, 2, 13, 15, mix(RUST, VOID, 0.4), TILE, TILE)
    bevel(px, 2, 2, 13, 15, RUST, VOID, TILE, TILE)
    vline(px, 8, 3, 14, VOID, TILE, TILE)
    disc(px, 11, 9, 0, AMBER, TILE, TILE)


@tile('door_open', tags=['door', 'floor'])
def t_door_open(px):
    _concrete_wall(px, 45)
    rect(px, 2, 2, 13, 15, VOID, TILE, TILE)
    rect(px, 3, 3, 12, 15, mix(VOID, CYAN_D, 0.3), TILE, TILE)
    vline(px, 2, 2, 15, RUST, TILE, TILE)
    vline(px, 13, 2, 15, RUST, TILE, TILE)


@tile('sec_door', solid=True, tags=['door', 'locked'])
def t_sec_door(px):
    rect(px, 0, 0, 15, 15, METAL_D, TILE, TILE)
    bevel(px, 0, 0, 15, 15, METAL, VOID, TILE, TILE)
    rect(px, 2, 2, 13, 13, mix(METAL_D, VOID, 0.4), TILE, TILE)
    for y in (4, 8, 12):
        hline(px, 3, 12, y, METAL, TILE, TILE)
    rect(px, 6, 6, 9, 9, RED_D, TILE, TILE)
    disc(px, 7, 7, 0, RED, TILE, TILE)
    glow(px, 7, 7, with_alpha(RED, 110), 5, TILE, TILE)


@tile('sec_door_open', tags=['door', 'floor'])
def t_sec_door_open(px):
    rect(px, 0, 0, 15, 15, VOID, TILE, TILE)
    rect(px, 1, 1, 14, 14, mix(VOID, LIME_D, 0.35), TILE, TILE)
    vline(px, 0, 0, 15, METAL, TILE, TILE)
    vline(px, 15, 0, 15, METAL, TILE, TILE)
    hline(px, 0, 15, 0, METAL, TILE, TILE)
    glow(px, 8, 8, with_alpha(LIME, 70), 8, TILE, TILE)


@tile('terminal', solid=True, tags=['prop', 'interact'])
def t_terminal(px):
    rect(px, 1, 3, 14, 15, METAL_D, TILE, TILE)
    bevel(px, 1, 3, 14, 15, METAL, VOID, TILE, TILE)
    rect(px, 3, 5, 12, 10, VOID, TILE, TILE)
    hline(px, 4, 10, 6, CYAN, TILE, TILE)
    hline(px, 4, 8, 8, CYAN_D, TILE, TILE)
    hline(px, 4, 11, 9, CYAN_D, TILE, TILE)
    rect(px, 4, 12, 11, 13, mix(METAL_D, VOID, 0.5), TILE, TILE)
    glow(px, 7, 8, with_alpha(CYAN, 110), 7, TILE, TILE)


@tile('terminal_dead', solid=True, tags=['prop'])
def t_terminal_dead(px):
    rect(px, 1, 3, 14, 15, METAL_D, TILE, TILE)
    bevel(px, 1, 3, 14, 15, mix(METAL, VOID, 0.4), VOID, TILE, TILE)
    rect(px, 3, 5, 12, 10, VOID, TILE, TILE)
    speckle(px, 4, 6, 11, 9, mix(VOID, METAL, 0.3), 0.25, 46, TILE, TILE)


@tile('reader', solid=True, tags=['prop', 'interact'])
def t_reader(px):
    _concrete_wall(px, 47)
    rect(px, 5, 5, 10, 12, METAL_D, TILE, TILE)
    bevel(px, 5, 5, 10, 12, METAL, VOID, TILE, TILE)
    rect(px, 6, 6, 9, 8, VOID, TILE, TILE)
    hline(px, 6, 9, 7, RED, TILE, TILE)
    hline(px, 6, 9, 10, METAL_L, TILE, TILE)
    glow(px, 7, 7, with_alpha(RED, 90), 4, TILE, TILE)


@tile('stairs_up', tags=['floor', 'stairs'])
def t_stairs_up(px):
    rect(px, 0, 0, 15, 15, CONCRETE_D, TILE, TILE)
    for i, y in enumerate(range(0, 16, 4)):
        shade = mix(CONCRETE_D, CONCRETE_L, i / 4)
        rect(px, 0, y, 15, y + 2, shade, TILE, TILE)
        hline(px, 0, 15, y + 3, VOID, TILE, TILE)


@tile('stairs_down', tags=['floor', 'stairs'])
def t_stairs_down(px):
    rect(px, 0, 0, 15, 15, CONCRETE_D, TILE, TILE)
    for i, y in enumerate(range(0, 16, 4)):
        shade = mix(CONCRETE_L, CONCRETE_D, i / 4)
        rect(px, 0, y, 15, y + 2, shade, TILE, TILE)
        hline(px, 0, 15, y + 3, VOID, TILE, TILE)


@tile('void', solid=True, tags=['wall'])
def t_void(px):
    rect(px, 0, 0, 15, 15, VOID, TILE, TILE)
    speckle(px, 0, 0, 15, 15, mix(VOID, VIOLET_D, 0.5), 0.08, 48, TILE, TILE)


def build(out_png, out_json):
    n = len(_REGISTRY)
    rows = (n + COLS - 1) // COLS
    sheet = Image.new('RGBA', (COLS * TILE, rows * TILE), (0, 0, 0, 0))

    meta = []
    for i, entry in enumerate(_REGISTRY):
        img = new_image(TILE, TILE)
        entry['fn'](img.load())
        paste_grid(sheet, img, i, COLS, TILE, TILE)
        meta.append({
            'id': i,
            'name': entry['name'],
            'solid': entry['solid'],
            'tags': entry['tags'],
        })

    sheet.save(out_png)
    with open(out_json, 'w', encoding='utf-8') as fh:
        json.dump({
            'image': out_png.name if hasattr(out_png, 'name') else str(out_png),
            'tileWidth': TILE,
            'tileHeight': TILE,
            'columns': COLS,
            'count': n,
            'tiles': meta,
        }, fh, indent=2)
    return n
