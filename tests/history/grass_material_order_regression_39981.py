#!/usr/bin/env python3
from pathlib import Path
import json,re
R=Path(__file__).resolve().parent
js=(R/'game.js').read_text(); html=(R/'index.html').read_text(); maps=json.loads((R/'relay_moth_maps.json').read_text())
assert "next('grassChunk'" in js and "next('grassFrond'" in js and "next('grassBush'" in js
assert "next('grassTuft'" in js and "next('grassBlade'" in js
assert 'renderHeroGrass(now)' in js and 'renderFloaterFX(now)' in js
assert 'addRootedGrass' in js and '_pushRootedQuad' in js
# Rooted deformation: bottom rows get zero sway; mid/top progressively move.
rooted=js[js.index('  _pushRootedQuad'):js.index('  spriteFlush',js.index('  _pushRootedQuad'))]
assert 'rows=[[0,0,1],[.34,0,.98],[.68,sway*.42,.94],[1,sway,.88]]' in rooted
# Grass material is solid/non-additive.
hero=js[js.index('  renderHeroGrass'):js.index('  renderFloaterFX',js.index('  renderHeroGrass'))]
assert 'addRootedGrass' in hero and ',1.0,sway,front' in hero
assert 'addGround' not in hero and 'true,rot' not in hero
# Old floaty effect was copied into Floater-FX and recoloured to semantic pink/purple LUT ranges.
floater=js[js.index('  renderFloaterFX'):js.index('  renderMothPickups',js.index('  renderFloaterFX'))]
assert "this.luts.rgb('fx_magic'" in floater and "this.luts.rgb('moth_wings'" in floater
assert 'x+sway' in floater and 'rot=sway*.018' in floater
assert 'data-gfx="floaterFX"' in html and 'data-gfx="floaterStrength"' in html
# Cheap depth ordering: 40px bins, vertical-overlap front rule, lateral bottom-Y rule.
assert 'buildGrassDepthGrid' in js and 'const cell=40' in js
order=js[js.index('  grassShouldFront'):js.index('  renderHeroGrass',js.index('  grassShouldFront'))]
assert 'speed>5&&sy>sx*.65' in order and 'rootY>=a.bottom-2' in order
assert 'grassFrontNormal' in js and 'foregroundHDNormal' in js
end=js[js.index('  end(grade='):js.index('\n}\n\nclass ParticleField')]
assert end.index('spriteFlush(this.hdNormal') < end.index('spriteFlush(this.grassFrontNormal') < end.index('spriteFlush(this.foregroundHDNormal')
# All authored levels retain grass clumps; first three retain strong visible counts.
for key in ('quiet_nest','lantern_lane','tin_stream'):
    room=maps['rooms'][key]; assert len(room.get('grass_clumps',[]))>=8,key
assert (R/'-Play.cmd').exists() and not (R/'run_relay_moth_pretty_graphics.cmd').exists()
print('ROOTED GRASS / FLOATER-FX REGRESSION 3.998.1 PASS')
print('  rooted three-band opaque grass + pink/purple Floater-FX validated')
print('  optimized vertical-overlap / lateral bottom-Y ordering validated')
