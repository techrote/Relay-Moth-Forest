#!/usr/bin/env python3
"""Optional native browser WebGL2 integration (not a GL mock).
Offline JSON/images are injected into a blank document to avoid navigation-policy
restrictions. Production renderer, shaders, Canvas2D and DOM execute unchanged;
only asset transport and the animation scheduler are controlled by the fixture.
Requires Playwright + Chromium. Run separately: python ... --out <evidence-dir>.
"""
from __future__ import annotations
import argparse, base64, json, re, shutil, sys, time
from contextlib import contextmanager
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
SETUP=r'''window.requestAnimationFrame=()=>1;
window.fetch=async(url)=>{const k=String(url).split('?')[0];if(k in window.__json)return {ok:true,json:async()=>structuredClone(window.__json[k]),text:async()=>JSON.stringify(window.__json[k])};throw Error('Unexpected offline fetch: '+url)};
'''
WATER_CHECK_SETUP=r'''()=>{
  const check=(ok,label)=>{if(!ok)throw Error('PERF-003 '+label)};
  const mismatches=(a,b)=>{check(a.length===b.length,'byte lengths differ');let n=0;for(let i=0;i<a.length;i++)if(a[i]!==b[i])n++;return n};
  const readTexture=(g,texture,w,h)=>{
    const draw=g.getParameter(g.DRAW_FRAMEBUFFER_BINDING),read=g.getParameter(g.READ_FRAMEBUFFER_BINDING),f=g.createFramebuffer(),bytes=new Uint8Array(w*h*4);
    try{g.bindFramebuffer(g.FRAMEBUFFER,f);g.framebufferTexture2D(g.FRAMEBUFFER,g.COLOR_ATTACHMENT0,g.TEXTURE_2D,texture,0);check(g.checkFramebufferStatus(g.FRAMEBUFFER)===g.FRAMEBUFFER_COMPLETE,'incomplete texture framebuffer');g.readPixels(0,0,w,h,g.RGBA,g.UNSIGNED_BYTE,bytes)}
    finally{g.bindFramebuffer(g.DRAW_FRAMEBUFFER,draw);g.bindFramebuffer(g.READ_FRAMEBUFFER,read);g.deleteFramebuffer(f)}
    return bytes;
  };
  const fullTexture=(g,source,w,h,isCanvas)=>{
    const old=g.getParameter(g.TEXTURE_BINDING_2D),flip=g.getParameter(g.UNPACK_FLIP_Y_WEBGL),t=g.createTexture();
    try{
      g.bindTexture(g.TEXTURE_2D,t);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_MIN_FILTER,g.LINEAR);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_MAG_FILTER,g.LINEAR);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_WRAP_S,g.CLAMP_TO_EDGE);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_WRAP_T,g.CLAMP_TO_EDGE);g.pixelStorei(g.UNPACK_FLIP_Y_WEBGL,true);
      if(isCanvas)g.texImage2D(g.TEXTURE_2D,0,g.RGBA,g.RGBA,g.UNSIGNED_BYTE,source);
      else g.texImage2D(g.TEXTURE_2D,0,g.RGBA8,w,h,0,g.RGBA,g.UNSIGNED_BYTE,source);
      return readTexture(g,t,w,h);
    }finally{g.pixelStorei(g.UNPACK_FLIP_Y_WEBGL,flip);g.bindTexture(g.TEXTURE_2D,old);g.deleteTexture(t)}
  };
  const parity=(label,canvas=game.waterMaskCanvas,water=game.renderer.surfaceFX.water,legacy=game.renderer.waterMaskTex,g=game.renderer.gl)=>{
    const q=water.quality,[w,h]=RelaySurfaceFX.fieldResolutionForQuality(q),c=new OffscreenCanvas(w,h),x=c.getContext('2d',{willReadFrequently:true});
    x.imageSmoothingEnabled=false;x.drawImage(canvas,0,0,w,h);
    const data=x.getImageData(0,0,w,h).data,mask=new Uint8Array(w*h);
    for(let i=0;i<mask.length;i++)mask[i]=data[i*4+3]>20&&data[i*4]>20?1:0;
    const ref=RelaySurfaceFX.buildShoreField(mask,w,h,RelaySurfaceFX.shoreMaxDistanceForQuality(q));
    const result={label,quality:q,mode:water.lastUpdate?.mode,legacyMode:game.renderer.lastWaterMaskUpdate?.mode,
      maskMismatch:mismatches(mask,water.mask),fieldMismatch:mismatches(ref.rgba,water.rgba),
      fieldGpuMismatch:mismatches(readTexture(g,water.texture,w,h),fullTexture(g,ref.rgba,w,h,false)),
      legacyGpuMismatch:legacy?mismatches(readTexture(g,legacy,640,360),fullTexture(g,canvas,640,360,true)):0,
      last:water.lastUpdate,legacy:legacy?game.renderer.lastWaterMaskUpdate:null};
    check(!result.maskMismatch&&!result.fieldMismatch&&!result.fieldGpuMismatch&&!result.legacyGpuMismatch,label+' CPU/full-texture parity '+JSON.stringify(result));
    check(g.getError()===g.NO_ERROR,label+' WebGL error');
    return result;
  };
  const snapshot=()=>({field:game.renderer.surfaceFX.water.rebuilds,legacy:game.renderer.waterMaskFullUploads||0});
  const bounded=(label,before,canvas=game.waterMaskCanvas)=>{
    const r=game.renderer,w=r.surfaceFX.water,last=w.lastUpdate;
    check(w.rebuilds===before.field&&(r.waterMaskFullUploads||0)===before.legacy,label+' performed a full rebuild/upload');
    check(last?.mode==='bounded'&&r.lastWaterMaskUpdate?.mode==='bounded',label+' did not use both bounded paths');
    check(last.distanceCells<w.fieldW*w.fieldH&&last.acquirePixels<w.fieldW*w.fieldH,label+' performed whole-field CPU work');
    check(last.uploadBytes>0&&last.uploadBytes<4*w.fieldW*w.fieldH&&r.lastWaterMaskUpdate.uploadBytes>0&&r.lastWaterMaskUpdate.uploadBytes<640*360*4,label+' upload was not bounded');
    return parity(label,canvas);
  };
  const authority=label=>{
    const raw=game.maps.rooms[game.room.key],expected=new Set(raw.water.map(p=>p.join(',')));
    check(expected.size===game.room.water.size&&[...expected].every(k=>game.room.water.has(k)),label+' Room rebind is stale');
    for(let y=0;y<19;y++)for(let x=0;x<40;x++){
      const key=x+','+y,wet=expected.has(key)&&!game.room.bridgeOpen(key);
      check(game.waterAuthority[y*40+x]===(wet?1:0),label+' effective authority '+key);
    }
  };
  window.auditWater={check,parity,snapshot,bounded,authority};
  window.__waterTinOriginal=structuredClone(game.maps.rooms.tin_stream);
}'''

