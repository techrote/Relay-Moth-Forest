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
  constructor(canvas){this.canvas=canvas;this.transforms=[]}
  setTransform(...values){this.transforms.push(values)}
  createLinearGradient(){return{addColorStop(){}}}
  createRadialGradient(){return{addColorStop(){}}}
  fillRect(){if(++faults.rasterCalls===faults.rasterAt)throw new Error('injected floor raster failure')}
  clearRect(){} save(){} restore(){} beginPath(){} arc(){} fill(){} strokeRect(){}
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
  const gl={TEXTURE_2D:3553,RGBA:6408,UNSIGNED_BYTE:5121,UNPACK_FLIP_Y_WEBGL:37440,NO_ERROR:0,uploads:[],fullCount:0,subCount:0,flip:false,bound:null,lost:false,error:0,failFullAt:0,failSubAt:0,errorSubAt:0,hook:null};
  gl.bindTexture=(_target,texture)=>{gl.bound=texture};
  gl.pixelStorei=(name,value)=>{assert.strictEqual(name,gl.UNPACK_FLIP_Y_WEBGL);gl.flip=value};
  gl.texImage2D=(...args)=>{
    gl.fullCount++;const canvas=args[5];assert(canvas instanceof FakeCanvas,'full path uploads the production painter canvas');
    gl.uploads.push({mode:'full',texture:gl.bound,width:canvas.width,height:canvas.height,flip:gl.flip});gl.hook?.('full',canvas);
    if(gl.fullCount===gl.failFullAt)throw new Error('injected full upload failure');
  };
  gl.texSubImage2D=(...args)=>{
    gl.subCount++;const canvas=args[6];assert(canvas instanceof FakeCanvas,'patch path uploads bounded canvas directly');
    gl.uploads.push({mode:'patch',texture:gl.bound,x:args[2],y:args[3],width:canvas.width,height:canvas.height,flip:gl.flip});gl.hook?.('patch',canvas);
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
  g.art={img:{src:'color.png',width:64,height:64},normalImg:{src:'normal.png',width:64,height:64},specImg:{src:'spec.png',width:64,height:64},regions:{},meta:{},roles:{},worldScale:.18,tintCache:new Map(),normalTransformCache:new Map(),trimTintCache(){}};
  g.luts={data:{test:['#123456']},elementChannel:new Map([['ground','ground']]),signature:()=> 'unchanged-theme',hex:()=> '#123456'};
  g.painter=new production.StaticPainter(g.art,g.luts);g.updateUI=()=>{g.uiCalls++};
  return g;
}
function released(g,from=0){
  for(const canvas of allocations.slice(from))assert(canvas.width===1&&canvas.height===1,'every transient canvas backing must be released');
  assert.strictEqual(g.painter.lastMaterialMaps,null);assert.strictEqual(g.painter.materialNormalCtx,null);assert.strictEqual(g.painter.materialSpecCtx,null);
  assert(!g.currentStatic,'full-size CPU color backing must not be retained');
  assert.strictEqual(g.renderer.gl.flip,false,'pixel unpack state must be restored');
}
function refresh(g){const first=allocations.length,result=g.refreshEditorStatic();released(g,first);assert.strictEqual(result.retainedScratchPixels,0);assert.strictEqual(g.staticBackgroundRevision,g.renderer.backgroundRevision);return result}
function observeCommit(g,previous){let calls=0;g.renderer.gl.hook=()=>{assert.strictEqual(g.staticTerrainSnapshot,previous,'snapshot must commit only after every material upload succeeds');assert.strictEqual(g.renderer.backgroundReady,false,'partial material upload is never marked ready');calls++};return()=>{g.renderer.gl.hook=null;return calls}}
let scenarios=0;

