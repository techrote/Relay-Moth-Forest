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
let traceCanvases=false;
class FakeCanvas{
  constructor(width,height){if(++faults.allocationCalls===faults.allocationAt)throw new Error('injected canvas allocation failure');this.width=width;this.height=height;this.originalWidth=width;this.originalHeight=height;this.context=new FakeContext(this);allocations.push(this)}
  getContext(kind){assert.strictEqual(kind,'2d');return this.context}
}
class FakeContext{
  constructor(canvas){this.canvas=canvas;this.transforms=[];this.matrix=[1,0,0,1,0,0];this.stack=[];this.images=[];this.commands=traceCanvases?[]:null;this.floorCommands=traceCanvases?new Map():null;this.floorCell=null}
  recordCommand(name,args=[]){if(!this.commands)return;const entry={name,args:[...args],matrix:[...this.matrix]};if(this.floorCell){if(!this.floorCommands.has(this.floorCell))this.floorCommands.set(this.floorCell,[]);this.floorCommands.get(this.floorCell).push(entry)}else this.commands.push(entry)}
  // Record the effective matrix at drawing/restoration boundaries, so the first
  // entry remains the full native transform after translate followed by scale.
  recordTransform(){const last=this.transforms.at(-1);if(!last||this.matrix.some((value,i)=>value!==last[i]))this.transforms.push([...this.matrix])}
  setTransform(...values){this.recordCommand('setTransform',values);assert(values.length===6&&values.every(Number.isFinite));this.matrix=[...values]}
  translate(x,y){this.recordCommand('translate',[x,y]);assert(Number.isFinite(x)&&Number.isFinite(y));const[a,b,c,d,e,f]=this.matrix;this.matrix=[a,b,c,d,e+a*x+c*y,f+b*x+d*y]}
  scale(x,y){this.recordCommand('scale',[x,y]);assert(Number.isFinite(x)&&Number.isFinite(y));const[a,b,c,d,e,f]=this.matrix;this.matrix=[a*x,b*x,c*y,d*y,e,f]}
  rotate(angle){this.recordCommand('rotate',[angle]);assert(Number.isFinite(angle));const[a,b,c,d,e,f]=this.matrix,co=Math.cos(angle),si=Math.sin(angle);this.matrix=[a*co+c*si,b*co+d*si,-a*si+c*co,-b*si+d*co,e,f]}
  save(){this.recordCommand('save');this.stack.push([...this.matrix])}
  restore(){this.recordCommand('restore');this.recordTransform();if(this.stack.length)this.matrix=this.stack.pop()}
  createLinearGradient(...args){this.recordCommand('createLinearGradient',args);return{addColorStop:(...stop)=>this.recordCommand('addColorStop',stop)}}
  createRadialGradient(...args){this.recordCommand('createRadialGradient',args);return{addColorStop:(...stop)=>this.recordCommand('addColorStop',stop)}}
  fillRect(...args){this.recordCommand('fillRect',args);this.recordTransform();if(++faults.rasterCalls===faults.rasterAt)throw new Error('injected floor raster failure')}
  drawImage(...args){
    this.recordCommand('drawImage',args);this.recordTransform();assert.strictEqual(args.length,9,'atlas drawing uses an explicit source and destination rectangle');
    const[image,sx,sy,sw,sh,x,y,w,h]=args;assert([sx,sy,sw,sh,x,y,w,h].every(Number.isFinite),'drawImage coordinates must be finite');
    const[a,b,c,d,e,f]=this.matrix,corners=[[x,y],[x+w,y],[x+w,y+h],[x,y+h]].map(([px,py])=>[a*px+c*py+e,b*px+d*py+f]);
    this.images.push({image,source:[sx,sy,sw,sh],destination:[x,y,w,h],matrix:[...this.matrix],corners});
  }
  clearRect(...args){this.recordCommand('clearRect',args);this.recordTransform()}beginPath(){this.recordCommand('beginPath')}arc(...args){this.recordCommand('arc',args);this.recordTransform()}fill(){this.recordCommand('fill');this.recordTransform()}strokeRect(...args){this.recordCommand('strokeRect',args);this.recordTransform()}
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
function fractionalPrefixMatchesFullCommands(){
  const cases=[
    {label:'floor-only',width:997,height:563},
    {label:'mounted-sprite',width:997,height:563},
    {label:'objective-substitution',width:997,height:563},
    {label:'custom-metadata',width:997,height:563},
    {label:'rotated-subrect',width:997,height:563},
    {label:'fractional-x',width:997,height:360},
    {label:'fractional-y',width:640,height:563}
  ];
  for(const test of cases){
    const g=spriteFixture(test.width,test.height);
    if(test.label==='floor-only')g.room.decorLamps=[];
    if(test.label==='objective-substitution'){g.art.roles.objective.lamp='lamp_blue';g.room.spec.objects=[{object_id:'fixture-objective',kind:'lamp'}]}
    if(test.label==='custom-metadata'){g.art.worldScale=.27;g.art.meta.lamp_blue.world_scale=.65;g.art.meta.orb_pillar.world_scale=1.25}
    if(test.label==='rotated-subrect'){
      // This fixture tests actual color transforms without manufacturing a
      // transformed-normal source; the full builder still owns three maps.
      g.art.normalImg=null;const drawDecor=g.painter.drawDecor;
      g.painter.drawDecor=function(ctx,room){drawDecor.call(this,ctx,room);return this.spriteSubrect(ctx,'lamp_blue',0,70,82,70,72.25,72.5,9.7416,8.316,{anchor:'center',rot:.37,flip:true,alpha:.8})};
    }
    const baseTile=g.painter.baseTile;
    g.painter.baseTile=function(ctx,tx,ty,...args){const prior=ctx.floorCell;ctx.floorCell=tx+','+ty;try{return baseTile.call(this,ctx,tx,ty,...args)}finally{ctx.floorCell=prior}};
    refresh(g);const previous=g.staticTerrainSnapshot,actors=actorState(g),materials=materialSnapshot(g.renderer);g.room.water.add('4,4');
    traceCanvases=true;
    try{
      // Run the unchanged full painter as an independent command oracle for
      // this edited room, without uploading or replacing the live materials.
      const fullColor=g.painter.build(g.room,g.state,test.width,test.height),fullMaps=g.painter.lastMaterialMaps,fullCtx=fullColor.context;
      for(const canvas of [fullColor,fullMaps.normal,fullMaps.spec])canvas.width=canvas.height=1;
      g.painter.lastMaterialMaps=null;
      const first=allocations.length,stats=refresh(g),created=allocations.slice(first);
      assert.strictEqual(stats.mode,'patch',test.label);assert.strictEqual(created.length,1);assert.strictEqual(stats.regions.length,1);
      const region=stats.regions[0],ctx=created[0].context;
      assert.strictEqual(region.rasterX,0);assert.strictEqual(region.rasterY,0);assert.strictEqual(region.tx0,0);assert.strictEqual(region.ty0,0);
      assert.strictEqual(region.rasterWidth,Math.min(test.width,Math.ceil((region.x+region.width+32)/16)*16));
      assert.strictEqual(region.rasterHeight,Math.min(test.height,Math.ceil((region.y+region.height+32)/16)*16));
      assert.deepStrictEqual(ctx.commands,fullCtx.commands,'prefix root, gradients, actual atlas transforms and footer commands must equal the full global command sequence');
      assert.deepStrictEqual(ctx.commands.slice(0,2).map(c=>[c.name,c.args]),[['save',[]],['scale',[test.width/640,test.height/360]]],'zero-origin prefix must not issue an extra translate, including translate(-0,-0)');
      assert.deepStrictEqual(ctx.images,fullCtx.images,'real HDArtSheet draw/drawSubrect source rectangles, destination corners and transforms must match');
      assert.strictEqual(ctx.images.length,test.label==='floor-only'?0:test.label==='rotated-subrect'?3:2);
      if(test.label==='objective-substitution')assert.deepStrictEqual(ctx.images[1].source,artManifest.regions.lamp_orange);
      const expectedCells=[];
      for(let y=region.ty0;y<region.ty1;y++)for(let x=region.tx0;x<region.tx1;x++)expectedCells.push(x+','+y);
      assert.deepStrictEqual([...ctx.floorCommands.keys()],expectedCells,'the entire prefix, including predecessor cells and filtering guard, is rastered in row-major order');
      for(const [cell,commands] of ctx.floorCommands)assert.deepStrictEqual(commands,fullCtx.floorCommands.get(cell),'floor commands and native transforms must equal the full renderer at '+cell);
      assert.strictEqual(ctx.floorCommands.size,stats.rasterCells);assert.strictEqual(stats.rasterPixels,region.rasterWidth*region.rasterHeight);assert.strictEqual(stats.scratchBytes,stats.rasterPixels*4);
      assert.strictEqual(stats.uploadBytes,region.width*region.height*4);assert(stats.rasterPixels>stats.pixels,'global prefix work is reported separately from tight output');
      assertMaterialsRetained(g.renderer,materials);assert.deepStrictEqual(g.staticTerrainSnapshot.dependencies,previous.dependencies);assert.deepStrictEqual(g.staticTerrainSnapshot.references,previous.references);assert.strictEqual(actorState(g),actors);
      const count=allocations.length,uploads=g.renderer.gl.uploads.length;assert.strictEqual(refresh(g).mode,'noop');assert.strictEqual(allocations.length,count);assert.strictEqual(g.renderer.gl.uploads.length,uploads);assert.strictEqual(actorState(g),actors);scenarios+=2;
    }finally{traceCanvases=false}
  }
}

function prefixWorkAndBudgetFallbacks(){
  // Prefixes overlap in source space but are separately rastered/uploaded.
  // Sum their work; peak scratch is the largest single released surface.
  {
    const g=spriteFixture();refresh(g);const actors=actorState(g),buildPatch=g.painter.buildPatch,first=allocations.length;let lastCanvas=null,patches=0;
    g.painter.buildPatch=function(...args){if(lastCanvas)assert(lastCanvas.width===1&&lastCanvas.height===1,'a previous prefix must be released before allocating the next');lastCanvas=buildPatch.apply(this,args);patches++;return lastCanvas};
    g.room.water.add('3,2');g.room.water.add('6,2');const stats=refresh(g);
    assert.strictEqual(stats.mode,'patch');assert.strictEqual(patches,2);assert.strictEqual(allocations.length-first,2);
    assert.deepStrictEqual(Array.from(stats.regions,r=>[r.rasterX,r.rasterY,r.rasterWidth,r.rasterHeight]),[[0,0,144,112],[0,0,224,112]]);
    assert.strictEqual(stats.rasterPixels,41216);assert.strictEqual(stats.rasterCells,85);assert.strictEqual(stats.scratchPixels,25088);assert.strictEqual(stats.scratchBytes,25088*4);assert.strictEqual(stats.pixels,1798);assert.strictEqual(stats.uploadCalls,2);assert.strictEqual(stats.uploadBytes,1798*4);assert.strictEqual(actorState(g),actors);scenarios++;
  }
  const cases=[
    {label:'fractional-pattern-location',width:997,height:563,cells:['19,10'],reason:'raster-pixel-budget'},
    {label:'fractional-x-distant',width:997,height:360,cells:['19,10'],reason:'raster-pixel-budget'},
    {label:'fractional-y-distant',width:640,height:563,cells:['19,10'],reason:'raster-pixel-budget'},
    {label:'summed-overlapping-prefixes',width:997,height:563,cells:['9,5','13,5'],reason:'raster-pixel-budget'},
    {label:'prefix-peak-scratch',width:2000,height:1000,cells:['14,6'],reason:'scratch-budget'}
  ];
  for(const test of cases){
    const g=spriteFixture(test.width,test.height);refresh(g);const previous=g.staticTerrainSnapshot,actors=actorState(g),first=allocations.length,uploads=g.renderer.gl.uploads.length,phaseStart=phases.length,build=g.painter.build;
    if(test.label==='summed-overlapping-prefixes'){
      const isolated=[];
      for(const cell of test.cells){g.room.water=new Set([cell]);const plan=terrain.plan(previous,terrain.capture(g.room,g.staticTerrainContext()));assert.strictEqual(plan.kind,'patch');isolated.push(plan.regions[0])}
      const sum=isolated.reduce((n,r)=>n+r.rasterWidth*r.rasterHeight,0),union=Math.max(...isolated.map(r=>r.rasterWidth))*Math.max(...isolated.map(r=>r.rasterHeight));
      assert.strictEqual(sum,132096);assert.strictEqual(union,76800);assert(sum>test.width*test.height*.20&&union<test.width*test.height*.20,'only summing repeated prefix work enforces the unchanged 20% limit');
    }
    g.room.water=new Set(test.cells);
    const plan=terrain.plan(previous,terrain.capture(g.room,g.staticTerrainContext()));assert.strictEqual(plan.kind,'full');assert.strictEqual(plan.reason,test.reason);
    if(test.label==='prefix-peak-scratch'){
      const probe=terrain.plan(previous,terrain.capture(g.room,g.staticTerrainContext()),{maxScratchPixels:300000});assert.strictEqual(probe.kind,'patch');assert.strictEqual(probe.scratchPixels,281600);assert(probe.rasterPixels<test.width*test.height*.20&&probe.rasterCellCount<760*.35,'the unchanged peak limit is the binding budget');
    }
    g.painter.buildPatch=()=>{throw Error('prefix budget must be decided before any partial build')};
    g.painter.build=function(...args){assert.strictEqual(allocations.length,first,'budget fallback cannot allocate partial scratch');assert.strictEqual(g.renderer.gl.uploads.length,uploads,'budget fallback cannot upload a partial texture');return build.apply(this,args)};
    const stats=refresh(g);assert.strictEqual(stats.mode,'full');assert.strictEqual(stats.reason,test.reason);assert.strictEqual(stats.uploadCalls,3);assert.strictEqual(stats.regions.length,0);assert.strictEqual(stats.rasterCells,760);assert.strictEqual(allocations.length-first,3);assert(!phases.slice(phaseStart).some(name=>name.startsWith('static.patch.')));
    assert.deepStrictEqual(g.staticTerrainSnapshot.dependencies,previous.dependencies);assert.deepStrictEqual(g.staticTerrainSnapshot.references,previous.references);assert.strictEqual(actorState(g),actors);scenarios++;
  }
  // Integer transforms retain the localized-raster optimization away from the
  // origin, including the same distant cell which is too costly fractionally.
  for(const [width,height] of [[640,360],[1280,720]]){
    const g=spriteFixture(width,height);refresh(g);g.room.water.add('19,10');const stats=refresh(g),region=stats.regions[0];
    assert.strictEqual(stats.mode,'patch');assert(region.rasterX>0&&region.rasterY>0);assert.strictEqual(stats.uploadCalls,1);assert(stats.rasterPixels<width*height*.20&&stats.rasterCells<760*.35);scenarios++;
  }
  // Preserve synchronous repair/cleanup when a later global-origin prefix
  // fails after an earlier prefix has already reached the GPU.
  {
    const g=spriteFixture();refresh(g);g.room.water.add('3,2');g.room.water.add('6,2');g.renderer.gl.failSubAt=2;
    const stats=refresh(g);assert.strictEqual(stats.mode,'full');assert.strictEqual(stats.reason,'patch-failed');assert.strictEqual(stats.uploadCalls,5);assert.strictEqual(stats.regions.length,2);assert(stats.regions.every(r=>r.rasterX===0&&r.rasterY===0));assert.strictEqual(stats.rasterPixels,997*563+41216);assert.strictEqual(stats.scratchBytes,997*563*12);assert.strictEqual(g.renderer.backgroundReady,true);scenarios++;
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

fullPatchNoopAndHistory();staticIdentityAndStaleness();materialPreservationAndDependencies();repairedUploadFailures();contextLossSkipsWork();laterRasterFailureInvalidatesReadiness();rasterAndAllocationFailures();guardedEdgeRasterMetrics();croppedUploadRestoresUnpackState();rejectInvalidPatches();fractionalPrefixMatchesFullCommands();prefixWorkAndBudgetFallbacks();
console.log('STATIC TERRAIN RUNTIME REGRESSION PERF-004 PASS');
console.log('  production Game / StaticPainter / GLRenderer scenarios:',scenarios);
console.log('  color-only guarded-raster uploads, preserved material handles/bytes, full material-dependency refreshes, asymmetric flipped crops and exact scratch/raster accounting');
console.log('  coherent snapshot/revision commits, unpack restoration, upload / GL error / context-loss repair, failed repair invalidation, allocation/raster cleanup, zero retained scratch');
console.log('  fractional global-origin prefixes match real full floor/atlas command traces; unchanged raster/scratch budgets, overlap accounting, integer locality and prefix failure repair');
