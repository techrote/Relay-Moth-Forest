#!/usr/bin/env python3
"""Strict all-region material/split audits; no average-error allowance at seams."""
from __future__ import annotations
from pathlib import Path
import hashlib, importlib.util, json
import numpy as np
from PIL import Image
ROOT=Path(__file__).resolve().parents[2]

def main():
    hd=json.loads((ROOT/'hd_remake_atlas.json').read_text(encoding='utf-8'))
    images={key:Image.open(ROOT/hd[key]).convert('RGBA') for key in ('image','bump_image','specular_image','normal_image')}
    size=tuple(hd['source_size']);assert all(im.size==size for im in images.values())
    regions=hd['regions'];rects=[]
    for name,(x,y,w,h) in regions.items():
        assert x>=0 and y>=0 and w>0 and h>0 and x+w<=size[0] and y+h<=size[1],name
        r=(x,y,x+w,y+h);rects.append((name,r));source=np.asarray(images['image'].crop(r))
        for key,image in images.items():
            pixels=np.asarray(image.crop(r))
            assert np.array_equal(pixels[...,3],source[...,3]),(name,key,'source alpha not preserved exactly')
            if key=='normal_image' and np.any(source[...,3]>32):
                normals=(pixels[...,:3].astype(float)-128)/127
                lengths=np.linalg.norm(normals,axis=2)[source[...,3]>32]
                assert np.max(abs(lengths-1))<.014,(name,'invalid normal encoding')
    for i,(name,a) in enumerate(rects):
        for other,b in rects[i+1:]:
            assert min(a[2],b[2])<=max(a[0],b[0]) or min(a[3],b[3])<=max(a[1],b[1]),(name,other,'overlapping atlas regions')
    def tile(key,name):
        x,y,w,h=regions[name];return images[key].crop((x,y,x+w,y+h))
    families=0
    for parent,trunk in hd['roles']['tree_trunks'].items():
        canopy=hd['roles']['tree_canopies'][parent];full=tile('image',parent);tr=tile('image',trunk);ca=tile('image',canopy)
        composite=Image.new('RGBA',full.size);composite.alpha_composite(tr,(0,full.height-tr.height));composite.alpha_composite(ca,(0,0))
        f=np.asarray(full);c=np.asarray(composite)
        assert np.array_equal(f[...,3],c[...,3]),(parent,'split alpha seam')
        assert np.array_equal(f[...,:3][f[...,3]>0],c[...,:3][f[...,3]>0]),(parent,'split colour seam')
        for child in (trunk,canopy):
            sy=hd['region_meta'][child]['material_source_y'];_,_,w,h=regions[child]
            for key in ('bump_image','specular_image','normal_image'):
                childpixels=np.asarray(tile(key,child));expected=np.asarray(tile(key,parent).crop((0,sy,w,sy+h)))
                valid=childpixels[...,3]>0
                assert np.array_equal(childpixels[...,:3][valid],expected[...,:3][valid]),(parent,child,key,'independently generated split material')
        families+=1
    # Pure per-sprite derivation remains deterministic. Full-atlas byte-idempotence was
    # separately measured twice for the release and recorded with the audit evidence.
    spec=importlib.util.spec_from_file_location('sprite_builder_414',ROOT/'tools/generate_material_maps_413.py')
    mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)
    sample=tile('image','tree_purple');one=mod.derive(sample,.24);two=mod.derive(sample,.24)
    assert all(a.tobytes()==b.tobytes() for a,b in zip(one,two))
    assert all(np.array_equal(np.asarray(im)[...,3],np.asarray(sample)[...,3]) for im in one)
    print(f'STRICT SPRITE ASSET REGRESSION 4.14 PASS: {len(regions)} regions × 4 atlases; {families} exact tree reconstructions; parent-inherited materials; deterministic derivation')
if __name__=='__main__':main()
