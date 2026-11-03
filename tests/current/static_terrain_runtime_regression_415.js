'use strict';
const assert=require('assert');
const fs=require('fs');
const path=require('path');
const vm=require('vm');
const ROOT=path.resolve(__dirname,'../..');
const terrain=require(path.join(ROOT,'static_terrain.js'));
const gameSource=fs.readFileSync(path.join(ROOT,'game.js'),'utf8');
const source=(start,end)=>{const a=gameSource.indexOf(start),b=gameSource.indexOf(end,a+start.length);assert(a>=0&&b>a);return gameSource.slice(a,b)};
const allocations=[],phases=[],faults={allocationAt:0,rasterAt:0,allocationCalls:0,rasterCalls:0};
class FakeCanvas{
  constructor(width,height){if(++faults.allocationCalls===faults.allocationAt)throw new Error('injected canvas allocation failure');this.width=width;this.height=height;this.originalWidth=width;this.originalHeight=height;this.context=new FakeContext(this);allocations.push(this)}
  getContext(kind){assert.strictEqual(kind,'2d');return this.context}
}
class FakeContext{
  constructor(canvas){this.canvas=canvas;this.transforms=[];this.matrix=[1,0,0,1,0,0];this.stack=[]}
  // Record the effective matrix at drawing/restoration boundaries, so the first
  // entry remains the full native transform after translate followed by scale.
  recordTransform(){const last=this.transforms.at(-1);if(!last||this.matrix.some((value,i)=>value!==last[i]))this.transforms.push([...this.matrix])}
  setTransform(...values){assert(values.length===6&&values.every(Number.isFinite));this.matrix=[...values]}
  translate(x,y){assert(Number.isFinite(x)&&Number.isFinite(y));const[a,b,c,d,e,f]=this.matrix;this.matrix=[a,b,c,d,e+a*x+c*y,f+b*x+d*y]}
  scale(x,y){assert(Number.isFinite(x)&&Number.isFinite(y));const[a,b,c,d,e,f]=this.matrix;this.matrix=[a*x,b*x,c*y,d*y,e,f]}
  rotate(angle){assert(Number.isFinite(angle));const[a,b,c,d,e,f]=this.matrix,co=Math.cos(angle),si=Math.sin(angle);this.matrix=[a*co+c*si,b*co+d*si,-a*si+c*co,-b*si+d*co,e,f]}
  save(){this.stack.push([...this.matrix])}
  restore(){this.recordTransform();if(this.stack.length)this.matrix=this.stack.pop()}
  createLinearGradient(){return{addColorStop(){}}}
  createRadialGradient(){return{addColorStop(){}}}
  fillRect(){this.recordTransform();if(++faults.rasterCalls===faults.rasterAt)throw new Error('injected floor raster failure')}
  clearRect(){this.recordTransform()}beginPath(){}arc(){this.recordTransform()}fill(){this.recordTransform()}strokeRect(){this.recordTransform()}
}
const sandbox={OffscreenCanvas:FakeCanvas,RelayStaticTerrain:terrain,perfMeasure:(name,fn)=>{phases.push(name);return fn()}};
const production=vm.runInNewContext(`
  const W=640,H=360,TILE=16,FLOOR_TILE=4,GRID_W=40,GRID_H=19,PLAY_H=304,BOTTOM_H=56,TAU=Math.PI*2;
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  ${source('function hash32(','\nfunction h01(')}
  ${source('function releaseCanvasBacking(','\n\n// PERF-001A:')}
  ${source('class Room{','\n// Low-cost steering helpers')}
  ${source('class StaticPainter{','\nclass SpriteAtlas')}
  ${source('class GLRenderer{','\nclass ParticleField')}
  ${source('class Game{','\nlet game=null')}
  ({Room,StaticPainter,GLRenderer,Game});
`,sandbox);