WATER_QUALITY_CASE=r'''q=>{
  const a=auditWater,r=game.renderer,e=rmfEditor,idx=game.storyData.rooms.findIndex(s=>s.key==='tin_stream'),spec=game.storyData.rooms[idx];
  e.toggle(true);e.clearPendingInvalidation();game.maps.rooms.tin_stream=structuredClone(__waterTinOriginal);game.rooms[idx]=new Room(idx,spec,game.maps);e.history.set('tin_stream',{undo:[],redo:[]});
  for(const o of spec.objects)game.state.completed.delete(o.object_id);
  game.graphics.waterQuality=q;game.enterRoom(idx,null);document.querySelector('#storyModal').classList.add('hidden');
  const attributes=game.waterMaskCanvas.getContext('2d').getContextAttributes();
  a.check(attributes.willReadFrequently===true,'authority canvas must request CPU readback on its first context creation');
  const result={quality:q,cpuReadback:attributes.willReadFrequently,initial:a.parity('q'+q+' initial'),stages:[]};
  for(let stage=0;stage<spec.objects.length;stage++){
    const o=spec.objects[stage],before=a.snapshot();[game.x,game.y]=game.room.center(game.room.objects[o.object_id]);game.checkObjectives();
    a.check(game.state.isDone(o.object_id)&&game.room.bridgeProgress===stage+1,'bridge objective did not commit');
    for(let s=0;s<game.room.bridgeSegments.length;s++)for(const tile of game.room.bridgeSegments[s]){
      const open=s<=stage;a.check(game.room.bridgeOpen(tile.join(','))===open,'bridge stage authority mismatch');
      a.check(game.room.blocked(tile)===!open,'bridge collision is stale before next player update');
    }
    a.authority('q'+q+' '+o.object_id);
    result.stages.push(a.bounded('q'+q+' '+o.object_id,before));
  }
  const noChange=a.snapshot();game.refreshEditorWater();
  a.check(r.surfaceFX.water.rebuilds===noChange.field&&(r.waterMaskFullUploads||0)===noChange.legacy,'unchanged topology rebuilt');
  a.check(r.lastWaterMaskUpdate.uploadBytes===0&&r.surfaceFX.water.lastUpdate.uploadBytes===0&&r.surfaceFX.water.lastUploadBytes===0,'unchanged topology uploaded');
  // Move a wet cell diagonally across a shoreline. The sparse multirow change
  // catches subupload row packing, vertical placement and same-count invalidation.
  const raw=e.rawRoom(),source=raw.water.find(p=>p[0]===16&&p[1]===2),target=[15,3];
  a.check(source&&!raw.water.some(p=>p.join(',')===target.join(',')),'asymmetric water fixture unavailable');
  const originalWater=JSON.stringify(raw.water),signature=r.surfaceFX.water.signature,counters=e.getInvalidationDiagnostics().counters,before=a.snapshot();
  e.beginTransaction('PERF-003 same-count water move');raw.water[raw.water.indexOf(source)]=target;
  for(let i=0;i<40;i++)e.queueInvalidation(RelayEditorInvalidation.TERRAIN);
  const queued=e.getInvalidationDiagnostics();
  a.check(queued.pending!==0&&queued.counters.flushes===counters.flushes&&queued.counters.scheduled===counters.scheduled+1,'40 events did not coalesce into one pending flush');
  e.pointerDown=true;e.pointerId=415;e.dragMode='paint';
  const box=e.overlay.getBoundingClientRect();
  e.overlay.dispatchEvent(new PointerEvent('pointerup',{pointerId:415,button:0,clientX:box.left+box.width*.4,clientY:box.top+box.height*.4,bubbles:true}));
  const committed=e.getInvalidationDiagnostics();
  a.check(!committed.pending&&!e.transaction&&committed.counters.flushes===counters.flushes+1&&committed.counters.water===counters.water+1,'pointerup did not synchronously flush final topology');
  a.check(committed.counters.creatures===counters.creatures&&committed.counters.miniRobots===counters.miniRobots,'water edit reset unrelated actors');
  a.check(raw.water.length===JSON.parse(originalWater).length&&r.surfaceFX.water.signature!==signature,'same-count identity did not change');
  a.authority('q'+q+' commit');result.editorCommit=a.bounded('q'+q+' editor commit',before);
  const editedWater=JSON.stringify(e.rawRoom().water),undoBefore=a.snapshot();a.check(e.undoOne(),'water undo unavailable');
  a.check(JSON.stringify(e.rawRoom().water)===originalWater,'water undo lost original data');a.authority('water undo');result.editorUndo=a.bounded('q'+q+' editor undo',undoBefore);
  const redoBefore=a.snapshot();a.check(e.redoOne(),'water redo unavailable');
  a.check(JSON.stringify(e.rawRoom().water)===editedWater,'water redo lost final data');a.authority('water redo');result.editorRedo=a.bounded('q'+q+' editor redo',redoBefore);
  e.flushForPersistence();a.check(!e.getInvalidationDiagnostics().pending&&JSON.stringify(e.rawRoom().water)===editedWater,'persistence flush missed final water data');
  result.coalescing={queued:40,flushes:committed.counters.flushes-counters.flushes,waterRefreshes:committed.counters.water-counters.water,synchronousPointerup:true};
  return result;
}'''

