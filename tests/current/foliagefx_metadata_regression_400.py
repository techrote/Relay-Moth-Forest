#!/usr/bin/env python3
from pathlib import Path
import json,re
ROOT=Path(__file__).resolve().parents[2]
atlas=json.loads((ROOT/'hd_remake_atlas.json').read_text())
js=(ROOT/'game.js').read_text(); fx=(ROOT/'foliagefx.js').read_text(); html=(ROOT/'index.html').read_text()
required_cats={'GROUND_MOSS','SHORT_GRASS','FERN','BROAD_LEAF','FLOWER_CLUSTER','BUSH'}
required_fields={'category','root_cutoff','bend_scale','flutter_scale','stiffness','damping','interaction_scale','shadow_scale','bend_exponent'}
entries={k:v['foliage_fx'] for k,v in atlas['region_meta'].items() if isinstance(v,dict) and isinstance(v.get('foliage_fx'),dict)}
assert entries
assert required_cats <= {v['category'] for v in entries.values()}
for name,v in entries.items():
    assert required_fields <= set(v), (name,required_fields-set(v))
    assert 0 <= v['root_cutoff'] < 1
assert atlas['schema']=='relay-moth-hd-atlas/v4.14'
# Metadata is authority; the gameplay integration contains no category-name behavior table.
for cat in required_cats: assert f"'{cat}'" not in js and f'"{cat}"' not in js
# Required controls and diagnostics.
for key in ('foliageFX','foliageQuality','foliageWindStrength','foliageWindSpeed','foliageInteractionStrength','foliageShadingStrength','foliageBendAmount','foliageShowRoots','foliageShowInteractionRadii','foliageFreezeWind','foliageCategoryView'):
    assert f'data-gfx="{key}"' in html,key
for key in ('enabled','quality','instances','backgroundCount','foregroundCount','interactionSourceCount','categoryCounts','instanceBytes','rebuilds','drawCalls'):
    assert re.search(rf'\b{re.escape(key)}\s*:',fx),key
assert html.index('surfacefx.js') < html.index('foliagefx.js') < html.index('game.js')
assert 'floaterFX:false' in js
# 15 disabled FoliageFX is presentation-only: module owns no gameplay/collision/story operations.
for forbidden in ('walkablePixel','movePlayer','checkObjectives','roomComplete(','nearestWalkable','pathClock'):
    assert forbidden not in fx,forbidden
# Contact AO remains in unified compositor and is water rejected.
shadow=js[js.index('  renderShadowOverlay('):js.index('\n  renderLightMap(',js.index('  renderShadowOverlay('))]
assert 'this.foliageFX.renderContactMask' in shadow and 'g.blendEquation(g.MAX)' in shadow and 'this.waterMaskTex' in shadow
# Floater-FX is opt-in authored magic, never borrowed automatically from physical grass clumps.
maps=json.loads((ROOT/'relay_moth_maps.json').read_text())
assert 'this.room.floaterClumps||[]' in js
floater=js[js.index('  renderFloaterFX'):js.index('  renderMothPickups',js.index('  renderFloaterFX'))]
assert 'surfaceFX===false' not in floater, 'Floater-FX toggle must be independent of SurfaceFX master'
assert all(not room.get('floater_clumps') for room in maps['rooms'].values())

assert 'foliage_v401_meadow' in atlas['roles'] and 'foliage_v401_grove' in atlas['roles'] and 'foliage_v401_ground' in atlas['roles'] and 'foliage_v401_reed' in atlas['roles']
for flower in ('flower_meadow','flower_pink','flower_blue','flower_white','flower_bush','flower_hd_bell','flower_hd_star','flower_hd_circuit'):
    if flower in entries:
        assert entries[flower]['interaction_scale'] <= 0.14
for name,v in entries.items():
    assert 'width_scale' in v and 'height_scale' in v, name
assert max(v['height_scale'] for v in entries.values() if v['category']=='SHORT_GRASS') >= 1.3
assert all(v['height_scale']==1.0 for v in entries.values() if v['category']=='FLOWER_CLUSTER')
print('FOLIAGEFX METADATA REGRESSION 4.14 PASS')
print(f'  metadata_regions={len(entries)} categories={sorted(required_cats)}')
