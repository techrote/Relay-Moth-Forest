'use strict';
const assert=require('assert');
const fs=require('fs');
const path=require('path');
const vm=require('vm');
const ROOT=path.resolve(__dirname,'../..');
const terrain=require(path.join(ROOT,'static_terrain.js'));
const gameSource=fs.readFileSync(path.join(ROOT,'game.js'),'utf8');
const browserSource=fs.readFileSync(path.join(ROOT,'tests/current/static_terrain_browser_415.js'),'utf8');
const legacyStart=browserSource.indexOf('function legacyFullBuild('),legacyEnd=browserSource.indexOf('\n  function readTexture(',legacyStart);
assert(legacyStart>=0&&legacyEnd>legacyStart,'the frozen accepted full composition remains an independent command oracle');
const legacyFullSource=browserSource.slice(legacyStart,legacyEnd);
const artManifest=JSON.parse(fs.readFileSync(path.join(ROOT,'hd_remake_atlas.json'),'utf8'));
const source=(start,end)=>{const a=gameSource.indexOf(start),b=gameSource.indexOf(end,a+start.length);assert(a>=0&&b>a);return gameSource.slice(a,b)};
const allocations=[],allocationAttempts=[],phases=[],syncReads=[],faults={allocationAt:0,rasterAt:0,allocationCalls:0,rasterCalls:0,syncAt:0,syncFrom:0,syncCalls:0};
let traceCanvases=false,tracePrimitives=false,syncClock=0;
class FakeCanvas{
  constructor(width,height){const attempt={width,height,allocated:false};allocationAttempts.push(attempt);if(++faults.allocationCalls===faults.allocationAt)throw new Error('injected canvas allocation failure');this.width=width;this.height=height;this.originalWidth=width;this.originalHeight=height;this.contextRequests=[];this.context=new FakeContext(this);allocations.push(this);attempt.allocated=true}
  getContext(kind,options){assert.strictEqual(kind,'2d');this.contextRequests.push({kind,options});return this.context}
}
class FakeContext{
  constructor(canvas){this.canvas=canvas;this.transforms=[];this.matrix=[1,0,0,1,0,0];this.stack=[];this.images=[];this.clips=[];this.clipBounds=null;this.pathRectangles=[];this.pathCircles=[];this.globalAlpha=1;this.primitives=tracePrimitives?[]:null;this.footerBackground=false;this.commands=traceCanvases?[]:null;this.floorCommands=traceCanvases?new Map():null;this.floorCell=null;this.paintedCells=[];this.overlaysStarted=false}
  recordPrimitive(kind,corners){if(!this.primitives||this.globalAlpha<=0)return;const xs=corners.map(p=>p[0]),ys=corners.map(p=>p[1]),bounds={x0:Math.min(...xs),y0:Math.min(...ys),x1:Math.max(...xs),y1:Math.max(...ys)};if(bounds.x0<bounds.x1&&bounds.y0<bounds.y1)this.primitives.push({kind,bounds})}
  corners(x,y,w,h){const[a,b,c,d,e,f]=this.matrix;return[[x,y],[x+w,y],[x+w,y+h],[x,y+h]].map(([px,py])=>[a*px+c*py+e,b*px+d*py+f])}
  recordCommand(name,args=[]){if(!this.commands)return;const entry={name,args:[...args],matrix:[...this.matrix],clip:this.clipBounds?[...this.clipBounds]:null};if(this.floorCell){if(!this.floorCommands.has(this.floorCell))this.floorCommands.set(this.floorCell,[]);this.floorCommands.get(this.floorCell).push(entry)}else this.commands.push(entry)}
  // Record the effective matrix at drawing/restoration boundaries, so the first
  // entry remains the full native transform after translate followed by scale.
  recordTransform(){const last=this.transforms.at(-1);if(!last||this.matrix.some((value,i)=>value!==last[i]))this.transforms.push([...this.matrix])}
  setTransform(...values){this.recordCommand('setTransform',values);assert(values.length===6&&values.every(Number.isFinite));this.matrix=[...values]}
  translate(x,y){this.recordCommand('translate',[x,y]);assert(Number.isFinite(x)&&Number.isFinite(y));const[a,b,c,d,e,f]=this.matrix;this.matrix=[a,b,c,d,e+a*x+c*y,f+b*x+d*y]}
  scale(x,y){this.recordCommand('scale',[x,y]);assert(Number.isFinite(x)&&Number.isFinite(y));const[a,b,c,d,e,f]=this.matrix;this.matrix=[a*x,b*x,c*y,d*y,e,f]}
  rotate(angle){this.recordCommand('rotate',[angle]);assert(Number.isFinite(angle));const[a,b,c,d,e,f]=this.matrix,co=Math.cos(angle),si=Math.sin(angle);this.matrix=[a*co+c*si,b*co+d*si,-a*si+c*co,-b*si+d*co,e,f]}
  save(){this.recordCommand('save');this.stack.push({matrix:[...this.matrix],clip:this.clipBounds?[...this.clipBounds]:null,alpha:this.globalAlpha})}
  restore(){this.recordCommand('restore');this.recordTransform();if(this.stack.length){const state=this.stack.pop();this.matrix=state.matrix;this.clipBounds=state.clip;this.globalAlpha=state.alpha}}
  createLinearGradient(...args){this.recordCommand('createLinearGradient',args);return{addColorStop:(...stop)=>this.recordCommand('addColorStop',stop)}}
  createRadialGradient(...args){this.recordCommand('createRadialGradient',args);return{addColorStop:(...stop)=>this.recordCommand('addColorStop',stop)}}
  fillRect(...args){this.recordCommand('fillRect',args);this.recordTransform();if(this.primitives&&!this.footerBackground)this.recordPrimitive('rectangle',this.corners(...args));if(++faults.rasterCalls===faults.rasterAt)throw new Error('injected floor raster failure')}
  drawImage(...args){
    this.recordCommand('drawImage',args);this.recordTransform();assert.strictEqual(args.length,9,'atlas drawing uses an explicit source and destination rectangle');
    const[image,sx,sy,sw,sh,x,y,w,h]=args;assert([sx,sy,sw,sh,x,y,w,h].every(Number.isFinite),'drawImage coordinates must be finite');
    const[a,b,c,d,e,f]=this.matrix,corners=[[x,y],[x+w,y],[x+w,y+h],[x,y+h]].map(([px,py])=>[a*px+c*py+e,b*px+d*py+f]);
    this.images.push({image,source:[sx,sy,sw,sh],destination:[x,y,w,h],matrix:[...this.matrix],corners});
    this.recordPrimitive('sprite',corners);
  }
  clearRect(...args){this.recordCommand('clearRect',args);this.recordTransform()}
  beginPath(){this.recordCommand('beginPath');this.pathRectangles=[];this.pathCircles=[]}
  rect(x,y,width,height){
    this.recordCommand('rect',[x,y,width,height]);assert([x,y,width,height].every(Number.isFinite));
    const[a,b,c,d,e,f]=this.matrix,points=[[x,y],[x+width,y],[x+width,y+height],[x,y+height]].map(([px,py])=>[a*px+c*py+e,b*px+d*py+f]);
    this.pathRectangles.push([Math.min(...points.map(p=>p[0])),Math.min(...points.map(p=>p[1])),Math.max(...points.map(p=>p[0])),Math.max(...points.map(p=>p[1]))]);
  }
  clip(){
    assert.strictEqual(this.pathRectangles.length,1,'native guard uses one rectangular clip path');const rectangle=[...this.pathRectangles[0]],prior=this.clipBounds||[0,0,this.canvas.width,this.canvas.height];
    this.clipBounds=[Math.max(prior[0],rectangle[0]),Math.max(prior[1],rectangle[1]),Math.min(prior[2],rectangle[2]),Math.min(prior[3],rectangle[3])];
    this.clips.push({rectangle,matrix:[...this.matrix],bounds:[...this.clipBounds]});this.recordCommand('clip');
  }
  arc(...args){this.recordCommand('arc',args);this.recordTransform();if(this.primitives)this.pathCircles.push(args)}
  fill(){this.recordCommand('fill');this.recordTransform();if(this.primitives){const[a,b,c,d,e,f]=this.matrix;for(const[x,y,r,start,end]of this.pathCircles){assert.strictEqual(start,0);assert.strictEqual(end,Math.PI*2);const cx=a*x+c*y+e,cy=b*x+d*y+f,rx=Math.hypot(a,c)*r,ry=Math.hypot(b,d)*r;this.recordPrimitive('circle',[[cx-rx,cy-ry],[cx+rx,cy+ry]])}}}
  strokeRect(...args){this.recordCommand('strokeRect',args);this.recordTransform()}
  getImageData(x,y,width,height){
    // Synchronization is observed separately from the frozen draw-command
    // oracle: it cannot hide any changed primitive, transform or draw order.
    const read={canvas:this.canvas,x,y,width,height,floorCells:this.paintedCells.length,lastCell:this.paintedCells.at(-1),overlaysStarted:this.overlaysStarted,success:false,ms:2.5};syncReads.push(read);
    try{
      assert.deepStrictEqual([x,y,width,height],[0,0,1,1],'static color synchronizes exactly one native pixel');
      const options=this.canvas.contextRequests[0].options;assert.strictEqual(options.alpha,false);assert(Object.prototype.hasOwnProperty.call(options,'willReadFrequently')&&options.willReadFrequently===false,'the synchronization context must explicitly request false');
      assert(read.floorCells>0&&!read.overlaysStarted,'read follows painted floor work and precedes every overlay');
      if(++faults.syncCalls===faults.syncAt||(faults.syncFrom&&faults.syncCalls>=faults.syncFrom))throw Error('injected color synchronization failure');
      read.success=true;
      return{get data(){throw Error('synchronization pixels must be discarded')}};
    }finally{syncClock+=read.ms}
  }
}
const sandbox={OffscreenCanvas:FakeCanvas,RelayStaticTerrain:terrain,performance:{now:()=>syncClock},perfMeasure:(name,fn)=>{phases.push(name);return fn()}};
const production=vm.runInNewContext(`
  const W=640,H=360,TILE=16,FLOOR_TILE=4,GRID_W=40,GRID_H=19,PLAY_H=304,BOTTOM_H=56,TAU=Math.PI*2,HD_WORLD_SCALE_DEFAULT=.18;
  ${gameSource.match(/const BLOCKER_FOREGROUND_FRACTION=[^\n]+/)[0]}
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  ${source('function hash32(','\nfunction h01(')}
  ${source('function releaseCanvasBacking(','\n\n// PERF-001A:')}
  ${source('class Room{','\n// Low-cost steering helpers')}
  ${source('class HDArtSheet{','\nclass StaticPainter')}
  ${source('class StaticPainter{','\nclass SpriteAtlas')}
  ${source('class GLRenderer{','\nclass ParticleField')}
  ${source('class Game{','\nlet game=null')}
  ${legacyFullSource}
  ({Room,HDArtSheet,StaticPainter,GLRenderer,Game,legacyFullBuild});
`,sandbox);
const observeBaseTile=production.StaticPainter.prototype.baseTile;
production.StaticPainter.prototype.baseTile=function(ctx,tx,ty,...args){const value=observeBaseTile.call(this,ctx,tx,ty,...args);ctx.paintedCells.push([tx,ty]);return value};
for(const method of ['patternDecor','drawBlockerSprites','drawVegetationInterstitials','drawDecor','drawFooter']){
  const original=production.StaticPainter.prototype[method];production.StaticPainter.prototype[method]=function(ctx,...args){if(ctx)ctx.overlaysStarted=true;return original.call(this,ctx,...args)};
}