function fakeGL(){
  const gl={TEXTURE_2D:3553,RGBA:6408,UNSIGNED_BYTE:5121,UNPACK_FLIP_Y_WEBGL:37440,UNPACK_SKIP_PIXELS:3316,UNPACK_SKIP_ROWS:3315,NO_ERROR:0,uploads:[],pixelStores:[],parameterQueries:[],fullCount:0,subCount:0,flip:false,skipPixels:0,skipRows:0,bound:null,lost:false,error:0,failFullAt:0,failSubAt:0,errorSubAt:0,hook:null};
  gl.bindTexture=(_target,texture)=>{gl.bound=texture};
  const storeKey=name=>{const key=new Map([[gl.UNPACK_FLIP_Y_WEBGL,'flip'],[gl.UNPACK_SKIP_PIXELS,'skipPixels'],[gl.UNPACK_SKIP_ROWS,'skipRows']]).get(name);assert(key,'unexpected pixel store');return key};
  gl.pixelStorei=(name,value)=>{gl[storeKey(name)]=value;gl.pixelStores.push([name,value])};
  gl.getParameter=name=>{gl.parameterQueries.push(name);return gl[storeKey(name)]};
  gl.texImage2D=(...args)=>{
    gl.fullCount++;const canvas=args[5];assert(canvas instanceof FakeCanvas,'full path uploads the production painter canvas');
    gl.uploads.push({mode:'full',texture:gl.bound,width:canvas.width,height:canvas.height,flip:gl.flip});gl.hook?.('full',canvas);
    if(gl.fullCount===gl.failFullAt)throw new Error('injected full upload failure');
  };
  gl.texSubImage2D=(...args)=>{
    assert.strictEqual(args.length,9,'guarded source uses the explicit-size TexImageSource overload');
    gl.subCount++;const canvas=args[8],width=args[4],height=args[5];assert(canvas instanceof FakeCanvas,'patch path uploads guarded canvas directly');
    assert.strictEqual(args[6],gl.RGBA);assert.strictEqual(args[7],gl.UNSIGNED_BYTE);
    assert([width,height,gl.skipPixels,gl.skipRows].every(Number.isInteger)&&width>0&&height>0&&gl.skipPixels>=0&&gl.skipRows>=0,'invalid source crop geometry');
    assert(gl.skipPixels+width<=canvas.width&&gl.skipRows+height<=canvas.height,'source crop must fit all three guarded maps');
    gl.uploads.push({mode:'patch',texture:gl.bound,x:args[2],y:args[3],width,height,sourceWidth:canvas.width,sourceHeight:canvas.height,skipPixels:gl.skipPixels,skipRows:gl.skipRows,flip:gl.flip});gl.hook?.('patch',canvas);
    if(gl.subCount===gl.errorSubAt)gl.error=1282;
    if(gl.subCount===gl.failSubAt)throw new Error('injected subupload failure');
  };
  gl.isContextLost=()=>gl.lost;
  gl.getError=()=>{const value=gl.error;gl.error=0;return value};
  return gl;
}
function renderer(){const r=Object.create(production.GLRenderer.prototype);Object.assign(r,{gl:fakeGL(),nativeW:640,nativeH:360,bgTex:'color',bgNormalTex:'normal',bgSpecTex:'specular',backgroundRevision:0,backgroundUploadCalls:0,backgroundUploadBytes:0,backgroundReady:false});return r}
function fixture(){
  const g=Object.create(production.Game.prototype),spec={key:'fixture',pattern:'fixture',objects:[]},maps={rooms:{fixture:{walls:[],water:[],path_cells:[],floor_microtile:4}}};
  Object.assign(g,{maps,room:new production.Room(0,spec,maps),state:{isDone:()=>false,roomComplete:()=>false},renderer:renderer(),uiCalls:0});g.room.border.clear();
  g.art={img:{src:'color.png',width:64,height:64},normalImg:{src:'normal.png',width:64,height:64},specImg:{src:'spec.png',width:64,height:64},regions:{},meta:{},roles:{},worldScale:.18,tintCache:new Map(),normalTransformCache:new Map(),normalTransformGeneration:0,trimTintCache(){}};
  g.luts={data:{test:['#123456']},elementChannel:new Map([['ground','ground']]),signature:()=> 'unchanged-theme',hex:()=> '#123456'};
  g.painter=new production.StaticPainter(g.art,g.luts);g.updateUI=()=>{g.uiCalls++};
  return g;
}
function released(g,from=0){
  for(const canvas of allocations.slice(from))assert(canvas.width===1&&canvas.height===1,'every transient canvas backing must be released');
  assert.strictEqual(g.painter.lastMaterialMaps,null);assert.strictEqual(g.painter.materialNormalCtx,null);assert.strictEqual(g.painter.materialSpecCtx,null);
  assert(!g.currentStatic,'full-size CPU color backing must not be retained');
  assert.strictEqual(g.renderer.gl.flip,false,'pixel unpack state must be restored');
  assert.strictEqual(g.renderer.gl.skipPixels,0,'pixel unpack column crop must be restored');assert.strictEqual(g.renderer.gl.skipRows,0,'pixel unpack row crop must be restored');
}
function refresh(g){
  const first=allocations.length,result=g.refreshEditorStatic();released(g,first);assert.strictEqual(result.retainedScratchPixels,0);assert.strictEqual(g.staticBackgroundRevision,g.renderer.backgroundRevision);
  const fullPixels=result.mode==='full'?g.renderer.nativeW*g.renderer.nativeH:0,regions=result.regions;
  const rasterAreas=regions.map(r=>r.rasterWidth*r.rasterHeight);
  assert.strictEqual(result.pixels,fullPixels+regions.reduce((n,r)=>n+r.width*r.height,0),'upload work uses output bounds');
  assert.strictEqual(result.rasterPixels,fullPixels+rasterAreas.reduce((n,area)=>n+area,0),'raster work includes every guarded surface and any full repair');
  assert.strictEqual(result.scratchPixels,Math.max(fullPixels,...rasterAreas,0),'scratch budget uses the largest guarded surface');assert.strictEqual(result.scratchBytes,result.scratchPixels*12);
  if(result.mode==='patch'){
    const created=allocations.slice(first);assert.strictEqual(created.length,regions.length*3,'no intermediate crop canvases are allocated');
    regions.forEach((region,i)=>{for(const canvas of created.slice(i*3,i*3+3)){
      assert.strictEqual(canvas.originalWidth,region.rasterWidth);assert.strictEqual(canvas.originalHeight,region.rasterHeight);
      assert.deepStrictEqual(canvas.context.transforms[0],[g.renderer.nativeW/640,0,0,g.renderer.nativeH/360,region.rasterX?-region.rasterX:0,region.rasterY?-region.rasterY:0],'guarded raster translates from source origin, not output origin');
    }});
  }
  return result;
}
function observeCommit(g,previous){let calls=0;g.renderer.gl.hook=()=>{assert.strictEqual(g.staticTerrainSnapshot,previous,'snapshot must commit only after every material upload succeeds');assert.strictEqual(g.renderer.backgroundReady,false,'partial material upload is never marked ready');calls++};return()=>{g.renderer.gl.hook=null;return calls}}
let scenarios=0;

