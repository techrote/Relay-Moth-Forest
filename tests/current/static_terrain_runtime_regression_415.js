'use strict';
const assert=require('assert');
const fs=require('fs');
const path=require('path');
const vm=require('vm');
const ROOT=path.resolve(__dirname,'../..');
const terrain=require(path.join(ROOT,'static_terrain.js'));
const gameSource=fs.readFileSync(path.join(ROOT,'game.js'),'utf8');
const artManifest=JSON.parse(fs.readFileSync(path.join(ROOT,'hd_remake_atlas.json'),'utf8'));
const source=(start,end)=>{const a=gameSource.indexOf(start),b=gameSource.indexOf(end,a+start.length);assert(a>=0&&b>a);return gameSource.slice(a,b)};
const allocations=[],phases=[],faults={allocationAt:0,rasterAt:0,allocationCalls:0,rasterCalls:0};
class FakeCanvas{
  constructor(width,height){if(++faults.allocationCalls===faults.allocationAt)throw new Error('injected canvas allocation failure');this.width=width;this.height=height;this.originalWidth=width;this.originalHeight=height;this.context=new FakeContext(this);allocations.push(this)}
  getContext(kind){assert.strictEqual(kind,'2d');return this.context}
}
class FakeContext{
  constructor(canvas){this.canvas=canvas;this.transforms=[];this.matrix=[1,0,0,1,0,0];this.stack=[];this.images=[]}
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
  drawImage(...args){
    this.recordTransform();assert.strictEqual(args.length,9,'atlas drawing uses an explicit source and destination rectangle');
    const[image,sx,sy,sw,sh,x,y,w,h]=args;assert([sx,sy,sw,sh,x,y,w,h].every(Number.isFinite),'drawImage coordinates must be finite');
    const[a,b,c,d,e,f]=this.matrix,corners=[[x,y],[x+w,y],[x+w,y+h],[x,y+h]].map(([px,py])=>[a*px+c*py+e,b*px+d*py+f]);
    this.images.push({image,source:[sx,sy,sw,sh],destination:[x,y,w,h],matrix:[...this.matrix],corners});
  }
  clearRect(){this.recordTransform()}beginPath(){}arc(){this.recordTransform()}fill(){this.recordTransform()}strokeRect(){this.recordTransform()}
}
const sandbox={OffscreenCanvas:FakeCanvas,RelayStaticTerrain:terrain,perfMeasure:(name,fn)=>{phases.push(name);return fn()}};
const production=vm.runInNewContext(`
  const W=640,H=360,TILE=16,FLOOR_TILE=4,GRID_W=40,GRID_H=19,PLAY_H=304,BOTTOM_H=56,TAU=Math.PI*2,HD_WORLD_SCALE_DEFAULT=.18;
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  ${source('function hash32(','\nfunction h01(')}
  ${source('function releaseCanvasBacking(','\n\n// PERF-001A:')}
  ${source('class Room{','\n// Low-cost steering helpers')}
  ${source('class HDArtSheet{','\nclass StaticPainter')}
  ${source('class StaticPainter{','\nclass SpriteAtlas')}
  ${source('class GLRenderer{','\nclass ParticleField')}
  ${source('class Game{','\nlet game=null')}
  ({Room,HDArtSheet,StaticPainter,GLRenderer,Game});
`,sandbox);

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
function refresh(g){
  const first=allocations.length,materials=materialSnapshot(g.renderer),beforeUploads=g.renderer.gl.uploads.length,result=g.refreshEditorStatic();released(g,first);assert.strictEqual(result.retainedScratchPixels,0);assert.strictEqual(g.staticBackgroundRevision,g.renderer.backgroundRevision);
  const fullPixels=result.mode==='full'?g.renderer.nativeW*g.renderer.nativeH:0,regions=result.regions;
  const rasterAreas=regions.map(r=>r.rasterWidth*r.rasterHeight);
  assert.strictEqual(result.pixels,fullPixels+regions.reduce((n,r)=>n+r.width*r.height,0),'upload work uses output bounds');
  assert.strictEqual(result.rasterPixels,fullPixels+rasterAreas.reduce((n,area)=>n+area,0),'raster work includes every guarded surface and any full repair');
  assert.strictEqual(result.scratchPixels,Math.max(fullPixels,...rasterAreas,0),'scratch budget uses the largest guarded surface');assert.strictEqual(result.scratchBytes,Math.max(fullPixels*12,...rasterAreas.map(area=>area*4),0),'scratch bytes reflect peak simultaneous color/material allocations');
  if(result.mode==='patch'||result.mode==='noop')assertMaterialsRetained(g.renderer,materials);
  else assert.deepStrictEqual(g.renderer.gl.uploads.slice(-3).map(u=>[u.mode,u.texture]),[['full','color'],['full','normal'],['full','specular']],'every full dependency refresh or repair replaces all three channels');
  if(result.mode==='patch'){
    assert(g.renderer.gl.uploads.slice(beforeUploads).every(u=>u.texture===g.renderer.bgTex),'eligible terrain patches upload color only');
    const created=allocations.slice(first);assert.strictEqual(created.length,regions.length,'one guarded color canvas per region, without material or crop canvases');
    regions.forEach((region,i)=>{const canvas=created[i];
      assert.strictEqual(canvas.originalWidth,region.rasterWidth);assert.strictEqual(canvas.originalHeight,region.rasterHeight);
      assert.deepStrictEqual(canvas.context.transforms[0],[g.renderer.nativeW/640,0,0,g.renderer.nativeH/360,region.rasterX?-region.rasterX:0,region.rasterY?-region.rasterY:0],'guarded raster translates from source origin, not output origin');
    });
  }
  return result;
}
function observeCommit(g,previous){let calls=0;g.renderer.gl.hook=()=>{assert.strictEqual(g.staticTerrainSnapshot,previous,'snapshot must commit only after every required upload succeeds');assert.strictEqual(g.renderer.backgroundReady,false,'an incomplete background update is never marked ready');calls++};return()=>{g.renderer.gl.hook=null;return calls}}
let scenarios=0;