function fakeGL(){
  const gl={TEXTURE_2D:3553,RGBA:6408,UNSIGNED_BYTE:5121,UNPACK_FLIP_Y_WEBGL:37440,UNPACK_SKIP_PIXELS:3316,UNPACK_SKIP_ROWS:3315,NO_ERROR:0,uploads:[],textures:new Map(),pixelStores:[],parameterQueries:[],fullCount:0,subCount:0,flip:false,skipPixels:0,skipRows:0,bound:null,lost:false,error:0,failFullAt:0,failSubAt:0,errorSubAt:0,hook:null};
  gl.bindTexture=(_target,texture)=>{gl.bound=texture};
  const storeKey=name=>{const key=new Map([[gl.UNPACK_FLIP_Y_WEBGL,'flip'],[gl.UNPACK_SKIP_PIXELS,'skipPixels'],[gl.UNPACK_SKIP_ROWS,'skipRows']]).get(name);assert(key,'unexpected pixel store');return key};
  gl.pixelStorei=(name,value)=>{gl[storeKey(name)]=value;gl.pixelStores.push([name,value])};
  gl.getParameter=name=>{gl.parameterQueries.push(name);return gl[storeKey(name)]};
  gl.texImage2D=(...args)=>{
    gl.fullCount++;const canvas=args[5];assert(canvas instanceof FakeCanvas,'full path uploads the production painter canvas');
    // Simulated GPU bytes deliberately change on every upload. This makes
    // accidental material replacement observable independently of draw counts.
    gl.textures.set(gl.bound,{width:canvas.width,height:canvas.height,bytes:new Uint8Array(canvas.width*canvas.height*4).fill(gl.fullCount%255+1)});
    gl.uploads.push({mode:'full',texture:gl.bound,width:canvas.width,height:canvas.height,flip:gl.flip});gl.hook?.('full',canvas);
    if(gl.fullCount===gl.failFullAt)throw new Error('injected full upload failure');
  };
  gl.texSubImage2D=(...args)=>{
    assert.strictEqual(args.length,9,'guarded source uses the explicit-size TexImageSource overload');
    gl.subCount++;const canvas=args[8],width=args[4],height=args[5];assert(canvas instanceof FakeCanvas,'patch path uploads guarded canvas directly');
    assert.strictEqual(args[6],gl.RGBA);assert.strictEqual(args[7],gl.UNSIGNED_BYTE);
    assert([width,height,gl.skipPixels,gl.skipRows].every(Number.isInteger)&&width>0&&height>0&&gl.skipPixels>=0&&gl.skipRows>=0,'invalid source crop geometry');
    assert(gl.skipPixels+width<=canvas.width&&gl.skipRows+height<=canvas.height,'source crop must fit the guarded color surface');
    const texture=gl.textures.get(gl.bound);assert(texture,'patch texture must already exist');
    for(let row=args[3];row<args[3]+height;row++)texture.bytes.fill((gl.fullCount+gl.subCount)%255+1,(row*texture.width+args[2])*4,(row*texture.width+args[2]+width)*4);
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
  for(const name of ['region','regionMeta','worldSize'])g.art[name]=production.HDArtSheet.prototype[name];
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
function materialSnapshot(r){return['bgNormalTex','bgSpecTex'].map(key=>{const handle=r[key],texture=r.gl.textures.get(handle);return{key,handle,texture,bytes:texture?.bytes.slice()}})}
function assertMaterialsRetained(r,before){for(const saved of before){assert.strictEqual(r[saved.key],saved.handle,'terrain delta cannot replace a material texture handle');assert.strictEqual(r.gl.textures.get(saved.handle),saved.texture,'terrain delta cannot allocate a material texture');assert.deepStrictEqual(saved.texture?.bytes,saved.bytes,'terrain delta cannot change existing material texture bytes')}}
function assertSyncAccounting(g,stats,from){
  const reads=syncReads.slice(from),successes=reads.filter(read=>read.success);
  assert.strictEqual(stats.colorPolicy,g.painter.colorPolicy);assert.strictEqual(stats.colorSyncAttempts,reads.length,'count every attempted synchronization including throwing reads');
  assert.strictEqual(stats.colorSyncReads,successes.length);assert.strictEqual(stats.colorSyncPixels,successes.length,'every successful read returns exactly one pixel');assert.strictEqual(stats.readbackPixels,successes.length,'reported static readback cost must include row synchronization');
  assert.strictEqual(stats.colorSyncMs,reads.reduce((n,read)=>n+read.ms,0),'elapsed read time includes failures and every synchronous repair');
  for(const read of reads){
    assert(!read.overlaysStarted);assert.deepStrictEqual([read.x,read.y,read.width,read.height],[0,0,1,1]);
    const next=read.canvas.context.paintedCells[read.floorCells];if(next)assert.notStrictEqual(next[1],read.lastCell[1],'a row read cannot occur before its final painted cell');
  }
  if(stats.mode==='patch')assert.strictEqual(reads.length,stats.regions.reduce((n,r)=>n+r.ty1-r.ty0,0),'one read per actually painted bounded row');
  else if(stats.mode==='noop')assert.strictEqual(reads.length,0,'no-op refresh performs no synchronization');
  else if(stats.reason!=='refresh-failed'&&!stats.repairError)assert.strictEqual(reads.length,19,'a successful full composition synchronizes all 19 floor rows');
}
function refresh(g,options){
  const first=allocations.length,firstAttempt=allocationAttempts.length,firstRead=syncReads.length,materials=materialSnapshot(g.renderer),beforeUploads=g.renderer.gl.uploads.length,result=g.refreshEditorStatic(options);released(g,first);assert.strictEqual(result.retainedScratchPixels,0);assert.strictEqual(g.staticBackgroundRevision,g.renderer.backgroundRevision);assertSyncAccounting(g,result,firstRead);
  const fullPixels=result.mode==='full'?g.renderer.nativeW*g.renderer.nativeH:0,regions=result.regions;
  const rasterAreas=regions.map(r=>r.rasterWidth*r.rasterHeight),created=allocations.slice(first),canvasAreas=created.map(c=>c.originalWidth*c.originalHeight),attempts=allocationAttempts.slice(firstAttempt);
  assert.strictEqual(result.pixels,fullPixels+regions.reduce((n,r)=>n+r.width*r.height,0),'upload work uses output bounds');
  assert.strictEqual(result.rasterPixels,fullPixels+rasterAreas.reduce((n,area)=>n+area,0),'raster work includes every guarded clip and any full repair');
  assert.strictEqual(result.scratchPixels,Math.max(...canvasAreas,0),'scratch pixels report actual largest canvas capacity');assert.strictEqual(result.scratchBytes,Math.max(fullPixels*12,...canvasAreas.map(area=>area*4),0),'scratch bytes reflect peak simultaneous color/material allocations');
  assert.strictEqual(result.scratchAllocationAttempts,attempts.length,'allocation attempts include throwing constructors');assert.strictEqual(result.scratchAllocations,created.length,'successful canvas allocations are independently observed');
  assert.strictEqual(result.scratchAllocationPixels,canvasAreas.reduce((n,area)=>n+area,0),'cumulative capacity includes every allocated color surface and full repair map');assert.strictEqual(result.scratchAllocationBytes,result.scratchAllocationPixels*4);
  assert.strictEqual(result.scratchMode,result.mode==='full'?'full':result.mode==='noop'?'none':regions[0].canvasMode);
  for(const canvas of created){const options=canvas.contextRequests[0]?.options;if(options?.alpha===false)assert.strictEqual(options.willReadFrequently,false,'every color build uses the selected synchronization policy');else if(options?.alpha===true)assert(!Object.prototype.hasOwnProperty.call(options,'willReadFrequently'),'material context creation options remain unchanged')}
  if(result.mode==='patch'||result.mode==='noop')assertMaterialsRetained(g.renderer,materials);
  else assert.deepStrictEqual(g.renderer.gl.uploads.slice(-3).map(u=>[u.mode,u.texture]),[['full','color'],['full','normal'],['full','specular']],'every full dependency refresh or repair replaces all three channels');
  if(result.mode==='patch'){
    assert(g.renderer.gl.uploads.slice(beforeUploads).every(u=>u.texture===g.renderer.bgTex),'eligible terrain patches upload color only');
    assert.strictEqual(created.length,regions.length,'one color canvas per region, without material or crop canvases');
    regions.forEach((region,i)=>{const canvas=created[i];
      assert.strictEqual(canvas.originalWidth,region.canvasWidth);assert.strictEqual(canvas.originalHeight,region.canvasHeight);
      assert.strictEqual(canvas.contextRequests[0].options.alpha,false,'patch allocates only opaque color');
      assert.deepStrictEqual(canvas.context.transforms[0],[g.renderer.nativeW/640,0,0,g.renderer.nativeH/360,region.canvasX?-region.canvasX:0,region.canvasY?-region.canvasY:0],'drawing uses actual canvas origin, independently of output and guarded clip');
      if(region.canvasMode==='native-clip')assert.deepStrictEqual(canvas.context.clips,[{rectangle:[region.rasterX,region.rasterY,region.rasterX+region.rasterWidth,region.rasterY+region.rasterHeight],matrix:[1,0,0,1,0,0],bounds:[region.rasterX,region.rasterY,region.rasterX+region.rasterWidth,region.rasterY+region.rasterHeight]}],'native target receives the local guard as an integer clip before scaling');
      else assert.deepStrictEqual(canvas.context.clips,[],'local canvas bounds already clip the integer-scale raster');
    });
  }
  return result;
}
function observeCommit(g,previous){let calls=0;g.renderer.gl.hook=()=>{assert.strictEqual(g.staticTerrainSnapshot,previous,'snapshot must commit only after every required upload succeeds');assert.strictEqual(g.renderer.backgroundReady,false,'an incomplete background update is never marked ready');calls++};return()=>{g.renderer.gl.hook=null;return calls}}
let scenarios=0;

function spriteFixture(width=997,height=563){
  const g=fixture(),names=['orb_pillar','lamp_blue','lamp_orange'];
  const manifest={world_scale:artManifest.world_scale,regions:{},region_meta:{},roles:{lamps:['lamp_blue','lamp_orange'],objective:{}}};
  for(const name of names){manifest.regions[name]=[...artManifest.regions[name]];manifest.region_meta[name]={...artManifest.region_meta[name],tint_strength:0}}
  g.art=new production.HDArtSheet({src:'atlas.png',width:4096,height:4096},manifest,null,{src:'spec.png',width:4096,height:4096},{src:'normal.png',width:4096,height:4096});
  g.painter=new production.StaticPainter(g.art,g.luts);g.renderer.nativeW=width;g.renderer.nativeH=height;
  g.room.decorLamps=[{tile:[4,5]}];
  Object.assign(g,{x:301.25,y:142.5,vx:2,vy:-1,followers:{units:[{id:'pip',x:275,y:130,path:[[1,2],[3,4]]}]},miniGuides:{units:[{id:'mini',x:19,y:27}]},flock:{m:[{id:'moth',x:300,y:142}]}});
  g.state.completed=new Set(['kept-completion']);g.state.robots=new Set(['kept-robot']);g.state.moths=new Set(['kept-moth']);
  g.room.objects={'kept-object':[4,5]};g.room.objectFxHidden.add('kept-object');
  return g;
}
function actorState(g){return JSON.stringify([g.x,g.y,g.vx,g.vy,g.followers,g.miniGuides,g.flock,[...g.state.completed],[...g.state.robots],[...g.state.moths],g.room.objects,[...g.room.objectFxHidden]])}
// Record actual production draw commands at logical identity coordinates. This
// oracle knows Canvas geometry, not StaticPainter placement/anchor formulas.
function observedOverlayPrimitives(g){
  tracePrimitives=true;const canvas=new FakeCanvas(640,360),ctx=canvas.context;
  try{
    for(const method of ['patternDecor','drawBlockerSprites','drawVegetationInterstitials','drawDecor'])g.painter[method](ctx,g.room,g.state);
    ctx.footerBackground=true;g.painter.drawFooter(ctx);
    return{bounds:ctx.primitives.map(p=>p.bounds),primitives:ctx.primitives,images:ctx.images};
  }finally{canvas.width=canvas.height=1;tracePrimitives=false}
}
function isolatedOverlayBounds(g,run=()=>g.painter.staticOverlayBounds(g.room,g.state)){
  const descriptors=[],deny=(o,k)=>{descriptors.push([o,k,Object.getOwnPropertyDescriptor(o,k)]);Object.defineProperty(o,k,{configurable:true,get(){throw Error('Bounds replay touched '+k)}})};
  const first=allocations.length,attempts=allocationAttempts.length,raster=faults.rasterCalls,actors=actorState(g),material=[g.painter.materialNormalCtx,g.painter.materialSpecCtx,g.painter.lastMaterialMaps];
  const resources=JSON.stringify([g.art.regions,g.art.meta,g.art.roles,g.art.worldScale]),caches=[g.art.tintCache,g.art.normalTransformCache],entries=caches.map(c=>[...c]),generation=g.art.normalTransformGeneration;
  for(const key of ['img','normalImg','specImg','bumpImg','tintCache','normalTransformCache','normalTransformGeneration','tintInfo','tintedRegion','trimTintCache','draw','drawSubrect','drawMap','drawMapSubrect','transformedNormal'])deny(g.art,key);
  deny(g.luts,'hex');for(const[key,value]of Object.entries(g.renderer.gl))if(typeof value==='function')deny(g.renderer.gl,key);
  try{return run()}finally{
    for(const[o,k,d]of descriptors.reverse())if(d)Object.defineProperty(o,k,d);else delete o[k];
    assert.strictEqual(allocations.length,first);assert.strictEqual(allocationAttempts.length,attempts,'bounds replay cannot attempt a canvas allocation');assert.strictEqual(faults.rasterCalls,raster);
    assert.strictEqual(actorState(g),actors);assert.deepStrictEqual([g.painter.materialNormalCtx,g.painter.materialSpecCtx,g.painter.lastMaterialMaps],material,'dry receiver cannot alter real painter material pointers');
    assert.strictEqual(JSON.stringify([g.art.regions,g.art.meta,g.art.roles,g.art.worldScale]),resources,'dry replay cannot mutate authoring metadata');
    assert.deepStrictEqual([g.art.tintCache,g.art.normalTransformCache],caches);assert.deepStrictEqual(caches.map(c=>[...c]),entries);assert.strictEqual(g.art.normalTransformGeneration,generation);
  }
}
function expectedOverlayRaster(output,bounds,width,height){
  const sx=width/640,sy=height/360;let left=output.x-32,top=output.y-32,right=output.x+output.width+32,bottom=output.y+output.height+32;
  for(const b of bounds){const x0=b.x0*sx-2,y0=b.y0*sy-2,x1=b.x1*sx+2,y1=b.y1*sy+2;
    if(x0<=output.x+output.width&&output.x<=x1&&y0<=output.y+output.height&&output.y<=y1){left=Math.min(left,x0);top=Math.min(top,y0);right=Math.max(right,x1);bottom=Math.max(bottom,y1)}
  }
  const x=Math.max(0,Math.floor(left/16)*16),y=Math.max(0,Math.floor(top/16)*16),x1=Math.min(width,Math.ceil(right/16)*16),y1=Math.min(height,Math.ceil(bottom/16)*16);
  const tx0=Math.max(0,Math.floor((x/sx-4-2/sx)/16)),ty0=Math.max(0,Math.floor((y/sy-4-2/sy)/16)),tx1=Math.min(40,Math.ceil((x1/sx+4+2/sx)/16)),ty1=Math.min(19,Math.ceil((y1/sy+4+2/sy)/16));
  return{raster:[x,y,x1-x,y1-y],pixels:(x1-x)*(y1-y),floorCells:(tx1-tx0)*(ty1-ty0)};
}
function overlayCollectorGeometryAndPurity(){
  const verify=g=>{
    const actual=observedOverlayPrimitives(g),normal={},spec={},maps={};g.painter.materialNormalCtx=normal;g.painter.materialSpecCtx=spec;g.painter.lastMaterialMaps=maps;
    const bounds=isolatedOverlayBounds(g);assert(Object.isFrozen(bounds)&&bounds.every(Object.isFrozen));assert.strictEqual(bounds.length,actual.bounds.length,'collector includes every real overlay and sampled footer primitive');
    // Different equivalent double-matrix multiplication orders can differ at
    // machine epsilon; this checks geometry, never the exact native pixel gate.
    for(let i=0;i<bounds.length;i++)for(const key of ['x0','y0','x1','y1'])assert(Math.abs(bounds[i][key]-actual.bounds[i][key])<1e-10,'bounds disagree with actual drawing at '+i+' '+key);
    g.painter.materialNormalCtx=g.painter.materialSpecCtx=g.painter.lastMaterialMaps=null;scenarios++;return actual;
  };
  const variants=['default','objective-substitution','metadata-scale','footer-scale',...['top','center','bottom'].flatMap(anchor=>[false,true].map(flip=>({anchor,flip})))];
  for(const variant of variants){
    const g=spriteFixture();
    for(const name of ['gear','orb_cyan','flower_pink']){g.art.regions[name]=[...artManifest.regions[name]];g.art.meta[name]={...artManifest.region_meta[name],tint_strength:0}}
    g.art.tintInfo=()=>null;
    if(variant==='objective-substitution'){g.art.roles.objective.lamp='lamp_blue';g.room.spec.objects=[{kind:'lamp',object_id:'fixture-objective'}]}
    if(variant==='metadata-scale'){g.art.worldScale=.27;g.art.meta.lamp_blue.world_scale=.65;g.art.meta.orb_pillar.world_scale=1.25}
    if(variant==='footer-scale'){g.art.meta.gear.world_scale=24;g.art.meta.orb_cyan.world_scale=24}
    if(typeof variant==='object'){
      const draw=g.painter.drawDecor;
      g.painter.drawDecor=function(ctx,room){draw.call(this,ctx,room);this.sprite(ctx,'flower_pink',173.25,114.5,{...variant,rot:.37,scale:.73,alpha:.8});this.spriteSubrect(ctx,'lamp_blue',0,70,82,70,215.25,126.5,9.7416,8.316,{...variant,rot:-.41,alpha:.8});this.dot(ctx,10.5,20.25,'#fff',1.3,.8);this.px(ctx,15.5,20.5,3.5,2.2,'#fff',.4)};
    }
    const actual=verify(g);
    assert.deepStrictEqual(actual.images.slice(-2).map(d=>d.source),[artManifest.regions.gear,artManifest.regions.orb_cyan],'footer sprites come from the actual footer method');
    if(variant==='footer-scale')assert(actual.bounds.slice(-2).every(b=>b.y0<304&&b.y1>304),'imported footer scaling reaches terrain and must participate in bounds');
  }
  const story=JSON.parse(fs.readFileSync(path.join(ROOT,'relay_moth_story.json'),'utf8')),maps=JSON.parse(fs.readFileSync(path.join(ROOT,'relay_moth_maps.json'),'utf8'));
  for(let i=0;i<story.rooms.length;i++){
    const g=spriteFixture();g.room=new production.Room(i,story.rooms[i],maps);g.art=new production.HDArtSheet({width:4096,height:4096},artManifest);g.art.tintInfo=()=>null;g.painter=new production.StaticPainter(g.art,g.luts);verify(g);
  }
  for(const kind of ['nonfinite-size','oversized-lamps','oversized-roles','emission-limit']){
    const g=spriteFixture();let visited=0;
    if(kind==='nonfinite-size')g.art.meta.lamp_blue.world_scale=NaN;
    if(kind==='oversized-lamps')g.room.decorLamps=Array(761).fill({tile:[1,1]});
    if(kind==='oversized-roles')g.art.roles.foliage_v391=Array(761).fill('lamp_blue');
    if(kind==='emission-limit')g.painter.patternDecor=function(ctx){for(let i=0;i<5000;i++){visited++;this.dot(ctx,20,20,'#fff')}};
    assert.throws(()=>isolatedOverlayBounds(g),/Invalid static overlay bounds/);
    if(kind==='emission-limit')assert.strictEqual(visited,4097,'bounded replay must stop at the first excess primitive');scenarios++;
  }
}
function overlayGeometryFallbacks(){
  for(const kind of ['invalid-size','oversized-quad']){
    const g=spriteFixture();if(kind==='oversized-quad'){g.room.decorLamps=[{tile:[20,14]}];g.art.meta.lamp_blue.world_scale=60}
    const actual=kind==='oversized-quad'?observedOverlayPrimitives(g):null;
    refresh(g);const previous=g.staticTerrainSnapshot,first=allocations.length,attempts=allocationAttempts.length,uploads=g.renderer.gl.uploads.length,build=g.painter.build,worldSize=g.art.worldSize,query=g.painter.staticOverlayBounds;let bad=kind==='invalid-size',queries=0;
    if(bad)g.art.worldSize=function(name,...args){if(name==='lamp_blue'&&bad){bad=false;return[NaN,20]}return worldSize.call(this,name,...args)};
    g.painter.staticOverlayBounds=function(...args){queries++;return isolatedOverlayBounds(g,()=>query.apply(this,args))};
    g.room.water.add('3,2');const basic=terrain.plan(previous,terrain.capture(g.room,g.staticTerrainContext()));assert.strictEqual(basic.kind,'patch','the new geometry check is the binding fallback');
    if(actual)assert(expectedOverlayRaster(basic.regions[0],actual.bounds,997,563).pixels>997*563*.20,'the negative fixture must exceed the unchanged clip budget using independently observed geometry');
    g.painter.buildPatch=()=>{throw Error('invalid/oversized overlay geometry must not start a partial draw')};
    g.painter.build=function(...args){assert.strictEqual(allocations.length,first);assert.strictEqual(allocationAttempts.length,attempts);assert.strictEqual(g.renderer.gl.uploads.length,uploads);return build.apply(this,args)};
    const stats=refresh(g);assert.strictEqual(stats.mode,'full');assert.strictEqual(stats.reason,kind==='invalid-size'?'invalid-overlay-bounds':'raster-pixel-budget');assert.strictEqual(queries,1);assert.strictEqual(stats.uploadCalls,3);assert.strictEqual(stats.regions.length,0);scenarios++;
  }
  const g=spriteFixture();refresh(g);let queries=0;g.painter.staticOverlayBounds=()=>{queries++;throw Error('nonpatch plan must skip bounds replay')};
  assert.strictEqual(refresh(g).mode,'noop');assert.strictEqual(g.refreshEditorStatic({force:true}).reason,'forced');released(g);
  g.renderer.backgroundRevision++;assert.strictEqual(refresh(g).reason,'stale-background');g.room.walls.add('4,4');assert.strictEqual(refresh(g).reason,'dependency:walls');assert.strictEqual(queries,0);scenarios+=4;
}

function nativeClipMatchesFullCommands(){
  const cases=[
    {label:'floor-only',width:997,height:563,cell:'8,6'},
    {label:'mounted-sprite',width:997,height:563,cell:'10,7'},
    {label:'objective-substitution',width:997,height:563,cell:'10,7'},
    {label:'custom-metadata',width:997,height:563,cell:'10,7'},
    {label:'rotated-subrect',width:997,height:563,cell:'10,7'},
    {label:'footer-imported-scale',width:997,height:563,cell:'38,18'},
    {label:'fractional-x',width:997,height:360,cell:'19,10'},
    {label:'fractional-y',width:640,height:563,cell:'19,10'}
  ];
  const canonical=commands=>commands.map(({clip,...command})=>command);
  const withoutNativeClip=ctx=>{
    assert.deepStrictEqual(ctx.commands.slice(0,5).map(c=>c.name),['save','beginPath','rect','clip','scale'],'native clip is the sole setup difference from full save/scale');
    return canonical([ctx.commands[0],...ctx.commands.slice(4)]);
  };
  for(const test of cases){
    const g=spriteFixture(test.width,test.height);g.room.decorLamps=test.label==='floor-only'?[]:[{tile:[10,8]}];
    if(test.label==='objective-substitution'){g.art.roles.objective.lamp='lamp_blue';g.room.spec.objects=[{object_id:'fixture-objective',kind:'lamp'}]}
    if(test.label==='custom-metadata'){g.art.worldScale=.27;g.art.meta.lamp_blue.world_scale=.65;g.art.meta.orb_pillar.world_scale=1.25}
    if(test.label==='footer-imported-scale'){
      g.room.decorLamps=[];
      for(const name of ['gear','orb_cyan']){g.art.regions[name]=[...artManifest.regions[name]];g.art.meta[name]={...artManifest.region_meta[name],tint_strength:0}}
      g.art.meta.gear.world_scale=4;
    }
    if(test.label==='rotated-subrect'){
      g.art.normalImg=null;const drawDecor=g.painter.drawDecor;
      g.painter.drawDecor=function(ctx,room){drawDecor.call(this,ctx,room);return this.spriteSubrect(ctx,'lamp_blue',0,70,82,70,168.25,124.5,9.7416,8.316,{anchor:'center',rot:.37,flip:true,alpha:.8})};
    }
    const baseTile=g.painter.baseTile;
    g.painter.baseTile=function(ctx,tx,ty,...args){const prior=ctx.floorCell;ctx.floorCell=tx+','+ty;try{return baseTile.call(this,ctx,tx,ty,...args)}finally{ctx.floorCell=prior}};
    refresh(g);const previous=g.staticTerrainSnapshot,actors=actorState(g),materials=materialSnapshot(g.renderer);g.room.water.add(test.cell);
    traceCanvases=true;
    try{
      // Compare the full production command stream with the frozen accepted
      // builder, then compare the patch after removing only its guard wrapper.
      const fullColor=g.painter.build(g.room,g.state,test.width,test.height),fullMaps=g.painter.lastMaterialMaps,fullCtx=fullColor.context;
      const legacyColor=production.legacyFullBuild.call(g.painter,g.room,g.state,test.width,test.height),legacyMaps=g.painter.lastMaterialMaps;
      assert.deepStrictEqual(fullCtx.commands,legacyColor.context.commands,'full color commands remain identical to the accepted full renderer');
      assert.deepStrictEqual(fullCtx.floorCommands,legacyColor.context.floorCommands,'full floor command stream remains identical to the accepted renderer');
      for(const channel of ['normal','spec'])assert.deepStrictEqual(fullMaps[channel].context.commands,legacyMaps[channel].context.commands,'full '+channel+' commands retain accepted composition');
      for(const canvas of [fullColor,fullMaps.normal,fullMaps.spec,legacyColor,legacyMaps.normal,legacyMaps.spec])canvas.width=canvas.height=1;
      g.painter.lastMaterialMaps=null;
      const first=allocations.length,stats=refresh(g),created=allocations.slice(first);
      assert.strictEqual(stats.mode,'patch',test.label);assert.strictEqual(created.length,1);assert.strictEqual(stats.regions.length,1);
      const region=stats.regions[0],ctx=created[0].context;
      assert.strictEqual(region.canvasMode,'native-clip');assert.deepStrictEqual([region.canvasX,region.canvasY,region.canvasWidth,region.canvasHeight],[0,0,test.width,test.height]);
      assert(region.rasterX>0&&region.rasterY>0,'the regression must distinguish a local guard from global canvas origin');
      assert.deepStrictEqual(withoutNativeClip(ctx),canonical(fullCtx.commands),'native coordinates, gradients, atlas transforms and footer commands equal the accepted full sequence');
      assert.deepStrictEqual(ctx.commands.slice(0,5).map(c=>[c.name,c.args]),[['save',[]],['beginPath',[]],['rect',[region.rasterX,region.rasterY,region.rasterWidth,region.rasterHeight]],['clip',[]],['scale',[test.width/640,test.height/360]]],'native setup cannot issue an extra identity translation');
      assert.deepStrictEqual(ctx.images,fullCtx.images,'actual HDArtSheet source rectangles, destination corners and transformations match full drawing');
      assert.strictEqual(ctx.images.length,test.label==='floor-only'?0:test.label==='rotated-subrect'?3:2);
      if(test.label==='objective-substitution')assert.deepStrictEqual(ctx.images[1].source,artManifest.regions.lamp_orange);
      const expectedCells=[],guard=[region.rasterX,region.rasterY,region.rasterX+region.rasterWidth,region.rasterY+region.rasterHeight];
      for(let y=region.ty0;y<region.ty1;y++)for(let x=region.tx0;x<region.tx1;x++)expectedCells.push(x+','+y);
      assert.deepStrictEqual([...ctx.floorCommands.keys()],expectedCells,'only the bounded local guard inputs are replayed in original row-major order');
      for(const [cell,commands] of ctx.floorCommands){
        assert.deepStrictEqual(canonical(commands),canonical(fullCtx.floorCommands.get(cell)),'floor command geometry/state equals the full renderer at '+cell);
        assert(commands.every(c=>JSON.stringify(c.clip)===JSON.stringify(guard)),'every floor command retains the native guard');
      }
      assert(ctx.commands.slice(3).every(c=>JSON.stringify(c.clip)===JSON.stringify(guard)),'overlays, gradients and footer preserve the guard through nested save/restore');
      assert.strictEqual(ctx.clipBounds,null,'final restore releases the temporary drawing clip');assert.strictEqual(ctx.floorCommands.size,stats.rasterCells);
      assert.strictEqual(stats.rasterPixels,region.rasterWidth*region.rasterHeight);assert.strictEqual(stats.scratchBytes,test.width*test.height*4);assert.strictEqual(stats.scratchAllocationBytes,test.width*test.height*4);
      assert.strictEqual(stats.uploadBytes,region.width*region.height*4);assert(stats.scratchPixels>stats.rasterPixels&&stats.rasterPixels>stats.pixels,'canvas capacity, clipped drawing and tight upload are separate observations');
      assertMaterialsRetained(g.renderer,materials);assert.deepStrictEqual(g.staticTerrainSnapshot.dependencies,previous.dependencies);assert.deepStrictEqual(g.staticTerrainSnapshot.references,previous.references);assert.strictEqual(actorState(g),actors);
      if(test.label==='floor-only'){
        // Negative control: an extra translate(-0,-0) preserves the mathematical
        // CTM, but must still fail our exact accepted-command comparison.
        const scale=FakeContext.prototype.scale;let bad=null;
        FakeContext.prototype.scale=function(...args){this.translate(-0,-0);return scale.apply(this,args)};
        try{bad=g.painter.buildPatch(g.room,g.state,test.width,test.height,region);assert.throws(()=>withoutNativeClip(bad.context),/native clip is the sole setup difference/)}
        finally{FakeContext.prototype.scale=scale;if(bad)bad.width=bad.height=1;g.painter.lastMaterialMaps=null}
        scenarios++;
      }
      const count=allocations.length,uploads=g.renderer.gl.uploads.length;assert.strictEqual(refresh(g).mode,'noop');assert.strictEqual(allocations.length,count);assert.strictEqual(g.renderer.gl.uploads.length,uploads);assert.strictEqual(actorState(g),actors);scenarios+=2;
    }finally{traceCanvases=false}
  }
}

function nativeClipCapacityAndFallbacks(){
  // Guards can overlap, but drawing and independently allocated native targets
  // are summed. The previous backing must be released before the next begins.
  {
    const g=spriteFixture(),observed=observedOverlayPrimitives(g);refresh(g);const actors=actorState(g),buildPatch=g.painter.buildPatch,first=allocations.length;let lastCanvas=null,patches=0;
    g.painter.buildPatch=function(...args){if(lastCanvas)assert(lastCanvas.width===1&&lastCanvas.height===1,'release each native target before allocating the next');lastCanvas=buildPatch.apply(this,args);patches++;return lastCanvas};
    g.room.water.add('3,2');g.room.water.add('6,2');const stats=refresh(g);
    assert.strictEqual(stats.mode,'patch');assert.strictEqual(patches,2);assert.strictEqual(allocations.length-first,2);
    const expected=Array.from(stats.regions,r=>expectedOverlayRaster(r,observed.bounds,997,563));
    assert.deepStrictEqual(Array.from(stats.regions,r=>[r.rasterX,r.rasterY,r.rasterWidth,r.rasterHeight]),expected.map(r=>r.raster),'guards enclose actual sprite/circle geometry independently of the dry collector');
    assert.deepStrictEqual(expected.map(r=>r.raster),[[32,16,144,128],[48,16,176,128]],'the existing mounted glow enlarges both unchanged fixture regions');
    assert.strictEqual(stats.rasterPixels,expected.reduce((n,r)=>n+r.pixels,0));assert.strictEqual(stats.rasterCells,expected.reduce((n,r)=>n+r.floorCells,0));assert.strictEqual(stats.rasterPixels,40960);assert.strictEqual(stats.rasterCells,119);assert.strictEqual(stats.scratchPixels,997*563);assert.strictEqual(stats.scratchBytes,997*563*4);
    assert.strictEqual(stats.scratchAllocations,2);assert.strictEqual(stats.scratchAllocationBytes,997*563*8);assert.strictEqual(stats.pixels,1798);assert.strictEqual(stats.uploadCalls,2);assert.strictEqual(stats.uploadBytes,1798*4);assert.strictEqual(actorState(g),actors);scenarios++;
  }
  const eligible=[
    {width:997,height:563,cells:['19,10']},{width:997,height:360,cells:['19,10']},{width:640,height:563,cells:['19,10']},
    {width:997,height:563,cells:['10,7']},{width:997,height:563,cells:['3,3','13,3','23,3']},
    {width:1278,height:718,cells:['3,3','13,3']},{width:1024,height:1024,cells:['3,3','13,3']}
  ];
  for(const test of eligible){
    const g=spriteFixture(test.width,test.height);g.room.decorLamps=[{tile:[10,8]}];refresh(g);g.room.water=new Set(test.cells);const stats=refresh(g);
    assert.strictEqual(stats.mode,'patch','ordinary local drawing budgets must permit fractional far/mounted/multi-region edits');assert.strictEqual(stats.scratchMode,'native-clip');assert.strictEqual(stats.regions.length,test.cells.length);
    assert.strictEqual(stats.scratchPixels,test.width*test.height);assert.strictEqual(stats.scratchAllocationPixels,test.width*test.height*test.cells.length);
    assert(stats.scratchPixels<=1048576&&stats.scratchAllocationPixels<=2097152,'native peak and cumulative capacity stay independently bounded');
    assert(stats.rasterPixels<=test.width*test.height*.20&&stats.rasterCells<=760*.35,'local drawing budgets retain their original limits');scenarios++;
  }
  const fallbacks=[
    {label:'native-peak-one-pixel-row-over',width:1025,height:1024,cells:['3,3'],reason:'scratch-budget'},
    {label:'native-peak-large-target',width:2000,height:1000,cells:['14,6'],reason:'scratch-budget'},
    {label:'997-four-allocations',width:997,height:563,cells:['3,3','13,3','23,3','33,3'],reason:'scratch-allocation-budget'},
    {label:'benchmark-three-allocations',width:1278,height:718,cells:['3,3','13,3','23,3'],reason:'scratch-allocation-budget'},
    {label:'native-cap-three-allocations',width:1024,height:1024,cells:['3,3','13,3','23,3'],reason:'scratch-allocation-budget'}
  ];
  for(const test of fallbacks){
    const g=spriteFixture(test.width,test.height);refresh(g);const previous=g.staticTerrainSnapshot,actors=actorState(g),first=allocations.length,attemptStart=allocationAttempts.length,uploads=g.renderer.gl.uploads.length,phaseStart=phases.length,build=g.painter.build;
    g.room.water=new Set(test.cells);const plan=terrain.plan(previous,terrain.capture(g.room,g.staticTerrainContext()));assert.strictEqual(plan.kind,'full',test.label);assert.strictEqual(plan.reason,test.reason);
    const probe=terrain.plan(previous,terrain.capture(g.room,g.staticTerrainContext()),{maxNativeScratchPixels:4000000,maxScratchAllocationPixels:8000000});
    assert.strictEqual(probe.kind,'patch','only the explicit capacity policy forces this full fallback');assert(probe.rasterPixels<test.width*test.height*.20&&probe.rasterCellCount<760*.35);
    g.painter.buildPatch=()=>{throw Error('capacity fallback must precede every partial build')};
    g.painter.staticOverlayBounds=()=>{throw Error('basic capacity fallback must skip overlay bounds work')};
    g.painter.build=function(...args){assert.strictEqual(allocations.length,first,'no partial scratch before a planned capacity fallback');assert.strictEqual(allocationAttempts.length,attemptStart,'not even a failed partial allocation may precede fallback');assert.strictEqual(g.renderer.gl.uploads.length,uploads);return build.apply(this,args)};
    const stats=refresh(g);assert.strictEqual(stats.mode,'full');assert.strictEqual(stats.reason,test.reason);assert.strictEqual(stats.uploadCalls,3);assert.strictEqual(stats.regions.length,0);assert.strictEqual(stats.rasterCells,760);assert.strictEqual(allocations.length-first,3);
    assert.strictEqual(stats.scratchAllocationPixels,test.width*test.height*3);assert(!phases.slice(phaseStart).some(name=>name.startsWith('static.patch.')));
    assert.deepStrictEqual(g.staticTerrainSnapshot.dependencies,previous.dependencies);assert.deepStrictEqual(g.staticTerrainSnapshot.references,previous.references);assert.strictEqual(actorState(g),actors);scenarios++;
  }
  // Integer native scales continue to allocate only the local guard, even when
  // the full native frame is larger than the fractional-capacity policy permits.
  for(const [width,height] of [[640,360],[1280,720],[2560,1440]]){
    const g=spriteFixture(width,height);refresh(g);g.room.water.add('19,10');const stats=refresh(g),region=stats.regions[0];
    assert.strictEqual(stats.mode,'patch');assert.strictEqual(stats.scratchMode,'local');assert(region.rasterX>0&&region.rasterY>0);assert.strictEqual(stats.uploadCalls,1);
    assert.deepStrictEqual([region.canvasX,region.canvasY,region.canvasWidth,region.canvasHeight],[region.rasterX,region.rasterY,region.rasterWidth,region.rasterHeight]);
    assert.strictEqual(stats.scratchPixels,region.rasterWidth*region.rasterHeight);assert(stats.scratchPixels<=262144&&stats.scratchAllocationPixels<=2097152);scenarios++;
  }
  // A failed later native-color upload synchronously repairs all three maps;
  // report both successful transient targets plus the three full repair maps.
  {
    const g=spriteFixture();refresh(g);g.room.water.add('3,2');g.room.water.add('6,2');g.renderer.gl.failSubAt=2;
    const stats=refresh(g);assert.strictEqual(stats.mode,'full');assert.strictEqual(stats.reason,'patch-failed');assert.strictEqual(stats.uploadCalls,5);assert.strictEqual(stats.regions.length,2);
    assert(stats.regions.every(r=>r.canvasMode==='native-clip'&&r.rasterX>0&&r.canvasX===0));assert.strictEqual(stats.rasterPixels,997*563+40960);assert.strictEqual(stats.scratchBytes,997*563*12);
    assert.strictEqual(stats.scratchAllocations,5);assert.strictEqual(stats.scratchAllocationAttempts,5);assert.strictEqual(stats.scratchAllocationBytes,997*563*20);assert.strictEqual(g.renderer.backgroundReady,true);scenarios++;
  }
}

function nativeClipAllocationFailures(){
  for(const kind of ['clip','first-allocation','later-allocation']){
    const g=fixture();g.renderer.nativeW=997;g.renderer.nativeH=563;refresh(g);g.room.water.add('3,2');if(kind==='later-allocation')g.room.water.add('6,2');
    const first=allocations.length,clip=FakeContext.prototype.clip;let injected=false;
    if(kind==='clip')FakeContext.prototype.clip=function(){const result=clip.call(this);if(!injected){injected=true;throw Error('injected native guard clip failure')}return result};
    else faults.allocationAt=faults.allocationCalls+(kind==='later-allocation'?2:1);
    try{
      const stats=refresh(g),successes=kind==='first-allocation'?3:4;
      assert.strictEqual(stats.mode,'full');assert.strictEqual(stats.reason,'patch-failed');assert.strictEqual(stats.scratchMode,'full');
      assert.strictEqual(stats.scratchAllocationAttempts,kind==='later-allocation'?5:4);assert.strictEqual(stats.scratchAllocations,successes);
      assert.strictEqual(stats.scratchAllocationBytes,successes*997*563*4,'failed constructors cannot count capacity; completed partial and full repair canvases must count');
      assert.strictEqual(stats.scratchBytes,997*563*12);assert.strictEqual(stats.uploadCalls,kind==='later-allocation'?4:3);assert.strictEqual(g.renderer.backgroundReady,true);
      if(kind==='clip'){assert(injected);assert.strictEqual(allocations[first].context.clips.length,1,'failure occurred after applying the real native clip')}
      released(g,first);scenarios++;
    }finally{FakeContext.prototype.clip=clip;faults.allocationAt=0}
  }
}

function fullPatchNoopAndHistory(){
  const g=fixture(),r=g.renderer,gl=r.gl;
  let finish=observeCommit(g,undefined),stats=refresh(g);assert.strictEqual(finish(),3);
  assert.strictEqual(stats.mode,'full');assert.strictEqual(stats.reason,'missing-baseline');assert.strictEqual(stats.rasterCells,760);assert.strictEqual(stats.uploadCalls,3);assert.strictEqual(stats.uploadBytes,640*360*12);assert.strictEqual(r.backgroundRevision,1);assert(g.staticTerrainSnapshot.valid&&g.bgKey);
  let previous=g.staticTerrainSnapshot;g.room.water.add('6,7');finish=observeCommit(g,previous);stats=refresh(g);assert.strictEqual(finish(),1);
  assert.strictEqual(stats.mode,'patch');assert.strictEqual(stats.uploadCalls,1);assert.strictEqual(gl.fullCount,3,'eligible patch must not use texImage2D');assert(stats.rasterCells<=81&&stats.pixels<640*360);assert.strictEqual(stats.uploadBytes,stats.pixels*4);assert.strictEqual(stats.scratchBytes,stats.scratchPixels*4);assert.strictEqual(g.staticTerrainSnapshot.cellTypes[7*40+6],terrain.CELL_TYPES.water);assert.strictEqual(r.backgroundRevision,2);
  const firstRegion=stats.regions[0],upload=gl.uploads.find(x=>x.mode==='patch');assert.strictEqual(upload.x,firstRegion.x);assert.strictEqual(upload.y,360-firstRegion.y-firstRegion.height,'native y offset must account for flipped texture storage');assert(gl.uploads.every(u=>u.flip===true));
  assert.strictEqual(upload.width,firstRegion.width);assert.strictEqual(upload.height,firstRegion.height);assert.strictEqual(upload.sourceWidth,firstRegion.rasterWidth);assert.strictEqual(upload.sourceHeight,firstRegion.rasterHeight);
  assert.strictEqual(upload.skipPixels,firstRegion.x-firstRegion.rasterX);assert.strictEqual(upload.skipRows,firstRegion.rasterHeight-(firstRegion.y-firstRegion.rasterY)-firstRegion.height);assert(stats.rasterPixels>stats.pixels,'filtering guard must be rastered without being uploaded');
  const count=allocations.length;stats=refresh(g);assert.strictEqual(stats.mode,'noop');assert.strictEqual(stats.uploadCalls,0);assert.strictEqual(stats.rasterCells,0);assert.strictEqual(stats.pixels,0);assert.strictEqual(stats.scratchPixels,0);assert.strictEqual(allocations.length,count,'unchanged static state creates no canvases');assert.strictEqual(r.backgroundRevision,2);
  g.room.water.delete('6,7');g.room.water.add('30,14');stats=refresh(g);assert.strictEqual(stats.mode,'patch');assert.strictEqual(stats.changedCells,2);assert.strictEqual(stats.regions.length,2);assert.strictEqual(stats.uploadCalls,2);assert(stats.rasterCells<=162&&stats.pixels<10000);assert.strictEqual(r.backgroundRevision,4);
  // Production editor history replaces one raw room and rebinds Room while
  // retaining the source map. The runtime must accept this as a bounded delta.
  g.maps.rooms.fixture={walls:[],water:[[6,7]],path_cells:[],floor_microtile:4};g.room=new production.Room(0,g.room.spec,g.maps);g.room.border.clear();stats=refresh(g);assert.strictEqual(stats.mode,'patch');assert.strictEqual(stats.changedCells,2);
  g.maps.rooms.fixture.water=[[30,14]];g.room=new production.Room(0,g.room.spec,g.maps);g.room.border.clear();stats=refresh(g);assert.strictEqual(stats.mode,'patch');assert.strictEqual(stats.changedCells,2);
  assert(phases.includes('static.plan')&&phases.includes('static.patch.floor')&&phases.includes('static.patch.overlays-materials')&&phases.includes('static.patch.upload.color'));assert(!phases.includes('static.patch.upload.normal')&&!phases.includes('static.patch.upload.specular'));
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

function rowSynchronizationPolicy(){
  assert.strictEqual(production.StaticPainter.COLOR_POLICY,'canvas2d-row-sync-v1');
  for(const [width,height] of [[640,360],[997,563],[1280,720]]){
    const g=fixture();g.renderer.nativeW=width;g.renderer.nativeH=height;
    const first=syncReads.length,full=refresh(g);
    assert.strictEqual(full.colorSyncReads,19);assert.strictEqual(full.colorSyncMs,47.5);
    assert.deepStrictEqual(syncReads.slice(first).map(read=>read.lastCell),Array.from({length:19},(_,y)=>[39,y]),'full synchronization follows each complete authored row');
    g.room.water.add('6,7');g.room.paths.add('30,14');const patchStart=syncReads.length,patch=refresh(g);
    assert.strictEqual(patch.mode,'patch');assert.strictEqual(patch.regions.length,2);
    const expected=Array.from(patch.regions).flatMap(r=>Array.from({length:r.ty1-r.ty0},(_,i)=>[r.tx1-1,r.ty0+i]));
    assert.deepStrictEqual(syncReads.slice(patchStart).map(read=>read.lastCell),expected,'partial synchronization follows each actually painted row without expanding floor input');
    assert.strictEqual(patch.colorSyncAttempts,expected.length);assert.strictEqual(patch.colorSyncPixels,expected.length);assert.strictEqual(patch.colorSyncMs,expected.length*2.5);
    const noop=refresh(g);for(const key of ['colorSyncAttempts','colorSyncReads','colorSyncPixels','colorSyncMs','readbackPixels'])assert.strictEqual(noop[key],0,'unchanged authority has no '+key);
    const forced=refresh(g,{force:true});assert.strictEqual(forced.reason,'forced');assert.strictEqual(forced.colorSyncReads,19);
    assert.strictEqual(g.staticTerrainSnapshot.colorPolicy,g.painter.colorPolicy);assert(g.bgKey.endsWith('|'+g.painter.colorPolicy));scenarios+=4;
  }
  for(const changeTerrain of [false,true]){
    const g=fixture();refresh(g);const previous=g.staticTerrainSnapshot,key=g.bgKey,tint=new FakeCanvas(7,9),normal=new FakeCanvas(11,13);
    g.art.tintCache.set('retained-policy-tint',tint);g.art.normalTransformCache.set('retained-policy-normal',normal);
    Object.defineProperty(g.painter,'colorPolicy',{configurable:true,value:'canvas2d-row-sync-v2'});
    assert.notStrictEqual(g.editorBackgroundKey(),key,'policy revision invalidates the ordinary background key too');if(changeTerrain)g.room.water.add('6,7');
    const stats=refresh(g);assert.strictEqual(stats.mode,'full');assert.strictEqual(stats.reason,'color-policy');assert.strictEqual(stats.colorSyncReads,19);
    assert.strictEqual(g.staticTerrainSnapshot.colorPolicy,'canvas2d-row-sync-v2');assert.strictEqual(g.staticTerrainSnapshot.resourceSignature,previous.resourceSignature);assert.deepStrictEqual(g.staticTerrainSnapshot.references,previous.references);assert.deepStrictEqual(g.staticTerrainSnapshot.dependencies,previous.dependencies);
    assert.strictEqual(g.art.tintCache.get('retained-policy-tint'),tint);assert.strictEqual(g.art.normalTransformCache.get('retained-policy-normal'),normal);assert.deepStrictEqual([tint.width,tint.height,normal.width,normal.height],[7,9,11,13],'a color policy revision cannot release unchanged derived atlas surfaces');
    assert.strictEqual(refresh(g).mode,'noop');delete g.painter.colorPolicy;assert.strictEqual(refresh(g).reason,'color-policy');
    g.art.tintCache.clear();g.art.normalTransformCache.clear();tint.width=tint.height=normal.width=normal.height=1;scenarios+=3;
  }
}

function synchronizationFailuresAndRepair(){
  for(const kind of ['first-patch-row','last-patch-row','second-region-row']){
    const g=fixture();refresh(g);g.room.water.add('6,7');if(kind==='second-region-row')g.room.water.add('30,14');
    const plan=terrain.plan(g.staticTerrainSnapshot,terrain.capture(g.room,g.staticTerrainContext())),firstRows=plan.regions[0].ty1-plan.regions[0].ty0;
    const offset=kind==='first-patch-row'?1:kind==='last-patch-row'?firstRows:firstRows+1,first=allocations.length,readStart=syncReads.length;
    faults.syncAt=faults.syncCalls+offset;
    try{
      const stats=refresh(g);assert.strictEqual(stats.mode,'full');assert.strictEqual(stats.reason,'patch-failed');assert.match(stats.repairError,/color synchronization failure/);
      assert.strictEqual(stats.colorSyncAttempts,offset+19);assert.strictEqual(stats.colorSyncReads,offset-1+19);assert.strictEqual(stats.colorSyncMs,(offset+19)*2.5);
      assert.strictEqual(stats.uploadCalls,kind==='second-region-row'?4:3,'only completely synchronized color patches upload before full repair');
      assert.strictEqual(syncReads.slice(readStart).filter(read=>!read.success).length,1);assert.strictEqual(g.renderer.backgroundReady,true);released(g,first);scenarios++;
    }finally{faults.syncAt=0}
  }
  for(const offset of [1,19]){
    const g=fixture(),first=allocations.length,readStart=syncReads.length;faults.syncAt=faults.syncCalls+offset;
    try{
      assert.throws(()=>g.refreshEditorStatic(),/color synchronization failure/);assertSyncAccounting(g,g.staticRefreshStats,readStart);released(g,first);
      assert.strictEqual(g.staticRefreshStats.colorSyncAttempts,offset);assert.strictEqual(g.staticRefreshStats.colorSyncReads,offset-1);assert.strictEqual(g.staticRefreshStats.colorSyncMs,offset*2.5);
      assert.strictEqual(g.renderer.backgroundUploadCalls,0);assert.strictEqual(g.renderer.backgroundReady,false);assert.strictEqual(g.staticTerrainSnapshot,null);assert.strictEqual(g.staticBackgroundRevision,null);assert.strictEqual(g.bgKey,'');
    }finally{faults.syncAt=0}
    assert.strictEqual(refresh(g).colorSyncReads,19);scenarios++;
  }
  const g=fixture();refresh(g);g.room.paths.add('9,9');const first=allocations.length,readStart=syncReads.length,uploadStart=g.renderer.backgroundUploadCalls;faults.syncFrom=faults.syncCalls+1;
  try{
    assert.throws(()=>g.refreshEditorStatic(),/color synchronization failure/);assertSyncAccounting(g,g.staticRefreshStats,readStart);released(g,first);
    assert.strictEqual(g.staticRefreshStats.colorSyncAttempts,2,'both failed partial synchronization and failed full repair are charged');assert.strictEqual(g.staticRefreshStats.colorSyncReads,0);assert.strictEqual(g.staticRefreshStats.colorSyncMs,5);
    assert.strictEqual(g.renderer.backgroundUploadCalls,uploadStart);assert.strictEqual(g.renderer.backgroundReady,false);assert.strictEqual(g.staticTerrainSnapshot,null);assert.strictEqual(g.staticBackgroundRevision,null);assert.strictEqual(g.bgKey,'');
  }finally{faults.syncFrom=0}
  assert.strictEqual(refresh(g).colorSyncReads,19);scenarios++;
}

function materialPreservationAndDependencies(){
  // Cache turnover cannot invalidate a color-only delta: the normal/specular
  // GPU contents keep their original backing and are never rerastered here.
  {
    const g=fixture();refresh(g);const first=allocations.length,full=g.renderer.gl.fullCount;
    g.art.normalTransformGeneration+=100;
    assert.strictEqual(refresh(g).mode,'noop');assert.strictEqual(allocations.length,first);
    const overlay=g.painter.patternDecor;let overlays=0,dryOverlays=0;
    g.painter.patternDecor=function(...args){assert(!this.materialNormalCtx&&!this.materialSpecCtx,'partial overlays have no material drawing contexts');if(args[0]===null)dryOverlays++;else overlays++;return overlay.apply(this,args)};
    g.painter.build=()=>{throw Error('normal cache pressure must not force a terrain full build')};
    g.room.water.add('6,7');const stats=refresh(g);
    assert.strictEqual(stats.mode,'patch');assert.strictEqual(stats.uploadCalls,1);assert.strictEqual(g.renderer.gl.fullCount,full);assert.strictEqual(overlays,1,'exactly one real overlay paint');assert.strictEqual(dryOverlays,1,'one metadata-only placement replay');assert.strictEqual(g.painter.lastMaterialMaps,null);scenarios+=2;
  }
  for(const changedAt of [1,2]){
    const g=fixture();refresh(g);const previous=g.staticTerrainSnapshot,revision=g.renderer.backgroundRevision,patch=g.painter.buildPatch;let patches=0;
    g.room.water.add('6,7');g.room.water.add('30,14');
    g.painter.buildPatch=function(...args){const canvas=patch.apply(this,args);assert.strictEqual(this.lastMaterialMaps,null);if(++patches===changedAt)g.art.normalTransformGeneration++;return canvas};
    g.painter.build=()=>{throw Error('normal cache turnover during color replay must not force a full build')};
    const finish=observeCommit(g,previous),stats=refresh(g);assert.strictEqual(finish(),2);assert.strictEqual(patches,2);
    assert.strictEqual(stats.mode,'patch');assert.strictEqual(stats.uploadCalls,2);assert.strictEqual(g.renderer.gl.fullCount,3);assert.strictEqual(g.renderer.backgroundRevision,revision+2);assert.strictEqual(stats.repairError,undefined);scenarios++;
  }
  // A terrain edit must not hide a simultaneous change to a real static
  // material dependency. Every case requires a full three-channel refresh.
  const dependencies=[
    ['dependency:pattern',g=>g.room.spec.pattern='lane'],
    ['dependency:walls',g=>g.room.walls.add('4,4')],
    ['dependency:border',g=>g.room.border.add('4,4')],
    ['dependency:blocker-styles',g=>g.room.blockerStyles['4,4']={kind:'wall',sprite:'fixture'}],
    ['dependency:trees',g=>g.room.largeTrees.push({sprite:'fixture',tile:[10,8]})],
    ['dependency:lamps',g=>g.room.decorLamps.push({tile:[10,8],lamp:'lamp_blue'})],
    ['dependency:decor-exclusions',g=>g.room.decorExclusions.add('10,8')],
    ['dependency:pattern-exclusions',g=>g.room.patternExclusions.add('lane:lamp:0')],
    ['dependency:bridge-topology',g=>g.room.bridgeCells.add('10,8')],
    ['dependency:objective-kinds',g=>g.room.spec.objects.push({kind:'lamp',object_id:'fixture-lamp'})],
    ['lut',g=>g.luts.data.test[0]='#654321'],
    ['identity:atlasRef',g=>g.art.img={...g.art.img}],
    ['identity:normalRef',g=>g.art.normalImg={...g.art.normalImg}],
    ['identity:specularRef',g=>g.art.specImg={...g.art.specImg}],
    ['resource',g=>g.art.regions.fixture=[0,0,8,8]],
    ['resource',g=>g.art.roles.fixture=['lamp_blue']],
    ['resource',g=>g.art.meta.fixture={material:'metal'}],
    ['resource',g=>g.art.worldScale=.2]
  ];
  for(const [reason,change] of dependencies){
    const g=fixture();refresh(g);const previous=g.staticTerrainSnapshot,materials=materialSnapshot(g.renderer),first=allocations.length;
    g.room.water.add('6,7');change(g);const finish=observeCommit(g,previous),stats=refresh(g);
    assert.strictEqual(finish(),3);assert.strictEqual(stats.mode,'full');assert.strictEqual(stats.reason,reason);
    assert.strictEqual(stats.uploadCalls,3);assert.strictEqual(g.renderer.gl.subCount,0);assert.strictEqual(allocations.length-first,3);
    assert.strictEqual(stats.uploadBytes,640*360*12);assert.strictEqual(stats.scratchBytes,640*360*12);
    for(const saved of materials){const current=g.renderer.gl.textures.get(g.renderer[saved.key]);assert.notStrictEqual(current,saved.texture,'real material dependency requires a replacement full upload');assert.notDeepStrictEqual(current.bytes,saved.bytes,'simulated material upload bytes must reflect the replacement')}
    scenarios++;
  }
}

function repairedUploadFailures(){
  for(const mode of ['first-color','later-region','gl-error']){
    const g=fixture();refresh(g);const r=g.renderer,gl=r.gl,previous=g.staticTerrainSnapshot,revision=r.backgroundRevision,first=allocations.length;
    g.room.water.add('6,7');if(mode==='later-region')g.room.water.add('30,14');
    if(mode==='gl-error')gl.errorSubAt=gl.subCount+1;else gl.failSubAt=gl.subCount+(mode==='later-region'?2:1);
    const finish=observeCommit(g,previous),stats=refresh(g),attempts=finish();
    assert.strictEqual(stats.mode,'full');assert.strictEqual(stats.reason,'patch-failed');assert(stats.repairError);assert.strictEqual(stats.uploadCalls,attempts);assert.strictEqual(gl.fullCount,6,'failed bounded upload must synchronously rebuild/upload all three maps');assert.strictEqual(r.backgroundReady,true);assert.strictEqual(r.backgroundRevision,revision+(mode==='later-region'?2:1));assert.notStrictEqual(g.staticTerrainSnapshot,previous);assert(g.bgKey);
    assert.strictEqual(stats.scratchPixels,640*360);assert.strictEqual(stats.scratchBytes,640*360*12);assert(stats.rasterCells>760);released(g,first);scenarios++;
  }
  const g=fixture();refresh(g);const gl=g.renderer.gl;g.room.paths.add('8,9');gl.failSubAt=gl.subCount+1;gl.failFullAt=gl.fullCount+1;
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
  assert.strictEqual(gl.subCount,1,'first region must upload its color channel');
  assert.strictEqual(r.backgroundRevision,revision+1,'only the first complete region advanced renderer revision');
  assert.strictEqual(r.backgroundReady,false,'later raster/repair failure must invalidate readiness left by the first region');
  assert.strictEqual(g.staticTerrainSnapshot,null);assert.strictEqual(g.staticBackgroundRevision,null);assert.strictEqual(g.bgKey,'');
  assert.strictEqual(g.staticRefreshStats.reason,'refresh-failed');released(g,first);
  g.painter.build=build;g.painter.buildPatch=patch;
  const stats=refresh(g);assert.strictEqual(stats.mode,'full');assert.strictEqual(stats.reason,'missing-baseline');assert.strictEqual(stats.uploadCalls,3);
  assert.strictEqual(r.backgroundReady,true);assert.strictEqual(r.backgroundRevision,revision+2);assert.notStrictEqual(g.staticTerrainSnapshot,previous);scenarios++;
}

function rasterAndAllocationFailures(){
  for(const kind of ['raster','first-patch-allocation','later-patch-allocation']){
    const g=fixture();refresh(g);g.room.water.add('11,8');const first=allocations.length;
    if(kind==='later-patch-allocation')g.room.water.add('30,14');
    if(kind==='raster')faults.rasterAt=faults.rasterCalls+4;
    else faults.allocationAt=faults.allocationCalls+(kind==='later-patch-allocation'?2:1);
    const stats=refresh(g);assert.strictEqual(stats.mode,'full');assert.strictEqual(stats.reason,'patch-failed');assert.strictEqual(stats.uploadCalls,kind==='later-patch-allocation'?4:3,'only completed regions may upload before synchronous repair');released(g,first);faults.allocationAt=faults.rasterAt=0;scenarios++;
  }
  // Full composition still owns three canvases; retain partial-allocation and
  // raster-failure cleanup coverage for that path as well as color patches.
  for(const kind of ['raster','second-allocation','third-allocation']){
    const g=fixture(),first=allocations.length;
    if(kind==='raster')faults.rasterAt=faults.rasterCalls+4;else faults.allocationAt=faults.allocationCalls+(kind==='second-allocation'?2:3);
    assert.throws(()=>g.refreshEditorStatic(),/injected floor raster failure|injected canvas allocation failure/);released(g,first);assert.strictEqual(g.staticTerrainSnapshot,null);assert.strictEqual(g.bgKey,'');assert.strictEqual(g.renderer.backgroundReady,false);assert.strictEqual(g.renderer.backgroundUploadCalls,0);
    faults.rasterAt=faults.allocationAt=0;assert.strictEqual(refresh(g).mode,'full');scenarios++;
  }
}

function guardedEdgeRasterMetrics(){
  for(const [width,height,cell] of [[640,360,'0,0'],[640,360,'39,18'],[997,563,'0,18'],[997,563,'39,0']]){
    const g=fixture();g.renderer.nativeW=width;g.renderer.nativeH=height;refresh(g);g.room.water.add(cell);
    const stats=refresh(g),region=stats.regions[0],uploads=g.renderer.gl.uploads.filter(u=>u.mode==='patch');
    assert.strictEqual(stats.mode,'patch');assert.strictEqual(stats.regions.length,1);assert.strictEqual(uploads.length,1);
    assert(region.rasterX>=0&&region.rasterY>=0&&region.rasterX+region.rasterWidth<=width&&region.rasterY+region.rasterHeight<=height,'native-edge guards remain within the full source');
    assert(region.rasterWidth>region.width&&region.rasterHeight>region.height,'edge clipping preserves the filtering guard on the interior sides');
    assert.strictEqual(stats.rasterCells,(region.tx1-region.tx0)*(region.ty1-region.ty0));assert(stats.rasterCells<=760*.35,'guarded floor work retains the existing raster budget');
    for(const u of uploads){
      assert.strictEqual(u.width,region.width);assert.strictEqual(u.height,region.height);assert.strictEqual(u.sourceWidth,region.canvasWidth);assert.strictEqual(u.sourceHeight,region.canvasHeight);
      assert.strictEqual(u.skipPixels,region.x-region.canvasX);assert.strictEqual(u.skipRows,region.canvasY+region.canvasHeight-region.y-region.height);
    }
    assert.strictEqual(stats.uploadBytes,region.width*region.height*4);assert.strictEqual(stats.scratchBytes,region.canvasWidth*region.canvasHeight*4);scenarios++;
  }
}

function croppedUploadRestoresUnpackState(){
  // Unequal top/bottom margins distinguish flipped source-row cropping from a
  // top-origin skip. Test both normal completion and color upload failures.
  const cases=[
    {x:37,y:11,width:19,height:17,rasterX:16,rasterY:0,rasterWidth:80,rasterHeight:80,skipPixels:21,skipRows:52},
    {x:613,y:327,width:27,height:21,rasterX:576,rasterY:288,rasterWidth:64,rasterHeight:72,skipPixels:37,skipRows:12},
    {nativeW:997,nativeH:563,x:274,y:150,width:30,height:29,rasterX:240,rasterY:112,rasterWidth:96,rasterHeight:112,canvasMode:'native-clip',canvasX:0,canvasY:0,canvasWidth:997,canvasHeight:563,skipPixels:274,skipRows:384},
    {nativeW:997,nativeH:563,x:973,y:451,width:24,height:27,rasterX:928,rasterY:416,rasterWidth:69,rasterHeight:96,canvasMode:'native-clip',canvasX:0,canvasY:0,canvasWidth:997,canvasHeight:563,skipPixels:973,skipRows:85}
  ];
  for(const region of cases)for(const fault of ['none','throw','gl-error']){
    const g=fixture();g.renderer.nativeW=region.nativeW||640;g.renderer.nativeH=region.nativeH||360;refresh(g);const r=g.renderer,gl=r.gl,first=allocations.length,revision=r.backgroundRevision,bytes=r.backgroundUploadBytes,before=gl.uploads.length,materials=materialSnapshot(r);
    const canvas=new FakeCanvas(region.canvasWidth??region.rasterWidth,region.canvasHeight??region.rasterHeight);
    const seed={flip:region.y>300,skipPixels:5,skipRows:7};gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,seed.flip);gl.pixelStorei(gl.UNPACK_SKIP_PIXELS,seed.skipPixels);gl.pixelStorei(gl.UNPACK_SKIP_ROWS,seed.skipRows);
    if(fault==='throw')gl.failSubAt=1;else if(fault==='gl-error')gl.errorSubAt=1;
    if(fault==='none')r.patchBackground(region,canvas);else assert.throws(()=>r.patchBackground(region,canvas),/injected subupload|Static background subupload failed/);
    const uploads=gl.uploads.slice(before),attempts=1;
    assert.strictEqual(uploads.length,attempts);assert.deepStrictEqual(uploads.map(u=>u.texture),['color']);assertMaterialsRetained(r,materials);
    for(const u of uploads){
      assert.strictEqual(u.x,region.x);assert.strictEqual(u.y,r.nativeH-region.y-region.height);assert.strictEqual(u.width,region.width);assert.strictEqual(u.height,region.height);
      assert.strictEqual(u.sourceWidth,canvas.originalWidth);assert.strictEqual(u.sourceHeight,canvas.originalHeight);assert.strictEqual(u.flip,true);
      assert.strictEqual(u.skipPixels,region.skipPixels);assert.strictEqual(u.skipRows,region.skipRows,'flipped source crop is measured from actual canvas bottom, independently of the guard');
    }
    assert.deepStrictEqual({flip:gl.flip,skipPixels:gl.skipPixels,skipRows:gl.skipRows},seed,'all previous unpack values must be restored on success or failure');
    assert.strictEqual(r.backgroundUploadBytes-bytes,attempts*region.width*region.height*4,'guard pixels never count as uploaded bytes');
    assert.strictEqual(r.backgroundReady,fault==='none');assert.strictEqual(r.backgroundRevision,revision+(fault==='none'?1:0));
    canvas.width=canvas.height=1;
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);gl.pixelStorei(gl.UNPACK_SKIP_PIXELS,0);gl.pixelStorei(gl.UNPACK_SKIP_ROWS,0);released(g,first);scenarios++;
  }
}

function rejectInvalidPatches(){
  const g=fixture();refresh(g);const r=g.renderer,gl=r.gl,region={x:7,y:11,width:13,height:17},c=new FakeCanvas(13,17),before=gl.uploads.length,stores=gl.pixelStores.length,queries=gl.parameterQueries.length;
  for(const change of [{x:-1},{y:-1},{width:0},{height:0},{x:.5},{x:639},{y:359}])assert.throws(()=>r.patchBackground({...region,...change},c),/Stale or invalid/);
  for(const change of [{rasterX:-1},{rasterY:-1},{rasterX:7.5},{rasterY:Infinity},{rasterWidth:0},{rasterHeight:NaN},{rasterWidth:12},{rasterHeight:16},{rasterX:8},{rasterY:12},{rasterWidth:640},{rasterHeight:360}])assert.throws(()=>r.patchBackground({...region,...change},c),/Stale or invalid static background patch crop/);
  for(const change of [{canvasX:-1},{canvasY:-1},{canvasX:.5},{canvasY:Infinity},{canvasWidth:0},{canvasHeight:NaN},{canvasWidth:12},{canvasHeight:16},{canvasX:8},{canvasY:12},{canvasWidth:641},{canvasHeight:361}])assert.throws(()=>r.patchBackground({...region,...change},c),/Stale or invalid static background canvas/,'actual canvas must contain the entire guard and stay within the native frame');
  assert.throws(()=>r.patchBackground({...region,canvasMode:'native-clip'},c),/Incomplete native static projection/,'a local-sized canvas cannot claim full native projection');
  assert.throws(()=>r.patchBackground({...region,canvasMode:'native-clip',canvasX:0,canvasY:0,canvasWidth:640,canvasHeight:360},c),/Incomplete static color patch/,'actual backing must match the declared native capacity');
  assert.throws(()=>r.patchBackground({...region,canvasMode:'unknown-projection'},c),/Invalid static background canvas mode/,'unrecognized projection modes cannot use the legacy default');
  const expanded=new FakeCanvas(32,32);
  assert.throws(()=>r.patchBackground({...region,canvasMode:'local',canvasX:0,canvasY:0,canvasWidth:32,canvasHeight:32},expanded),/Incomplete local static raster/,'an explicit local canvas must exactly match its guarded raster even when a larger backing and crop are otherwise valid');
  expanded.width=expanded.height=1;
  assert.throws(()=>r.patchBackground({...region,rasterX:0,rasterY:0,rasterWidth:20,rasterHeight:28},c),/Incomplete static color patch/,'color backing must match the larger raster bounds');
  assert.throws(()=>r.patchBackground(region,null),/Incomplete static color patch/);
  c.width=12;assert.throws(()=>r.patchBackground(region,c),/Incomplete static color patch/);c.width=13;
  c.height=16;assert.throws(()=>r.patchBackground(region,c),/Incomplete static color patch/);c.height=17;
  assert.strictEqual(gl.uploads.length,before,'validation precedes every upload');assert.strictEqual(r.backgroundReady,true);
  assert.strictEqual(gl.pixelStores.length,stores,'validation precedes any unpack mutation');assert.strictEqual(gl.parameterQueries.length,queries,'invalid crop requires no driver state query');
  const revision=r.backgroundRevision;r.backgroundReady=false;assert.throws(()=>r.patchBackground(region,c),/Stale or invalid/);r.backgroundReady=true;r.backgroundSize=[639,360];assert.throws(()=>r.patchBackground(region,c),/Stale or invalid/);r.backgroundSize=[640,360];
  gl.failSubAt=gl.subCount+1;assert.throws(()=>r.patchBackground(region,c),/injected subupload/);assert.strictEqual(r.backgroundReady,false);assert.strictEqual(r.backgroundRevision,revision);assert.strictEqual(gl.flip,false);
  c.width=c.height=1;scenarios++;
}

fullPatchNoopAndHistory();staticIdentityAndStaleness();rowSynchronizationPolicy();synchronizationFailuresAndRepair();materialPreservationAndDependencies();repairedUploadFailures();contextLossSkipsWork();laterRasterFailureInvalidatesReadiness();rasterAndAllocationFailures();guardedEdgeRasterMetrics();croppedUploadRestoresUnpackState();rejectInvalidPatches();nativeClipMatchesFullCommands();nativeClipCapacityAndFallbacks();nativeClipAllocationFailures();overlayCollectorGeometryAndPurity();overlayGeometryFallbacks();
console.log('STATIC TERRAIN RUNTIME REGRESSION PERF-004 PASS');
console.log('  production Game / StaticPainter / GLRenderer scenarios:',scenarios);
console.log('  color-only guarded-raster uploads, preserved material handles/bytes, full material-dependency refreshes, asymmetric flipped crops and exact scratch/raster accounting');
console.log('  coherent snapshot/revision commits, unpack restoration, upload / GL error / context-loss repair, failed repair invalidation, allocation/raster cleanup, zero retained scratch');
console.log('  fractional native targets use bounded clips and accepted full floor/atlas command traces; local integer rasters, exact capacity/attempt accounting and early peak/cumulative fallbacks');
console.log('  far and mounted edits remain eligible, fractional capacity is capped at 4 MiB peak / 8 MiB cumulative, and every surface is released before the next allocation');
console.log('  dry whole-primitive bounds agree with actual atlas quads/circles/rounded pixels across all rooms, anchors, flips, rotations and imported footer scales; no source/cache/LUT/material mutations');
console.log('  explicit-false color policy; separate observed one-pixel row synchronization counts/time, discarded pixels, policy-only full invalidation without cache clears, failed read/repair accounting and cleanup');
