#!/usr/bin/env python3
from __future__ import annotations
import collections, json, re, struct, subprocess
from pathlib import Path
ROOT=Path(__file__).resolve().parent
GW,GH=40,19

def load(n): return json.loads((ROOT/n).read_text(encoding='utf-8'))
def png_size(path:Path):
    d=path.read_bytes(); assert d[:8]==b'\x89PNG\r\n\x1a\n',path
    return struct.unpack('>II',d[16:24])
def xf(f): return round(2+(GW-5)*max(0,min(1,f)))
def yf(f): return round(1+(GH-3)*max(0,min(1,f)))
def door(side,f,inset=1):
    if side=='WEST': return (inset,yf(f))
    if side=='EAST': return (GW-1-inset,yf(f))
    if side=='NORTH': return (xf(f),inset)
    if side=='SOUTH': return (xf(f),GH-1-inset)
    return (xf(.16),yf(.5))
def spawn(side,f): return door(side,f,3) if side else (xf(.16),yf(.5))
def path_for(room,start,target,bridge_stage=999):
    walls={tuple(p) for p in room.get('walls',[])};water={tuple(p) for p in room.get('water',[])}
    segs=room.get('bridge_segments',[]) or room.get('bridge_phases',[]);opened={tuple(p) for seg in segs[:bridge_stage] for p in seg};island={tuple(p) for p in room.get('bridge_island',[])}
    def walk(p):
        x,y=p;return 0<x<GW-1 and 0<y<GH-1 and p not in walls and (p not in water or p in opened or p in island)
    if not walk(start) or not walk(target):return []
    q=collections.deque([start]);prev={start:None}
    while q:
        p=q.popleft()
        if p==target:break
        for n in ((p[0]+1,p[1]),(p[0]-1,p[1]),(p[0],p[1]+1),(p[0],p[1]-1)):
            if n not in prev and walk(n):prev[n]=p;q.append(n)
    if target not in prev:return []
    out=[];p=target
    while p is not None:out.append(p);p=prev[p]
    return out[::-1]