function fullPatchNoopAndHistory(){
  const g=fixture(),r=g.renderer,gl=r.gl;
  let finish=observeCommit(g,undefined),stats=refresh(g);assert.strictEqual(finish(),3);
  assert.strictEqual(stats.mode,'full');assert.strictEqual(stats.reason,'missing-baseline');assert.strictEqual(stats.rasterCells,760);assert.strictEqual(stats.uploadCalls,3);assert.strictEqual(stats.uploadBytes,640*360*12);assert.strictEqual(r.backgroundRevision,1);assert(g.staticTerrainSnapshot.valid&&g.bgKey);
  let previous=g.staticTerrainSnapshot;g.room.water.add('6,7');finish=observeCommit(g,previous);stats=refresh(g);assert.strictEqual(finish(),3);
  assert.strictEqual(stats.mode,'patch');assert.strictEqual(stats.uploadCalls,3);assert.strictEqual(gl.fullCount,3,'eligible patch must not use texImage2D');assert(stats.rasterCells<=16&&stats.pixels<640*360);assert.strictEqual(stats.uploadBytes,stats.pixels*12);assert.strictEqual(stats.scratchBytes,stats.scratchPixels*12);assert.strictEqual(g.staticTerrainSnapshot.cellTypes[7*40+6],terrain.CELL_TYPES.water);assert.strictEqual(r.backgroundRevision,2);
  const firstRegion=stats.regions[0],upload=gl.uploads.find(x=>x.mode==='patch');assert.strictEqual(upload.x,firstRegion.x);assert.strictEqual(upload.y,360-firstRegion.y-firstRegion.height,'native y offset must account for flipped texture storage');assert(gl.uploads.every(u=>u.flip===true));
  const count=allocations.length;stats=refresh(g);assert.strictEqual(stats.mode,'noop');assert.strictEqual(stats.uploadCalls,0);assert.strictEqual(stats.rasterCells,0);assert.strictEqual(stats.pixels,0);assert.strictEqual(stats.scratchPixels,0);assert.strictEqual(allocations.length,count,'unchanged static state creates no canvases');assert.strictEqual(r.backgroundRevision,2);
  g.room.water.delete('6,7');g.room.water.add('30,14');stats=refresh(g);assert.strictEqual(stats.mode,'patch');assert.strictEqual(stats.changedCells,2);assert.strictEqual(stats.regions.length,2);assert.strictEqual(stats.uploadCalls,6);assert(stats.rasterCells<30&&stats.pixels<10000);assert.strictEqual(r.backgroundRevision,4);
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

function rejectInvalidPatches(){
  const g=fixture();refresh(g);const r=g.renderer,gl=r.gl,region={x:7,y:11,width:13,height:17},c=new FakeCanvas(13,17),normal=new FakeCanvas(13,17),spec=new FakeCanvas(13,17),maps={normal,spec},before=gl.uploads.length;
  for(const change of [{x:-1},{y:-1},{width:0},{height:0},{x:.5},{x:639},{y:359}])assert.throws(()=>r.patchBackground({...region,...change},c,maps),/Stale or invalid/);
  assert.throws(()=>r.patchBackground(region,c,{normal}),/Incomplete static material patch/);
  normal.width=12;assert.throws(()=>r.patchBackground(region,c,maps),/Incomplete static material patch/);normal.width=13;
  assert.strictEqual(gl.uploads.length,before,'validation precedes every upload');assert.strictEqual(r.backgroundReady,true);
  const revision=r.backgroundRevision;r.backgroundReady=false;assert.throws(()=>r.patchBackground(region,c,maps),/Stale or invalid/);r.backgroundReady=true;r.backgroundSize=[639,360];assert.throws(()=>r.patchBackground(region,c,maps),/Stale or invalid/);r.backgroundSize=[640,360];
  gl.failSubAt=gl.subCount+2;assert.throws(()=>r.patchBackground(region,c,maps),/injected subupload/);assert.strictEqual(r.backgroundReady,false);assert.strictEqual(r.backgroundRevision,revision);assert.strictEqual(gl.flip,false);
  c.width=c.height=normal.width=normal.height=spec.width=spec.height=1;scenarios++;
}

fullPatchNoopAndHistory();staticIdentityAndStaleness();repairedUploadFailures();contextLossSkipsWork();laterRasterFailureInvalidatesReadiness();rasterAndAllocationFailures();rejectInvalidPatches();
console.log('STATIC TERRAIN RUNTIME REGRESSION PERF-004 PASS');
console.log('  production Game / StaticPainter / GLRenderer scenarios:',scenarios);
console.log('  bounded uploads, coherent snapshot/revision commits, native Y offsets, exact resource/source invalidation and editor history');
console.log('  partial upload / GL error / context-loss repair, failed repair invalidation, canvas allocation/raster cleanup, zero retained scratch');