function fullPatchNoopAndHistory(){
  const g=fixture(),r=g.renderer,gl=r.gl;
  let finish=observeCommit(g,undefined),stats=refresh(g);assert.strictEqual(finish(),3);
  assert.strictEqual(stats.mode,'full');assert.strictEqual(stats.reason,'missing-baseline');assert.strictEqual(stats.rasterCells,760);assert.strictEqual(stats.uploadCalls,3);assert.strictEqual(stats.uploadBytes,640*360*12);assert.strictEqual(r.backgroundRevision,1);assert(g.staticTerrainSnapshot.valid&&g.bgKey);
  let previous=g.staticTerrainSnapshot;g.room.water.add('6,7');finish=observeCommit(g,previous);stats=refresh(g);assert.strictEqual(finish(),3);
  assert.strictEqual(stats.mode,'patch');assert.strictEqual(stats.uploadCalls,3);assert.strictEqual(gl.fullCount,3,'eligible patch must not use texImage2D');assert(stats.rasterCells<=81&&stats.pixels<640*360);assert.strictEqual(stats.uploadBytes,stats.pixels*12);assert.strictEqual(stats.scratchBytes,stats.scratchPixels*12);assert.strictEqual(g.staticTerrainSnapshot.cellTypes[7*40+6],terrain.CELL_TYPES.water);assert.strictEqual(r.backgroundRevision,2);
  const firstRegion=stats.regions[0],upload=gl.uploads.find(x=>x.mode==='patch');assert.strictEqual(upload.x,firstRegion.x);assert.strictEqual(upload.y,360-firstRegion.y-firstRegion.height,'native y offset must account for flipped texture storage');assert(gl.uploads.every(u=>u.flip===true));
  assert.strictEqual(upload.width,firstRegion.width);assert.strictEqual(upload.height,firstRegion.height);assert.strictEqual(upload.sourceWidth,firstRegion.rasterWidth);assert.strictEqual(upload.sourceHeight,firstRegion.rasterHeight);
  assert.strictEqual(upload.skipPixels,firstRegion.x-firstRegion.rasterX);assert.strictEqual(upload.skipRows,firstRegion.rasterHeight-(firstRegion.y-firstRegion.rasterY)-firstRegion.height);assert(stats.rasterPixels>stats.pixels,'filtering guard must be rastered without being uploaded');
  const count=allocations.length;stats=refresh(g);assert.strictEqual(stats.mode,'noop');assert.strictEqual(stats.uploadCalls,0);assert.strictEqual(stats.rasterCells,0);assert.strictEqual(stats.pixels,0);assert.strictEqual(stats.scratchPixels,0);assert.strictEqual(allocations.length,count,'unchanged static state creates no canvases');assert.strictEqual(r.backgroundRevision,2);
  g.room.water.delete('6,7');g.room.water.add('30,14');stats=refresh(g);assert.strictEqual(stats.mode,'patch');assert.strictEqual(stats.changedCells,2);assert.strictEqual(stats.regions.length,2);assert.strictEqual(stats.uploadCalls,6);assert(stats.rasterCells<=162&&stats.pixels<10000);assert.strictEqual(r.backgroundRevision,4);
  // Production editor history replaces one raw room and rebinds Room while
  // retaining the source map. The runtime must accept this as a bounded delta.
  g.maps.rooms.fixture={walls:[],water:[[6,7]],path_cells:[],floor_microtile:4};g.room=new production.Room(0,g.room.spec,g.maps);g.room.border.clear();stats=refresh(g);assert.strictEqual(stats.mode,'patch');assert.strictEqual(stats.changedCells,2);
  g.maps.rooms.fixture.water=[[30,14]];g.room=new production.Room(0,g.room.spec,g.maps);g.room.border.clear();stats=refresh(g);assert.strictEqual(stats.mode,'patch');assert.strictEqual(stats.changedCells,2);
  assert(phases.includes('static.plan')&&phases.includes('static.patch.floor')&&phases.includes('static.patch.overlays-materials')&&phases.includes('static.patch.upload.normal')&&phases.includes('static.patch.upload.specular'));
  scenarios+=7;
}

