"""Generates animated 4-direction character spritesheets.

Sheet layout is fixed so the game can compute a frame index arithmetically:

    rows = direction  [0 down, 1 left, 2 right, 3 up]
    cols = pose       [0..3 walk, 4..5 attack, 6 hurt]
    frame index       = row * 7 + col

Frames are 16x24 with the feet planted on y=23 and two rows of headroom so the
walk bob never clips. Poses are procedural: a `phase` drives the legs and arm
swing, so a new character is a colour/feature spec, never new animation code.

Adding a character: append a spec to SPECS (or ACTOR_SPECS in gen_assets.py).
A palette-swapped variant is just another spec reusing the same feature flags.
"""

from PIL import Image

from palette import *
from pixel import (disc, glow, hline, line, new_image, paste_grid, put, rect,
                   ring, speckle, vline)

FW, FH = 16, 24
COLS, ROWS = 7, 4

DOWN, LEFT, RIGHT, UP = 0, 1, 2, 3

# pose column -> (leg phase, arm swing, bob, lean)
WALK_PHASES = [
    (0, 0, 0),    # 0 contact / doubles as idle
    (1, 1, -1),   # 1 step A (body rises)
    (0, 0, 0),    # 2 contact, arms mirrored
    (-1, -1, -1),  # 3 step B
]


class Spec(dict):
    """Attribute-style access keeps the draw code readable."""

    def __getattr__(self, k):
        try:
            return self[k]
        except KeyError:
            raise AttributeError(k)


def spec(name, skin, hair, coat, pants, accent,
         shades=False, cyberarm=False, weapon=None, hover=False,
         bulk=0, hair_style='short'):
    return Spec(
        name=name, skin=skin, hair=hair, coat=coat, pants=pants, accent=accent,
        shades=shades, cyberarm=cyberarm, weapon=weapon, hover=hover,
        bulk=bulk, hair_style=hair_style,
    )


# --------------------------------------------------------------- humanoid body

def _head(px, s, direction, oy):
    """Head block with hair, plus face features when not facing away."""
    skin_d, skin, skin_l = s.skin
    hair_d, hair, hair_l = s.hair

    # skull
    rect(px, 4, 3 + oy, 11, 8 + oy, skin, FW, FH)
    rect(px, 5, 9 + oy, 10, 9 + oy, skin, FW, FH)
    # shading down the away-side
    if direction == LEFT:
        vline(px, 10, 3 + oy, 9 + oy, skin_d, FW, FH)
    elif direction == RIGHT:
        vline(px, 5, 3 + oy, 9 + oy, skin_d, FW, FH)
    else:
        hline(px, 4, 11, 8 + oy, skin_d, FW, FH)
    hline(px, 5, 10, 3 + oy, skin_l, FW, FH)

    # hair cap
    rect(px, 4, 2 + oy, 11, 4 + oy, hair, FW, FH)
    hline(px, 5, 10, 1 + oy, hair, FW, FH)
    hline(px, 5, 10, 1 + oy, hair_l, FW, FH)
    rect(px, 4, 5 + oy, 4, 6 + oy, hair_d, FW, FH)
    rect(px, 11, 5 + oy, 11, 6 + oy, hair_d, FW, FH)

    if s.hair_style == 'mohawk':
        rect(px, 6, 0 + oy, 9, 2 + oy, hair_l, FW, FH)
        rect(px, 4, 2 + oy, 11, 3 + oy, hair_d, FW, FH)
    elif s.hair_style == 'long':
        rect(px, 3, 4 + oy, 3, 11 + oy, hair_d, FW, FH)
        rect(px, 12, 4 + oy, 12, 11 + oy, hair_d, FW, FH)
    elif s.hair_style == 'bald':
        rect(px, 4, 2 + oy, 11, 4 + oy, skin, FW, FH)
        hline(px, 5, 10, 1 + oy, skin_l, FW, FH)
        hline(px, 5, 10, 2 + oy, skin_l, FW, FH)

    if direction == UP:
        # back of the head: hair covers everything
        rect(px, 4, 2 + oy, 11, 7 + oy, hair, FW, FH)
        hline(px, 5, 10, 1 + oy, hair, FW, FH)
        hline(px, 4, 11, 7 + oy, hair_d, FW, FH)
        if s.hair_style == 'mohawk':
            rect(px, 6, 0 + oy, 9, 6 + oy, hair_l, FW, FH)
        return

    # eyes / shades
    ey = 6 + oy
    if s.shades:
        lens = s.accent
        if direction == DOWN:
            rect(px, 4, ey, 11, ey + 1, VOID, FW, FH)
            put(px, 5, ey, lens, FW, FH)
            put(px, 10, ey, lens, FW, FH)
        elif direction == LEFT:
            rect(px, 4, ey, 8, ey + 1, VOID, FW, FH)
            put(px, 4, ey, lens, FW, FH)
        else:
            rect(px, 7, ey, 11, ey + 1, VOID, FW, FH)
            put(px, 11, ey, lens, FW, FH)
    else:
        if direction == DOWN:
            put(px, 6, ey, VOID, FW, FH)
            put(px, 9, ey, VOID, FW, FH)
        elif direction == LEFT:
            put(px, 5, ey, VOID, FW, FH)
        else:
            put(px, 10, ey, VOID, FW, FH)