WATER_FALLBACK_CASE=r'''()=>{
  const a=auditWater,r=game.renderer,w=r.surfaceFX.water,e=rmfEditor,result={};
  game.graphics.waterQuality=0;game.refreshEditorWater();a.check(w.lastUpdate.mode==='disabled','quality zero did not disable field');
  e.beginTransaction('PERF-003 disabled-quality water edit');e.rawRoom().water.push([14,4]);e.queueInvalidation(RelayEditorInvalidation.TERRAIN);e.flushForPersistence();
  a.check(!e.transaction&&!e.getInvalidationDiagnostics().pending&&w.lastUpdate.mode==='disabled','save boundary did not commit disabled-quality edit');a.authority('disabled quality');
  const count=w.rebuilds;game.graphics.waterQuality=2;game.refreshEditorWater();a.check(w.rebuilds===count+1&&w.lastUpdate.mode==='full','reenabling quality reused stale field');result.qualityResume=a.parity('quality off/edit/on');
  const replacement=new OffscreenCanvas(640,360),x=replacement.getContext('2d',{willReadFrequently:true});x.drawImage(game.waterMaskCanvas,0,0);
  let changed=r.setWaterMask(replacement,'water-source-replacement',game.graphics);
  a.check(changed.legacy.mode==='full'&&changed.surface.mode==='full','source replacement must rebuild');result.sourceReplacement=a.parity('source replacement',replacement);
  const asymmetricBefore=a.snapshot();
  x.fillStyle='#fff';x.fillRect(35,25,7,19);x.clearRect(35,25,3,4);
  r.setWaterMask(replacement,'water-asymmetric-rectangle',game.graphics,{fromRevision:'water-source-replacement',toRevision:'water-asymmetric-rectangle',logicalRects:[{x0:35,y0:25,x1:42,y1:44}],logicalChangedCells:1});
  result.asymmetricRectangle=a.bounded('asymmetric multirow pixel rectangle',asymmetricBefore,replacement);
  x.clearRect(35,40,5,4);
  changed=r.setWaterMask(replacement,'water-revision-fallback',game.graphics,{fromRevision:'stale-base',toRevision:'water-revision-fallback',logicalRects:[{x0:35,y0:25,x1:42,y1:44}]});
  a.check(changed.legacy.mode==='full'&&changed.surface.mode==='full','stale delta base must rebuild');result.revisionFallback=a.parity('revision fallback',replacement);
  const fragmented=[];for(let i=0;i<40;i++){const px=i*16;x.fillRect(px,320,8,7);fragmented.push({x0:px,y0:320,x1:px+8,y1:327})}
  changed=r.setWaterMask(replacement,'water-fragmentation-fallback',game.graphics,{fromRevision:'water-revision-fallback',toRevision:'water-fragmentation-fallback',logicalRects:fragmented});
  a.check(changed.legacy.mode==='full'&&changed.surface.mode==='full','large legacy delta must rebuild');result.fragmentationFallback=a.parity('fragmentation fallback',replacement);
  x.fillRect(0,0,640,360);
  const field=w.setSource(replacement,'water-field-budget-fallback',2,{fromRevision:w.signature,toRevision:'water-field-budget-fallback',logicalRects:[{x0:0,y0:0,x1:640,y1:360}]});
  a.check(field.mode==='full'&&field.reason==='bounded-fallback:source-work-budget','large field delta must use work-budget fallback');result.workBudgetFallback=a.parity('field work-budget fallback',replacement,w,null);
  // Fresh field ownership is the path used after the game's recovery reload. No
  // old CPU cache or delta base may be accepted for the recreated GPU resource.
  const fresh=new RelaySurfaceFX.WaterField(r.gl),recreated=fresh.setSource(replacement,'water-recreated',2,{fromRevision:w.signature,toRevision:'water-recreated',logicalRects:[]});
  try{a.check(recreated.mode==='full'&&recreated.reason==='baseline-missing','recreated field accepted stale cache');result.fieldRecreation=a.parity('fresh field recreation',replacement,fresh,null)}
  finally{r.gl.deleteTexture(fresh.texture);r.gl.deleteBuffer(fresh.quad);r.gl.deleteProgram(fresh.program)}
  return result;
}'''

