'use strict';
const assert=require('assert');
const fs=require('fs');
const path=require('path');
const vm=require('vm');
const ROOT=path.resolve(__dirname,'../..');
const game=fs.readFileSync(path.join(ROOT,'game.js'),'utf8');
const source=(start,end)=>{const a=game.indexOf(start),b=game.indexOf(end,a+start.length);assert(a>=0&&b>a);return game.slice(a,b)};
const maps=JSON.parse(fs.readFileSync(path.join(ROOT,'relay_moth_maps.json'),'utf8'));
const story=JSON.parse(fs.readFileSync(path.join(ROOT,'relay_moth_story.json'),'utf8'));
const manifest=JSON.parse(fs.readFileSync(path.join(ROOT,'hd_remake_atlas.json'),'utf8'));
let canvasSerial=0;

// Actual room composition and production cache methods run unchanged. Only
// Canvas2D storage is substituted: atlas crops have deterministic RGBA samples,
// while full/patch destination drawing is unnecessary for this ownership test.
// Native-browser tests separately compare the real sampled material pixels.
class Canvas{
  constructor(width,height){this.id=++canvasSerial;this._width=width;this._height=height;this.context=new Context(this)}
  get width(){return this._width}set width(value){this._width=value;this.context?.reset()}
  get height(){return this._height}set height(value){this._height=value;this.context?.reset()}
  getContext(kind,options){assert.strictEqual(kind,'2d');if(!this.context.firstOptions)this.context.firstOptions=options||{};return this.context}
}
class Context{
  constructor(canvas){this.canvas=canvas;this.reset()}
  reset(){this.pixels=null;this.crop=null}
  save(){}restore(){}translate(){}rotate(){}scale(){}setTransform(){}clearRect(){}fillRect(){}strokeRect(){}beginPath(){}arc(){}fill(){}
  createLinearGradient(){return{addColorStop(){}}}createRadialGradient(){return{addColorStop(){}}}
  drawImage(image,sx,sy,sw,sh,dx,dy,dw,dh){
    if(image?.sample&&dx===0&&dy===0&&sw===dw&&sh===dh)this.crop={image,sx,sy,sw,sh};
  }
  getImageData(x,y,width,height){
    assert(x===0&&y===0&&width===this.canvas.width&&height===this.canvas.height);
    const data=new Uint8ClampedArray(width*height*4);
    if(this.pixels)data.set(this.pixels);
    else if(this.crop){const{image,sx,sy}=this.crop;for(let py=0;py<height;py++)for(let px=0;px<width;px++)image.sample(sx+px,sy+py,data,(py*width+px)*4)}
    return{width,height,data};
  }
  putImageData(image,x,y){assert(x===0&&y===0);this.pixels=new Uint8ClampedArray(image.data)}
}
const release=canvas=>{if(canvas){canvas.width=1;canvas.height=1}};
const core=vm.runInNewContext(`
  const W=640,H=360,TILE=16,FLOOR_TILE=4,GRID_W=40,GRID_H=19,PLAY_H=304,BOTTOM_H=56,TAU=Math.PI*2,HD_WORLD_SCALE_DEFAULT=.18,BLOCKER_FOREGROUND_FRACTION=.52;
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  ${source('function hash32(','\nfunction h01(')}
  ${source('class Room{','\n// Low-cost steering helpers')}
  ${source('class HDArtSheet{','\nclass SpriteAtlas')}
  ({Room,HDArtSheet,StaticPainter});
`,{OffscreenCanvas:Canvas,releaseCanvasBacking:release,perfMeasure:(_name,fn)=>fn()});

const image={width:4096,height:4096};
const normal={...image,sample(x,y,out,i){out[i]=(x*17+y*3)&255;out[i+1]=(x*5+y*19)&255;out[i+2]=(x*11+y*7+128)&255;out[i+3]=[0,1,64,127,200,255][(x+y)%6]}};
const createArt=(data=manifest)=>{const art=new core.HDArtSheet(image,data,null,image,normal);assert.strictEqual(art.normalTransformGeneration,0,'new atlas starts at transformed-source generation zero');return art};
const key=(name,flip,rot)=>`${name}|${flip?1:0}|${rot.toFixed(6)}`;
function build(art,room,patch=false){
  const painter=new core.StaticPainter(art,{hex:()=> '#456789'}),requests=[],original=art.transformedNormal;
  art.transformedNormal=function(name,flip=false,rot=0){
    const cacheKey=key(name,flip,rot),generation=this.normalTransformGeneration,existed=this.normalTransformCache.has(cacheKey);
    const canvas=original.call(this,name,flip,rot);
    if(original===core.HDArtSheet.prototype.transformedNormal)assert.strictEqual(this.normalTransformGeneration,generation+(canvas&&!existed?1:0),'generation advances exactly once per newly created transformed source');
    if(canvas)requests.push({key:cacheKey,name,flip,rot,canvas});assert(this.normalTransformCache.size<=96);return canvas;
  };
  let color=null,materials=null;
  try{
    color=patch?painter.buildPatch(room,{isDone:()=>false},997,563,{x:147,y:131,width:47,height:49,tx0:5,ty0:4,tx1:9,ty1:8}):painter.build(room,{isDone:()=>false},997,563);
    materials=painter.lastMaterialMaps;
  }finally{art.transformedNormal=original;release(color);release(materials?.normal);release(materials?.spec);painter.lastMaterialMaps=null}
  return requests;
}
function activeSources(requests){
  const active=new Map();
  for(const request of requests){if(active.has(request.key))assert.strictEqual(request.canvas,active.get(request.key),'one full composition recreated an active transformed source');active.set(request.key,request.canvas)}
  return active;
}
function retained(art,expected,requests,label){
  for(const request of requests)assert.strictEqual(request.canvas,expected.get(request.key),label+' replaced source '+request.key);
  for(const [cacheKey,canvas] of expected){assert.strictEqual(art.normalTransformCache.get(cacheKey),canvas,label+' evicted active source '+cacheKey);assert(canvas.width>1&&canvas.height>1,label+' released an active source')}
}
function dispose(art){for(const cache of [art.tintCache,art.normalTransformCache]){for(const canvas of cache.values())release(canvas);cache.clear()}}