def main():
    maps,story,sprites,luts,hd,effects,sheets=[load(n) for n in ('relay_moth_maps.json','relay_moth_story.json','relay_moth_sprites.json','relay_moth_pixel_luts.json','hd_remake_atlas.json','relay_moth_effects.json','sprite_sheet_manifest.json')]
    assert maps['schema']=='relay-moth-maps/v3.99'
    assert luts['schema']=='relay-moth-luts/v3.99'
    assert effects['schema']=='relay-moth-effects/v3.99'
    assert len(story['rooms'])==9 and maps['grid']['width']==GW and maps['grid']['height']==GH

    # Runtime atlas / bump map and category sheets.
    atlas,bump,spec=ROOT/hd['image'],ROOT/hd['bump_image'],ROOT/hd['specular_image'];assert atlas.exists() and bump.exists() and spec.exists();assert png_size(atlas)==tuple(hd['source_size'])==png_size(bump)==png_size(spec)
    aw,ah=hd['source_size'];assert len(hd['regions'])>=363
    for n,(x,y,w,h) in hd['regions'].items():assert 0<=x and 0<=y and w>0 and h>0 and x+w<=aw and y+h<=ah,(n,x,y,w,h)
    for cat in {'large','small','terrain','characters','minirobots','fx','ui','foliage','creatures','trees'}:assert cat in sheets['categories'],cat
    for cat,info in sheets['categories'].items():
        if {'image','edit_image','bump_image','size'} <= set(info):
            sz=tuple(info['size'])
            for k in ('image','edit_image','bump_image'):assert (ROOT/info[k]).exists() and png_size(ROOT/info[k])==sz,(cat,k)
        elif 'sheets' in info:
            for path in info['sheets'].values():assert (ROOT/path).exists(),(cat,path)

    # Original + remixed trees and six animated creature families.
    roles=hd['roles'];assert {'tree_purple','tree_green'}<=set(roles['tree_blockers'])
    assert all(f'tree_v391_{i:02d}' in roles['tree_blockers'] for i in range(8))
    assert len(roles.get('foliage_v391',[]))>=24
    creatures=roles.get('creatures',{});families={'squirrel','rabbit','cat','pixie','gnome','mushroom_pixie'};assert families<=set(creatures)
    for fam in families:
        f=creatures[fam];assert {'idle','blink','walk_a','walk_b'}<=set(f);assert all(v in hd['regions'] for v in f.values())
    mini=roles.get('mini_robots',{}) or roles.get('mini_robot_variants',{});assert len(mini)>=8
    for fam,f in mini.items():assert {'idle','blink','walk_a','walk_b'}<=set(f)

    # All shader effects have explicit EFFECTS-channel LUT bases, including Space pulse.
    assert luts['channel_order']==['WORLD','BLOCKERS','FOREST','MOTHS','SPARKLES','STORY','EFFECTS','INTERFACE']
    fx_elems=set(luts['channels']['EFFECTS']['elements']);assert {'fx_pulse','fx_magic','fx_water','fx_portal','fx_objective','fx_teleport','fx_creature'}<=fx_elems
    all_elems=set();[all_elems.update(c['elements']) for c in luts['channels'].values()]
    for theme in luts['theme_order']:
        for el in all_elems:
            arr=luts['themes'][theme]['luts'][el];assert len(arr)==256 and all(re.fullmatch(r'#[0-9A-Fa-f]{6}',x) for x in arr),(theme,el)
    assert effects['presets']['pulse']['element']=='fx_pulse'
    assert all(p['element'] in fx_elems for p in effects['presets'].values())

    # Authored traversal, population density, original-tree majority and objective uniqueness policy.
    routes=mini_units=wild_units=trees=0;all_moths=set();original_trees=0
    for ri,spec in enumerate(story['rooms']):
        room=maps['rooms'][spec['key']];assert room.get('floor_microtile')==4;assert room.get('outer_border_depth',0)>=2
        cur=spawn(spec.get('previous_side'),spec.get('previous_fraction',.5));stage=0
        assert path_for(room,cur,cur,stage if spec['key']=='tin_stream' else 999)
        for obj in spec.get('objects',[]):
            target=tuple(room['objects'][obj['object_id']]);assert path_for(room,cur,target,stage if spec['key']=='tin_stream' else 999),(spec['key'],obj['object_id']);routes+=1;cur=target;stage+=1
        if spec.get('next_side'):
            target=door(spec['next_side'],spec.get('next_fraction',.5),1);assert path_for(room,cur,target,stage if spec['key']=='tin_stream' else 999),(spec['key'],'exit');routes+=1
        groups=room.get('mini_robot_groups',[])
        if ri<3:assert not groups
        else:assert len(groups)>=2 and all(g.get('requires')=='pip' for g in groups)
        mini_units+=sum(int(g.get('count',0)) for g in groups)
        cgroups=room.get('creature_groups',[]);assert any(g.get('kind')=='mushroom_pixie' for g in cgroups);assert sum(g.get('count',0) for g in cgroups)>=10
        wild_units+=sum(int(g.get('count',0)) for g in cgroups)
        for t in room.get('large_trees',[]):
            trees+=1;original_trees+=t.get('sprite') in ('tree_purple','tree_green')
        for m in room.get('moth_pickups',[]):assert m['id'] not in all_moths;all_moths.add(m['id'])
    assert routes==27,routes;assert mini_units>=60,mini_units;assert wild_units>=100,wild_units;assert trees>=150 and original_trees/trees>.60,(original_trees,trees)
    assert all(len(r.get('grass_clumps',[]))>=8 for r in maps['rooms'].values()),'authored grass clumps missing'
    assert len(maps['rooms']['tin_stream'].get('grass_clumps',[]))>=18,'tin_stream should have extra authored grass layering on the right bank'

    # Tin Stream bridge still stages correctly.
    tin=maps['rooms']['tin_stream'];segs=tin['bridge_segments'];assert len(segs)==4 and all(len({y for x,y in seg})==4 for seg in segs),segs
    cur=spawn(story['rooms'][2].get('previous_side'),story['rooms'][2].get('previous_fraction',.5))
    for stage,obj in enumerate(story['rooms'][2]['objects']):target=tuple(tin['objects'][obj['object_id']]);assert path_for(tin,cur,target,stage),(stage,obj['object_id']);cur=target
    exit_tile=door(story['rooms'][2]['next_side'],story['rooms'][2]['next_fraction'],1);assert not path_for(tin,spawn(story['rooms'][2]['previous_side'],story['rooms'][2]['previous_fraction']),exit_tile,0);assert path_for(tin,cur,exit_tile,4)

    js=(ROOT/'game.js').read_text();surface=(ROOT/'surfacefx.js').read_text();foliage=(ROOT/'foliagefx.js').read_text();editor=(ROOT/'editor.js').read_text();server=(ROOT/'relay_moth_server.py').read_text();html=(ROOT/'index.html').read_text();css=(ROOT/'style.css').read_text()
    # No-path followers are guarded and use step-aside/retry; non-colliding minis/wildlife never use map BFS.
    follower=js[js.index('class Followers'):js.index('class MiniRobotGuides')];mini_js=js[js.index('class MiniRobotGuides'):js.index('class FireflyField')];wild_js=js[js.index('class WoodlandCreatures'):js.index('class GamepadInput')]
    assert '||[]' in follower and 'Array.isArray(raw)' in follower and 'fallbackStep' in follower and 'failCount=Math.min(3' in follower
    assert 'casualSlot(u,i,total,gx,gy,guideVX=0,guideVY=0,room=null)' in follower and 'comfortable=distance>=46&&distance<=104' in follower
    assert 'if(groupD>80)' in follower and 'if(rd<29)' in follower and 'formationTargets=this.units.map' not in follower
    assert 'findPath(' not in mini_js and '.move(' not in mini_js
    assert 'findPath(' not in wild_js and '.move(' not in wild_js
    # Scaling and animation.
    assert 'ow*1.52' in mini_js and "scale=(u.kind==='pixie'||u.kind==='mushroom_pixie')?1.62:1.755" in wild_js
    assert all(x in js for x in ["'walk_a'","'walk_b'","'blink'",'wingPhase'])
    assert 'mothOrbitSpeed' in js and 'mothOrbitDistance' in js and 'mothChaos' in js
    # Shadow order: projected shadow layer is underneath all live character sprite flushes.
    end=js[js.index('  end(grade='):js.index('\n}\n\nclass ParticleField')];assert end.index('renderShadowOverlay')<end.index('spriteFlush(this.normal')
    # Soft bump / pulse lighting / high-resolution objective marker.
    assert 'RelaySpriteMaterial.fragment' in js and 'RelaySpriteMaterial.materialState(settings)' in js
    assert 'this.pulseLight=1' in js and "this.luts.rgb('fx_pulse',244)" in js
    assert 'renderObjectiveMarker(objectiveMarker)' in js and 'this.activeObjectiveMarker={x,y:' in js
    # Objective sprites excluded from automatic/pattern decoration.
    assert 'objectiveSprites' in js and ".filter(n=>!objectiveSprites.has(n))" in js
    assert "if(p==='orchard'){for(let i=0;i<4;i++){if(skip(`orchard:lamp:${i}`))continue;const x=150+i*115,n='candelabra_small'" in js
    assert "const orbs=['orb_magenta','orb_green','orb_orange','orb_cyan','orb_purple']" in js
    # Pickup/follower scale equality.
    assert "scale:.84" in js and "scale=.84" in js
    # Ambient transition, override and frame cap.
    assert 'ambientInitial' in js and 'ambientComplete' in js and 'forceCompleteLight' in js and "if(k==='b')" in js
    assert 'this.ambientLevel+=' in js and 'const cap=clamp(Number(this.graphics.maxFPS)||60,15,240)' in js
    # Graphics menu: left anchored, no blur, numeric fields and flock controls.
    g0=html.index('<div id="graphicsMenu"');g1=html.index('<div id="lutMixer"',g0);gfx=html[g0:g1]
    assert 'class="floating graphicsPanel hidden"' in gfx and 'type="range"' not in gfx
    for k in ('maxFPS','brightness','contrast','gamma','gradeTemperature','gradeTint','shadowLift','highlightGain','ambientInitial','ambientComplete','forceCompleteLight','shadowWidthRobots','shadowWidthLargeDecor','shadowWidthSmallDecor','surfaceFX','waterQuality','shoreFoamStrength','waterNormalStrength','waterDetailStrength','waterHighlightStrength','waterEdgeStrength','waterRefractionStrength','grassFX','grassFineFX','grassQuality','grassDensity','grassHeroStrength','floaterFX','floaterStrength','grassWindStrength','grassPushStrength','foliageFX','foliageQuality','foliageWindStrength','foliageWindSpeed','foliageInteractionStrength','foliageShadingStrength','foliageBendAmount','foliageShowRoots','foliageShowInteractionRadii','foliageFreezeWind','foliageCategoryView','mothOrbitSpeed','mothOrbitDistance','mothChaos'):assert f'data-gfx="{k}"' in gfx,k
    assert 'backdrop-filter:blur' not in css.replace(' ','') and '#graphicsMenu{left:8px' in css
    # v4.14 direct WYSIWYG room editor: normal game canvas is the visual truth.
    assert '<canvas id="editorOverlay" width="640" height="360"' in html and '<div id="wysiwygEditor" class="hidden">' in html
    assert 'id="mapEditor"' not in html and 'mapCanvas' not in html and 'toggleMapEditor' not in js
    for token in ('class WysiwygEditor','onDown(e)','onMove(e)','onUp(e)','eraseAt(p,decorOnly=false)','copySelection()','pasteClipboard()','rebuildRoom()','saveProject()'): assert token in editor,token
    for tool in ('brush','select','object','move','erase'): assert f'data-editor-tool="{tool}"' in html
    for cat in ('tiles','blockers','trees','decor','grass','lamps','robots','moths','wildlife','mini','ambient'): assert f'data-editor-category="{cat}"' in html
    assert "if(k==='f2'){e.preventDefault();toggleWysiwygEditor();return}" in js and '!!globalThis.rmfEditor?.active' in js
    assert 'this.editorDecor=r.editor_decor||[]' in js and 'drawEditorDecor(ctx,room)' in js and 'decorExclusions=new Set' in js
    assert 'patternExclusions=new Set' in js and 'objectFxHidden=new Set' in js and "skip('nest:swirl')" in js
    assert "fetch('/__editor/save_maps'" in editor and "path != '/__editor/save_maps'" in server and "backups = ROOT / 'editor_backups'" in server
    assert 'relay-moth-runtime-diagnostics-414.json' in js
    # SurfaceFX v3.995.2 bridge architecture: separate reusable file, bounded water/grass resources, clean fallback.
    assert html.index('surfacefx.js') < html.index('foliagefx.js') < html.index('editor.js') < html.index('game.js')
    for token in ('class SurfaceFX','class WaterField','class GrassField','buildShoreField','drawArraysInstanced','GRASS_HARD_CAP=4600','MAX_RIPPLES=12',"const VERSION='3.999'",'uRefractionStrength','sampler2D uScene'): assert token in surface,token
    assert 'settings.waterQuality??2' in js and 'this.waterProg' in js
    assert 'buildGrassSurfaceDescriptor' in js and "this.updateStep('surface-fx'" in js
    assert 'relayMothGraphics3999' in js and 'relayMothGraphics39981' in js and 'relayMothGraphics3998' in js and 'relayMothGraphics39955' in js and 'relayMothGraphics39954' in js and 'relayMothGraphics39953' in js and 'relayMothGraphics39952' in js and 'relayMothGraphics3995' in js and 'relayMothGraphics399' in js
    assert 'relay-moth-runtime-diagnostics-414.json' in js
    # v4.14 FoliageFX architecture: standalone reusable module, static instancing, bounded sources and root-locked GPU deformation.
    for token in ('class FoliageRegistry','class FoliageInstanceBuffer','class WindField','class InteractionField','class RootedDeformation','class FoliageMaterial','class DepthClassifier','class DebugView','class FoliageFX','FOLIAGE_HARD_CAP=208','MAX_INTERACTION_SOURCES=8',"const VERSION='4.14'",'drawArraysInstanced','renderContactMask'): assert token in foliage,token
    assert 'relayMothGraphics400' in js and 'relay-moth-runtime-diagnostics-414.json' in js
    assert "this.updateStep('foliage-fx'" in js and 'buildFoliageDescriptor' in js and 'foliageInteractionSources' in js
    assert "foliageFX?.render('background'" in end and "foliageFX?.render('foreground'" in end
    assert end.index('renderShadowOverlay') < end.index("foliageFX?.render('background'") < end.index('flushWorldHD()') < end.index("foliageFX?.render('foreground'") < end.index('spriteFlush(this.foregroundHDNormal')
    live_render=js[js.index('  render(now){'):js.index('\n  renderObjectives',js.index('  render(now){'))];assert 'if(this.renderer.foliageFX?.ready)' in live_render and 'else this.renderHeroGrass(now)' in live_render
    assert hd.get('schema')=='relay-moth-hd-atlas/v4.14'
    assert hd.get('specular_image')=='assets/sprite_specularmap.png'
    for token in ('bgMaterialProg','bgNormalTex','bgSpecTex','uNormalTex','materialNormalCtx','materialSpecCtx','renderBackground(settings)'): assert token in js,token
    assert 'comfortable=distance>=46&&distance<=104' in follower and 'Math.min(212,20+d*1.06*rubber)' in follower
    foliage_meta=[v.get('foliage_fx') for v in hd.get('region_meta',{}).values() if isinstance(v,dict) and isinstance(v.get('foliage_fx'),dict)];assert len(foliage_meta)>=30
    assert {'GROUND_MOSS','SHORT_GRASS','FERN','BROAD_LEAF','FLOWER_CLUSTER','BUSH'} <= {v['category'] for v in foliage_meta}
    # v3.995.2 rendering/ambient-life contracts.
    assert {'bridge_deck_tile','bridge_island_tile'}<=set(hd['regions'])
    assert hd.get('roles',{}).get('bridge',{}).get('deck')=='bridge_deck_tile'
    assert len(tin.get('bridge_cells',[]))==16 and len(tin.get('bridge_island',[]))==16
    assert 'renderTreesBack' in js and 'renderForegroundScenery' in js and 'addHDSubrect' in js
    assert 'this.art.roles.tree_trunks' in js and 'this.art.roles.tree_canopies' in js and 'this.renderer.addHD(trunk' in js and 'this.renderer.addHDForeground(canopy' in js
    assert "category:'robot'" in js and "'largeDecor'" in js and 'shadowWidthLargeDecor' in js
    assert "phase:'circle'" in mini_js and "phase='scatter'" in mini_js and 'groupId' in mini_js
    assert 'localObstacleRepulsion' in mini_js and 'nearestWaterInfo' in mini_js
    assert 'catRestUntil' in wild_js and 'cornerCooldown' in wild_js and 'game.waterSplash' in wild_js
    assert 'uBrightness' in js and 'uContrast' in js and 'uGamma' in js and 'uTemperature' in js and 'uHighlightGain' in js
    # v3.999 decor-integrated grass + hidden Floater-FX + unified shadow composition.
    assert 'renderHeroGrass(now)' in js and 'renderFloaterFX(now)' in js
    assert 'addHDRootedGrass' in js and 'foliage_v391' in js and 'foliage_v401_meadow' in js and 'grassShouldFront' in js and 'buildGrassDepthGrid' in js
    assert 'groundHDGrassNormal' in js and 'grassFrontHDNormal' in js and 'foregroundHDNormal' in js
    assert 'floaterFX:false' in js and 'grassFineFX:false' in js
    assert 'shadowMask' in js and 'shadowCompositeProg' in js and 'blendEquation(g.MAX)' in js
    assert 'contactY=u.y+h*.24' in js and 'spotRx=half' in js and 'cast*1.28+.06' in js
    assert (ROOT/'0Play.cmd').exists() and not (ROOT/'-Play.cmd').exists() and not (ROOT/'run_relay_moth_pretty_graphics.cmd').exists()

    # Original-art tree remix authoring rather than vector-only new style.
    build=(ROOT/'tools'/'build_v391_assets.py').read_text();assert 'remix_tree_base' in build and "original_tree_bases=[sprites[n] for n in ('tree_purple','tree_green')" in build

    subprocess.run(['node','--check',str(ROOT/'surfacefx.js')],check=True)
    subprocess.run(['node','--check',str(ROOT/'foliagefx.js')],check=True)
    subprocess.run(['node','--check',str(ROOT/'game.js')],check=True)
    subprocess.run(['node','--check',str(ROOT/'sprite_material.js')],check=True)
    subprocess.run(['node','--check',str(ROOT/'editor.js')],check=True)
    subprocess.run(['node',str(ROOT/'tests'/'current'/'surfacefx_regression.js')],check=True)
    subprocess.run(['node',str(ROOT/'tests'/'current'/'foliagefx_regression_400.js')],check=True)
    subprocess.run(['node',str(ROOT/'tests'/'current'/'foliagefx_depth_regression_400.js')],check=True)
    subprocess.run(['node',str(ROOT/'tests'/'current'/'foliagefx_occlusion_regression_404.js')],check=True)
    subprocess.run(['node',str(ROOT/'tests'/'current'/'foliagefx_anchor_grouping_regression_406.js')],check=True)
    subprocess.run(['python',str(ROOT/'tests'/'current'/'foliagefx_metadata_regression_400.py')],check=True)
    subprocess.run(['python',str(ROOT/'tests'/'current'/'foliagefx_glsl_regression_400.py')],check=True)
    subprocess.run(['python',str(ROOT/'tests'/'current'/'visual_behavior_regression_400.py')],check=True)
    subprocess.run(['python',str(ROOT/'tests'/'current'/'render_order_seam_regression_402.py')],check=True)
    subprocess.run(['python',str(ROOT/'tests'/'current'/'render_pipeline_glsl_regression_402.py')],check=True)
    subprocess.run(['python',str(ROOT/'tests'/'current'/'material_maps_regression_413.py')],check=True)
    subprocess.run(['node',str(ROOT/'tests'/'current'/'render_contracts_414.js')],check=True)
    subprocess.run(['python',str(ROOT/'tests'/'current'/'sprite_assets_regression_414.py')],check=True)
    subprocess.run(['python',str(ROOT/'tests'/'current'/'sprite_pixels_regression_414.py')],check=True)
    subprocess.run(['python',str(ROOT/'tests'/'current'/'movement_regression_397.py')],check=True)
    subprocess.run(['node',str(ROOT/'tests'/'current'/'input_regression.js')],check=True)
    subprocess.run(['python',str(ROOT/'tests'/'current'/'jitter_regression.py')],check=True)
    subprocess.run(['python',str(ROOT/'tests'/'current'/'transition_memory_regression.py')],check=True)
    subprocess.run(['python',str(ROOT/'tests'/'current'/'bridge_regression_39954.py')],check=True)
    subprocess.run(['node',str(ROOT/'tests'/'current'/'ambient_ai_regression_39953.js')],check=True)
    subprocess.run(['node',str(ROOT/'tests'/'current'/'npc_regression_399.js')],check=True)
    subprocess.run(['node',str(ROOT/'tests'/'current'/'followers_casual_regression_409.js')],check=True)
    subprocess.run(['python',str(ROOT/'tests'/'current'/'wysiwyg_editor_regression_410.py')],check=True)
    subprocess.run(['python',str(ROOT/'tests'/'current'/'wysiwyg_editor_input_regression_411.py')],check=True)
    subprocess.run(['python',str(ROOT/'tests'/'current'/'object_editor_regression_412.py')],check=True)
    subprocess.run(['python',str(ROOT/'tests'/'current'/'editor_server_save_regression_410.py')],check=True)
    subprocess.run(['node',str(ROOT/'tests'/'current'/'graphics_migration_regression_3999.js')],check=True)
    subprocess.run(['python',str(ROOT/'tests'/'current'/'grass_shadow_regression_3999.py')],check=True)
    subprocess.run(['python',str(ROOT/'tests'/'current'/'fault_regression.py')],check=True)
    subprocess.run(['python','-m','py_compile',str(ROOT/'tools'/'build_v391_assets.py')],check=True)
    subprocess.run(['python','-m','py_compile',str(ROOT/'tools'/'generate_material_maps_413.py'),str(ROOT/'tools'/'rebuild_runtime_atlas.py')],check=True)
    print('Relay Moth Forest — Pretty Graphics Edition 4.14')
    print('SELF-TEST PASSED')
    print(f'  {routes} staged objective/exit routes')
    print(f'  {mini_units} mini robots; {wild_units} woodland creatures incl mushroom pixies/cats')
    print(f'  {trees} large trees; {original_trees} use original painted tree sprites')
    print(f'  {len(hd["regions"])} atlas regions + coordinate-matched colour/height/normal/specular atlases')
    print('  v4.14 source-normal materials + exact tree/alpha assets + genuine GPU pixel tests + inherited gameplay/editor contracts validated')
if __name__=='__main__':main()