WATER_FAULT_CASE=r'''()=>{
  const a=auditWater,e=rmfEditor,idx=game.storyData.rooms.findIndex(s=>s.key==='tin_stream'),spec=game.storyData.rooms[idx],results=[];
  for(const fault of ['first-particle-burst','objective-effect','bridge-effect']){
    e.clearPendingInvalidation();game.maps.rooms.tin_stream=structuredClone(__waterTinOriginal);game.rooms[idx]=new Room(idx,spec,game.maps);
    for(const o of spec.objects)game.state.completed.delete(o.object_id);
    game.graphics.waterQuality=2;game.enterRoom(idx,null);document.querySelector('#storyModal').classList.add('hidden');
    const before=a.snapshot(),objective=spec.objects[0],expected=new Error('expected PERF-003 '+fault),burst=game.particles.burst,add=game.fx.add;
    [game.x,game.y]=game.room.center(game.room.objects[objective.object_id]);
    if(fault==='first-particle-burst')game.particles.burst=()=>{throw expected};
    else game.fx.add=function(kind,...args){if(kind===(fault==='objective-effect'?'objective_generic':'bridge_build'))throw expected;return add.call(this,kind,...args)};
    let caught=null;
    try{game.checkObjectives()}catch(error){caught=error}
    finally{game.particles.burst=burst;game.fx.add=add}
    a.check(caught===expected,fault+' injection did not reach the intended optional effect');
    a.check(game.state.isDone(objective.object_id)&&game.room.bridgeProgress===1,fault+' lost committed objective progress');
    for(const tile of game.room.bridgeSegments[0])a.check(game.room.bridgeOpen(tile.join(','))&&!game.room.blocked(tile),fault+' bridge collision did not commit');
    // Assert immediately after the throw: no subsequent update or retry may be
    // needed to reconcile the authoritative collision mask and either texture.
    a.authority(fault);const pixels=a.bounded(fault+' committed water before effects',before);
    const after=a.snapshot(),signature=game.renderer.surfaceFX.water.signature;
    game.checkObjectives();
    a.check(game.room.bridgeProgress===1&&game.renderer.surfaceFX.water.signature===signature,fault+' retry changed accepted progress');
    a.check(game.renderer.surfaceFX.water.rebuilds===after.field&&(game.renderer.waterMaskFullUploads||0)===after.legacy,fault+' retry rebuilt completed objective water');
    results.push({fault,expectedErrorCaught:true,coherentBeforeNextUpdate:true,pixels});
  }
  return results;
}'''