// One atlas/cache persists across real room transitions, just as in Game. This
// exercises stale entries from earlier rooms, not only an empty-cache fixture.
const art=createArt(),counts=[];let requestCount=0;
for(let index=0;index<story.rooms.length;index++){
  const room=new core.Room(index,story.rooms[index],maps),first=build(art,room),active=activeSources(first);
  assert(active.size<=96,'authored active room exceeds the bounded cache policy');retained(art,active,first,room.key+' first full');
  const generation=art.normalTransformGeneration;
  const repeated=build(art,room);retained(art,active,repeated,room.key+' repeated full');assert.strictEqual(art.normalTransformGeneration,generation,room.key+' repeated full advanced source generation');
  const patch=build(art,room,true);retained(art,active,patch,room.key+' bounded patch');assert.strictEqual(art.normalTransformGeneration,generation,room.key+' bounded patch advanced source generation');
  assert.deepStrictEqual(repeated.map(x=>x.key),first.map(x=>x.key),'full composition request order changed');assert.deepStrictEqual(patch.map(x=>x.key),first.map(x=>x.key),'patch must replay the same authored material sources');
  counts.push({room:room.key,active:active.size,requests:first.length});requestCount+=first.length+repeated.length+patch.length;
}
assert(counts.some(row=>row.room==='dawn_tree'&&row.active>64),'negative-control room must actually exceed the previous 64-source cap');
dispose(art);

// Frozen pre-fix FIFO policy. It uses the same transforms and real authored
// request stream, so rejecting it demonstrates the regression independently of
// superficial source checks or a cache-size assertion alone.
function old64FIFO(name,flip=false,rot=0){
  const r=this.region(name);if(!this.normalImg||(!flip&&!rot))return null;
  const cacheKey=key(name,flip,rot);if(this.normalTransformCache.has(cacheKey))return this.normalTransformCache.get(cacheKey);
  const c=new Canvas(r[2],r[3]),ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(this.normalImg,r[0],r[1],r[2],r[3],0,0,r[2],r[3]);const pixels=ctx.getImageData(0,0,r[2],r[3]),d=pixels.data,co=Math.cos(rot),si=Math.sin(rot);
  for(let i=0;i<d.length;i+=4){const nx=(d[i]-128)*(flip?-1:1),ny=d[i+1]-128;d[i]=Math.max(0,Math.min(255,Math.round(128+co*nx+si*ny)));d[i+1]=Math.max(0,Math.min(255,Math.round(128-si*nx+co*ny)))}ctx.putImageData(pixels,0,0);
  if(this.normalTransformCache.size>=64){const first=this.normalTransformCache.keys().next().value,old=this.normalTransformCache.get(first);release(old);this.normalTransformCache.delete(first)}this.normalTransformCache.set(cacheKey,c);return c;
}
const legacy=createArt();legacy.transformedNormal=old64FIFO;
const dawnIndex=story.rooms.findIndex(room=>room.key==='dawn_tree'),dawn=new core.Room(dawnIndex,story.rooms[dawnIndex],maps),oldFirst=build(legacy,dawn),oldSources=new Map(oldFirst.map(r=>[r.key,r.canvas])),oldRepeat=build(legacy,dawn);
const changedIdentities=oldRepeat.filter(request=>oldSources.get(request.key)!==request.canvas).length;
const releasedSources=[...oldSources.values()].filter(canvas=>canvas.width===1&&canvas.height===1).length;
assert(changedIdentities>0&&releasedSources>0,'old64 FIFO must reproduce same-source recreation/release');assert.strictEqual(legacy.normalTransformCache.size,64);dispose(legacy);