function staticIdentityAndStaleness(){
  const g=fixture();refresh(g);
  g.maps={...g.maps};assert.strictEqual(refresh(g).reason,'identity:sourceRef');
  g.renderer.backgroundRevision++;assert.strictEqual(refresh(g).reason,'stale-background');
  g.renderer.backgroundReady=false;assert.strictEqual(refresh(g).reason,'stale-background');
  g.renderer=renderer();assert.strictEqual(refresh(g).mode,'full');
  g.renderer.nativeW=997;g.renderer.nativeH=563;assert.strictEqual(refresh(g).reason,'dimensions');assert.deepStrictEqual(Array.from(g.renderer.backgroundSize),[997,563]);
  g.luts.data.test[0]='#654321';assert.strictEqual(refresh(g).reason,'lut','in-place palette changes invalidate even with identical theme name');
  for(const kind of ['regions','roles','meta']){
    const tint=new FakeCanvas(17,23),normal=new FakeCanvas(19,29);g.art.tintCache.set('derived',tint);g.art.normalTransformCache.set('derived',normal);
    g.art[kind].changed='same-length';assert.strictEqual(refresh(g).reason,'resource');assert.strictEqual(g.art.tintCache.size,0);assert.strictEqual(g.art.normalTransformCache.size,0);assert.strictEqual(tint.width,1);assert.strictEqual(normal.width,1);
  }
  const tint=new FakeCanvas(17,23);g.art.tintCache.set('image-derived',tint);g.art.img={...g.art.img};assert.strictEqual(refresh(g).reason,'identity:atlasRef');assert.strictEqual(tint.width,1);
  g.art.normalImg={...g.art.normalImg};assert.strictEqual(refresh(g).reason,'identity:normalRef');
  g.art.specImg={...g.art.specImg};assert.strictEqual(refresh(g).reason,'identity:specularRef');
  g.art.img.src='reloaded-color.png';assert.strictEqual(refresh(g).reason,'resource','an existing image object can acquire another resource');
  assert.strictEqual(g.refreshEditorStatic({force:true}).reason,'forced');released(g);
  const before=g.staticTerrainSnapshot;g.art.meta.cycle=g.art.meta;assert.strictEqual(refresh(g).reason,'invalid-context');assert.strictEqual(g.staticTerrainSnapshot,null,'unserializable resources cannot become a trusted patch baseline');delete g.art.meta.cycle;assert.strictEqual(refresh(g).mode,'full');assert.notStrictEqual(g.staticTerrainSnapshot,before);
  const planner=sandbox.RelayStaticTerrain;sandbox.RelayStaticTerrain=null;assert.strictEqual(refresh(g).reason,'planner-unavailable');assert.strictEqual(g.staticTerrainSnapshot,null);sandbox.RelayStaticTerrain=planner;assert.strictEqual(refresh(g).mode,'full');
  scenarios+=17;
}

