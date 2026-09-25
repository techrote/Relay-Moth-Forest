#!/usr/bin/env python3
"""Rebuild colour/category inputs, then deterministic v4.14 material atlases.

External editing workflow:
  1. Edit a clean ``assets/sprites_<category>.png`` sheet.
  2. Keep matching category sheets/metadata together.
  3. Run this script.

v4.13 notes:
- Runtime bump data is RGBA: height in RGB, source sprite alpha in A. The alpha is
  required when static decoration material maps are composited into world space.
- Imported regions that do not have a normal category sheet are preserved from the
  current runtime atlas.
- ``generate_material_maps_413.py`` is run automatically afterwards to refresh the
  broad decoration bump treatment and dedicated specular atlas.
"""
from __future__ import annotations
import json, subprocess, sys
from pathlib import Path
from PIL import Image
import numpy as np

ROOT=Path(__file__).resolve().parent.parent
AS=ROOT/'assets'
manifest=json.loads((ROOT/'sprite_sheet_manifest.json').read_text())
hd=json.loads((ROOT/'hd_remake_atlas.json').read_text())
size=tuple(hd['source_size'])
old_runtime=Image.open(ROOT/hd['image']).convert('RGBA')
old_bump=Image.open(ROOT/hd['bump_image']).convert('RGBA')
runtime=Image.new('RGBA',size,(0,0,0,0))
bump=Image.new('RGBA',size,(0,0,0,0))
seen=set()

for cat,info in manifest.get('categories',{}).items():
    if not {'image','bump_image','size','regions'} <= set(info):
        continue
    img=Image.open(ROOT/info['image']).convert('RGBA')
    bimg=Image.open(ROOT/info['bump_image']).convert('L')
    assert img.size==tuple(info['size'])==bimg.size,(cat,img.size,bimg.size,info['size'])
    for name,src_r in info['regions'].items():
        if name not in hd['regions']:
            raise KeyError(f'{name} exists in {cat} sheet but not master manifest')
        sx,sy,sw,sh=src_r; dx,dy,dw,dh=hd['regions'][name]
        if (sw,sh)!=(dw,dh):
            raise ValueError(f'{name}: category size {(sw,sh)} != runtime size {(dw,dh)}')
        tile=img.crop((sx,sy,sx+sw,sy+sh))
        runtime.alpha_composite(tile,(dx,dy))
        hv=np.asarray(bimg.crop((sx,sy,sx+sw,sy+sh)),dtype=np.uint8)
        av=np.asarray(tile.getchannel('A'),dtype=np.uint8)
        rgba=Image.fromarray(np.dstack([hv,hv,hv,av]),'RGBA')
        bump.alpha_composite(rgba,(dx,dy))
        seen.add(name)

# v4.01 imported foliage and any future externally packed regions are preserved.
for name,(x,y,w,h) in hd['regions'].items():
    if name in seen: continue
    runtime.alpha_composite(old_runtime.crop((x,y,x+w,y+h)),(x,y))
    bump.alpha_composite(old_bump.crop((x,y,x+w,y+h)),(x,y))

runtime.save(AS/'sprite_runtime_atlas.png',compress_level=1)
bump.save(AS/'sprite_bumpmap.png',compress_level=1)
subprocess.run([sys.executable,str(ROOT/'tools'/'generate_material_maps_413.py')],check=True)
print(f'Rebuilt {len(hd["regions"])} sprites into {size[0]}x{size[1]} runtime colour/bump/specular atlases.')
