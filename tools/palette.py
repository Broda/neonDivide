"""Shared colour ramps for every Neon Divide generator.

Everything the pipeline draws pulls from this module so the tilesheet, the actor
sheets and the UI read as one coherent set. Colours are RGBA tuples.

Adding a new hue: define the base, then use `ramp()` to derive shade/light steps
rather than hand-picking, so new art sits on the same value scale as the old.
"""

# ---------------------------------------------------------------- base palette

VOID = (7, 7, 13, 255)        # deepest shadow, also the transparent-adjacent dark
ASPHALT_D = (24, 24, 34, 255)
ASPHALT = (37, 38, 52, 255)
ASPHALT_L = (52, 54, 72, 255)

CONCRETE_D = (44, 46, 60, 255)
CONCRETE = (72, 76, 94, 255)
CONCRETE_L = (104, 110, 130, 255)

METAL_D = (38, 42, 54, 255)
METAL = (86, 96, 112, 255)
METAL_L = (140, 152, 172, 255)

RUST = (112, 62, 44, 255)
RUST_L = (156, 92, 58, 255)

# neon / emissive
CYAN_D = (0, 96, 126, 255)
CYAN = (0, 200, 232, 255)
CYAN_L = (150, 245, 255, 255)

MAGENTA_D = (124, 16, 96, 255)
MAGENTA = (236, 44, 160, 255)
MAGENTA_L = (255, 148, 214, 255)

LIME_D = (48, 110, 40, 255)
LIME = (126, 232, 88, 255)
LIME_L = (198, 255, 168, 255)

AMBER_D = (128, 76, 16, 255)
AMBER = (232, 158, 48, 255)
AMBER_L = (255, 216, 138, 255)

VIOLET_D = (56, 32, 96, 255)
VIOLET = (110, 74, 190, 255)
VIOLET_L = (176, 148, 248, 255)

RED_D = (110, 22, 32, 255)
RED = (208, 48, 62, 255)
RED_L = (255, 122, 122, 255)

# organics
SKIN_D = (128, 84, 66, 255)
SKIN = (188, 132, 104, 255)
SKIN_L = (226, 178, 146, 255)

SKIN2_D = (86, 54, 42, 255)
SKIN2 = (134, 88, 66, 255)
SKIN2_L = (176, 126, 96, 255)

CLOTH_D = (28, 30, 46, 255)
CLOTH = (48, 52, 76, 255)
CLOTH_L = (74, 82, 116, 255)

SLUDGE_D = (34, 56, 30, 255)
SLUDGE = (66, 104, 48, 255)
SLUDGE_L = (108, 158, 72, 255)

WHITE = (236, 244, 255, 255)
BLACK = (12, 12, 18, 255)
NONE = (0, 0, 0, 0)

# UI
UI_BG = (10, 12, 22, 236)
UI_EDGE = CYAN
UI_EDGE_D = CYAN_D
UI_TEXT = (206, 232, 248, 255)
UI_DIM = (108, 128, 152, 255)


# ------------------------------------------------------------------- utilities

def ramp(color, factor):
    """Scale a colour's brightness, preserving alpha. factor 1.0 = unchanged."""
    r, g, b, a = color
    return (
        max(0, min(255, int(r * factor))),
        max(0, min(255, int(g * factor))),
        max(0, min(255, int(b * factor))),
        a,
    )


def mix(a, b, t):
    """Linear blend between two colours; t=0 -> a, t=1 -> b."""
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(4))


def with_alpha(color, alpha):
    return (color[0], color[1], color[2], alpha)


#: Named neon accents, used by tiles and by the actor recolour system.
NEON = {
    'cyan': (CYAN_D, CYAN, CYAN_L),
    'magenta': (MAGENTA_D, MAGENTA, MAGENTA_L),
    'lime': (LIME_D, LIME, LIME_L),
    'amber': (AMBER_D, AMBER, AMBER_L),
    'violet': (VIOLET_D, VIOLET, VIOLET_L),
    'red': (RED_D, RED, RED_L),
}