def boot_offline_runtime(page, html):
    """Boot an independent production runtime with the existing asset transport."""
    page.set_content(html);page.add_style_tag(content=(ROOT/'style.css').read_text())
    page.evaluate('(d)=>{window.__json=d;window.__assets={}}',{f.name:json.loads(f.read_text()) for f in ROOT.glob('*.json')})
    meta=json.loads((ROOT/'hd_remake_atlas.json').read_text())
    page.evaluate("()=>{const i=document.createElement('input');i.id='auditAsset';i.type='file';i.style.display='none';document.body.appendChild(i)}")
    for key in ('image','specular_image','normal_image'):
        name=meta[key];page.locator('#auditAsset').set_input_files(str(ROOT/name))
        page.evaluate('(name)=>{window.__assets[name]=URL.createObjectURL(document.querySelector("#auditAsset").files[0])}',name)
    page.add_script_tag(content=SETUP)
    for name in ('surfacefx.js','sprite_material.js','foliagefx.js','procedural_decor.js','static_terrain.js','editor_identity.js','editor_validation.js','editor.js','game.js'):
        source=(ROOT/name).read_text()
        if name=='game.js':source=source.replace('img.src=url','img.src=window.__assets[url]||url')
        page.add_script_tag(content=source)
    page.wait_for_function("document.body.dataset.ready==='1'",timeout=60000)


