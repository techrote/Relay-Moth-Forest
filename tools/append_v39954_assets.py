#!/usr/bin/env python3
"""Reapply v3.995.4 supplemental bridge and high-resolution flora assets.

Run this after ``build_v399_assets.py`` and ``append_v39952_bridge_assets.py`` (or
run it directly; it calls the wooden bridge stage itself).  It makes the current
shipping atlas reproducible instead of relying on already-baked pixels.
"""
from pathlib import Path
import json
from PIL import Image, ImageFilter
import append_v39952_bridge_assets as bridge_stage

ROOT=Path(__file__).resolve().parent.parent
AS=ROOT/'assets'
HP=ROOT/'hd_remake_atlas.json'
SP=ROOT/'sprite_sheet_manifest.json'

BRIDGE_SLOT=(8,2240,512,256)
FLORA_SLOTS={
    'flower_hd_bell':(544,2240,128,128),
    'flower_hd_star':(680,2240,128,128),
    'flower_hd_circuit':(816,2240,128,128),
    'foliage_hd_fern':(952,2240,128,128),
    'foliage_hd_moss':(1088,2240,128,128),
    'foliage_hd_spiral':(1224,2240,128,128),
}
FLORA_SHEET={
    'flower_hd_bell':(8,8,128,128),
    'flower_hd_star':(144,8,128,128),
    'flower_hd_circuit':(280,8,128,128),
    'foliage_hd_fern':(416,8,128,128),
    'foliage_hd_moss':(552,8,128,128),
    'foliage_hd_spiral':(688,8,128,128),
}

def rgba_bump(im:Image.Image)->Image.Image:
    g=im.convert('L').filter(ImageFilter.GaussianBlur(1.4))
    return Image.merge('RGBA',(g,g,g,Image.new('L',im.size,255)))

def ensure_size(im:Image.Image,w:int,h:int,fill):
    if im.width>=w and im.height>=h:return im
    out=Image.new('RGBA',(max(w,im.width),max(h,im.height)),fill)
    out.alpha_composite(im,(0,0));return out

def main():
    # Canonical wooden per-cell bridge stage first.  This is intentionally called
    # here so one command after the base authoring build yields the whole current atlas.
    bridge_stage.main()
    hd=json.loads(HP.read_text())
    color=Image.open(ROOT/hd['image']).convert('RGBA')
    bump=Image.open(ROOT/hd['bump_image']).convert('RGBA')
    need_w=max(color.width,1360);need_h=max(color.height,2528)
    color=ensure_size(color,need_w,need_h,(0,0,0,0))
    bump=ensure_size(bump,need_w,need_h,(128,128,128,255))

    complete=Image.open(AS/'bridge_complete.png').convert('RGBA').resize((512,256),Image.Resampling.LANCZOS)
    x,y,w,h=BRIDGE_SLOT;color.alpha_composite(complete,(x,y));bump.alpha_composite(rgba_bump(complete),(x,y))
    hd['regions']['bridge_complete']=[x,y,w,h]
    hd.setdefault('region_meta',{})['bridge_complete']={
        'channel':'BLOCKERS','element':'blockers','tint_strength':.025,'world_scale':1.3888889,
        'category':'bridge','material':'wood','shadow_category':'largeDecor','high_resolution':True,
    }
    hd.setdefault('roles',{}).setdefault('bridge',{}).update({'complete':'bridge_complete'})

    sheet=Image.open(AS/'sprites_foliage_hd.png').convert('RGBA')
    for name,(x,y,w,h) in FLORA_SLOTS.items():
        sx,sy,sw,sh=FLORA_SHEET[name]
        im=sheet.crop((sx,sy,sx+sw,sy+sh)).resize((w,h),Image.Resampling.LANCZOS)
        color.alpha_composite(im,(x,y));bump.alpha_composite(rgba_bump(im),(x,y))
        hd['regions'][name]=[x,y,w,h]
        hd.setdefault('region_meta',{})[name]={
            'channel':'FOREST','element':'far_forest','tint_strength':.07,'world_scale':.65,
            'category':'foliage_hd','high_resolution':True,
        }
    roles=hd.setdefault('roles',{})
    decor=roles.setdefault('decor_plants',[])
    mix=roles.setdefault('foliage_mix',[])
    for name in FLORA_SLOTS:
        if name not in decor:decor.append(name)
        if name.startswith('foliage_hd_') and name not in mix:mix.append(name)
    hd['source_size']=[color.width,color.height]
    color.save(ROOT/hd['image'],optimize=True);bump.save(ROOT/hd['bump_image'],optimize=True)
    HP.write_text(json.dumps(hd,indent=2)+'\n')

    sm=json.loads(SP.read_text());cats=sm.setdefault('categories',{})
    cats['bridge_complete']={
        'image':'assets/bridge_complete.png','edit_image':'assets/bridge_complete_edit_grid.png',
        'bump_image':'assets/bridge_complete_bump.png','size':[512,256],
        'regions':{'bridge_complete':[0,0,512,256]},'material':'wood',
        'note':'coherent full-span completed Tin Stream bridge',
    }
    cats['foliage_hd']={
        'image':'assets/sprites_foliage_hd.png','edit_image':'assets/sprites_foliage_hd_edit_grid.png',
        'bump_image':'assets/sprites_foliage_hd_bump.png','size':[816,144],
        'regions':{k:list(v) for k,v in FLORA_SHEET.items()},
        'note':'v3.995.4 high-resolution flower/foliage art at modest world scale',
    }
    SP.write_text(json.dumps(sm,indent=2)+'\n')
    print('v3.995.4 bridge + high-resolution flora assets appended')

if __name__=='__main__':main()
