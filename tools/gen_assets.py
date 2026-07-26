"""Neon Divide asset pipeline entry point.

    python tools/gen_assets.py

Writes every PNG plus the metadata JSON the game reads at runtime into
apps/game/public/assets/. Output is deterministic: same source, same bytes.
"""

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))

OUT = ROOT.parent / 'apps' / 'game' / 'public' / 'assets'

import gen_actors  # noqa: E402
import gen_font  # noqa: E402
import gen_fx  # noqa: E402
import gen_sfx  # noqa: E402
import gen_tileset  # noqa: E402


def main():
    OUT.mkdir(parents=True, exist_ok=True)

    manifest = {'icons': {}, 'portraits': {}, 'actors': {}}

    n_tiles = gen_tileset.build(OUT / 'tiles_neokyoto.png',
                                OUT / 'tiles_neokyoto.json')
    print(f'  tiles       {n_tiles:3d} tiles  -> tiles_neokyoto.png + .json')

    for s in gen_actors.SPECS:
        frames = gen_actors.build_actor(s, OUT / f'actor_{s.name}.png')
        manifest['actors'][s.name] = {
            'frameWidth': gen_actors.FW,
            'frameHeight': gen_actors.FH,
            'cols': gen_actors.COLS,
            'rows': gen_actors.ROWS,
            'frames': frames,
            'hover': bool(s.hover),
        }
        print(f'  actor       {frames:3d} frames -> actor_{s.name}.png')

    gen_fx.build_all(OUT, manifest)
    print(f'  fx/ui       {len(manifest["icons"])} icons, '
          f'{len(manifest["portraits"])} portraits')

    manifest['font'] = gen_font.build(OUT / 'ui_font.png')
    print(f'  font        {manifest["font"]["count"]} glyphs -> ui_font.png')

    n_sfx = gen_sfx.build_all(OUT, manifest)
    print(f'  sfx         {n_sfx:3d} sounds -> sfx_*.wav')

    with open(OUT / 'fx_manifest.json', 'w', encoding='utf-8') as fh:
        json.dump(manifest, fh, indent=2)

    print(f'\nassets written to {OUT}')


if __name__ == '__main__':
    main()