def _torso(px, s, direction, oy, lean):
    coat_d, coat, coat_l = s.coat
    x0, x1 = 4 - s.bulk, 11 + s.bulk

    rect(px, x0, 10 + oy, x1, 17 + oy, coat, FW, FH)
    hline(px, x0, x1, 10 + oy, coat_l, FW, FH)
    hline(px, x0, x1, 17 + oy, coat_d, FW, FH)

    if direction == DOWN:
        # open jacket: a darker gutter down the middle, accent trim on the lapels
        vline(px, 7, 11 + oy, 16 + oy, coat_d, FW, FH)
        vline(px, 8, 11 + oy, 16 + oy, coat_d, FW, FH)
        vline(px, 6, 11 + oy, 16 + oy, s.accent, FW, FH)
        vline(px, 9, 11 + oy, 16 + oy, s.accent, FW, FH)
        rect(px, 6, 10 + oy, 9, 10 + oy, s.skin[1], FW, FH)
    elif direction == UP:
        vline(px, 7, 11 + oy, 16 + oy, coat_d, FW, FH)
        hline(px, x0, x1, 13 + oy, coat_d, FW, FH)
        hline(px, x0 + 1, x1 - 1, 12 + oy, s.accent, FW, FH)
    else:
        side = x0 if direction == LEFT else x1
        vline(px, side, 11 + oy, 16 + oy, s.accent, FW, FH)
        vline(px, x1 if direction == LEFT else x0, 11 + oy, 16 + oy, coat_d, FW, FH)

    # belt
    hline(px, x0, x1, 16 + oy, mix(coat_d, VOID, 0.4), FW, FH)
    put(px, 8, 16 + oy, AMBER, FW, FH)


def _arms(px, s, direction, oy, swing, extend=None):
    """extend: None, or (dx, dy) for a weapon-arm reach."""
    coat_d, coat, coat_l = s.coat
    skin_d, skin, skin_l = s.skin
    x0, x1 = 3 - s.bulk, 12 + s.bulk

    la_y = 11 + oy + (1 if swing > 0 else 0)
    ra_y = 11 + oy + (1 if swing < 0 else 0)

    def draw_arm(x, y, cyber):
        col = coat if not cyber else METAL
        rect(px, x, y, x, y + 4, col, FW, FH)
        put(px, x, y + 5, skin if not cyber else METAL_L, FW, FH)
        if cyber:
            put(px, x, y + 2, s.accent, FW, FH)
            put(px, x, y + 4, s.accent, FW, FH)

    if direction in (DOWN, UP):
        draw_arm(x0, la_y, False)
        draw_arm(x1, ra_y, s.cyberarm)
    elif direction == LEFT:
        draw_arm(x0, la_y, s.cyberarm)
    else:
        draw_arm(x1, ra_y, s.cyberarm)

    if extend is not None:
        _weapon(px, s, direction, oy, extend)


