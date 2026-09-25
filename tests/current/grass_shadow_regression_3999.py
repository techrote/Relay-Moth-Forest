#!/usr/bin/env python3
from pathlib import Path
import json,re
R=Path(__file__).resolve().parents[2]
js=(R/'game.js').read_text(); html=(R/'index.html').read_text(); hd=json.loads((R/'hd_remake_atlas.json').read_text()); maps=json.loads((R/'relay_moth_maps.json').read_text())
# Grass uses the actual foliage/decor atlas vocabulary, not flat vector hero-grass silhouettes.
hero=js[js.index('  renderHeroGrass'):js.index('  renderFloaterFX',js.index('  renderHeroGrass'))]
assert "this.art.roles.foliage_v391" in hero
for name in ('grass_patch','leaf_plant','foliage_hd_fern','foliage_hd_moss','foliage_hd_spiral'):
    assert name in hero and name in hd['regions'],name
assert 'addHDRootedGrass' in hero and 'addRootedGrass' not in hero
assert 'alpha=1' in js[js.index('  addHDRootedGrass'):js.index('  addHDForeground')]
# Existing art is segmented root-to-tip: root band stationary, upper bands progressively sway.
rooted=js[js.index('  addHDRootedGrass'):js.index('  addHDForeground')]
assert 'rows=[[0,0],[.38,0],[.61,.14],[.82,.46],[1,.82]]' in rooted
# Old fine instanced blade layer remains reusable but is hidden in the normal v3.999 presentation.
assert 'grassFineFX:false' in js and 'settings.grassFineFX===false' in js
# Floater-FX stays available but is hidden by default and on migration.
assert 'floaterFX:false' in js and 'v.floaterFX=false' in js
assert 'data-gfx="floaterFX"' in html
# Smart grass ordering is retained with HD front/back batches.
assert 'groundHDGrassNormal' in js and 'grassFrontHDNormal' in js
end=js[js.index('  end(grade='):js.index('\n}\n\nclass ParticleField')]
assert end.index('groundHDGrassNormal') < end.index('renderShadowOverlay') < end.index('flushWorldHD()') < end.index('grassFrontHDNormal') < end.index('foregroundHDNormal')
# Shadow origins are lower-center, not sprite-bottom, and spot size follows projected width.
casters=js[js.index('  collectCasters'):js.index('  renderTreesBack')]
assert 'contactY=rootY-footH*(tree?.34:.30)' in casters
assert 'contactY=u.y+h*.24' in casters
shadow=js[js.index('  renderShadowOverlay'):js.index('  renderLightMap')]
assert 'spotRx=half' in shadow and 'cast*1.28+.06' in shadow
# Shadows compose into one max mask: overlap cannot repeatedly multiply darkness.
assert 'this.shadowMask' in shadow and 'blendEquation(g.MAX)' in shadow and 'this.shadowCompositeProg' in shadow
assert 'g.bindFramebuffer(g.FRAMEBUFFER,this.scene.fbo)' in shadow
# Water rejection still happens in shadow-mask shader.
assert 'uniform sampler2D uWaterMask' in js and 'if(texture(uWaterMask' in js
# All rooms still have authored grass source clumps.
assert all(len(r.get('grass_clumps',[]))>=8 for r in maps['rooms'].values())
# Launcher naming contract.
assert (R/'0Play.cmd').exists() and not (R/'-Play.cmd').exists() and not (R/'run_relay_moth_pretty_graphics.cmd').exists()
print('GRASS / SHADOW REGRESSION 3.999 PASS')
print('  decor-integrated rooted grass + hidden Floater-FX validated')
print('  lower-center origins + stronger width-matched spots + MAX shadow composition validated')
