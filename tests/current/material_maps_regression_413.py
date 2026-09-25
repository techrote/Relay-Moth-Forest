#!/usr/bin/env python3
from pathlib import Path
import json
from PIL import Image, ImageStat
ROOT=Path(__file__).resolve().parents[2]
hd=json.loads((ROOT/'hd_remake_atlas.json').read_text())
assert hd['schema']=='relay-moth-hd-atlas/v4.14'
assert hd.get('specular_image')=='assets/sprite_specularmap.png'
color=Image.open(ROOT/hd['image']).convert('RGBA'); bump=Image.open(ROOT/hd['bump_image']).convert('RGBA'); spec=Image.open(ROOT/hd['specular_image']).convert('RGBA')
assert color.size==bump.size==spec.size==tuple(hd['source_size'])
roles=hd['roles']; names=set()
def add(v):
    if isinstance(v,str): names.add(v)
    elif isinstance(v,list):
        for x in v:add(x)
    elif isinstance(v,dict):
        for x in v.values():add(x)
for k in ('border_trees','blockers','decor_plants','lamps','objective','blocker_variants','tree_blockers','tree_canopies','tree_trunks','foliage_mix','foliage_v391','bridge','foliage_v401_all','robot_variants'):add(roles.get(k))
checked=0
for n in names:
    if n not in hd['regions']:continue
    x,y,w,h=hd['regions'][n]; c=color.crop((x,y,x+w,y+h));
    if c.getchannel('A').getbbox() is None:continue
    b=bump.crop((x,y,x+w,y+h)); s=spec.crop((x,y,x+w,y+h));
    assert b.getchannel('R').getextrema()[1]>0,n
    assert s.getchannel('R').getextrema()[1]>0,n
    assert b.getchannel('A').getbbox() is not None,n
    assert s.getchannel('A').getbbox() is not None,n
    checked+=1
assert checked>=300,checked
js=(ROOT/'game.js').read_text()
for token in ('bgMaterialProg','uSpecularTex','bgNormalTex','bgSpecTex','renderBackground(settings)','materialNormalCtx','materialSpecCtx'):
    assert token in js,token
assert "loadImage(hdAtlas.specular_image)" in js
assert "this.renderBackground(settings)" in js
assert "program===this.hdProg||program===this.hdTintProg||program===this.hdFlatProg" in js
print('DECORATION MATERIAL MAP REGRESSION 4.14 PASS')
print(f'  decoration/material regions with bump+specular coverage={checked}')