function mountedFixture(width=997,height=563){
  const g=fixture(),names=['orb_pillar','lamp_blue','lamp_orange'];
  const manifest={world_scale:artManifest.world_scale,regions:{},region_meta:{},roles:{lamps:['lamp_blue','lamp_orange'],objective:{}}};
  for(const name of names){manifest.regions[name]=[...artManifest.regions[name]];manifest.region_meta[name]={...artManifest.region_meta[name],tint_strength:0}}
  g.art=new production.HDArtSheet({src:'atlas.png',width:4096,height:4096},manifest,null,{src:'spec.png',width:4096,height:4096},{src:'normal.png',width:4096,height:4096});
  g.painter=new production.StaticPainter(g.art,g.luts);g.renderer.nativeW=width;g.renderer.nativeH=height;
  g.room.decorLamps=[{tile:[10,8]}];
  Object.assign(g,{x:301.25,y:142.5,vx:2,vy:-1,followers:{units:[{id:'pip',x:275,y:130,path:[[1,2],[3,4]]}]},miniGuides:{units:[{id:'mini',x:19,y:27}]},flock:{m:[{id:'moth',x:300,y:142}]}});
  g.state.completed=new Set(['kept-completion']);g.state.robots=new Set(['kept-robot']);g.state.moths=new Set(['kept-moth']);
  g.room.objects={'kept-object':[4,5]};g.room.objectFxHidden.add('kept-object');
  return g;
}
function actorState(g){return JSON.stringify([g.x,g.y,g.vx,g.vy,g.followers,g.miniGuides,g.flock,[...g.state.completed],[...g.state.robots],[...g.state.moths],g.room.objects,[...g.room.objectFxHidden]])}
function isolateFootprintWork(g,run){
  // A sizing query may read metadata, but cannot touch source surfaces, tint or
  // material caches, any Canvas drawing method, LUT lookup, or GL state.
  const descriptors=[],deny=(object,name)=>{descriptors.push([object,name,Object.getOwnPropertyDescriptor(object,name)]);Object.defineProperty(object,name,{configurable:true,get(){throw Error('Footprint phase touched '+name)}})};
  const first=allocations.length,allocationCalls=faults.allocationCalls,rasterCalls=faults.rasterCalls,actors=actorState(g),materialNormal=g.painter.materialNormalCtx,materialSpec=g.painter.materialSpecCtx,maps=g.painter.lastMaterialMaps;
  for(const name of ['img','normalImg','specImg','bumpImg','tintCache','normalTransformCache','normalTransformGeneration','tintInfo','tintedRegion','trimTintCache','draw','drawSubrect','drawMap','drawMapSubrect','transformedNormal'])deny(g.art,name);
  deny(g.luts,'hex');for(const [name,value] of Object.entries(g.renderer.gl))if(typeof value==='function')deny(g.renderer.gl,name);
  try{return run()}finally{
    for(const [object,name,descriptor] of descriptors.reverse())if(descriptor)Object.defineProperty(object,name,descriptor);else delete object[name];
    assert.strictEqual(allocations.length,first,'footprints cannot allocate scratch or derived source canvases');assert.strictEqual(faults.allocationCalls,allocationCalls);assert.strictEqual(faults.rasterCalls,rasterCalls);
    assert.strictEqual(actorState(g),actors,'footprint detection cannot change live actors or progression');
    assert.strictEqual(g.painter.materialNormalCtx,materialNormal);assert.strictEqual(g.painter.materialSpecCtx,materialSpec);assert.strictEqual(g.painter.lastMaterialMaps,maps,'dry recording cannot claim or detach the real painter material maps');
  }
}
function observedMountedDraws(g){
  // This oracle measures actual HDArtSheet destination corners. It does not
  // call the footprint helper or reconstruct the mounted-placement formulas.
  const canvas=new FakeCanvas(g.renderer.nativeW,g.renderer.nativeH),ctx=canvas.context;
  ctx.scale(g.renderer.nativeW/640,g.renderer.nativeH/360);g.painter.drawDecor(ctx,g.room);
  const out=ctx.images.map(draw=>{
    const xs=draw.corners.map(p=>p[0]),ys=draw.corners.map(p=>p[1]),x=Math.floor(Math.min(...xs)),y=Math.floor(Math.min(...ys)),right=Math.ceil(Math.max(...xs)),bottom=Math.ceil(Math.max(...ys));
    return{draw,core:{x,y,width:right-x,height:bottom-y},guard:{x:x-2,y:y-2,width:right-x+4,height:bottom-y+4}};
  });canvas.width=canvas.height=1;return out;
}
const overlaps=(a,b)=>a.x<b.x+b.width&&b.x<a.x+a.width&&a.y<b.y+b.height&&b.y<a.y+a.height;