function normalSourceGeneration(){
  // A source created outside this static update may leave the uploaded normal
  // texture sampling older canvas identities. Reject the patch before raster.
  {
    const g=fixture();g.art.normalTransformGeneration=11;refresh(g);
    assert.strictEqual(g.staticNormalTransformGeneration,11,'full build records the generation it actually uploaded');
    const gl=g.renderer.gl,first=allocations.length,sub=gl.subCount;
    g.art.normalTransformGeneration+=2;g.room.water.add('6,7');
    g.painter.buildPatch=()=>{throw Error('upfront source pressure must not raster a patch')};
    const stats=refresh(g);assert.strictEqual(stats.mode,'full');assert.strictEqual(stats.reason,'normal-cache-pressure');assert.strictEqual(stats.repairError,undefined);
    assert.strictEqual(stats.regions.length,0);assert.strictEqual(stats.rasterCells,760);assert.strictEqual(stats.uploadCalls,3);assert.strictEqual(gl.subCount,sub);
    assert.strictEqual(allocations.length-first,3,'upfront source pressure allocates only the full repair maps');assert.strictEqual(g.staticNormalTransformGeneration,13);scenarios++;
  }
  // A no-op performs no upload and therefore cannot bless a newer generation.
  // Once repaired, a stable generation must allow genuinely bounded work.
  {
    const g=fixture();refresh(g);const first=allocations.length,revision=g.renderer.backgroundRevision;
    g.art.normalTransformGeneration=7;
    for(let i=0;i<2;i++){
      const stats=refresh(g);assert.strictEqual(stats.mode,'noop');assert.strictEqual(stats.uploadCalls,0);assert.strictEqual(allocations.length,first);
      assert.strictEqual(g.staticNormalTransformGeneration,0,'no-op must preserve the uploaded generation');assert.strictEqual(g.renderer.backgroundRevision,revision);
    }
    g.room.water.add('6,7');let stats=refresh(g);assert.strictEqual(stats.mode,'full');assert.strictEqual(stats.reason,'normal-cache-pressure');assert.strictEqual(g.staticNormalTransformGeneration,7);
    const full=g.renderer.gl.fullCount;g.room.water.add('30,14');stats=refresh(g);
    assert.strictEqual(stats.mode,'patch');assert.strictEqual(stats.uploadCalls,3);assert.strictEqual(g.renderer.gl.fullCount,full);assert.strictEqual(g.staticNormalTransformGeneration,7);assert(stats.scratchPixels<640*360);scenarios+=3;
  }
  // A cache miss discovered while replaying either the first or a later region
  // must discard that region before uploading any of its three material maps.
  for(const missAt of [1,2]){
    const g=fixture();refresh(g);const gl=g.renderer.gl,previous=g.staticTerrainSnapshot,revision=g.renderer.backgroundRevision,first=allocations.length;
    g.room.water.add('6,7');g.room.water.add('30,14');
    const patch=g.painter.buildPatch,build=g.painter.build,uploaded=[];let patches=0,changedScratch=null,repairs=0;
    g.painter.buildPatch=function(...args){const canvas=patch.apply(this,args);if(++patches===missAt){g.art.normalTransformGeneration++;changedScratch=[canvas,this.lastMaterialMaps.normal,this.lastMaterialMaps.spec]}return canvas};
    g.painter.build=function(...args){
      repairs++;assert(changedScratch.every(c=>c.width===1&&c.height===1),'changed-source scratch must be released before full repair');
      const canvas=build.apply(this,args);g.art.normalTransformGeneration+=3;return canvas;
    };
    const finish=observeCommit(g,previous),observe=gl.hook;
    gl.hook=(mode,canvas)=>{observe(mode,canvas);assert.strictEqual(g.staticNormalTransformGeneration,0,'generation authority cannot advance during material uploads');uploaded.push(canvas)};
    const stats=refresh(g);assert.strictEqual(finish(),3*missAt);assert.strictEqual(patches,missAt);assert.strictEqual(repairs,1,'source change is synchronously repaired once');
    assert.strictEqual(stats.mode,'full');assert.strictEqual(stats.reason,'normal-cache-pressure');assert.match(stats.repairError,/normal source cache changed/i);
    assert.strictEqual(gl.subCount,3*(missAt-1));assert.strictEqual(gl.fullCount,6);assert.strictEqual(stats.uploadCalls,3*missAt);
    assert(changedScratch.every(c=>!uploaded.includes(c)),'a changed-source region must never reach the GPU');
    assert.strictEqual(g.renderer.backgroundRevision,revision+missAt);assert.strictEqual(g.renderer.backgroundReady,true);assert.notStrictEqual(g.staticTerrainSnapshot,previous);
    assert.strictEqual(g.staticNormalTransformGeneration,4,'repair commits the post-build generation, not the generation from patch planning');
    assert.strictEqual(stats.scratchPixels,640*360);released(g,first);scenarios++;
  }
  // If full repair itself fails after a later region succeeded, neither the
  // partial texture nor its old generation may be reused as patch authority.
  {
    const g=fixture();refresh(g);const gl=g.renderer.gl,previous=g.staticTerrainSnapshot,revision=g.renderer.backgroundRevision,first=allocations.length;
    g.room.water.add('6,7');g.room.water.add('30,14');const patch=g.painter.buildPatch,build=g.painter.build;let patches=0;
    g.painter.buildPatch=function(...args){const canvas=patch.apply(this,args);if(++patches===2)g.art.normalTransformGeneration++;return canvas};
    g.painter.build=function(...args){const canvas=build.apply(this,args);g.art.normalTransformGeneration+=2;return canvas};
    gl.failFullAt=gl.fullCount+2;const finish=observeCommit(g,previous);
    assert.throws(()=>g.refreshEditorStatic(),/injected full upload failure/);assert.strictEqual(finish(),5);released(g,first);
    assert.strictEqual(patches,2);assert.strictEqual(gl.subCount,3);assert.strictEqual(g.renderer.backgroundRevision,revision+1);
    assert.strictEqual(g.art.normalTransformGeneration,3);assert.strictEqual(g.staticNormalTransformGeneration,null);assert.strictEqual(g.staticTerrainSnapshot,null);assert.strictEqual(g.staticBackgroundRevision,null);
    assert.strictEqual(g.bgKey,'');assert.strictEqual(g.renderer.backgroundReady,false);assert.strictEqual(g.staticRefreshStats.reason,'refresh-failed');assert.match(g.staticRefreshStats.repairError,/normal source cache changed/i);
    g.painter.buildPatch=patch;g.painter.build=build;gl.failFullAt=0;
    const stats=refresh(g);assert.strictEqual(stats.mode,'full');assert.strictEqual(stats.reason,'missing-baseline');assert.strictEqual(stats.uploadCalls,3);assert.strictEqual(g.staticNormalTransformGeneration,3);assert.strictEqual(g.renderer.backgroundReady,true);scenarios++;
  }
}