def run_final_native_gates(page, export_page_factory, export_check, result, out=None, runtime_errors=None):
    """Collect both strict gates before failing; never reuse a failed renderer."""
    failures=[];statuses={}
    result['native_gate_status']=statuses;result['native_gate_failures']=failures
    diagnostic_names={'static_terrain':'static_raster_failure.json','raster_export_415':'raster_export_failure.json'}
    if out:out.mkdir(parents=True,exist_ok=True)

    def failure(name, stage, error, target):
        statuses[name]='failed'
        entry={'gate':name,'stage':stage,'type':type(error).__name__,'error':str(error)}
        failures.append(entry)
        if out:
            if target is not None:
                try:
                    diagnostic=target.evaluate('window.__staticRasterDiagnostics||null')
                    if diagnostic:
                        filename=diagnostic_names[name]
                        (out/filename).write_text(json.dumps(diagnostic,indent=2))
                        entry['diagnostic']=filename
                except Exception as diagnostic_error:
                    # A broken/closed context must not hide the original gate
                    # failure or prevent the other independent runtime from booting.
                    entry['diagnostic_error']=str(diagnostic_error)
            try:
                (out/(name+'_errors.json')).write_text(json.dumps([item for item in failures if item['gate']==name],indent=2))
            except Exception as artifact_error:
                entry['artifact_error']=str(artifact_error)

    def collect(name, target, check):
        try:
            result[name]=check()
            statuses[name]='passed'
        except Exception as error:
            failure(name,'fixture',error,target)

    print('NATIVE WEBGL bounded static color/material textures',flush=True)
    collect('static_terrain',page,lambda:page.evaluate('()=>auditStaticTerrain.run()'))
    print('NATIVE WEBGL raster export snapshots, cache pressure and immediate terrain parity (isolated runtime)',flush=True)
    export_page=None
    try:
        with export_page_factory() as export_page:
            collect('raster_export_415',export_page,lambda:export_check(export_page))
    except Exception as error:
        failure('raster_export_415','isolated runtime setup/teardown',error,export_page)
    result['runtime_errors']=list(runtime_errors or [])
    if out:(out/'browser_results.json').write_text(json.dumps(result,indent=2))
    if failures or result['runtime_errors']:
        messages=[item['gate']+' ['+item['stage']+']: '+item['error'] for item in failures]
        if result['runtime_errors']:messages.append('Runtime errors: '+json.dumps(result['runtime_errors']))
        raise AssertionError('NATIVE BROWSER GATES FAILED:\n'+'\n\n'.join(messages))