// Isolate recency/pressure behavior with small sources. Reusing the oldest key
// must preserve its canvas; the next insertion evicts/releases the next oldest.
const smallManifest={regions:Object.fromEntries(Array.from({length:112},(_,i)=>['pressure_'+i,[0,0,3,2]])),roles:{},region_meta:{},world_scale:1};
const pressure=createArt(smallManifest),allocated=new Map();
for(let i=0;i<96;i++){allocated.set(i,pressure.transformedNormal('pressure_'+i,true,0));assert.strictEqual(pressure.normalTransformGeneration,i+1)}
assert.strictEqual(pressure.normalTransformCache.size,96);
assert.strictEqual(pressure.transformedNormal('pressure_0',true,0),allocated.get(0),'cache hit must preserve object identity');
assert.strictEqual(pressure.normalTransformGeneration,96,'cache hit must not advance generation');
assert.strictEqual([...pressure.normalTransformCache.keys()].at(-1),key('pressure_0',true,0),'cache hit must promote recency');
for(let i=96;i<112;i++){allocated.set(i,pressure.transformedNormal('pressure_'+i,true,0));assert.strictEqual(pressure.normalTransformCache.size,96);assert.strictEqual(pressure.normalTransformGeneration,i+1,'pressure creation increments generation once')}
assert.strictEqual(pressure.normalTransformCache.get(key('pressure_0',true,0)),allocated.get(0));
for(let i=1;i<=16;i++){assert.strictEqual(allocated.get(i).width,1);assert.strictEqual(allocated.get(i).height,1);assert(!pressure.normalTransformCache.has(key('pressure_'+i,true,0)),'pressure eviction must remove oldest inactive entry')}
assert.strictEqual([...allocated.values()].filter(c=>c.width>1&&c.height>1).length,96,'live transformed backings must stay bounded');
const recreated=pressure.transformedNormal('pressure_1',true,0);assert.notStrictEqual(recreated,allocated.get(1));assert.strictEqual(pressure.normalTransformGeneration,113,'recreating an evicted key advances the monotonic generation');
assert.strictEqual(pressure.transformedNormal('pressure_0',false,0),null,'identity transform uses the atlas directly');assert.strictEqual(pressure.normalTransformGeneration,113,'identity transform must not advance generation');assert.strictEqual(pressure.normalTransformCache.size,96);dispose(pressure);assert.strictEqual(pressure.normalTransformGeneration,113,'clearing cache ownership must not reset generation');

// The policy changes ownership only. Preserve the source pixels, normal Z and
// all partial-alpha values through transforms and warm-cache lookups.
const bytes=Uint8ClampedArray.from([128,128,200,0,255,0,101,1,0,255,203,64,1,127,77,127,154,203,222,200,74,13,194,255]),original=bytes.slice();
const samples={width:3,height:2,sample(x,y,out,i){out.set(bytes.subarray((y*3+x)*4,(y*3+x)*4+4),i)}};
const exact=new core.HDArtSheet(image,{regions:{sample:[0,0,3,2]},roles:{},region_meta:{}},null,image,samples);
assert.strictEqual(exact.normalTransformGeneration,0);
for(const [flip,rot] of [[true,0],[false,Math.PI/2],[true,Math.PI/2],[false,-Math.PI/2],[true,.41]]){
  const generation=exact.normalTransformGeneration,canvas=exact.transformedNormal('sample',flip,rot),data=canvas.getContext('2d').getImageData(0,0,3,2).data;
  assert.strictEqual(exact.normalTransformGeneration,generation+1);
  assert.strictEqual(canvas.context.firstOptions.willReadFrequently,true);
  for(let i=0;i<bytes.length;i+=4){
    const nx=(bytes[i]-128)*(flip?-1:1),ny=bytes[i+1]-128;
    const wantX=Math.max(0,Math.min(255,Math.round(128+Math.cos(rot)*nx+Math.sin(rot)*ny))),wantY=Math.max(0,Math.min(255,Math.round(128-Math.sin(rot)*nx+Math.cos(rot)*ny)));
    assert.strictEqual(data[i],wantX);assert.strictEqual(data[i+1],wantY);assert.strictEqual(data[i+2],bytes[i+2],'normal Z byte changed');assert.strictEqual(data[i+3],bytes[i+3],'partial alpha byte changed');
  }
  assert.strictEqual(exact.transformedNormal('sample',flip,rot),canvas);assert.strictEqual(exact.normalTransformGeneration,generation+1,'warm pixel read must not advance generation');assert.deepStrictEqual(canvas.getContext('2d').getImageData(0,0,3,2).data,data,'cache hit changed the material bytes');
}
assert.deepStrictEqual(bytes,original,'normal transform must never modify atlas authority');const generation=exact.normalTransformGeneration;exact.normalImg=null;assert.strictEqual(exact.transformedNormal('sample',true,0),null);assert.strictEqual(exact.normalTransformGeneration,generation,'missing normal source must not advance generation');dispose(exact);

console.log('NORMAL SOURCE CACHE REGRESSION PERF-004 PASS');
console.log('  authored room active sources:',counts.map(row=>row.room+'='+row.active).join(', '));
console.log('  source requests through full/repeated/patch builds:',requestCount,'; old64 FIFO recreated requests:',changedIdentities,'; released previous sources:',releasedSources);
console.log('  LRU hit promotion, fixed96 bound, immediate pressure release, monotonic creation generation, exact RGBA/partial-alpha preservation');
