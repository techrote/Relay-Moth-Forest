"""Native raster-export cases for browser_render_regression_414.py.

Call run_raster_export_checks(page) after the normal offline runtime boots.
No transport, shader, Canvas2D or PNG implementation is replaced. Downloads are
captured, and selected encoder promises are delayed/rejected to test lifecycle.
"""

RASTER_EXPORT_CASE = r'''async()=>{
  const check=(ok,label)=>{if(!ok)throw Error('F8 raster export: '+label)};
  const difference=(a,b)=>{check(a.length===b.length,'pixel dimensions changed');let n=0;for(let i=0;i<a.length;i++)if(a[i]!==b[i])n++;return n};
  const pixels=c=>c.getContext('2d').getImageData(0,0,c.width,c.height).data;
  rmfEditor.flushForPersistence();
  const original={build:StaticPainter.prototype.build,encode:OffscreenCanvas.prototype.convertToBlob,
    download,downloadBlob,exportRaster,room:game.room,completed:game.state.completed,
    worldTheme:game.luts.themeForChannel('WORLD'),lutsUndo:game.luts.undo.slice(),editorActive:rmfEditor.active,
    flush:rmfEditor.flushForPersistence,mutable:game.renderMutablePresentation,mutableOwn:Object.hasOwn(game,'renderMutablePresentation')};
  const builds=[],issued=[],result={pixels:{},bridgeStages:[]};
  let runtimeBuilds=0,observePrivateBuild=null;
  StaticPainter.prototype.build=function(...args){
    if(this===game.painter)runtimeBuilds++;
    observePrivateBuild?.(this);
    const canvas=original.build.apply(this,args);
    builds.push({painter:this,canvas,normal:this.lastMaterialMaps?.normal,spec:this.lastMaterialMaps?.spec});return canvas;
  };
  const released=c=>!c||(c.width===1&&c.height===1);
  const assertReleased=label=>{
    check(builds.every(b=>released(b.canvas)&&released(b.normal)&&released(b.spec)),label+' left a backing canvas');
    for(const b of builds)if(b.painter.art!==game.art)check(b.painter.art.tintCache.size===0&&b.painter.art.normalTransformCache.size===0,label+' retained private derived cache entries');
  };
  const sourceFor=index=>{
    const source=Object.create(game);source.room=new Room(index,structuredClone(game.storyData.rooms[index]),structuredClone(game.maps));
    source.state=Object.create(game.state);source.state.completed=new Set();source.state.robots=new Set();return source;
  };
  const image=source=>{const s=buildRasterSnapshot(source);try{return pixels(s.canvas)}finally{releaseCanvasBacking(s.canvas)}};
  const decode=async blob=>{
    const bitmap=await createImageBitmap(blob),canvas=new OffscreenCanvas(bitmap.width,bitmap.height);
    try{canvas.getContext('2d').drawImage(bitmap,0,0);return {width:canvas.width,height:canvas.height,data:pixels(canvas)}}
    finally{bitmap.close();releaseCanvasBacking(canvas)}
  };
  try{
    // No mutation of the live room/state or GPU is needed for content oracles.
    const runtimePainter=Object.entries(game.painter),queues=['mutableNormal','mutableGlow','mutableHD'].map(k=>[k,JSON.stringify(game.renderer[k])]);
    const source=sourceFor(0);source.room.editorDecor=[];
    let before=image(source);source.room.editorDecor=[{sprite:'orb_orange',x:320,y:200,scale:2,alpha:1,flip:true,rot:.2}];
    result.pixels.authoredDecor=difference(before,image(source));check(result.pixels.authoredDecor>0,'authored decor absent');
    // Derive the reference center and dimensions from the actual runtime mutable
    // quad path. A bottom-anchored Canvas rotation shifts this sprite even when
    // all authored option values match; require exact pixels at the live pivot.
    const rotated=sourceFor(0),decor={sprite:'orb_orange',x:321,y:190,scale:1.3,alpha:.63,flip:true,rot:.37,tint_strength:0};
    rotated.room.editorDecor=[decor];rotated.renderMutablePresentation=function(){this.renderMutableEditorDecor()};
    const live=Object.create(rotated),captureRenderer=Object.create(game.renderer),runtimeDraws=[];
    captureRenderer.hdArt=rotated.art;captureRenderer.mutableHD=[];
    captureRenderer.addMutableHD=function(...args){runtimeDraws.push(args);return GLRenderer.prototype.addMutableHD.apply(this,args)};
    live.renderer=captureRenderer;live.renderMutableEditorDecor();
    check(runtimeDraws.length===1&&captureRenderer.mutableHD.length===54,'rotated runtime geometry fixture unavailable');
    const [name,cx,cy,w,h,alpha,rot,_tint,flip,tintStrength]=runtimeDraws[0];check(tintStrength===0,'geometry fixture must use untinted source pixels');
    const positionedReference=anchor=>{
      const painter=new StaticPainter(rotated.art,rotated.luts);let canvas=null;
      try{
        canvas=painter.build(rotated.room,rotated.state,640,360);
        rotated.art.draw(canvas.getContext('2d'),name,cx,anchor==='center'?cy:decor.y,w,h,{anchor,alpha,rot,flip,tintStrength:0});
        return pixels(canvas);
      }finally{releaseCanvasBacking(canvas);releaseCanvasBacking(painter.lastMaterialMaps?.normal);releaseCanvasBacking(painter.lastMaterialMaps?.spec);painter.lastMaterialMaps=null}
    };
    const runtimePosition=positionedReference('center');
    result.pixels.rotatedRuntimePositionMismatch=difference(runtimePosition,image(rotated));
    check(result.pixels.rotatedRuntimePositionMismatch===0,'rotated/flipped export differs from runtime center geometry');
    result.pixels.rotatedOldPivotDifference=difference(runtimePosition,positionedReference('bottom'));
    check(result.pixels.rotatedOldPivotDifference>0,'old bottom-pivot negative control did not move the sprite');
    source.room.editorDecor=[];
    const objective=source.room.spec.objects.find(o=>o.kind!=='pip');source.state.completed.add(objective.object_id);
    before=image(source);source.room.objectFxHidden.add(objective.object_id);
    result.pixels.completedObjective=difference(before,image(source));check(result.pixels.completedObjective>0,'completed objective/suppression absent');
    before=image(source);source.state.completed.clear();
    result.pixels.gateState=difference(before,image(source));check(result.pixels.gateState>0,'open/closed gate state absent');
    const generated=RelayProceduralDecor.enumerate(source.room,source.art.roles).find(d=>Array.isArray(d.tile));
    check(generated,'generated decor fixture unavailable');before=image(source);source.room.decorExclusions.add(generated.tile.join(','));
    result.pixels.generatedSuppression=difference(before,image(source));check(result.pixels.generatedSuppression>0,'generated decor/suppression absent');
    const home=sourceFor(4),robot=home.room.decorRobots.find(r=>r.id);check(robot,'robot fixture unavailable');
    before=image(home);home.state.robots.add(robot.id);
    result.pixels.robotRecruitment=difference(before,image(home));check(result.pixels.robotRecruitment>0,'unrecruited robot/recruitment absent');
    const tin=sourceFor(2);tin.room.objectFxHidden=new Set(tin.room.spec.objects.map(o=>o.object_id));before=image(tin);
    for(let stage=1;stage<=4;stage++){
      tin.room.bridgeProgress=stage;tin.room.bridgeBuilt=stage===4;tin.state.completed.add(tin.room.spec.objects[stage-1].object_id);
      const after=image(tin),changedBytes=difference(before,after);check(changedBytes>0,'bridge stage '+stage+' absent');
      result.bridgeStages.push({stage,changedBytes});before=after;
    }
    for(const [key,value] of runtimePainter)check(game.painter[key]===value,'changed runtime painter '+key);
    for(const [key,value] of queues)check(JSON.stringify(game.renderer[key])===value,'changed renderer queue '+key);
    check(runtimeBuilds===0,'persistent export used runtime painter');assertReleased('content checks');

    // Capture the real PNG. Defer encoding, navigate/change progress and LUTs,
    // then verify exact decoded pixels, names and sidecar still describe capture.
    rmfEditor.flushForPersistence();
    downloadBlob=(name,blob)=>issued.push({name,blob});download=(name,text)=>issued.push({name,data:JSON.parse(text)});
    const expected={room:game.room.key,completed:game.room.spec.objects.filter(o=>game.state.isDone(o.object_id)).map(o=>o.object_id),theme:game.luts.themeForChannel('WORLD'),data:image(game)};
    let finishEncoding=null;
    OffscreenCanvas.prototype.convertToBlob=function(options){const canvas=this;return new Promise((resolve,reject)=>{finishEncoding=()=>original.encode.call(canvas,options).then(resolve,reject)})};
    const pending=exportRaster(),count=builds.length;check(finishEncoding,'encoder did not start');check(issued.length===0,'download issued before PNG encoding');
    check(await exportRaster()===false&&builds.length===count,'concurrent export was not guarded');
    const pendingBuild=builds.at(-1);check(released(pendingBuild.normal)&&released(pendingBuild.spec),'material maps retained while encoding');
    check(pendingBuild.painter.art!==game.art&&pendingBuild.painter.art.tintCache.size===0&&pendingBuild.painter.art.normalTransformCache.size===0,'private derived caches retained while encoding');
    game.room=game.rooms[(game.room.index+1)%game.rooms.length];game.state.completed=new Set();game.luts.cycleTheme('WORLD');
    finishEncoding();check(await pending===true,'delayed export failed');
    check(issued.length===2,'missing PNG/JSON pair');
    check(issued[0].name===expected.room+'-pretty39952-static.png'&&issued[1].name===expected.room+'-pretty39952-static.json','filename followed later navigation');
    const semantic=issued[1].data;
    check(semantic.room===expected.room&&JSON.stringify(semantic.completed)===JSON.stringify(expected.completed)&&semantic.channels.WORLD===expected.theme,'metadata followed later edits');
    const png=await decode(issued[0].blob);check(png.width===640&&png.height===360,'PNG is not logical resolution');
    result.encodedPixelMismatch=difference(expected.data,png.data);check(result.encodedPixelMismatch===0,'encoded PNG does not match capture');
    result.capturedRoom=expected.room;assertReleased('delayed encode');
    game.room=original.room;game.state.completed=original.completed;game.luts.data.channels.WORLD.theme=original.worldTheme;game.luts.undo=original.lutsUndo.slice();

    // Failure must issue no orphan sidecar, release all backings and reset the
    // guard; the successful keyboard retry below exercises its recovery path.
    issued.length=0;OffscreenCanvas.prototype.convertToBlob=()=>Promise.reject(Error('intentional encoder failure'));
    check(await exportRaster()===false,'failed encoder reported success');check(!issued.length,'failed encoder issued a download');assertReleased('failed encode');
    game.renderMutablePresentation=()=>{throw Error('intentional composition failure')};
    check(await exportRaster()===false,'failed composition reported success');check(!issued.length,'failed composition issued a download');assertReleased('failed composition');
    if(original.mutableOwn)game.renderMutablePresentation=original.mutable;else delete game.renderMutablePresentation;
    OffscreenCanvas.prototype.convertToBlob=original.encode;

    // F8 can pass through the active editor, but keeps input isolation and does
    // not mark map data saved. A held key does not generate repeated exports.
    rmfEditor.toggle(true);let flushes=0,lastAttempt=null;
    rmfEditor.flushForPersistence=function(){flushes++;return original.flush.call(this)};
    exportRaster=()=>lastAttempt=original.exportRaster();
    const baseline=rmfEditor.savedBaseline;
    window.dispatchEvent(new KeyboardEvent('keydown',{key:'F8',bubbles:true,cancelable:true}));
    check(lastAttempt&&await lastAttempt===true,'F8 did not reach export through editor');
    check(flushes===1,'F8 missed editor flush');check(rmfEditor.savedBaseline===baseline,'raster export marked project saved');assertReleased('keyboard retry');
    const countAfter=builds.length;
    window.dispatchEvent(new KeyboardEvent('keydown',{key:'F8',repeat:true,bubbles:true,cancelable:true}));
    check(builds.length===countAfter,'held F8 exported repeatedly');
    const input=document.createElement('input');document.body.appendChild(input);
    try{input.dispatchEvent(new KeyboardEvent('keydown',{key:'F8',bubbles:true,cancelable:true}));check(builds.length===countAfter,'F8 escaped editor text-input isolation')}
    finally{input.remove()}
    result.keyboard={editorExport:true,inputIsolation:true,repeatSuppressed:true};
    result.failures={encodeCleaned:true,compositionCleaned:true,retrySucceeded:true};

    // Force real eviction within F8's private caches, then edit terrain before
    // any reference can warm runtime sources. Every runtime cache entry, its
    // order and backing, and all GPU textures must survive the export unchanged.
    const e=rmfEditor,r=game.renderer,art=game.art,audit=globalThis.auditStaticTerrain;
    check(audit?.capture&&audit?.instrument&&audit?.parity,'static GPU audit helpers unavailable');
    const saved={maps:game.maps,rooms:game.rooms,room:game.room,index:game.state.room,x:game.x,y:game.y,vx:game.vx,vy:game.vy,
      history:e.history,choice:e.choice,selection:e.selection,activeRoomKey:e.activeRoomKey,nextDecorId:e.nextDecorId,
      rectOwn:Object.hasOwn(r.c,'getBoundingClientRect'),rect:r.c.getBoundingClientRect,
      tintOwn:Object.hasOwn(art,'tintedRegion'),tint:art.tintedRegion,
      normalOwn:Object.hasOwn(art,'transformedNormal'),normal:art.transformedNormal,encode:OffscreenCanvas.prototype.convertToBlob};
    const restoreArt=()=>{
      if(saved.tintOwn)art.tintedRegion=saved.tint;else delete art.tintedRegion;
      if(saved.normalOwn)art.transformedNormal=saved.normal;else delete art.transformedNormal;
      observePrivateBuild=null;OffscreenCanvas.prototype.convertToBlob=saved.encode;
    };
    try{
      original.flush.call(e);e.clearPendingInvalidation();e.resetPointerState();
      const index=game.storyData.rooms.findIndex(spec=>spec.key==='quiet_nest'),sprite='lamp_blue';
      check(index>=0&&art.regions[sprite],'cache-pressure room/sprite unavailable');
      game.maps=structuredClone(saved.maps);game.rooms=saved.rooms.slice();
      const raw=game.maps.rooms.quiet_nest;
      for(const key of ['walls','water','path_cells'])raw[key]=(raw[key]||[]).filter(p=>p[0]!==2||p[1]!==2);
      if(raw.blocker_styles)delete raw.blocker_styles['2,2'];
      raw.large_trees=(raw.large_trees||[]).filter(t=>t.tile?.[0]!==2||t.tile?.[1]!==2);
      raw.decor_exclusions=(raw.decor_exclusions||[]).filter(p=>(Array.isArray(p)?p.join(','):String(p))!=='2,2');
      raw.floor_microtile=4;
      raw.editor_decor=Array.from({length:100},(_,i)=>({editor_id:'export_cache_'+i,sprite,x:200+(i%10)*12,y:80+Math.floor(i/10)*12,scale:.5,alpha:.65,element:'far_forest',tint_index:156,tint_strength:.200+i/1000}));
      const strengths=new Set(raw.editor_decor.map(d=>d.tint_strength.toFixed(3)));check(strengths.size===100,'pressure strengths are not distinct cache keys');
      game.rooms[index]=new Room(index,game.storyData.rooms[index],game.maps);game.room=game.rooms[index];game.state.room=index;
      e.history=new Map();e.syncRoomContext();e.selection=[];game.x=80;game.y=200;
      const box=r.c.getBoundingClientRect(),dpr=Math.max(1,globalThis.devicePixelRatio||1);
      r.c.getBoundingClientRect=()=>({x:box.x,y:box.y,left:box.left,top:box.top,right:box.left+997/dpr,bottom:box.top+563/dpr,width:997/dpr,height:563/dpr});
      r.resizeToDisplaySize(true);game.ensureBackground(true);
      check(r.nativeW===997&&r.nativeH===563,'pressure baseline native size changed');
      check(!game.room.border.has('2,2')&&!game.room.walls.has('2,2')&&!game.room.water.has('2,2')&&!game.room.paths.has('2,2'),'pressure edit cell is not authoritative ground');
      const before=audit.capture(),textureKeys=['bgTex','bgNormalTex','bgSpecTex'];
      const baseline={handles:textureKeys.map(key=>r[key]),revision:r.backgroundRevision,staticRevision:game.staticBackgroundRevision,
        snapshot:game.staticTerrainSnapshot,bgKey:game.bgKey,stats:game.staticRefreshStats,uploads:r.backgroundUploadCalls,bytes:r.backgroundUploadBytes,
        normalGeneration:art.normalTransformGeneration,runtimeBuilds,builds:builds.length,downloads:issued.length,
        caches:['tintCache','normalTransformCache'].map(name=>({name,map:art[name],entries:[...art[name]].map(([key,canvas])=>({key,canvas,width:canvas.width,height:canvas.height}))}))};
      const owners=new Set(),seenTints=new Set(),seenNormals=new Set(),evicted=new Set(),requestedKeys=new Set();
      let peakTintSize=0,peakNormalSize=0,privateReleasedBeforeEncode=false;
      const assertRuntimeCaches=()=>{
        check(art.normalTransformGeneration===baseline.normalGeneration,'F8 changed runtime normal generation');
        for(const cache of baseline.caches){
          check(art[cache.name]===cache.map,'F8 replaced runtime '+cache.name);const current=[...cache.map];
          check(current.length===cache.entries.length,'F8 changed runtime cache size');
          cache.entries.forEach((entry,i)=>check(current[i][0]===entry.key&&current[i][1]===entry.canvas&&entry.canvas.width===entry.width&&entry.canvas.height===entry.height,'F8 changed a runtime cache entry, order, identity or backing'));
        }
      };
      observePrivateBuild=painter=>{
        const owner=painter.art;check(owner!==art,'F8 reused the runtime cache owner');owners.add(owner);
        for(const name of ['tintCache','normalTransformCache'])check(Object.hasOwn(owner,name)&&owner[name]!==art[name]&&owner[name].size===0,'F8 copied borrowed cache entries');
        check(Object.hasOwn(owner,'normalTransformGeneration')&&owner.normalTransformGeneration===0,'F8 did not start an independent normal generation');
        for(const name of ['img','bumpImg','normalImg','specImg','regions','meta','roles','worldScale'])check(owner[name]===art[name],'F8 lost current shared atlas authority '+name);
      };
      const observeEviction=(owner,name,prior)=>{
        const active=new Set(owner[name].values());for(const canvas of prior)if(!active.has(canvas)){check(released(canvas),'private cache eviction retained a backing');evicted.add(canvas)}
        peakTintSize=Math.max(peakTintSize,owner.tintCache.size);peakNormalSize=Math.max(peakNormalSize,owner.normalTransformCache.size);
      };
      art.tintedRegion=function(name,colour,strength){
        check(this!==art&&owners.has(this),'F8 requested a runtime tint source');
        const prior=new Set(this.tintCache.values()),canvas=saved.tint.call(this,name,colour,strength);seenTints.add(canvas);observeEviction(this,'tintCache',prior);
        if(name===sprite&&strengths.has(strength.toFixed(3))){
          const entry=[...this.tintCache].find(([,value])=>value===canvas);check(entry,'returned tint is not cache-owned');requestedKeys.add(entry[0]);
        }
        return canvas;
      };
      art.transformedNormal=function(...args){
        check(this!==art&&owners.has(this),'F8 requested a runtime transformed normal');
        const prior=new Set(this.normalTransformCache.values()),canvas=saved.normal.apply(this,args);if(canvas)seenNormals.add(canvas);observeEviction(this,'normalTransformCache',prior);return canvas;
      };
      const assertPrivateReleased=()=>{
        check(owners.size===1&&seenTints.size>100&&seenNormals.size>0,'F8 did not exercise one independent color/material cache owner');
        for(const owner of owners)check(owner.tintCache.size===0&&owner.normalTransformCache.size===0,'F8 retained private cache entries');
        check([...seenTints,...seenNormals].every(released),'F8 retained a private derived canvas');assertRuntimeCaches();
      };
      OffscreenCanvas.prototype.convertToBlob=function(options){assertPrivateReleased();privateReleasedBeforeEncode=true;return saved.encode.call(this,options)};
      lastAttempt=null;window.dispatchEvent(new KeyboardEvent('keydown',{key:'F8',bubbles:true,cancelable:true}));
      check(lastAttempt&&await lastAttempt===true,'cache-pressure F8 export failed');restoreArt();
      check(builds.length===baseline.builds+1&&runtimeBuilds===baseline.runtimeBuilds,'F8 rebuilt the runtime static painter');
      check(issued.length===baseline.downloads+2,'cache-pressure F8 missed its PNG/sidecar');assertReleased('cache-pressure F8');
      const afterExport=audit.capture(),exportMismatch=afterExport.maps.map((bytes,i)=>difference(before.maps[i],bytes));
      check(afterExport.width===before.width&&afterExport.height===before.height&&exportMismatch.every(n=>n===0),'F8 changed existing GPU texture bytes');
      check(textureKeys.every((key,i)=>r[key]===baseline.handles[i])&&r.backgroundReady&&r.backgroundRevision===baseline.revision&&game.staticBackgroundRevision===baseline.staticRevision,'F8 replaced textures or changed the background revision');
      check(game.staticTerrainSnapshot===baseline.snapshot&&game.bgKey===baseline.bgKey&&game.staticRefreshStats===baseline.stats,'F8 invalidated static authority');
      check(r.backgroundUploadCalls===baseline.uploads&&r.backgroundUploadBytes===baseline.bytes,'F8 uploaded a runtime background');
      assertPrivateReleased();check(privateReleasedBeforeEncode,'F8 retained derived surfaces into PNG encoding');
      check(requestedKeys.size===100,'F8 did not execute all 100 distinct authored tint requests');
      check(evicted.size>0&&[...evicted].every(released),'private tint pressure did not release evicted sources');
      check(peakTintSize<=96&&peakNormalSize<=96&&art.tintCache.size<=96&&art.normalTransformCache.size<=96,'F8 exceeded an art-cache bound');
      const pressureEvidence={authoredTintKeys:requestedKeys.size,privateArtOwners:owners.size,privateTintSources:seenTints.size,privateNormalSources:seenNormals.size,
        evictedSources:evicted.size,evictedBaselineSources:0,peakTintCache:peakTintSize,peakNormalCache:peakNormalSize,
        runtimeCachesUnchanged:true,runtimeCacheCounts:baseline.caches.map(c=>({name:c.name,entries:c.entries.length})),privateReleasedBeforeEncode,
        exportTextureMismatch:exportMismatch,exportAuthorityUnchanged:true,normalGenerationBefore:baseline.normalGeneration,normalGenerationAfter:art.normalTransformGeneration};

      // No full reference, render or other cache-warming operation is permitted
      // between F8 above and this first real editor transaction.
      const work=audit.instrument(()=>{
        check(e.beginTransaction('terrain immediately after F8'),'post-export transaction did not begin');
        e.choice={kind:'path'};e.paintVisited.clear();e.paintAt({x:40,y:40});check(e.commitTransaction(),'post-export transaction did not commit');
      });
      check(game.room.paths.has('2,2')&&e.rawRoom().path_cells.some(p=>p[0]===2&&p[1]===2),'post-export edit lost authoritative terrain');
      check(work.diagnostics.mode==='patch'&&work.diagnostics.reason==='terrain'&&work.diagnostics.changedCells===1,'post-export terrain did not remain eligible');
      check(work.fullBuilds===0&&work.fullUploads.length===0&&work.patchBuilds===1&&work.floorCalls===25,'post-export edit rebuilt full terrain or lost its bounded floor inputs');
      const rowReads=work.readbacks.filter(read=>read.staticPatch),region=work.diagnostics.regions[0];
      check(work.diagnostics.colorPolicy===StaticPainter.COLOR_POLICY&&rowReads.length===5&&rowReads.every((read,i)=>read.patchColor&&read.x===0&&read.y===0&&read.width===1&&read.height===1&&read.beforeOverlays&&read.lastFloor?.tx===region.tx1-1&&read.lastFloor?.ty===region.ty0+i),'post-export edit did not retain bounded color row synchronization');
      check(['colorSyncAttempts','colorSyncReads','colorSyncPixels','readbackPixels'].every(key=>work.diagnostics[key]===5)&&Number.isFinite(work.diagnostics.colorSyncMs)&&work.diagnostics.colorSyncMs>=0,'post-export synchronization accounting differs from actual reads');
      check(work.subUploads.length===1&&work.subUploads[0].channel==='color'&&work.subUploads[0].x===49&&work.subUploads[0].y===484&&work.subUploads[0].width===31&&work.subUploads[0].height===29,'post-export edit did not issue the expected color-only crop');
      check(work.patchMaterialMaps===0&&work.normalTransformRequests===0&&work.materialHandlesUnchanged&&work.normalSourceGenerationUnchanged,'post-export edit changed material resources');
      check(work.releasedPatchCanvases&&work.unpackRestored&&!game.currentStatic&&!game.painter.lastMaterialMaps,'post-export edit retained scratch or changed unpack state');
      const capacity=997*563,allocations=work.patchContextAllocations.filter(c=>c.explicitAlpha===false);
      check(allocations.length===1&&allocations[0].width===997&&allocations[0].height===563&&work.peakLiveScratchPixels===capacity,'post-export redraw did not preserve its bounded native target capacity');
      check(work.patchClips.length===1&&JSON.stringify(work.patchClips[0].rectangles)===JSON.stringify([[16,16,96,96]]),'post-export redraw lost its independently observed local guard clip');
      check(work.diagnostics.scratchMode==='native-clip'&&work.diagnostics.rasterPixels===96*96&&work.diagnostics.scratchPixels===capacity&&work.diagnostics.scratchBytes===capacity*4&&work.diagnostics.uploadBytes===31*29*4,'post-export capacity/redraw/upload accounting changed');
      check(work.diagnostics.scratchAllocationAttempts===1&&work.diagnostics.scratchAllocations===1&&work.diagnostics.scratchAllocationPixels===capacity&&work.diagnostics.scratchAllocationBytes===capacity*4,'post-export cumulative allocation accounting changed');
      let textures;
      try{textures=audit.parity('terrain immediately after F8 tint-cache pressure',before,work.subUploads,baseline.snapshot)}
      catch(error){
        if(window.__staticRasterDiagnostics)window.__staticRasterDiagnostics.exportPressure={...pressureEvidence,work};
        throw error;
      }
      result.exportThenTerrain={native:[997,563],...pressureEvidence,work,textures};
      assertReleased('post-export terrain reference');
    }finally{
      restoreArt();if(e.transaction)e.cancelTransaction(false);e.clearPendingInvalidation();e.resetPointerState();
      game.maps=saved.maps;game.rooms=saved.rooms;game.room=saved.room;game.state.room=saved.index;
      game.x=saved.x;game.y=saved.y;game.vx=saved.vx;game.vy=saved.vy;
      e.history=saved.history;e.choice=saved.choice;e.selection=saved.selection;e.activeRoomKey=saved.activeRoomKey;e.nextDecorId=saved.nextDecorId;
      if(saved.rectOwn)r.c.getBoundingClientRect=saved.rect;else delete r.c.getBoundingClientRect;
      r.resizeToDisplaySize(true);game.ensureBackground(true);e.renderOverlay();e.updateStatus();
    }
    return result;
  }finally{
    StaticPainter.prototype.build=original.build;OffscreenCanvas.prototype.convertToBlob=original.encode;
    download=original.download;downloadBlob=original.downloadBlob;exportRaster=original.exportRaster;
    game.room=original.room;game.state.completed=original.completed;game.luts.data.channels.WORLD.theme=original.worldTheme;game.luts.undo=original.lutsUndo;
    if(original.mutableOwn)game.renderMutablePresentation=original.mutable;else delete game.renderMutablePresentation;
    rmfEditor.flushForPersistence=original.flush;
    if(rmfEditor.active!==original.editorActive)rmfEditor.toggle(original.editorActive);
  }
}'''


def run_raster_export_checks(page):
    return page.evaluate(RASTER_EXPORT_CASE)
