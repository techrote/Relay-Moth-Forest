#!/usr/bin/env python3
from __future__ import annotations
from pathlib import Path
import json,re
from PIL import Image,ImageChops,ImageStat
R=Path(__file__).resolve().parents[2]
js=(R/'game.js').read_text(); fx=(R/'foliagefx.js').read_text(); html=(R/'index.html').read_text(); maps=json.loads((R/'relay_moth_maps.json').read_text()); hd=json.loads((R/'hd_remake_atlas.json').read_text())
# Tree split continuity: authored trees still reconstruct the original source art.
trunks=hd['roles']['tree_trunks']; canopies=hd['roles']['tree_canopies']; atlas=Image.open(R/hd['image']).convert('RGBA'); seen=set()
for room in maps['rooms'].values():
    for trdef in room.get('large_trees',[]):
        n=trdef['sprite']; assert n in trunks and n in canopies
        if n in seen: continue
        seen.add(n); x,y,w,h=hd['regions'][n]; full=atlas.crop((x,y,x+w,y+h)); tn,cn=trunks[n],canopies[n]; tx,ty,tw,th=hd['regions'][tn]; cx,cy,cw,ch=hd['regions'][cn]; tr=atlas.crop((tx,ty,tx+tw,ty+th)); ca=atlas.crop((cx,cy,cx+cw,cy+ch)); comp=Image.new('RGBA',(w,h),(0,0,0,0)); comp.alpha_composite(tr,(0,h-th)); comp.alpha_composite(ca,(0,0)); stat=ImageStat.Stat(ImageChops.difference(full,comp)); assert max(stat.mean)<1.0,(n,stat.mean)
# v4 render stack: foliage background -> unified mask -> actors -> foliage foreground -> tree/tall foreground.
end=js[js.index('  end(grade='):js.index('\n}\n\nclass ParticleField')]
order=[end.index('renderShadowOverlay'),end.index("foliageFX?.render('background'"),end.index('flushWorldHD()'),end.index("foliageFX?.render('foreground'"),end.index('spriteFlush(this.foregroundHDNormal')]
assert order==sorted(order),order
shadow=js[js.index('  renderShadowOverlay('):js.index('\n  renderLightMap(',js.index('  renderShadowOverlay('))]
assert 'blendEquation(g.MAX)' in shadow and 'renderContactMask' in shadow and 'waterMaskTex' in shadow
# Normal v4 rendering uses FoliageFX; legacy CPU hero grass is guarded fallback only.
rend=js[js.index('  render(now){'):js.index('\n  renderObjectives',js.index('  render(now){'))]
assert 'if(this.renderer.foliageFX?.ready)' in rend and 'else this.renderHeroGrass(now)' in rend and 'renderHeroGrass(now)' in js
# Existing tree/objective/water contracts survive.
assert 'this.renderer.addHD(trunk' in js and 'this.renderer.addHDForeground(canopy' in js
assert 'objectiveSprites' in js and '.filter(n=>!objectiveSprites.has(n))' in js
assert 'waterStrength:1.05' in js and 'waterQuality:3' in js and 'waterNormalStrength:1.34' in js
assert "kind:'splash',top:true" in js and 'addWaterRipple' in js
# Foliage material is physical and opaque-source-alpha, not glow/additive.
assert "additive:false" in fx and "emissive:0" in fx and "blend:'alpha'" in fx
assert 'g.blendFunc(g.SRC_ALPHA,g.ONE_MINUS_SRC_ALPHA)' in fx
# Floater remains separate and default-off.
assert 'floaterFX:false' in js and 'renderFloaterFX(now)' in js and 'this.room.floaterClumps||[]' in js
assert all(not r.get('floater_clumps') for r in maps['rooms'].values()),'v4 baseline must not auto-place magical Floater-FX'
# Script loading preserves SurfaceFX and makes FoliageFX available before game construction.
assert html.index('surfacefx.js')<html.index('foliagefx.js')<html.index('game.js')
assert 'bottomY=y+h*.5' in js and 'groupSpan:tileSpan' in js and "push('player','player'" in js and "push(`follower:${u.id||i}`,'follower'" in js
assert 'casualSlot(u,i,total,gx,gy,guideVX=0,guideVY=0,room=null)' in js and 'comfortable=distance>=46&&distance<=104' in js and 'if(groupD>80)' in js and 'if(rd<29)' in js
assert 'addHDForeground(trunk' not in js, 'tree trunk must not be submitted a second time in foreground'
assert 'foregroundHDFlat' in js and 'BLOCKER_FOREGROUND_FRACTION' in js
assert 'sortY&&data.length>=96' in js
print('VISUAL BEHAVIOR REGRESSION 4.14 PASS')
print(f'  reconstructed_tree_families={len(seen)}; foliage/shadow/actor/tree ordering validated')