def _weapon(px, s, direction, oy, reach):
    """Draw the weapon arm thrust out, plus the weapon itself."""
    if s.weapon is None:
        return
    hy = 13 + oy
    if direction == DOWN:
        hx, dx, dy = 11, 0, 1
    elif direction == UP:
        hx, dx, dy = 4, 0, -1
    elif direction == LEFT:
        hx, dx, dy = 3, -1, 0
    else:
        hx, dx, dy = 12, 1, 0

    # outstretched forearm
    ax, ay = hx + dx * reach, hy + dy * reach
    line(px, hx, hy, ax, ay, METAL if s.cyberarm else s.coat[1], FW, FH)
    put(px, ax, ay, s.skin[2] if not s.cyberarm else METAL_L, FW, FH)

    if s.weapon == 'blade':
        bx, by = ax + dx * 1, ay + dy * 1
        ex, ey = ax + dx * 6, ay + dy * 6
        line(px, bx, by, ex, ey, CYAN_L, FW, FH)
        line(px, bx + (1 if dx == 0 else 0), by + (1 if dy == 0 else 0),
             ex + (1 if dx == 0 else 0), ey + (1 if dy == 0 else 0), CYAN, FW, FH)
        glow(px, (bx + ex) // 2, (by + ey) // 2, with_alpha(CYAN, 90), 4, FW, FH)
    elif s.weapon == 'pistol':
        rect(px, min(ax, ax + dx * 2), min(ay, ay + dy * 2),
             max(ax, ax + dx * 2), max(ay, ay + dy * 2), METAL_D, FW, FH)
        put(px, ax + dx * 2, ay + dy * 2, AMBER, FW, FH)


def _legs(px, s, direction, oy, phase):
    pants_d, pants, pants_l = s.pants
    top = 18 + oy
    bot = 22 + oy

    boot = mix(pants_d, VOID, 0.55)

    if direction in (DOWN, UP):
        # one leg lifts (shorter) while the other plants
        l_lift = 1 if phase > 0 else 0
        r_lift = 1 if phase < 0 else 0
        rect(px, 5, top, 7, bot - l_lift, pants, FW, FH)
        rect(px, 8, top, 10, bot - r_lift, pants, FW, FH)
        vline(px, 5, top, bot - l_lift, pants_l, FW, FH)
        vline(px, 8, top, bot - r_lift, pants_l, FW, FH)
        vline(px, 7, top, bot, pants_d, FW, FH)
        # boots
        rect(px, 4, bot + 1 - l_lift, 7, bot + 1 - l_lift, boot, FW, FH)
        rect(px, 8, bot + 1 - r_lift, 11, bot + 1 - r_lift, boot, FW, FH)
        put(px, 4, bot + 1 - l_lift, s.accent, FW, FH)
        put(px, 11, bot + 1 - r_lift, s.accent, FW, FH)
    else:
        d = 1 if direction == RIGHT else -1
        fx = 7 + d * phase          # front leg swings with the phase
        bx = 7 - d * phase
        rect(px, bx, top, bx + 2, bot, pants_d, FW, FH)
        rect(px, bx, bot + 1, bx + 2, bot + 1, mix(boot, VOID, 0.4), FW, FH)
        rect(px, fx, top, fx + 2, bot, pants, FW, FH)
        vline(px, fx if d > 0 else fx + 2, top, bot, pants_l, FW, FH)
        rect(px, fx + (1 if d > 0 else -1), bot + 1, fx + 2 + (1 if d > 0 else -1),
             bot + 1, boot, FW, FH)
        put(px, fx + (2 if d > 0 else -1), bot + 1, s.accent, FW, FH)


def _shadow(px):
    rect(px, 4, 23, 11, 23, (0, 0, 0, 90))
    rect(px, 5, 22, 10, 22, (0, 0, 0, 40))


# ------------------------------------------------------------------ drone body

def _drone_frame(px, s, direction, col):
    """Hovering security drone: no legs, a bobbing chassis and spinning rotors."""
    bob = [-1, 0, 1, 0][col % 4]
    if col >= 4:
        bob = -1  # attack frames hold high
    cy = 11 + bob

    # under-glow
    glow(px, 8, cy + 7, with_alpha(s.accent, 70), 5, FW, FH)

    # chassis
    disc(px, 8, cy, 4, s.coat[1], FW, FH)
    disc(px, 8, cy - 1, 3, s.coat[2], FW, FH)
    ring(px, 8, cy, 4, s.coat[0], FW, FH)

    # rotor arms - blade orientation alternates to read as spin
    spin = col % 2
    for sx in (2, 13):
        rect(px, sx - 1, cy - 1, sx + 1, cy, METAL_D, FW, FH)
        if spin:
            hline(px, sx - 2, sx + 2, cy - 2, with_alpha(METAL_L, 200), FW, FH)
        else:
            vline(px, sx, cy - 4, cy + 1, with_alpha(METAL_L, 150), FW, FH)

    # optic points in the facing direction
    ox, oy_ = {DOWN: (8, cy + 3), UP: (8, cy - 3), LEFT: (5, cy), RIGHT: (11, cy)}[direction]
    disc(px, ox, oy_, 1, VOID, FW, FH)
    put(px, ox, oy_, RED if col >= 4 else s.accent, FW, FH)
    glow(px, ox, oy_, with_alpha(RED if col >= 4 else s.accent, 130), 4, FW, FH)

    if col >= 4:
        # muzzle spark on the strike frame
        if col == 5:
            dx, dy = {DOWN: (0, 1), UP: (0, -1), LEFT: (-1, 0), RIGHT: (1, 0)}[direction]
            put(px, ox + dx * 2, oy_ + dy * 2, AMBER_L, FW, FH)
            glow(px, ox + dx * 3, oy_ + dy * 3, with_alpha(AMBER, 160), 3, FW, FH)


# ------------------------------------------------------------------ frame draw

def draw_frame(s, direction, col):
    img = new_image(FW, FH)
    px = img.load()

    if s.hover:
        _drone_frame(px, s, direction, col)
        return img

    _shadow(px)

    if col <= 3:
        phase, swing, bob = WALK_PHASES[col]
        # frame 2 mirrors the arm swing so the cycle reads as four distinct poses
        if col == 2:
            swing = 0
        _head(px, s, direction, bob)
        _torso(px, s, direction, bob, 0)
        _arms(px, s, direction, bob, swing)
        _legs(px, s, direction, bob, phase)
    elif col in (4, 5):
        windup = col == 4
        bob = 0
        _head(px, s, direction, bob)
        _torso(px, s, direction, bob, 0)
        _legs(px, s, direction, bob, -1 if windup else 1)
        _arms(px, s, direction, bob, -1 if windup else 1,
              extend=1 if windup else 3)
    else:  # hurt
        bob = 1
        _head(px, s, direction, bob)
        _torso(px, s, direction, bob, 0)
        _arms(px, s, direction, bob, 1)
        _legs(px, s, direction, bob, 1)
        # recoil sparks
        put(px, 3, 9 + bob, RED_L, FW, FH)
        put(px, 12, 11 + bob, RED_L, FW, FH)

    return img


def build_actor(s, out_path):
    sheet = Image.new('RGBA', (COLS * FW, ROWS * FH), (0, 0, 0, 0))
    for row, direction in enumerate((DOWN, LEFT, RIGHT, UP)):
        for col in range(COLS):
            frame = draw_frame(s, direction, col)
            paste_grid(sheet, frame, row * COLS + col, COLS, FW, FH)
    sheet.save(out_path)
    return COLS * ROWS


# ------------------------------------------------------------------- the cast

SPECS = [
    spec('runner',
         skin=(SKIN_D, SKIN, SKIN_L), hair=(MAGENTA_D, MAGENTA, MAGENTA_L),
         coat=(CLOTH_D, CLOTH, CLOTH_L), pants=(ASPHALT_D, ASPHALT, ASPHALT_L),
         accent=CYAN, shades=True, cyberarm=True, weapon='blade'),

    spec('ganger_blade',
         skin=(SKIN2_D, SKIN2, SKIN2_L), hair=(LIME_D, LIME, LIME_L),
         coat=(RUST, RUST_L, mix(RUST_L, AMBER, 0.4)),
         pants=(CLOTH_D, CLOTH, CLOTH_L), accent=LIME,
         weapon='blade', hair_style='mohawk', bulk=1),

    spec('ganger_gun',
         skin=(SKIN_D, SKIN, SKIN_L), hair=(VOID, ASPHALT_D, ASPHALT),
         coat=(VIOLET_D, VIOLET, VIOLET_L),
         pants=(ASPHALT_D, ASPHALT, ASPHALT_L), accent=AMBER,
         shades=True, weapon='pistol'),

    spec('ganger_boss',
         skin=(SKIN2_D, SKIN2, SKIN2_L), hair=(RED_D, RED, RED_L),
         coat=(mix(VOID, RED_D, 0.6), RED_D, RED),
         pants=(ASPHALT_D, ASPHALT, ASPHALT_L), accent=RED_L,
         shades=True, cyberarm=True, weapon='blade', bulk=1, hair_style='mohawk'),

    spec('sec_drone',
         skin=(METAL_D, METAL, METAL_L), hair=(METAL_D, METAL, METAL_L),
         coat=(METAL_D, METAL, METAL_L), pants=(METAL_D, METAL, METAL_L),
         accent=RED, hover=True, weapon='pistol'),

    spec('fixer',
         skin=(SKIN2_D, SKIN2, SKIN2_L), hair=(VOID, ASPHALT_D, CONCRETE),
         coat=(mix(VOID, VIOLET_D, 0.7), VIOLET_D, VIOLET),
         pants=(ASPHALT_D, ASPHALT, ASPHALT_L), accent=AMBER,
         shades=True, hair_style='bald'),

    spec('decker',
         skin=(SKIN_D, SKIN, SKIN_L), hair=(CYAN_D, CYAN, CYAN_L),
         coat=(mix(VOID, CYAN_D, 0.5), CYAN_D, CYAN),
         pants=(CLOTH_D, CLOTH, CLOTH_L), accent=LIME,
         cyberarm=True, hair_style='long'),

    spec('civ_a',
         skin=(SKIN_D, SKIN, SKIN_L), hair=(RUST, RUST_L, AMBER_L),
         coat=(CONCRETE_D, CONCRETE, CONCRETE_L),
         pants=(CLOTH_D, CLOTH, CLOTH_L), accent=CONCRETE_L),

    spec('civ_b',
         skin=(SKIN2_D, SKIN2, SKIN2_L), hair=(VOID, ASPHALT_D, ASPHALT_L),
         coat=(SLUDGE_D, SLUDGE, SLUDGE_L),
         pants=(ASPHALT_D, ASPHALT, ASPHALT_L), accent=AMBER_L, hair_style='long'),

    spec('guard',
         skin=(SKIN_D, SKIN, SKIN_L), hair=(VOID, ASPHALT_D, ASPHALT),
         coat=(mix(VOID, METAL_D, 0.6), METAL_D, METAL),
         pants=(METAL_D, METAL, METAL_L), accent=CYAN,
         shades=True, weapon='pistol', bulk=1),
]