def main():
    ap=argparse.ArgumentParser();ap.add_argument('--out',type=Path);ap.add_argument('--chromium');args=ap.parse_args()
    from playwright.sync_api import sync_playwright
    from raster_export_browser_415 import run_raster_export_checks
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
        boot_offline_runtime(page,html)
        result={'rooms':[],'native_webgl':True,'asset_transport':'offline injected, normal renderer',
            'browserVersion':browser.version,'userAgent':page.evaluate('navigator.userAgent')}
        result['driver']=page.evaluate("(()=>{const g=game.renderer.gl,d=g.getExtension('WEBGL_debug_renderer_info');return {version:g.getParameter(g.VERSION),vendor:d?g.getParameter(d.UNMASKED_VENDOR_WEBGL):g.getParameter(g.VENDOR),renderer:d?g.getParameter(d.UNMASKED_RENDERER_WEBGL):g.getParameter(g.RENDERER)}})()")
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
        page.evaluate(WATER_CHECK_SETUP)
        bounded=page.evaluate("()=>auditWater.parity('same-count editor')")
        assert bounded['mode']=='bounded' and bounded['legacyMode']=='bounded',bounded
        result['waterfield_bounded']=bounded

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
        page.locator('[data-editor-tool="select"]').click()
        page.locator('#editorChrome').click();editor_click(ins['x'],ins['y']);page.keyboard.press('Tab')
        assert page.locator('#editorToolbar').is_visible()
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
        page.locator('[data-editor-tool="select"]').click();page.locator('#editorChrome').click()
        editor_click(cyc['x'],cyc['y'],alt=True)
        first=page.evaluate("rmfEditor.selection[0]?.id");editor_click(cyc['x'],cyc['y'],alt=True);second=page.evaluate("rmfEditor.selection[0]?.id")
        page.keyboard.press('Tab');assert page.locator('#editorToolbar').is_visible()
        assert first in ('browser_cycle_a','browser_cycle_b') and second in ('browser_cycle_a','browser_cycle_b') and first!=second,(first,second)
        behavior['alt_cycle']=[first,second]

        # Hide/show an objective entirely through OBJECT canvas selection + toolbar action.
        obj=page.evaluate('''()=>{const item=rmfEditor.collectItems().find(i=>i.type==='objective');if(!item)throw Error('objective browser fixture missing');return{id:item.id,x:(item.bbox.x0+item.bbox.x1)/2,y:(item.bbox.y0+item.bbox.y1)/2,tile:item.tile}}''')
        page.locator('[data-editor-tool="object"]').click();page.locator('#editorChrome').click()
        editor_click(obj['x'],obj['y']);page.keyboard.press('Tab');assert page.locator('#editorToolbar').is_visible()
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
        page.locator('#editorChrome').click();editor_click(sup['x'],sup['y']);page.keyboard.press('Tab');assert page.locator('#editorToolbar').is_visible()
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
        result['waterfield_quality_matrix']=[]
        for quality in range(1,5):
            print('NATIVE WEBGL bounded water quality',quality,flush=True)
            result['waterfield_quality_matrix'].append(page.evaluate(WATER_QUALITY_CASE,quality))
        result['waterfield_fallbacks']=page.evaluate(WATER_FALLBACK_CASE)
        result['waterfield_optional_effect_faults']=page.evaluate(WATER_FAULT_CASE)
        page.add_script_tag(content=(ROOT/'tests/current/static_terrain_browser_415.js').read_text())
        @contextmanager
        def export_runtime():
            # Static failure diagnostics and their cleanup may alter caches or
            # leave a damaged GL context. Boot the same production sources in a
            # new context; do not warm, retry or relocate the export test cases.
            context=browser.new_context(viewport={'width':1280,'height':800})
            try:
                export_page=context.new_page()
                export_page.on('pageerror',lambda e:logs.append('export runtime: '+str(e)))
                export_page.on('console',lambda m:logs.append('export runtime '+m.type+': '+m.text) if m.type=='error' else None)
                boot_offline_runtime(export_page,html)
                export_page.add_script_tag(content=(ROOT/'tests/current/static_terrain_browser_415.js').read_text())
                result['raster_export_runtime']=export_page.evaluate("(()=>{const g=game.renderer.gl,d=g.getExtension('WEBGL_debug_renderer_info');return {isolatedContext:true,initialRoom:game.room.key,native:[game.renderer.nativeW,game.renderer.nativeH],userAgent:navigator.userAgent,driver:{version:g.getParameter(g.VERSION),vendor:d?g.getParameter(d.UNMASKED_VENDOR_WEBGL):g.getParameter(g.VENDOR),renderer:d?g.getParameter(d.UNMASKED_RENDERER_WEBGL):g.getParameter(g.RENDERER)}}})()")
                result['raster_export_runtime']['browserVersion']=browser.version
                yield export_page
            finally:
                context.close()
        run_final_native_gates(page,export_runtime,run_raster_export_checks,result,args.out,logs)
        print('NATIVE BROWSER WEBGL2 PASS: nine rooms, material/quality toggles, same-count invalidation, v4.15 right-click/inspector/cycle/recovery/dirty interactions, ghost geometry, UI input, q1-q4 bounded-water GPU/collision/history/fallback parity, bounded static textures and raster export/cache-pressure terrain parity; '+result['driver']['renderer'],flush=True)
        browser.close()
if __name__=='__main__':main()