function mountedFootprintsFollowActualDrawing(){
  for(const mode of ['default','objective-substitution','custom-metadata','rotated-subrect']){
    const g=mountedFixture();
    if(mode==='objective-substitution'){g.art.roles.objective.lamp='lamp_blue';g.room.spec.objects=[{object_id:'fixture-objective',kind:'lamp'}]}
    if(mode==='custom-metadata'){g.art.worldScale=.27;g.art.meta.lamp_blue.world_scale=.65;g.art.meta.orb_pillar.world_scale=1.25}
    if(mode==='rotated-subrect'){
      const drawDecor=g.painter.drawDecor;
      g.painter.drawDecor=function(ctx,room){drawDecor.call(this,ctx,room);return this.spriteSubrect(ctx,'lamp_blue',0,70,82,70,215.25,126.5,9.7416,8.316,{anchor:'center',rot:.37,flip:true,alpha:.8})};
    }
    const rendered=observedMountedDraws(g),before=actorState(g),normalMarker={},specMarker={},mapsMarker={normal:{},spec:{}};
    g.painter.materialNormalCtx=normalMarker;g.painter.materialSpecCtx=specMarker;g.painter.lastMaterialMaps=mapsMarker;
    const footprints=isolateFootprintWork(g,()=>g.painter.mountedSpriteFootprints(g.room,g.renderer.nativeW,g.renderer.nativeH));
    assert.deepStrictEqual(Array.from(footprints,r=>({...r})),rendered.map(r=>r.guard),'footprints follow real atlas rectangles, anchors, substitutions, scales and transforms');
    assert.strictEqual(footprints.length,mode==='rotated-subrect'?3:2,'glow and post drawing do not add sprite footprints');
    assert.deepStrictEqual(rendered[1].draw.source,artManifest.regions[mode==='objective-substitution'?'lamp_orange':'lamp_blue'],'objective substitutions must select the real rendered source');
    if(mode==='default'){
      assert.deepStrictEqual(rendered[1].core,{x:254,y:158,width:16,height:27});assert.deepStrictEqual({...footprints[1]},{x:252,y:156,width:20,height:31});
      assert(Math.abs(rendered[1].draw.destination[2]-9.7416)<1e-12&&Math.abs(rendered[1].draw.destination[3]-16.632)<1e-12,'real lamp metadata and draw scale remain the placement authority');
    }
    assert.strictEqual(actorState(g),before);g.painter.materialNormalCtx=g.painter.materialSpecCtx=g.painter.lastMaterialMaps=null;scenarios++;
  }
  // Integral scales return before even inspecting mounted data or the atlas.
  for(const [width,height] of [[640,360],[1280,720]]){
    const painter=Object.create(production.StaticPainter.prototype);Object.defineProperty(painter,'art',{get(){throw Error('integer query touched art')}});Object.defineProperty(painter,'drawDecor',{get(){throw Error('integer query touched mounted placement')}});
    assert.deepStrictEqual(Array.from(painter.mountedSpriteFootprints(null,width,height)),[]);scenarios++;
  }
  const g=mountedFixture();
  for(const dimensions of [[0,563],[997,NaN],[997.5,563],[Number.MAX_SAFE_INTEGER+1,563]])assert.throws(()=>g.painter.mountedSpriteFootprints(g.room,...dimensions),/Invalid mounted sprite footprint/);
  for(const bad of [NaN,Infinity,-1,0]){g.art.meta.lamp_blue.world_scale=bad;assert.throws(()=>isolateFootprintWork(g,()=>g.painter.mountedSpriteFootprints(g.room,997,563)),/Invalid mounted sprite footprint/)}
  scenarios++;
}

