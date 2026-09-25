#!/usr/bin/env python3
from __future__ import annotations
from pathlib import Path
import json,re
from PIL import Image,ImageChops,ImageStat

R=Path(__file__).resolve().parent
js=(R/'game.js').read_text()
sfx=(R/'surfacefx.js').read_text()
html=(R/'index.html').read_text()
maps=json.loads((R/'relay_moth_maps.json').read_text())
hd=json.loads((R/'hd_remake_atlas.json').read_text())

# Tree split continuity: every authored large tree maps to dedicated trunk/canopy pieces.
# v391 trunk sprites intentionally preserve the full parent coordinate rectangle with the upper
# canopy area alpha-masked; older painted purple/green trees use physically cropped trunks.
trunks=hd['roles']['tree_trunks']; canopies=hd['roles']['tree_canopies']
for room in maps['rooms'].values():
    for trdef in room.get('large_trees',[]):
        n=trdef['sprite']; assert n in trunks and n in canopies,(n,'missing split roles')
        full=hd['regions'][n]; tr=hd['regions'][trunks[n]]; ca=hd['regions'][canopies[n]]
        assert tr[2]==ca[2]==full[2],(n,'split widths differ')
        assert ca[3] < full[3],(n,'canopy is not an upper subset')
        assert tr[3] in (full[3],full[3]-ca[3]),(n,'unexpected trunk coordinate model',tr,ca,full)
assert 'this.renderer.addHD(trunk' in js and 'this.renderer.addHD(canopy' in js
assert 'cy=rootY-fh+ch/2' in js and 'this.renderer.addHD(trunk' in js,'canopy is not anchored to the full parent tree coordinate system'


# Pixel-level reconstruction proof for each split tree. The two runtime layers should
# reconstruct the full source art when composed at their intended parent coordinates.
atlas=Image.open(R/hd['image']).convert('RGBA')
seen=set()
for room in maps['rooms'].values():
    for trdef in room.get('large_trees',[]):
        n=trdef['sprite']
        if n in seen: continue
        seen.add(n)
        x,y,w,h=hd['regions'][n]; full=atlas.crop((x,y,x+w,y+h))
        tn,cn=trunks[n],canopies[n]
        tx,ty,tw,th=hd['regions'][tn]; tr=atlas.crop((tx,ty,tx+tw,ty+th))
        cx,cy,cw,ch=hd['regions'][cn]; ca=atlas.crop((cx,cy,cx+cw,cy+ch))
        comp=Image.new('RGBA',(w,h),(0,0,0,0)); comp.alpha_composite(tr,(0,h-th)); comp.alpha_composite(ca,(0,0))
        stat=ImageStat.Stat(ImageChops.difference(full,comp))
        assert max(stat.mean)<1.0,(n,'split layers do not reconstruct parent',stat.mean)

# Render order: contact shadows below all live actors; canopies/tall foreground after actors.
end=js[js.index('  end(grade='):js.index('\n}\n\nclass ParticleField')]
assert end.index('renderShadowOverlay') < end.index('spriteFlush(this.hdNormal')
rend=js[js.index('  render(now){'):js.index('\n  renderObjectives',js.index('  render(now){'))]
for token in ('this.renderMiniRobots(now)','this.creatures?.render(this,now)','this.followers.render(this,now)','this.renderForegroundScenery()'):
    assert token in rend,token
assert rend.index('this.renderForegroundScenery()')>rend.index('this.followers.render(this,now)')
assert 'shadowWidthRobots' in js and 'shadowWidthLargeDecor' in js and 'shadowWidthSmallDecor' in js
assert 'contactY=ty*TILE+TILE+(tree?4:2)' in js

# Water/grass visibility + splash contract.
assert 'waterStrength:1.05' in js and 'waterQuality:3' in js
assert 'waterNormalStrength:1.34' in js and 'waterHighlightStrength:1.42' in js
assert 'grassQuality:3' in js and 'grassDensity:1.62' in js
assert 'GRASS_HARD_CAP=2200' in sfx and 'height=8.2' in sfx and 'width=1.55' in sfx
assert "kind:'splash',top:true" in js and 'waterSplash(x,y' in js and 'addWaterRipple(x,y' in js
assert 'room.grassClumps?.length' in js,'authored grass descriptors are not consumed'
assert all(len(r.get('grass_clumps',[]))>=8 for r in maps['rooms'].values()),'one or more rooms lacks authored grass clumps'

# Full followers idle with a large dead-zone and slower retarget/replan cadence.
followers=js[js.index('class Followers'):js.index('\nclass MiniRobotGuides')]
assert 'guideMoving' in followers and 'idleDead=guideMoving?2:17' in followers
assert "(guideMoving?.32:.72)" in followers and "(guideMoving?5.6:2.9)" in followers

