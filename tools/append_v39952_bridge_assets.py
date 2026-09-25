#!/usr/bin/env python3
"""Append dedicated wide wooden Tin Stream bridge sprites and authoring sheet.

The filename is retained for build-script compatibility with the 3.995.2 pipeline,
but the current generated art is the canonical 3.995.3 wooden bridge design.
Run after build_v399_assets.py if the base atlas is regenerated.
"""
from pathlib import Path
import json
from PIL import Image, ImageDraw, ImageFilter

ROOT=Path(__file__).resolve().parent.parent
AS=ROOT/'assets'
HP=ROOT/'hd_remake_atlas.json'
SP=ROOT/'sprite_sheet_manifest.json'


def wooden_deck() -> Image.Image:
    im=Image.new('RGBA',(64,64),(0,0,0,0)); d=ImageDraw.Draw(im)
    d.rounded_rectangle((1,18,62,46),radius=4,fill=(73,47,22,255),outline=(122,87,48,255),width=2)
    for y in (20,29,38):
        d.rectangle((4,y,59,y+6),fill=(126,83,42,255),outline=(165,118,69,255))
        for x in (8,18,29,40,51):
            d.line((x,y+1,x+3,y+5),fill=(109,69,36,255),width=1)
    for x in (7,56):
        d.rectangle((x,13,x+3,50),fill=(88,57,28,255))
        d.rectangle((x-2,46,x+5,56),fill=(67,42,22,255))
    d.line((4,18,59,46),fill=(86,57,29,92),width=2)
    for x,y in ((10,23),(25,23),(40,23),(55,23),(10,40),(25,40),(40,40),(55,40)):
        d.ellipse((x-1,y-1,x+3,y+3),fill=(214,171,96,255),outline=(248,220,146,255))
    return im


def wooden_island() -> Image.Image:
    im=Image.new('RGBA',(64,64),(0,0,0,0)); d=ImageDraw.Draw(im)
    d.rounded_rectangle((4,10,59,53),radius=8,fill=(92,61,31,255),outline=(136,97,58,255),width=2)
    for y in (15,24,33,42):
        d.rectangle((10,y,53,y+6),fill=(138,94,51,255),outline=(174,125,77,255))
    d.rectangle((28,7,35,57),fill=(78,50,26,255))
    for x,y in ((13,18),(50,18),(13,46),(50,46),(31,30)):
        d.ellipse((x-2,y-2,x+3,y+3),fill=(214,171,96,255),outline=(248,220,146,255))
    d.arc((18,20,45,39),start=180,end=360,fill=(72,45,22,255),width=2)
    return im


def sprites():
    return {'bridge_deck_tile':wooden_deck(),'bridge_island_tile':wooden_island()}


def bump(im: Image.Image) -> Image.Image:
    g=im.convert('L').filter(ImageFilter.GaussianBlur(1.2))
    return Image.merge('RGBA',(g,g,g,Image.new('L',im.size,255)))


def main():
    hd=json.loads(HP.read_text())
    color=Image.open(ROOT/hd['image']).convert('RGBA')
    old_bump=Image.open(ROOT/hd['bump_image']).convert('RGBA')
    H=max(color.height,2240)
    if H!=color.height:
        c=Image.new('RGBA',(color.width,H),(0,0,0,0));c.paste(color,(0,0));color=c
        b=Image.new('RGBA',(old_bump.width,H),(128,128,128,255));b.paste(old_bump,(0,0));old_bump=b
    ss=sprites();slots={'bridge_deck_tile':(8,2056,64,64),'bridge_island_tile':(80,2056,64,64)}
    for name,im in ss.items():
        x,y,w,h=slots[name]
        color.alpha_composite(im,(x,y));old_bump.alpha_composite(bump(im),(x,y))
        hd['regions'][name]=list(slots[name])
        hd.setdefault('region_meta',{})[name]={'channel':'BLOCKERS','element':'blockers','tint_strength':.035,'world_scale':1.3888889,'category':'bridge','shadow_category':'smallDecor','material':'wood'}
    hd.setdefault('roles',{})['bridge']={'deck':'bridge_deck_tile','island':'bridge_island_tile'}
    hd['source_size']=[color.width,color.height]
    color.save(ROOT/hd['image'],optimize=True);old_bump.save(ROOT/hd['bump_image'],optimize=True);HP.write_text(json.dumps(hd,indent=2)+'\n')

    sheet=Image.new('RGBA',(144,72),(0,0,0,0));bs=Image.new('L',sheet.size,128);regions={}
    for i,(name,im) in enumerate(ss.items()):
        x=4+i*72;y=4;sheet.alpha_composite(im,(x,y));bs.paste(im.convert('L').filter(ImageFilter.GaussianBlur(1.2)),(x,y));regions[name]=[x,y,64,64]
    sheet.save(AS/'sprites_bridge.png',optimize=True);bs.save(AS/'sprites_bridge_bump.png',optimize=True)
    edit=sheet.copy();d=ImageDraw.Draw(edit);d.rectangle((0,0,143,71),outline=(255,255,255,150))
    for name,(x,y,w,h) in regions.items():d.rectangle((x,y,x+w-1,y+h-1),outline=(255,80,210,220),width=1)
    edit.save(AS/'sprites_bridge_edit_grid.png',optimize=True)
    sm=json.loads(SP.read_text());sm.setdefault('categories',{})['bridge']={'image':'assets/sprites_bridge.png','edit_image':'assets/sprites_bridge_edit_grid.png','bump_image':'assets/sprites_bridge_bump.png','size':[144,72],'regions':regions,'material':'wood'};SP.write_text(json.dumps(sm,indent=2)+'\n')
    print('v3.995.3 wooden bridge assets appended')

if __name__=='__main__':main()