function repairedUploadFailures(){
  for(const mode of ['second-material','later-region','gl-error']){
    const g=fixture();refresh(g);const r=g.renderer,gl=r.gl,previous=g.staticTerrainSnapshot,revision=r.backgroundRevision,first=allocations.length;
    g.room.water.add('6,7');if(mode==='later-region')g.room.water.add('30,14');
    if(mode==='gl-error')gl.errorSubAt=gl.subCount+3;else gl.failSubAt=gl.subCount+(mode==='later-region'?5:2);
    const finish=observeCommit(g,previous),stats=refresh(g),attempts=finish();
    assert.strictEqual(stats.mode,'full');assert.strictEqual(stats.reason,'patch-failed');assert(stats.repairError);assert.strictEqual(stats.uploadCalls,attempts);assert.strictEqual(gl.fullCount,6,'failed bounded upload must synchronously rebuild/upload all three maps');assert.strictEqual(r.backgroundReady,true);assert.strictEqual(r.backgroundRevision,revision+(mode==='later-region'?2:1));assert.notStrictEqual(g.staticTerrainSnapshot,previous);assert(g.bgKey);
    assert.strictEqual(stats.scratchPixels,640*360);assert.strictEqual(stats.scratchBytes,640*360*12);assert(stats.rasterCells>760);released(g,first);scenarios++;
  }
  const g=fixture();refresh(g);const gl=g.renderer.gl;g.room.paths.add('8,9');gl.failSubAt=gl.subCount+2;gl.failFullAt=gl.fullCount+1;
  const first=allocations.length;assert.throws(()=>g.refreshEditorStatic(),/injected full upload failure/);released(g,first);
  assert.strictEqual(g.staticTerrainSnapshot,null);assert.strictEqual(g.staticBackgroundRevision,null);assert.strictEqual(g.bgKey,'');assert.strictEqual(g.renderer.backgroundReady,false);assert.strictEqual(g.staticRefreshStats.reason,'refresh-failed');
  gl.failSubAt=gl.failFullAt=0;assert.strictEqual(refresh(g).reason,'missing-baseline');assert.strictEqual(g.renderer.backgroundReady,true);scenarios++;
}

function contextLossSkipsWork(){
  // A lost context invalidates the uploaded authority even when no terrain has
  // changed. Detect it before allocating scratch or attempting any GPU work.
  for(const changed of [false,true]){
    const g=fixture();refresh(g);const r=g.renderer,gl=r.gl,revision=r.backgroundRevision,first=allocations.length,uploads=gl.uploads.length;
    if(changed)g.room.paths.add('9,9');
    gl.lost=true;assert.throws(()=>g.refreshEditorStatic(),/(?:context.*lost|lost.*context)/i);
    assert.strictEqual(allocations.length,first,'lost context must not allocate a patch or full repair');
    assert.strictEqual(gl.uploads.length,uploads,'lost context must not submit texture uploads');
    assert.strictEqual(r.backgroundReady,false,'lost context cannot retain ready texture authority');
    assert.strictEqual(r.backgroundRevision,revision,'failed refresh cannot advance renderer revision');
    assert.strictEqual(g.staticTerrainSnapshot,null);assert.strictEqual(g.staticBackgroundRevision,null);assert.strictEqual(g.bgKey,'');released(g,first);
    gl.lost=false;const stats=refresh(g);assert.strictEqual(stats.mode,'full');assert.strictEqual(stats.reason,'missing-baseline');
    assert.strictEqual(stats.uploadCalls,3);assert.strictEqual(r.backgroundReady,true);assert.strictEqual(r.backgroundRevision,revision+1);scenarios++;
  }
}

function laterRasterFailureInvalidatesReadiness(){
  const g=fixture();refresh(g);const r=g.renderer,gl=r.gl,previous=g.staticTerrainSnapshot,revision=r.backgroundRevision,first=allocations.length;
  g.room.water.add('6,7');g.room.water.add('30,14');
  const build=g.painter.build,patch=g.painter.buildPatch;let patches=0;
  g.painter.buildPatch=function(...args){if(++patches===2)throw Error('injected later patch raster failure');return patch.apply(this,args)};
  g.painter.build=()=>{throw Error('injected full repair raster failure')};
  assert.throws(()=>g.refreshEditorStatic(),/injected full repair raster failure/);
  assert.strictEqual(patches,2,'first region must succeed before the raster failure');
  assert.strictEqual(gl.subCount,3,'first region must upload all three material channels');
  assert.strictEqual(r.backgroundRevision,revision+1,'only the first complete region advanced renderer revision');
  assert.strictEqual(r.backgroundReady,false,'later raster/repair failure must invalidate readiness left by the first region');
  assert.strictEqual(g.staticTerrainSnapshot,null);assert.strictEqual(g.staticBackgroundRevision,null);assert.strictEqual(g.bgKey,'');
  assert.strictEqual(g.staticRefreshStats.reason,'refresh-failed');released(g,first);
  g.painter.build=build;g.painter.buildPatch=patch;
  const stats=refresh(g);assert.strictEqual(stats.mode,'full');assert.strictEqual(stats.reason,'missing-baseline');assert.strictEqual(stats.uploadCalls,3);
  assert.strictEqual(r.backgroundReady,true);assert.strictEqual(r.backgroundRevision,revision+2);assert.notStrictEqual(g.staticTerrainSnapshot,previous);scenarios++;
}