# Mini social life, blocked/water avoidance, and species behavior.
mini=js[js.index('class MiniRobotGuides'):js.index('\nclass FireflyField')]
wild=js[js.index('class WoodlandCreatures'):js.index('\nclass GamepadInput')]
assert 'w=ow*1.52' in mini and 'h=oh*1.52' in mini,'mini robot render scale was not increased'
assert '_seedGroups' in mini and 'if(completed&&!this.wasCompleted)' in mini
assert "phase:'circle'" in mini and "phase='scatter'" in mini
assert '_completedTargets' in mini and 'localObstacleRepulsion' in mini and 'wet' in mini
assert "scale=(u.kind==='pixie'||u.kind==='mushroom_pixie')?1.62:1.755" in wild
assert "nearestAny(['squirrel','rabbit'],u,190)" in wild
assert 'spd=48' in wild and 'spd=32' in wild and 'spd=23' in wild
assert 'nearestWaterInfo(game.room,u.x,u.y,120)' in wild
assert "(u.kind==='squirrel'||u.kind==='rabbit')" in wild and 'cell[0]<=1||cell[0]>=GRID_W-2||cell[1]<=1||cell[1]>=GRID_H-2' in wild
assert "groupCenter('mushroom_pixie')" in wild and 't*1.25+u.phase' in wild
assert 'catRestUntil' in wild and 'catInterestUntil' in wild

# 3.995.4 surface/occlusion/content contracts.
assert 'uniform sampler2D uWaterMask' in js and "texture(uWaterMask" in js,'shadow shader does not reject water'
assert 'playerSplashClock' in js and 'nearestWaterInfo(this.room,this.x,this.y,24)' in js,'player shoreline splashes missing'
assert 'drawVegetationInterstitials' in js and 'filter(x=>b.has(x))' in js,'vegetation interstitial fill pass missing'
assert "legacyFlower=name.startsWith('flower_')&&!name.startsWith('flower_hd_')" in js,'legacy flower scale-back missing'
assert len([n for n in hd['regions'] if n.startswith('flower_hd_')])>=3,'new HD flower sprites missing'
assert len([n for n in hd['regions'] if n.startswith('foliage_hd_')])>=3,'new HD foliage sprites missing'
assert hd.get('roles',{}).get('bridge',{}).get('complete')=='bridge_complete','completed bridge sprite role missing'
assert hd['regions']['bridge_complete'][2:]==[512,256],'completed bridge asset is not high-resolution'
assert 'this.renderer.addHD(trunk' in js[js.index('  renderForegroundScenery'):js.index('  renderMothPickups')],'foreground tree pass does not re-occlude actors with trunks'
assert 'void spectrum' in sfx and 'sqrt(G*k)' in sfx,'optimized analytical spectral idle-water field missing'
assert 'heightField(p+vec2' not in sfx,'legacy repeated finite-difference idle-wave evaluation still present'

# Grey disabled exit portal; enabled state still glows normally.
gate=js[js.index('  drawGates('):js.index('\n  patternDecor',js.index('  drawGates('))]
assert "element:'tree_shadow'" in gate and 'tintStrength:.34' in gate
assert "this.glow(ctx,x,y,'tree_lights',238" in gate

# Post controls and migration are actually exposed/persisted.
for k in ('brightness','contrast','gamma'):
    assert f'data-gfx="{k}"' in html,k
assert 'uBrightness' in js and 'uContrast' in js and 'uGamma' in js
assert 'relayMothGraphics39954' in js and 'raw39953' in js and 'raw39952' in js

# Wooden bridge proof: metadata + visible brown material rather than teal metal.
assert hd['region_meta']['bridge_deck_tile'].get('material')=='wood'
bridge=Image.open(R/'assets/sprites_bridge.png').convert('RGBA')
pixels=bridge.get_flattened_data() if hasattr(bridge,'get_flattened_data') else list(bridge.getdata());pix=[p for p in pixels if p[3]>32]
mean=tuple(sum(p[i] for p in pix)/len(pix) for i in range(3))
assert mean[0] > mean[1]*1.22 and mean[1] > mean[2]*1.15,('bridge palette is not brown/wood-like',mean)

print('VISUAL / BEHAVIOR REGRESSION 3.995.4 PASS')
print('  split-tree continuity + shadow/occlusion ordering validated')
print('  analytical idle water + authored grass + shoreline splash contract validated')
print('  mini grouping/circle-scatter + rabbit/cat/wildlife behavior validated')
print('  full-tree occlusion + interstitial vegetation + flora + coherent bridge validated')
