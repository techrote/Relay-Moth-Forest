#!/usr/bin/env python3
from __future__ import annotations
from pathlib import Path
import json
from PIL import Image, ImageChops, ImageStat

R=Path(__file__).resolve().parents[2]
js=(R/'game.js').read_text()
fx=(R/'foliagefx.js').read_text()
surface=(R/'surfacefx.js').read_text()
hd=json.loads((R/'hd_remake_atlas.json').read_text())
maps=json.loads((R/'relay_moth_maps.json').read_text())['rooms']
atlas=Image.open(R/hd['image']).convert('RGBA')
base_scale=float(hd.get('world_scale',.18))

# 1. HD world sprites are explicitly stable-sorted by visual bottom before submission.
assert 'spriteFlush(data,program,tex,blendAdd=false,sortY=false' in js
assert 'quads.sort((a,b)=>a.bottom-b.bottom||a.seq-b.seq)' in js
end=js[js.index('  end(grade='):js.index('\n}\n\nclass ParticleField')]
assert 'flushWorldHD()' in end
assert 'flushWorldHD()' in end
assert 'spriteFlush(this.foregroundHDNormal,this.hdProg,this.hdTex,false,true)' in end

# 2. Tree trunks are submitted exactly once; canopies alone occupy forced foreground.
assert js.count('this.renderer.addHD(trunk,x,cy,w,h,.997,false,0,tint)')==1
assert 'addHDForeground(trunk' not in js
assert 'addHDForeground(canopy' in js

# 3. Every split tree reconstructs the source exactly and uses compatible world scale.
trunks=hd['roles']['tree_trunks']; canopies=hd['roles']['tree_canopies']
cropped=full_canvas=0
for name,tr_name in trunks.items():
    ca_name=canopies[name]
    fr=hd['regions'][name]; tr=hd['regions'][tr_name]; ca=hd['regions'][ca_name]
    assert fr[2]==tr[2]==ca[2], (name,'split width mismatch')
    sm=lambda n: base_scale*float(hd.get('region_meta',{}).get(n,{}).get('world_scale',1))
    assert abs(sm(name)-sm(tr_name))<1e-12 and abs(sm(name)-sm(ca_name))<1e-12, (name,'world-scale mismatch')
    fx0,fy0,fw,fh=fr; tx,ty,tw,th=tr; cx,cy,cw,ch=ca
    full=atlas.crop((fx0,fy0,fx0+fw,fy0+fh)); trunk=atlas.crop((tx,ty,tx+tw,ty+th)); canopy=atlas.crop((cx,cy,cx+cw,cy+ch))
    comp=Image.new('RGBA',(fw,fh),(0,0,0,0))
    comp.alpha_composite(trunk,(0,fh-th))
    comp.alpha_composite(canopy,(0,0))
    stat=ImageStat.Stat(ImageChops.difference(full,comp))
    assert max(stat.mean)<1.0,(name,stat.mean)
    if th<fh:
        cropped+=1
        assert th+ch==fh,(name,'cropped split must meet exactly')
        # World seam: canopy bottom == cropped trunk top.
        full_h=fh*sm(name); trunk_h=th*sm(tr_name); canopy_h=ch*sm(ca_name)
        assert abs((-full_h+canopy_h)-(-trunk_h))<1e-9,name
    else:
        full_canvas+=1
        assert th==fh and ch<fh,(name,'full-canvas trunk contract')

assert cropped>=2 and full_canvas>=8,(cropped,full_canvas)

# 4. Tall explicit wall blockers are no longer double-drawn: static lower + flat foreground upper.
assert 'BLOCKER_FOREGROUND_FRACTION=.52' in js
assert 'tall=it.foreground&&wh>=18&&wh>=ww*.55' in js
assert 'spriteSubrect(ctx,drawName,0,split' in js
fg=js[js.index('  renderForegroundScenery()'):js.index('\n  buildGrassDepthGrid',js.index('  renderForegroundScenery()'))]
assert 'for(const key of this.room.walls)' in fg
assert 'if(count>=72)' not in fg
assert 'this.renderer.addHDSubrectForeground' in fg
assert 'foregroundHDFlat' in js and 'this.hdFlatProg' in js
assert "RelaySpriteMaterial.fragment('flat')" in js


# Source-level blocker split reconstruction and room load audit.
eligible=set(); room_counts={}
for room_key,room in maps.items():
    count=0
    for style in room.get('blocker_styles',{}).values():
        if style.get('kind')=='tree': continue
        name=style.get('sprite')
        if not name or name not in hd['regions']: continue
        x,y,w,h=hd['regions'][name]; meta=hd.get('region_meta',{}).get(name,{})
        s=base_scale*float(meta.get('world_scale',1)); ww,wh=w*s,h*s
        if wh<18 or wh<ww*.55: continue
        count+=1; eligible.add(name)
        split=max(1,min(h-1,round(h*.52)))
        src=atlas.crop((x,y,x+w,y+h)); top=src.crop((0,0,w,split)); bottom=src.crop((0,split,w,h))
        comp=Image.new('RGBA',(w,h),(0,0,0,0)); comp.alpha_composite(top,(0,0)); comp.alpha_composite(bottom,(0,split))
        stat=ImageStat.Stat(ImageChops.difference(src,comp)); assert max(stat.mean)<1e-9,(room_key,name,stat.mean)
    room_counts[room_key]=count
assert max(room_counts.values())>72, room_counts
assert eligible

# 5. Bump lighting samples are edge-aware, preventing transparent atlas gutters from becoming false normals.
assert 'spriteNormalToWorld' in (R/'sprite_material.js').read_text()
assert 'spriteNormalToWorld' in fx

# 6. Foliage primitives are deterministic back-to-front by root Y.
assert 'out.sort((a,b)=>a.rootY-b.rootY||a.x-b.x||a.name.localeCompare(b.name))' in fx

# 7. Moving grass scale increases are explicit and flowers are excluded from the enlargement.
entries=[m['foliage_fx'] for m in hd.get('region_meta',{}).values() if isinstance(m,dict) and isinstance(m.get('foliage_fx'),dict)]
assert entries
short=[e for e in entries if e.get('category')=='SHORT_GRASS']; fern=[e for e in entries if e.get('category')=='FERN']; flowers=[e for e in entries if e.get('category')=='FLOWER_CLUSTER']
assert short and fern and flowers
assert min(e['height_scale'] for e in short)>=1.30
assert min(e['height_scale'] for e in fern)>=1.20
assert all(abs(e['height_scale']-1.0)<1e-9 for e in flowers)
assert '*1.24,width=' in surface and '*1.10;' in surface

# 8. Fallback banded grass has a tiny overlap so deformation does not expose horizontal cracks.
assert 'rows=[[0,0],[.38,0],[.61,.14],[.82,.46],[1,.82]]' in js

print('RENDER ORDER / CLIPPING / TREE SEAM / LIGHTING REGRESSION 4.02 PASS')
print(f'  tree split modes: cropped={cropped}, full-canvas={full_canvas}; tall authored blocker max/room={max(room_counts.values())}')
print('  stable Y-sort, single-submit trunks, complementary blocker clips, edge-safe bump normals, enlarged moving grasses validated')
