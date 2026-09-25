#!/usr/bin/env python3
"""Deterministic v4.14 derived sprite materials; no previous output is an input.

Colour art is authoritative. Split-tree resources are regenerated from their parent
without double-compositing alpha. All material atlases preserve source alpha exactly.
The normal atlas stores broad source-space normals, so scaling a sprite or changing
DPI cannot alter its normal strength. Source Y is down; encoded normal Y is up.
"""
from __future__ import annotations
import argparse, hashlib, json, tempfile
from pathlib import Path
import numpy as np
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parents[1]

def material_scale(name: str, meta: dict) -> float:
    n=name.lower(); el=str(meta.get('element','')).lower(); fam=str(meta.get('family','')).lower()
    if any(k in n for k in ('swirl','moon','star_wave')): return .06
    if any(k in n for k in ('flower','foliage','grass','fern','moss','bush','leaf','mushroom')) or fam=='foliage': return .14
    if 'tree' in n or meta.get('material')=='wood' or 'stump' in n: return .24
    if 'rock' in n or fam=='rock' or 'stone' in n: return .27
    if 'robot' in n or el=='robot_faces': return .52
    if any(k in n for k in ('lamp','lantern','candelabra','pillar','gate','rivet','beacon')) or el in ('tree_lights','tree_metal'): return .56
    if any(k in n for k in ('orb_','crystal','glass')): return .68
    if 'bridge' in n: return .24
    return .34 if el=='blockers' else .30

def derive(rgba: Image.Image, scale: float) -> tuple[Image.Image, ...]:
    a=rgba.getchannel('A'); ar=np.asarray(a); rgba_a=np.asarray(rgba)
    rs=max(.42,min(1.,min(rgba.size)/80.))
    l=np.asarray(rgba.convert('RGB').convert('L'),dtype=np.float32)
    soft=np.asarray(a.filter(ImageFilter.GaussianBlur(7.5*rs)),dtype=np.float32)
    core=np.asarray(a.filter(ImageFilter.GaussianBlur(2.4*rs)),dtype=np.float32)
    edge=np.asarray(a.filter(ImageFilter.MaxFilter(max(3,int(round(9*rs))|1))),dtype=np.float32)
    raw=(.10*l+.48*soft+.34*core+.08*edge).clip(0,255).astype(np.uint8)
    height=np.array(Image.fromarray(raw).filter(ImageFilter.GaussianBlur(max(.55,1.25*rs))))
    h=height.astype(np.float32)/255.
    hp=np.pad(h,1,mode='edge'); ap=np.pad(ar,1,mode='edge')
    left=np.where(ap[1:-1,:-2]>5,hp[1:-1,:-2],h); right=np.where(ap[1:-1,2:]>5,hp[1:-1,2:],h)
    up=np.where(ap[:-2,1:-1]>5,hp[:-2,1:-1],h); down=np.where(ap[2:,1:-1]>5,hp[2:,1:-1],h)
    # +/- 1 texel gradients, scaled once in source space; art rotation/flip is applied at draw time.
    v=np.dstack([-(right-left)*5.0,(down-up)*5.0,np.ones_like(h)])
    v/=np.linalg.norm(v,axis=2)[...,None]
    normals=np.round(v*127+128).clip(0,255).astype(np.uint8)
    rgb=rgba_a[...,:3].astype(np.float32)/255.
    lum=rgb[...,0]*.2126+rgb[...,1]*.7152+rgb[...,2]*.0722
    sat=rgb.max(2)-rgb.min(2)
    # Reflectivity is unassociated with alpha. Alpha is applied exactly once when compositing.
    sr=(scale*(.22+.42*lum+.36*h)*(1-.22*sat)*255).clip(0,255).astype(np.uint8)
    sr=np.array(Image.fromarray(sr).filter(ImageFilter.GaussianBlur(max(.45,min(1.15,min(rgba.size)/85)))))
    return (Image.fromarray(np.dstack([height,height,height,ar])),
            Image.fromarray(np.dstack([sr,sr,sr,ar])),
            Image.fromarray(np.dstack([normals,ar])))

def build(root: Path=ROOT) -> dict:
    path=root/'hd_remake_atlas.json'; hd=json.loads(path.read_text(encoding='utf-8'))
    color=Image.open(root/hd['image']).convert('RGBA'); regions=hd['regions']; meta=hd.setdefault('region_meta',{})
    def rect(n): x,y,w,h=regions[n];return (x,y,x+w,y+h)
    def crop(n): return color.crop(rect(n))
    parents={}
    for parent,trunk in hd['roles']['tree_trunks'].items():
        canopy=hd['roles']['tree_canopies'][parent]; full=crop(parent); tw,th=regions[trunk][2:];cw,ch=regions[canopy][2:]
        if tw!=full.width or cw!=full.width: raise ValueError(f'{parent}: inconsistent split widths')
        can=full.crop((0,0,cw,ch)); tr=full.crop((0,full.height-th,tw,full.height))
        if th==full.height:
            tr=np.array(tr);tr[:ch,:,3]=0;tr=Image.fromarray(tr)
        for name,tile,sy in [(canopy,can,0),(trunk,tr,full.height-th)]:
            x,y,_,_=regions[name];color.paste(tile,(x,y));parents[name]=(parent,sy)
            meta.setdefault(name,{}).update(material_parent=parent,material_source_y=sy)
    mats=[Image.new('RGBA',color.size,(0,0,0,0)) for _ in range(3)]
    generated={}
    for name in regions:
        if name in parents: continue
        out=derive(crop(name),material_scale(name,meta.get(name,{})))
        if name in set(hd['roles']['tree_trunks']): generated[name]=out
        x,y,_,_=regions[name]
        for dst,tile in zip(mats,out):dst.paste(tile,(x,y))
    for name,(parent,sy) in parents.items():
        x,y,w,h=regions[name];alpha=crop(name).getchannel('A')
        for dst,full in zip(mats,generated[parent]):
            tile=full.crop((0,sy,w,sy+h));tile.putalpha(alpha);dst.paste(tile,(x,y))
    hd['normal_image']='assets/sprite_normalmap.png';hd['specular_image']='assets/sprite_specularmap.png'
    hd.setdefault('notes',{})['v414_material_maps']={'regions':len(regions),'method':'deterministic source-art height + source-space normal + unassociated specular','split_parent_inheritance':len(parents)}
    # Never overwrite a working atlas with a half-written PNG if encoding is interrupted.
    with tempfile.TemporaryDirectory(prefix='.material-build-',dir=root) as directory:
        staged=[]
        for i,(image,k) in enumerate(zip([color,*mats],['image','bump_image','specular_image','normal_image'])):
            tmp=Path(directory)/f'{i}.png';image.save(tmp,format='PNG',compress_level=1)
            with Image.open(tmp) as verification:verification.verify()
            staged.append((tmp,root/hd[k]))
        manifest=Path(directory)/'manifest.json';manifest.write_text(json.dumps(hd,indent=2)+'\n',encoding='utf-8')
        for tmp,dst in staged:tmp.replace(dst)
        manifest.replace(path)
    return {'regions':len(regions),'split_resources':len(parents),'files':{k:hashlib.sha256((root/hd[k]).read_bytes()).hexdigest() for k in ['image','bump_image','normal_image','specular_image']}}

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--root',type=Path,default=ROOT)
    print(json.dumps(build(parser.parse_args().root),indent=2))