function fractionalMountedFallbacks(){
  const cases=[
    {label:'both-fractional',width:997,height:563,cell:'10,7',mode:'full'},
    {label:'fractional-x',width:997,height:360,cell:'10,7',mode:'full'},
    {label:'fractional-y',width:640,height:563,cell:'10,7',mode:'full'},
    {label:'native-integer',width:640,height:360,cell:'10,7',mode:'patch'},
    {label:'double-integer',width:1280,height:720,cell:'10,7',mode:'patch'},
    {label:'head-filter-halo',width:997,height:563,cell:'9,7',mode:'full'},
    {label:'touching-halo-edge',width:997,height:563,cell:'9,7',mode:'patch',lampScale:.75},
    {label:'glow-only',width:997,height:563,cell:'8,6',mode:'patch'},
    {label:'distant',width:997,height:563,cell:'30,14',mode:'patch'}
  ];
  for(const test of cases){
    const g=mountedFixture(test.width,test.height);if(test.lampScale)g.art.meta.lamp_blue.world_scale=test.lampScale;
    const rendered=observedMountedDraws(g);refresh(g);const before=g.staticTerrainSnapshot,actors=actorState(g),first=allocations.length,uploads=g.renderer.gl.uploads.length,phaseStart=phases.length;
    const helper=g.painter.mountedSpriteFootprints,build=g.painter.build;let queries=0;
    g.painter.mountedSpriteFootprints=function(...args){queries++;return isolateFootprintWork(g,()=>helper.apply(this,args))};
    g.room.water.add(test.cell);
    const ordinaryPlan=terrain.plan(before,terrain.capture(g.room,g.staticTerrainContext()));assert.strictEqual(ordinaryPlan.kind,'patch','the new fallback must be the only reason this terrain edit is full');
    const output=ordinaryPlan.regions[0];
    if(test.label==='head-filter-halo'){
      assert.strictEqual(output.x+output.width,rendered[1].core.x,'output only touches the unpadded sprite boundary');
      assert(!rendered.some(r=>overlaps(output,r.core)));assert(overlaps(output,rendered[1].guard),'two native filtering pixels must protect this otherwise disjoint output');
    }
    if(test.label==='touching-halo-edge'){assert.strictEqual(output.x+output.width,rendered[1].guard.x);assert(!rendered.some(r=>overlaps(output,r.guard)),'half-open footprint edges do not overlap')}
    if(test.label==='glow-only'){
      assert(!rendered.some(r=>overlaps(output,r.guard)));const x=(output.x+output.width-.5)/(test.width/640),y=(output.y+output.height/2)/(test.height/360);
      assert(Math.hypot(x-168,y-107)<30,'the chosen output intersects the actual mounted glow while missing both sprites');
    }
    if(test.mode==='full'){
      g.painter.buildPatch=()=>{throw Error('mounted fallback must precede every patch attempt')};
      g.painter.build=function(...args){assert.strictEqual(allocations.length,first,'no guarded scratch may precede a planned full fallback');assert.strictEqual(g.renderer.gl.uploads.length,uploads,'no partial upload may precede the fallback');return build.apply(this,args)};
    }
    const stats=refresh(g);assert.strictEqual(stats.mode,test.mode,test.label);assert.strictEqual(queries,1);assert.strictEqual(actorState(g),actors);
    assert.deepStrictEqual(g.staticTerrainSnapshot.dependencies,before.dependencies,'render fallback cannot alter static material authority');assert.deepStrictEqual(g.staticTerrainSnapshot.references,before.references);
    assert.strictEqual(g.staticTerrainSnapshot.cellTypes[7*40+10],test.cell==='10,7'?terrain.CELL_TYPES.water:before.cellTypes[7*40+10]);
    if(test.mode==='full'){
      assert.strictEqual(stats.reason,'fractional-mounted-sprite');assert.strictEqual(stats.uploadCalls,3);assert.strictEqual(allocations.length-first,3);assert.strictEqual(stats.rasterCells,760);assert.strictEqual(stats.regions.length,0);
      assert(!phases.slice(phaseStart).some(name=>name.startsWith('static.patch.')),'selection happens before any patch work');
    }else assert.strictEqual(stats.uploadCalls,1);
    const count=allocations.length,afterUploads=g.renderer.gl.uploads.length;assert.strictEqual(refresh(g).mode,'noop');assert.strictEqual(queries,1,'unchanged static state needs no footprint query');assert.strictEqual(allocations.length,count);assert.strictEqual(g.renderer.gl.uploads.length,afterUploads);assert.strictEqual(actorState(g),actors);scenarios+=2;
  }
  // An invalid sizing result is caught while planning; the actual full builder
  // then runs with valid input. The helper itself is never stubbed or bypassed.
  {
    const g=mountedFixture();refresh(g);const first=allocations.length,uploads=g.renderer.gl.uploads.length,actors=actorState(g),worldSize=g.art.worldSize,helper=g.painter.mountedSpriteFootprints,build=g.painter.build;let invalid=true,queries=0;
    g.art.worldSize=function(name,...args){if(name==='lamp_blue'&&invalid){invalid=false;return[NaN,20]}return worldSize.call(this,name,...args)};
    g.painter.mountedSpriteFootprints=function(...args){queries++;return isolateFootprintWork(g,()=>helper.apply(this,args))};
    g.painter.buildPatch=()=>{throw Error('malformed footprint must not start a patch')};
    g.painter.build=function(...args){assert(!invalid,'the real footprint collector must have rejected the malformed size');assert.strictEqual(allocations.length,first);assert.strictEqual(g.renderer.gl.uploads.length,uploads);return build.apply(this,args)};
    g.room.water.add('10,7');const stats=refresh(g);assert.strictEqual(queries,1);assert.strictEqual(stats.mode,'full');assert.strictEqual(stats.reason,'invalid-context');assert.strictEqual(stats.uploadCalls,3);assert.strictEqual(stats.regions.length,0);assert.strictEqual(stats.rasterCells,760);assert.strictEqual(allocations.length-first,3);assert.strictEqual(actorState(g),actors);scenarios++;
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

function materialPreservationAndDependencies(){
  // Cache turnover cannot invalidate a color-only delta: the normal/specular
  // GPU contents keep their original backing and are never rerastered here.
  {
    const g=fixture();refresh(g);const first=allocations.length,full=g.renderer.gl.fullCount;
    g.art.normalTransformGeneration+=100;
    assert.strictEqual(refresh(g).mode,'noop');assert.strictEqual(allocations.length,first);
    const overlay=g.painter.patternDecor;let overlays=0;
    g.painter.patternDecor=function(...args){assert(!this.materialNormalCtx&&!this.materialSpecCtx,'partial overlays have no material drawing contexts');overlays++;return overlay.apply(this,args)};
    g.painter.build=()=>{throw Error('normal cache pressure must not force a terrain full build')};
    g.room.water.add('6,7');const stats=refresh(g);
    assert.strictEqual(stats.mode,'patch');assert.strictEqual(stats.uploadCalls,1);assert.strictEqual(g.renderer.gl.fullCount,full);assert.strictEqual(overlays,1);assert.strictEqual(g.painter.lastMaterialMaps,null);scenarios+=2;
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
      assert.strictEqual(u.width,region.width);assert.strictEqual(u.height,region.height);assert.strictEqual(u.sourceWidth,region.rasterWidth);assert.strictEqual(u.sourceHeight,region.rasterHeight);
      assert.strictEqual(u.skipPixels,region.x-region.rasterX);assert.strictEqual(u.skipRows,region.rasterY+region.rasterHeight-region.y-region.height);
    }
    assert.strictEqual(stats.uploadBytes,region.width*region.height*4);assert.strictEqual(stats.scratchBytes,region.rasterWidth*region.rasterHeight*4);scenarios++;
  }
}

function croppedUploadRestoresUnpackState(){
  // Unequal top/bottom margins distinguish flipped source-row cropping from a
  // top-origin skip. Test both normal completion and color upload failures.
  const cases=[
    {x:37,y:11,width:19,height:17,rasterX:16,rasterY:0,rasterWidth:80,rasterHeight:80,skipPixels:21,skipRows:52},
    {x:613,y:327,width:27,height:21,rasterX:576,rasterY:288,rasterWidth:64,rasterHeight:72,skipPixels:37,skipRows:12}
  ];
  for(const region of cases)for(const fault of ['none','throw','gl-error']){
    const g=fixture();refresh(g);const r=g.renderer,gl=r.gl,first=allocations.length,revision=r.backgroundRevision,bytes=r.backgroundUploadBytes,before=gl.uploads.length,materials=materialSnapshot(r);
    const canvas=new FakeCanvas(region.rasterWidth,region.rasterHeight);
    const seed={flip:region.y>300,skipPixels:5,skipRows:7};gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,seed.flip);gl.pixelStorei(gl.UNPACK_SKIP_PIXELS,seed.skipPixels);gl.pixelStorei(gl.UNPACK_SKIP_ROWS,seed.skipRows);
    if(fault==='throw')gl.failSubAt=1;else if(fault==='gl-error')gl.errorSubAt=1;
    if(fault==='none')r.patchBackground(region,canvas);else assert.throws(()=>r.patchBackground(region,canvas),/injected subupload|Static background subupload failed/);
    const uploads=gl.uploads.slice(before),attempts=1;
    assert.strictEqual(uploads.length,attempts);assert.deepStrictEqual(uploads.map(u=>u.texture),['color']);assertMaterialsRetained(r,materials);
    for(const u of uploads){
      assert.strictEqual(u.x,region.x);assert.strictEqual(u.y,360-region.y-region.height);assert.strictEqual(u.width,region.width);assert.strictEqual(u.height,region.height);
      assert.strictEqual(u.sourceWidth,region.rasterWidth);assert.strictEqual(u.sourceHeight,region.rasterHeight);assert.strictEqual(u.flip,true);
      assert.strictEqual(u.skipPixels,region.skipPixels);assert.strictEqual(u.skipRows,region.skipRows,'flipped source skip uses the bottom guard, not the top guard');
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

fullPatchNoopAndHistory();staticIdentityAndStaleness();materialPreservationAndDependencies();repairedUploadFailures();contextLossSkipsWork();laterRasterFailureInvalidatesReadiness();rasterAndAllocationFailures();guardedEdgeRasterMetrics();croppedUploadRestoresUnpackState();rejectInvalidPatches();mountedFootprintsFollowActualDrawing();fractionalMountedFallbacks();
console.log('STATIC TERRAIN RUNTIME REGRESSION PERF-004 PASS');
console.log('  production Game / StaticPainter / GLRenderer scenarios:',scenarios);
console.log('  color-only guarded-raster uploads, preserved material handles/bytes, full material-dependency refreshes, asymmetric flipped crops and exact scratch/raster accounting');
console.log('  coherent snapshot/revision commits, unpack restoration, upload / GL error / context-loss repair, failed repair invalidation, allocation/raster cleanup, zero retained scratch');
console.log('  real mounted-sprite footprints, objective substitutions/scales, filtering-edge overlap, fractional full fallback, integer/glow-only patches and zero-work footprint planning');