function rasterAndAllocationFailures(){
  for(const kind of ['raster','second-allocation','third-allocation']){
    const g=fixture();refresh(g);g.room.water.add('11,8');const first=allocations.length;
    if(kind==='raster')faults.rasterAt=faults.rasterCalls+4;
    else faults.allocationAt=faults.allocationCalls+(kind==='second-allocation'?2:3);
    const stats=refresh(g);assert.strictEqual(stats.mode,'full');assert.strictEqual(stats.reason,'patch-failed');assert.strictEqual(stats.uploadCalls,3,'failed raster must not upload a partial scratch');released(g,first);faults.allocationAt=faults.rasterAt=0;scenarios++;
  }
  const g=fixture(),first=allocations.length;faults.rasterAt=faults.rasterCalls+4;
  assert.throws(()=>g.refreshEditorStatic(),/injected floor raster failure/);released(g,first);assert.strictEqual(g.staticTerrainSnapshot,null);assert.strictEqual(g.bgKey,'');assert.strictEqual(g.renderer.backgroundUploadCalls,0);faults.rasterAt=0;assert.strictEqual(refresh(g).mode,'full');scenarios++;
}

function guardedEdgeRasterMetrics(){
  for(const [width,height,cell] of [[640,360,'0,0'],[640,360,'39,18'],[997,563,'0,18'],[997,563,'39,0']]){
    const g=fixture();g.renderer.nativeW=width;g.renderer.nativeH=height;refresh(g);g.room.water.add(cell);
    const stats=refresh(g),region=stats.regions[0],uploads=g.renderer.gl.uploads.filter(u=>u.mode==='patch');
    assert.strictEqual(stats.mode,'patch');assert.strictEqual(stats.regions.length,1);assert.strictEqual(uploads.length,3);
    assert(region.rasterX>=0&&region.rasterY>=0&&region.rasterX+region.rasterWidth<=width&&region.rasterY+region.rasterHeight<=height,'native-edge guards remain within the full source');
    assert(region.rasterWidth>region.width&&region.rasterHeight>region.height,'edge clipping preserves the filtering guard on the interior sides');
    assert.strictEqual(stats.rasterCells,(region.tx1-region.tx0)*(region.ty1-region.ty0));assert(stats.rasterCells<=760*.35,'guarded floor work retains the existing raster budget');
    for(const u of uploads){
      assert.strictEqual(u.width,region.width);assert.strictEqual(u.height,region.height);assert.strictEqual(u.sourceWidth,region.rasterWidth);assert.strictEqual(u.sourceHeight,region.rasterHeight);
      assert.strictEqual(u.skipPixels,region.x-region.rasterX);assert.strictEqual(u.skipRows,region.rasterY+region.rasterHeight-region.y-region.height);
    }
    assert.strictEqual(stats.uploadBytes,region.width*region.height*12);assert.strictEqual(stats.scratchBytes,region.rasterWidth*region.rasterHeight*12);scenarios++;
  }
}

function croppedUploadRestoresUnpackState(){
  // Unequal top/bottom margins distinguish flipped source-row cropping from a
  // top-origin skip. Test both normal completion and material upload failures.
  const cases=[
    {x:37,y:11,width:19,height:17,rasterX:16,rasterY:0,rasterWidth:80,rasterHeight:80,skipPixels:21,skipRows:52},
    {x:613,y:327,width:27,height:21,rasterX:576,rasterY:288,rasterWidth:64,rasterHeight:72,skipPixels:37,skipRows:12}
  ];
  for(const region of cases)for(const fault of ['none','throw','gl-error']){
    const g=fixture();refresh(g);const r=g.renderer,gl=r.gl,first=allocations.length,revision=r.backgroundRevision,bytes=r.backgroundUploadBytes,before=gl.uploads.length;
    const canvases=[new FakeCanvas(region.rasterWidth,region.rasterHeight),new FakeCanvas(region.rasterWidth,region.rasterHeight),new FakeCanvas(region.rasterWidth,region.rasterHeight)],maps={normal:canvases[1],spec:canvases[2]};
    const seed={flip:region.y>300,skipPixels:5,skipRows:7};gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,seed.flip);gl.pixelStorei(gl.UNPACK_SKIP_PIXELS,seed.skipPixels);gl.pixelStorei(gl.UNPACK_SKIP_ROWS,seed.skipRows);
    if(fault==='throw')gl.failSubAt=2;else if(fault==='gl-error')gl.errorSubAt=3;
    if(fault==='none')r.patchBackground(region,canvases[0],maps);else assert.throws(()=>r.patchBackground(region,canvases[0],maps),/injected subupload|Static background subupload failed/);
    const uploads=gl.uploads.slice(before),attempts=fault==='throw'?2:3;
    assert.strictEqual(uploads.length,attempts);assert.deepStrictEqual(uploads.map(u=>u.texture),['color','normal','specular'].slice(0,attempts));
    for(const u of uploads){
      assert.strictEqual(u.x,region.x);assert.strictEqual(u.y,360-region.y-region.height);assert.strictEqual(u.width,region.width);assert.strictEqual(u.height,region.height);
      assert.strictEqual(u.sourceWidth,region.rasterWidth);assert.strictEqual(u.sourceHeight,region.rasterHeight);assert.strictEqual(u.flip,true);
      assert.strictEqual(u.skipPixels,region.skipPixels);assert.strictEqual(u.skipRows,region.skipRows,'flipped source skip uses the bottom guard, not the top guard');
    }
    assert.deepStrictEqual({flip:gl.flip,skipPixels:gl.skipPixels,skipRows:gl.skipRows},seed,'all previous unpack values must be restored on success or failure');
    assert.strictEqual(r.backgroundUploadBytes-bytes,attempts*region.width*region.height*4,'guard pixels never count as uploaded bytes');
    assert.strictEqual(r.backgroundReady,fault==='none');assert.strictEqual(r.backgroundRevision,revision+(fault==='none'?1:0));
    for(const canvas of canvases)canvas.width=canvas.height=1;
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);gl.pixelStorei(gl.UNPACK_SKIP_PIXELS,0);gl.pixelStorei(gl.UNPACK_SKIP_ROWS,0);released(g,first);scenarios++;
  }
}

