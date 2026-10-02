#!/usr/bin/env python3
"""Optional native browser WebGL2 integration (not a GL mock).
Offline JSON/images are injected into a blank document to avoid navigation-policy
restrictions. Production renderer, shaders, Canvas2D and DOM execute unchanged;
only asset transport and the animation scheduler are controlled by the fixture.
Requires Playwright + Chromium. Run separately: python ... --out <evidence-dir>.
"""
from __future__ import annotations
import argparse, base64, json, re, shutil, sys, time
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
SETUP=r'''window.requestAnimationFrame=()=>1;
window.fetch=async(url)=>{const k=String(url).split('?')[0];if(k in window.__json)return {ok:true,json:async()=>structuredClone(window.__json[k]),text:async()=>JSON.stringify(window.__json[k])};throw Error('Unexpected offline fetch: '+url)};
'''
def main():
    ap=argparse.ArgumentParser();ap.add_argument('--out',type=Path);ap.add_argument('--chromium');args=ap.parse_args()
    from playwright.sync_api import sync_playwright
    if args.out:args.out.mkdir(parents=True,exist_ok=True)
    html=re.sub(r'<script\b[^>]*>.*?</script>','',(ROOT/'index.html').read_text(),flags=re.S)
    html=re.sub(r'<link[^>]*rel="stylesheet"[^>]*>','',html)
    with sync_playwright() as p:
        executable=args.chromium or shutil.which('chromium')
        flags=['--no-sandbox','--disable-dev-shm-usage','--ignore-gpu-blocklist']
        if sys.platform.startswith('linux'):flags+=['--use-gl=angle','--use-angle=gl-egl','--ozone-platform=headless']
        browser=p.chromium.launch(executable_path=executable,headless=True,args=flags)
        page=browser.new_page(viewport={'width':960,'height':680});logs=[]
        page.on('pageerror',lambda e:logs.append(str(e)))
        page.on('console',lambda m:logs.append(m.type+': '+m.text) if m.type=='error' else None)
        page.set_content(html);page.add_style_tag(content=(ROOT/'style.css').read_text())
        page.evaluate('(d)=>{window.__json=d;window.__assets={}}',{f.name:json.loads(f.read_text()) for f in ROOT.glob('*.json')})
        meta=json.loads((ROOT/'hd_remake_atlas.json').read_text())
        page.evaluate("()=>{const i=document.createElement('input');i.id='auditAsset';i.type='file';i.style.display='none';document.body.appendChild(i)}")
        for key in ('image','specular_image','normal_image'):
            name=meta[key];page.locator('#auditAsset').set_input_files(str(ROOT/name))
            page.evaluate('(name)=>{window.__assets[name]=URL.createObjectURL(document.querySelector("#auditAsset").files[0])}',name)
        page.add_script_tag(content=SETUP)
        for name in ('surfacefx.js','sprite_material.js','foliagefx.js','procedural_decor.js','editor_identity.js','editor_validation.js','editor.js','game.js'):
            source=(ROOT/name).read_text()
            if name=='game.js':source=source.replace('img.src=url','img.src=window.__assets[url]||url')
            page.add_script_tag(content=source)
        page.wait_for_function("document.body.dataset.ready==='1'",timeout=60000)
        result={'rooms':[],'native_webgl':True,'asset_transport':'offline injected, normal renderer'}
        result['driver']=page.evaluate("(()=>{const g=game.renderer.gl,d=g.getExtension('WEBGL_debug_renderer_info');return {version:g.getParameter(g.VERSION),renderer:d?g.getParameter(d.UNMASKED_RENDERER_WEBGL):g.getParameter(g.RENDERER)}})()")
        # Rendering/readback happen in the same browser task before the drawing buffer is discarded.
        page.evaluate('''()=>{window.auditFrame=(time=1000,capture=false)=>{game.renderer.foliageFX.update(.016,game.foliageInteractionSources(),game.graphics,time/1000);game.render(time);const g=game.renderer.gl;g.finish();const error=g.getError();if(error)throw Error('WebGL error '+error);if(game.renderer.foliageFX.error)throw Error(game.renderer.foliageFX.error);if(game.renderer.surfaceFX.errors.length)throw Error(game.renderer.surfaceFX.errors.join(';'));return {png:capture?game.canvas.toDataURL():null,foliage:game.renderer.foliageFX.diagnostics(),surface:game.renderer.surfaceFX.diagnostics()}}}'''.replace('game.canvas.toDataURL()','document.querySelector("#game").toDataURL()'))
        for i in range(9):
            print('NATIVE WEBGL room',i+1,flush=True)
            page.evaluate('(i)=>{game.enterRoom(i,null);document.querySelector("#storyModal").classList.add("hidden")}',i)
            frame=page.evaluate('(capture)=>auditFrame(1000,capture)',bool(args.out and i in (0,2,7)))
            png=frame.pop('png');frame['room']=page.evaluate('game.room.key');result['rooms'].append(frame)
            if png:(args.out/(frame['room']+'.png')).write_bytes(base64.b64decode(png.split(',')[1]))
        page.evaluate('''()=>{game.enterRoom(2,null);document.querySelector('#storyModal').classList.add('hidden');window.__settings={...game.graphics}}''')
        result['settings_matrix']=[]
        variants=[{'lighting':False},{'bump':False},{'foliageQuality':0},{'foliageQuality':1},{'foliageQuality':2},{'foliageQuality':3,'grassFineFX':True},{'foliageWindStrength':4,'foliageBendAmount':3,'foliageInteractionStrength':4}]
        for settings in variants:
            page.evaluate('(s)=>{game.graphics={...__settings,...s}}',settings)
            page.evaluate('()=>auditFrame(2345,false)');result['settings_matrix'].append(settings)
        page.evaluate("""()=>{game.graphics={...__settings};game.x=476;game.y=178;game.followers.units=['cream','brass','tin'].map((variant,i)=>game.followers.makeUnit({id:'audit-'+i,variant},463+i*13,165+i*5))}""")
        result['robot_overlap_frames']=0
        for frame in range(36):
            page.evaluate('(frame)=>{for(let i=0;i<game.followers.units.length;i++){const u=game.followers.units[i];u.x=462+i*14+Math.sin(frame*.1+i)*5;u.y=147+frame*.8+i*3;u.vx=4*Math.cos(frame*.1+i);u.vy=48}}',frame)
            f=page.evaluate('(frame)=>auditFrame(3500+frame*16.666,false)',frame);result['robot_overlap_frames']+=1
        if args.out:
            f=page.evaluate('()=>auditFrame(4150,true)');(args.out/'robot_overlap.png').write_bytes(base64.b64decode(f['png'].split(',')[1]))
        page.evaluate('()=>{game.graphics={...__settings};rmfEditor.toggle(true)}')
        def editor_click(x,y,button='left',alt=False):
            box=page.locator('#editorOverlay').bounding_box()
            assert box, 'editor overlay has no browser box'
            px=box['x']+float(x)/640.0*box['width'];py=box['y']+float(y)/360.0*box['height']
            if alt:page.keyboard.down('Alt')
            try:page.mouse.click(px,py,button=button)
            finally:
                if alt:page.keyboard.up('Alt')
        changed=page.evaluate('''()=>{const r=rmfEditor.rawRoom(),fx=game.renderer.foliageFX,water=game.renderer.surfaceFX.water,oldGrass=fx.descriptorKey,oldWater=water.signature;r.grass_clumps[0].x+=11;rmfEditor.queueInvalidation(RelayEditorInvalidation.FOLIAGE,{sync:true});auditFrame(2975,false);const grassChanged=oldGrass!==fx.descriptorKey,waterAfterGrass=water.signature;r.water[0]=[r.water[0][0]+1,r.water[0][1]];rmfEditor.queueInvalidation(RelayEditorInvalidation.TERRAIN,{sync:true});auditFrame(3000,false);return {grass:grassChanged,water:oldWater!==water.signature,grassDidNotRebuildWater:waterAfterGrass===oldWater,counters:rmfEditor.getInvalidationDiagnostics().counters}}''')
        assert changed['grass'] and changed['water'] and changed['grassDidNotRebuildWater'],changed;result['same_count_edits']=changed

        # v4.15 editor safety interactions: real DOM pointer/keyboard actions against the
        # production editor overlay/chrome rather than source-shape assertions.
        behavior={}

        # Tin Stream historical overlap fixture: keep a real generated bush and real
        # rivet_d item, but force their editor bboxes to overlap as the v4.14 bug did.
        tin=page.evaluate('''()=>{const idx=game.storyData.rooms.findIndex(r=>r.key==='tin_stream');game.enterRoom(idx,null);document.querySelector('#storyModal').classList.add('hidden');const raw=game.maps.rooms.tin_stream,target=RelayProceduralDecor.enumerate(game.room,game.art.roles).find(d=>d.generatorIndex===1)||RelayProceduralDecor.enumerate(game.room,game.art.roles)[0];if(!target)throw Error('Tin Stream generated decor fixture missing');window.__collectOriginal=rmfEditor.collectItems;rmfEditor.collectItems=function(){const items=window.__collectOriginal.call(rmfEditor),b=items.find(i=>i.type==='procedural-decor'&&i.id===target.id),o=items.find(i=>i.type==='objective'&&i.id==='rivet_d');if(b&&o)o.bbox={...b.bbox};return items};const items=rmfEditor.collectItems(),b=items.find(i=>i.type==='procedural-decor'&&i.id===target.id),o=items.find(i=>i.type==='objective'&&i.id==='rivet_d');if(!b||!o)throw Error('Tin Stream overlap editor refs missing');const x0=Math.max(b.bbox.x0,o.bbox.x0),x1=Math.min(b.bbox.x1,o.bbox.x1),y0=Math.max(b.bbox.y0,o.bbox.y0),y1=Math.min(b.bbox.y1,o.bbox.y1);if(x0>x1||y0>y1)throw Error('Tin Stream overlap fixture did not overlap');return{id:target.id,tile:target.tile,x:(x0+x1)/2,y:(y0+y1)/2,objects:JSON.stringify(raw.objects),hidden:JSON.stringify(raw.object_fx_hidden||[])}}''')
        # Hide editor chrome so the click necessarily reaches the real overlay even
        # when this historical fixture lies beneath the side inspector.
        page.locator('#editorChrome').click()
        editor_click(tin['x'],tin['y'],button='right')
        page.keyboard.press('Tab')
        assert page.locator('#editorToolbar').is_visible()
        tin_after=page.evaluate('''(f)=>{const raw=game.maps.rooms.tin_stream,excluded=(raw.decor_exclusions||[]).some(p=>(Array.isArray(p)?p.join(','):String(p))===f.tile.join(',')),ok=excluded&&JSON.stringify(raw.objects)===f.objects&&JSON.stringify(raw.object_fx_hidden||[])===f.hidden&&!(raw.object_fx_hidden||[]).includes('rivet_d');rmfEditor.collectItems=window.__collectOriginal;delete window.__collectOriginal;raw.decor_exclusions=(raw.decor_exclusions||[]).filter(p=>(Array.isArray(p)?p.join(','):String(p))!==f.tile.join(','));rmfEditor.rebuildRoom();return{ok,excluded,rivetHidden:(raw.object_fx_hidden||[]).includes('rivet_d')}}''',tin)
        assert tin_after['ok'],tin_after;behavior['tin_stream_right_click']=tin_after

        # Inspector edit via actual canvas selection + DOM field, then Ctrl+Z. Mark the
        # injected fixture as the baseline so the dirty indicator is directly testable.
        ins=page.evaluate('''()=>{const idx=game.storyData.rooms.findIndex(r=>r.key==='quiet_nest');game.enterRoom(idx,null);document.querySelector('#storyModal').classList.add('hidden');const raw=game.maps.rooms.quiet_nest,sprite=(game.art.roles.decor_plants||game.art.roles.foliage_v401_all||[])[0];if(!sprite)throw Error('decor sprite fixture missing');raw.editor_decor=raw.editor_decor||[];raw.editor_decor.push({editor_id:'browser_inspector_fixture',x:116,y:142,sprite,scale:1,alpha:1});rmfEditor.queueInvalidation(RelayEditorInvalidation.STATIC,{sync:true});rmfEditor.markSavedBaseline('browser-fixture');return{x:116,y:136}}''')
        page.locator('[data-editor-tool="select"]').click();editor_click(ins['x'],ins['y'])
        xfield=page.locator('#editorInspectorBody [data-editor-property="x"]')
        assert xfield.is_visible(),'inspector x control did not open from real canvas click'
        xfield.fill('143');xfield.press('Enter')
        assert page.evaluate("game.maps.rooms.quiet_nest.editor_decor.find(d=>d.editor_id==='browser_inspector_fixture').x")==143
        dirty_text=page.locator('#editorValidationState').inner_text();assert 'DIRTY' in dirty_text,dirty_text
        page.keyboard.press('Control+Z')
        assert page.evaluate("game.maps.rooms.quiet_nest.editor_decor.find(d=>d.editor_id==='browser_inspector_fixture').x")==116
        clean_text=page.locator('#editorValidationState').inner_text();assert clean_text.startswith('CLEAN'),clean_text
        behavior['inspector_edit_undo']={'dirty':dirty_text,'clean':clean_text}

        # Alt+click cycles deterministic overlapping authoring refs using the real pointer path.
        cyc=page.evaluate('''()=>{const raw=game.maps.rooms.quiet_nest,candidates=[[80,252],[560,248],[82,82],[550,82]],p=candidates.find(([x,y])=>RelayEditorPolicy.candidates(rmfEditor.collectItems(),{x,y},'select').length===0)||[80,252],sprite=(game.art.roles.decor_plants||game.art.roles.foliage_v401_all||[])[0];raw.editor_decor.push({editor_id:'browser_cycle_a',x:p[0],y:p[1],sprite,scale:.7,alpha:1},{editor_id:'browser_cycle_b',x:p[0],y:p[1],sprite,scale:.7,alpha:1});rmfEditor.queueInvalidation(RelayEditorInvalidation.STATIC,{sync:true});return{x:p[0],y:p[1]-3}}''')
        page.locator('[data-editor-tool="select"]').click();editor_click(cyc['x'],cyc['y'],alt=True)
        first=page.evaluate("rmfEditor.selection[0]?.id");editor_click(cyc['x'],cyc['y'],alt=True);second=page.evaluate("rmfEditor.selection[0]?.id")
        assert first in ('browser_cycle_a','browser_cycle_b') and second in ('browser_cycle_a','browser_cycle_b') and first!=second,(first,second)
        behavior['alt_cycle']=[first,second]

        # Hide/show an objective entirely through OBJECT canvas selection + toolbar action.
        obj=page.evaluate('''()=>{const item=rmfEditor.collectItems().find(i=>i.type==='objective');if(!item)throw Error('objective browser fixture missing');return{id:item.id,x:(item.bbox.x0+item.bbox.x1)/2,y:(item.bbox.y0+item.bbox.y1)/2,tile:item.tile}}''')
        page.locator('[data-editor-tool="object"]').click();editor_click(obj['x'],obj['y'])
        assert not page.locator('#editorObjectiveVisual').is_disabled()
        page.locator('#editorObjectiveVisual').click()
        hidden=page.evaluate('(id)=>(rmfEditor.rawRoom().object_fx_hidden||[]).includes(id)',obj['id']);assert hidden
        assert page.locator('#editorObjectiveVisual').inner_text()=='SHOW VISUAL'
        page.locator('#editorObjectiveVisual').click()
        shown=page.evaluate('(id)=>!(rmfEditor.rawRoom().object_fx_hidden||[]).includes(id)',obj['id']);assert shown
        assert page.evaluate('(o)=>JSON.stringify(rmfEditor.rawRoom().objects[o.id])===JSON.stringify(o.tile)',obj)
        behavior['objective_hide_show']=True

        # SHOW SUPPRESSED + real canvas selection + RESTORE for nest:swirl.
        page.evaluate('''()=>{const r=rmfEditor.rawRoom();r.pattern_exclusions=r.pattern_exclusions||[];if(!r.pattern_exclusions.includes('nest:swirl'))r.pattern_exclusions.push('nest:swirl');rmfEditor.queueInvalidation(RelayEditorInvalidation.STATIC|RelayEditorInvalidation.ROOM_DATA,{sync:true})}''')
        page.locator('#editorSuppressed').click();page.locator('[data-editor-tool="select"]').click()
        sup=page.evaluate('''()=>{const i=rmfEditor.collectItems().find(x=>x.type==='suppressed-pattern'&&x.id==='nest:swirl');if(!i)throw Error('suppressed nest:swirl handle missing');return{x:(i.bbox.x0+i.bbox.x1)/2,y:(i.bbox.y0+i.bbox.y1)/2}}''')
        editor_click(sup['x'],sup['y'])
        assert not page.locator('#editorRestoreSuppressed').is_disabled()
        page.locator('#editorRestoreSuppressed').click()
        restored=page.evaluate("!((rmfEditor.rawRoom().pattern_exclusions||[]).includes('nest:swirl'))");assert restored
        behavior['suppressed_restore']=True
        page.locator('#editorSuppressed').click()

        # Clean fixture content before the inherited palette/UI checks.
        page.evaluate('''()=>{const r=game.maps.rooms.quiet_nest;r.editor_decor=(r.editor_decor||[]).filter(d=>!String(d.editor_id||'').startsWith('browser_'));rmfEditor.queueInvalidation(RelayEditorInvalidation.STATIC,{sync:true});rmfEditor.markSavedBaseline('browser-cleanup')}''')
        result['editor_behavior_415']=behavior
        # Ghost alpha, scale and origin must match the planted sprite dimensions.
        result['ghost_geometry']=page.evaluate('''()=>{const cases=[{kind:'decor',sprite:'flower_white'},{kind:'ambient',sprite:'guide_moon',scale:.85,alpha:.55},{kind:'moth',sprite:game.art.roles.moths[0]},{kind:'wildlife',wildlifeKind:'cat',sprite:game.art.roles.creatures.cat.idle},{kind:'mini',sprite:game.art.roles.mini_robots.teal.idle}];return cases.map(e=>{const a=new OffscreenCanvas(160,160),b=new OffscreenCanvas(160,160);rmfEditor.drawSpriteGhost(a.getContext('2d'),e,80,130);const geometry=rmfEditor.ghostGeometry(e),reference={decor:[.62,'bottom'],ambient:[.85,'bottom'],moth:[.36,'center'],wildlife:[1.755,'center'],mini:[1.52,'center']}[e.kind];if(geometry.scale!==reference[0]||geometry.anchor!==reference[1])throw Error('Preview scale/anchor differs from runtime base size '+e.kind);game.art.draw(b.getContext('2d'),e.sprite,80,130,null,null,{scale:reference[0],anchor:reference[1],alpha:.56*(e.alpha??1)});const aa=a.getContext('2d').getImageData(0,0,160,160).data,bb=b.getContext('2d').getImageData(0,0,160,160).data;let max=0;for(let i=0;i<aa.length;i++)max=Math.max(max,Math.abs(aa[i]-bb[i]));if(max)throw Error('ghost mismatch '+e.sprite+' '+max);return {kind:e.kind,scale:geometry.scale,anchor:geometry.anchor,error:max}})}''')
        page.locator('[data-editor-category="decor"]').click();page.locator('.editorPaletteItem').first.click();page.locator('[data-editor-category="trees"]').click()
        assert page.locator('[data-editor-category="trees"]').evaluate('(b)=>b.classList.contains("active")')
        page.locator('#editorChrome').click();page.keyboard.press('Tab');assert page.locator('#editorToolbar').is_visible()
        result['palette_after_selection']=True;result['tab_restores_ui']=True
        result['editor_canvas_filter']=page.locator('#game').evaluate('(c)=>getComputedStyle(c).filter');assert result['editor_canvas_filter']=='none'
        if args.out:page.screenshot(path=str(args.out/'editor_controls.png'))
        page.evaluate('()=>{rmfEditor.toggle(false);game.graphics={...__settings}}')
        page.set_viewport_size({'width':1280,'height':800});page.evaluate('()=>auditFrame(3500,false)');result['resize_to_1280']=True
        result['runtime_errors']=logs;assert not logs,logs
        if args.out:(args.out/'browser_results.json').write_text(json.dumps(result,indent=2))
        print('NATIVE BROWSER WEBGL2 PASS: nine rooms, material/quality toggles, same-count invalidation, v4.15 right-click/inspector/cycle/recovery/dirty interactions, ghost geometry and UI input; '+result['driver']['renderer'],flush=True)
        browser.close()
if __name__=='__main__':main()