function rejectInvalidPatches(){
  const g=fixture();refresh(g);const r=g.renderer,gl=r.gl,region={x:7,y:11,width:13,height:17},c=new FakeCanvas(13,17),normal=new FakeCanvas(13,17),spec=new FakeCanvas(13,17),maps={normal,spec},before=gl.uploads.length,stores=gl.pixelStores.length,queries=gl.parameterQueries.length;
  for(const change of [{x:-1},{y:-1},{width:0},{height:0},{x:.5},{x:639},{y:359}])assert.throws(()=>r.patchBackground({...region,...change},c,maps),/Stale or invalid/);
  for(const change of [{rasterX:-1},{rasterY:-1},{rasterX:7.5},{rasterY:Infinity},{rasterWidth:0},{rasterHeight:NaN},{rasterWidth:12},{rasterHeight:16},{rasterX:8},{rasterY:12},{rasterWidth:640},{rasterHeight:360}])assert.throws(()=>r.patchBackground({...region,...change},c,maps),/Stale or invalid static background patch crop/);
  assert.throws(()=>r.patchBackground({...region,rasterX:0,rasterY:0,rasterWidth:20,rasterHeight:28},c,maps),/Incomplete static material patch/,'all material maps must match the larger raster bounds');
  assert.throws(()=>r.patchBackground(region,c,{normal}),/Incomplete static material patch/);
  normal.width=12;assert.throws(()=>r.patchBackground(region,c,maps),/Incomplete static material patch/);normal.width=13;
  assert.strictEqual(gl.uploads.length,before,'validation precedes every upload');assert.strictEqual(r.backgroundReady,true);
  assert.strictEqual(gl.pixelStores.length,stores,'validation precedes any unpack mutation');assert.strictEqual(gl.parameterQueries.length,queries,'invalid crop requires no driver state query');
  const revision=r.backgroundRevision;r.backgroundReady=false;assert.throws(()=>r.patchBackground(region,c,maps),/Stale or invalid/);r.backgroundReady=true;r.backgroundSize=[639,360];assert.throws(()=>r.patchBackground(region,c,maps),/Stale or invalid/);r.backgroundSize=[640,360];
  gl.failSubAt=gl.subCount+2;assert.throws(()=>r.patchBackground(region,c,maps),/injected subupload/);assert.strictEqual(r.backgroundReady,false);assert.strictEqual(r.backgroundRevision,revision);assert.strictEqual(gl.flip,false);
  c.width=c.height=normal.width=normal.height=spec.width=spec.height=1;scenarios++;
}

fullPatchNoopAndHistory();staticIdentityAndStaleness();normalSourceGeneration();repairedUploadFailures();contextLossSkipsWork();laterRasterFailureInvalidatesReadiness();rasterAndAllocationFailures();guardedEdgeRasterMetrics();croppedUploadRestoresUnpackState();rejectInvalidPatches();
console.log('STATIC TERRAIN RUNTIME REGRESSION PERF-004 PASS');
console.log('  production Game / StaticPainter / GLRenderer scenarios:',scenarios);
console.log('  bounded guarded-raster uploads, asymmetric flipped source crops, unpack restoration, exact scratch/raster accounting and coherent snapshot/revision commits');
console.log('  normal-source generation/no-op authority, partial upload / GL error / context-loss repair, failed repair invalidation, canvas allocation/raster cleanup, zero retained scratch');
