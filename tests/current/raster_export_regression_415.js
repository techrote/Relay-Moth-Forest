'use strict';
// Reconstructed after workspace loss. Canvas bytes are covered by the separate
// native fixture; these tests execute real presentation, export, and quad code.
const assert=require('assert'),fs=require('fs'),path=require('path'),vm=require('vm');
const ROOT=path.resolve(__dirname,'../..'),gameText=fs.readFileSync(path.join(ROOT,'game.js'),'utf8');
const section=(a,b)=>{const i=gameText.indexOf(a),j=gameText.indexOf(b,i+a.length);assert(i>=0&&j>i,'missing production source boundary '+a);return gameText.slice(i,j)};
const manifest=JSON.parse(fs.readFileSync(path.join(ROOT,'hd_remake_atlas.json'),'utf8'));
const maps=JSON.parse(fs.readFileSync(path.join(ROOT,'relay_moth_maps.json'),'utf8'));
const story=JSON.parse(fs.readFileSync(path.join(ROOT,'relay_moth_story.json'),'utf8'));
let encoder=async()=>({type:'image/png'}),canvases=[];
class Context{
  constructor(canvas){this.canvas=canvas;this.matrix=[1,0,0,1,0,0];this.stack=[];this.images=[];this.events=[]}
  save(){this.stack.push({matrix:[...this.matrix],alpha:this.globalAlpha})}
  restore(){const s=this.stack.pop();if(s){this.matrix=s.matrix;this.globalAlpha=s.alpha}}
  translate(x,y){const[a,b,c,d,e,f]=this.matrix;this.matrix=[a,b,c,d,e+a*x+c*y,f+b*x+d*y]}
  scale(x,y){const[a,b,c,d,e,f]=this.matrix;this.matrix=[a*x,b*x,c*y,d*y,e,f]}
  rotate(rot){const[a,b,c,d,e,f]=this.matrix,co=Math.cos(rot),si=Math.sin(rot);this.matrix=[a*co+c*si,b*co+d*si,-a*si+c*co,-b*si+d*co,e,f]}
  drawImage(image,...args){
    assert.strictEqual(args.length,8);assert(args.every(Number.isFinite));
    const[sx,sy,sw,sh,x,y,w,h]=args,[a,b,c,d,e,f]=this.matrix;
    const corners=[[x,y],[x+w,y],[x+w,y+h],[x,y+h]].map(([u,v])=>[a*u+c*v+e,b*u+d*v+f]);
    this.images.push({image,source:[sx,sy,sw,sh],destination:[x,y,w,h],corners});
  }
  clearRect(){}fillRect(){}beginPath(){}arc(){}fill(){}strokeRect(){}
  getImageData(_x,_y,width,height){return{width,height,data:new Uint8ClampedArray(width*height*4).fill(128)}}
  putImageData(){}
  createLinearGradient(){return{addColorStop(){}}}createRadialGradient(){return{addColorStop(){}}}
}
class Canvas{
  constructor(w,h){this.width=w;this.height=h;this.ctx=new Context(this);canvases.push(this)}
  getContext(kind){assert.strictEqual(kind,'2d');return this.ctx}
  convertToBlob(options){return encoder(this,options)}
}
const sandbox={OffscreenCanvas:Canvas,performance:{now:()=>1},console,
  RelayProceduralDecor:require(path.join(ROOT,'procedural_decor.js')),RelayEditorValidation:{},
  document:{querySelector:()=>null},perfMeasure:(_name,fn)=>fn()};
vm.createContext(sandbox);
const code=[
  section('const W=','\n// PERF-001A:'),
  section('class Room{','\n// Low-cost steering helpers'),
  section('class HDArtSheet{','\nclass StaticPainter'),
  section('class StaticPainter{','\nclass SpriteAtlas'),
  section('class GLRenderer{','\nclass ParticleField'),
  section('class Game{','\nlet game=null'),
  'let game=null;',section('function buildRasterSnapshot(','\nasync function main('),
  '({Room,HDArtSheet,StaticPainter,GLRenderer,Game,buildRasterSnapshot,exportRaster,setGame:g=>game=g,setDownloads:(blob,text)=>{downloadBlob=blob;download=text}});'
].join('\n');
const api=vm.runInContext(code,sandbox);
vm.runInContext(fs.readFileSync(path.join(ROOT,'editor.js'),'utf8'),sandbox);
const builds=[],issued=[];let runtimeBuilds=0,buildHook=null;
// Separate ownership from static raster details (qualified by PERF-004 tests).
// Real StaticPainter.sprite/glow and Game presentation methods remain active.
api.StaticPainter.prototype.build=function(room,state,w,h){
  if(this.runtimeMarker)runtimeBuilds++;
  buildHook?.(this);
  const canvas=new Canvas(w,h),normal=new Canvas(w,h),spec=new Canvas(w,h);
  this.lastMaterialMaps={normal,spec};this.materialNormalCtx=null;this.materialSpecCtx=null;
  builds.push({painter:this,canvas,normal,spec});return canvas;
};
const sprite=api.StaticPainter.prototype.sprite,glow=api.StaticPainter.prototype.glow;
api.StaticPainter.prototype.sprite=function(ctx,name,x,y,opts={}){ctx.events.push({kind:'sprite',name,x,y,opts:{...opts}});return sprite.call(this,ctx,name,x,y,opts)};
api.StaticPainter.prototype.glow=function(ctx,...args){ctx.events.push({kind:'glow',args:[...args]});return glow.call(this,ctx,...args)};
api.setDownloads((name,blob)=>issued.push({name,blob}),(name,text)=>issued.push({name,semantic:JSON.parse(text)}));
function sourceFor(index=0){
  const art=new api.HDArtSheet({width:4096,height:4096},structuredClone(manifest));
  const themes={WORLD:'initial',UI:'initial-ui'},luts={themes,channels:()=>Object.keys(themes),themeForChannel:k=>themes[k],hex:()=> '#123456',rgb:()=>[.1,.2,.3]};
  const state={completed:new Set(),robots:new Set(),isDone(id){return this.completed.has(id)},hasRobot(id){return this.robots.has(id)},roomComplete(sp){return sp.objects.every(o=>this.isDone(o.object_id))}};
  const g=Object.create(api.Game.prototype),painter=new api.StaticPainter(art,luts),renderer=Object.create(api.GLRenderer.prototype);
  Object.assign(renderer,{hdArt:art,mutableHD:[17,19],mutableNormal:[23],mutableGlow:[29]});
  painter.runtimeMarker={kept:true};painter.lastMaterialMaps={normal:{width:21,height:22},spec:{width:23,height:24}};
  painter.materialNormalCtx={kept:'normal'};painter.materialSpecCtx={kept:'spec'};
  Object.assign(g,{art,luts,state,painter,renderer,room:new api.Room(index,structuredClone(story.rooms[index]),structuredClone(maps)),toasts:[],levelMenuOpen:()=>false,isModal:()=>false,toast(message){this.toasts.push(message)}});
  return g;
}
const released=c=>!c||(c.width===1&&c.height===1);
function assertReleased(){for(const b of builds){assert(released(b.canvas)&&released(b.normal)&&released(b.spec),'snapshot retained an owned canvas');assert.strictEqual(b.painter.lastMaterialMaps,null);assert.strictEqual(b.painter.materialNormalCtx,null);assert.strictEqual(b.painter.materialSpecCtx,null);assert.strictEqual(b.painter.art.tintCache.size,0,'export retained private tint cache entries');assert.strictEqual(b.painter.art.normalTransformCache.size,0,'export retained private normal cache entries')}}
function capture(g){
  const painter=Object.entries(g.painter),queues=JSON.stringify([g.renderer.mutableHD,g.renderer.mutableNormal,g.renderer.mutableGlow]),s=api.buildRasterSnapshot(g);
  try{
    assert.strictEqual(s.canvas.width,640);assert.strictEqual(s.canvas.height,360);
    assert.strictEqual(s.semantic.schema,'relay-moth-raster/v3.9952');assert.strictEqual(s.basename,g.room.key+'-pretty39952-static');
    for(const [key,value] of painter)assert.strictEqual(g.painter[key],value,'export changed runtime painter '+key);
    assert.strictEqual(JSON.stringify([g.renderer.mutableHD,g.renderer.mutableNormal,g.renderer.mutableGlow]),queues,'export changed renderer queues');
    const b=builds.at(-1);assert.notStrictEqual(b.painter,g.painter);assert.notStrictEqual(b.painter.art,g.art,'export borrowed the runtime derived-cache owner');assert(released(b.normal)&&released(b.spec),'material maps outlived synchronous capture');
    const events=s.canvas.ctx.events,firstGlow=events.findIndex(e=>e.kind==='glow');
    if(firstGlow>=0)assert(events.slice(firstGlow).every(e=>e.kind==='glow'),'glows must follow the complete HD sprite batch');
    return{semantic:s.semantic,events:[...events],images:[...s.canvas.ctx.images]};
  }finally{s.canvas.width=s.canvas.height=1;assertReleased()}
}
const signature=shot=>JSON.stringify(shot.events);
let contentCases=0,cornerCases=0,cacheOwnershipCases=0;
function contentChecks(){
  for(let index=0;index<story.rooms.length;index++){
    const g=sourceFor(index);g.room.objectFxHidden.clear();
    const initial=capture(g);assert.deepStrictEqual(Array.from(initial.semantic.completed),[]);
    for(const obj of g.room.spec.objects)g.state.completed.add(obj.object_id);
    g.room.bridgeProgress=g.room.bridgePhases.length;g.room.bridgeBuilt=true;
    const completed=capture(g);
    assert.deepStrictEqual(Array.from(completed.semantic.completed),g.room.spec.objects.map(obj=>obj.object_id));
    for(const obj of g.room.spec.objects){
      const name=g.art.roles.objective[obj.kind];if(obj.kind==='pip'||!name)continue;
      const [x,y]=g.room.center(g.room.objects[obj.object_id]),[,h]=g.art.worldSize(name,g.painter.spriteScale(name));
      assert(completed.events.some(e=>e.kind==='sprite'&&e.name===name&&e.x===x&&e.y===y+12-h/2&&e.opts.alpha===.97),'completed objective absent in '+g.room.key+': '+obj.object_id);
    }
    const gates=completed.events.filter(e=>e.kind==='sprite'&&e.name==='gate');
    assert.strictEqual(gates.length,Number(!!g.room.spec.previous_side)+Number(!!g.room.spec.next_side));
    assert(gates.every(e=>e.opts.alpha===1),'completed room retained a closed gate');contentCases++;
  }
  const g=sourceFor();g.room.editorDecor=[];let before=capture(g);
  g.room.editorDecor=[{sprite:'orb_orange',x:320,y:200,scale:2,alpha:1,flip:true,rot:.2}];
  let after=capture(g);assert.notStrictEqual(signature(after),signature(before));assert(after.events.some(e=>e.kind==='sprite'&&e.name==='orb_orange'&&e.x===320));contentCases++;
  g.room.editorDecor=[];const objective=g.room.spec.objects.find(o=>o.kind!=='pip');g.state.completed.add(objective.object_id);
  before=capture(g);g.room.objectFxHidden.add(objective.object_id);after=capture(g);assert.notStrictEqual(signature(before),signature(after),'completed-objective suppression was omitted');contentCases++;
  for(const o of g.room.spec.objects)g.room.objectFxHidden.add(o.object_id);g.state.completed.clear();before=capture(g);
  for(const o of g.room.spec.objects)g.state.completed.add(o.object_id);after=capture(g);assert.notStrictEqual(signature(before),signature(after),'gate state was omitted');contentCases++;
  const generated=sandbox.RelayProceduralDecor.enumerate(g.room,g.art.roles).find(d=>Array.isArray(d.tile));assert(generated);before=capture(g);g.room.decorExclusions.add(generated.tile.join(','));after=capture(g);assert.notStrictEqual(signature(before),signature(after),'generated-decor suppression was omitted');contentCases++;
  const home=sourceFor(4),robot=home.room.decorRobots.find(r=>r.id);assert(robot);before=capture(home);home.state.robots.add(robot.id);after=capture(home);
  assert.notStrictEqual(signature(before),signature(after),'recruited robots were not removed');assert(Array.from(after.semantic.recruited_robots).includes(robot.id));contentCases++;
  const tin=sourceFor(2);tin.room.objectFxHidden=new Set(tin.room.spec.objects.map(o=>o.object_id));const stages=[];
  for(let stage=0;stage<=4;stage++){
    tin.room.bridgeProgress=stage;tin.room.bridgeBuilt=stage===4;tin.state.completed=new Set(tin.room.spec.objects.slice(0,stage).map(o=>o.object_id));
    const shot=capture(tin);assert.deepStrictEqual(Array.from(shot.semantic.completed),[...tin.state.completed]);stages.push(signature(shot));contentCases++;
  }
  assert.strictEqual(new Set(stages).size,5,'all five bridge presentation states must differ');assert.strictEqual(runtimeBuilds,0);
}
function textureCorners(g,image){
  const uv=g.art.uv('lamp_blue'),keys=[[uv.u0,uv.v0],[uv.u1,uv.v0],[uv.u1,uv.v1],[uv.u0,uv.v1]];
  return new Map(keys.map((key,i)=>[key.join(','),image.corners[i]]));
}
function cornerDistance(a,b){let max=0;assert.strictEqual(a.size,b.size);for(const [key,p] of a){assert(b.has(key));const q=b.get(key);max=Math.max(max,Math.hypot(p[0]-q[0],p[1]-q[1]))}return max}
function rotationChecks(){
  for(const anchor of ['bottom','top','center'])for(const flip of [false,true]){
    const g=sourceFor(),opts={anchor,flip,rot:.47,scale:1.3,alpha:.8,tintStrength:0},x=173.25,y=121.75;
    g.renderer.mutableHD=[];api.Game.prototype.mutableSprite.call(g,'lamp_blue',x,y,opts);
    const quad=new Map();for(let i=0;i<g.renderer.mutableHD.length;i+=9){const a=g.renderer.mutableHD;quad.set(a.slice(i+2,i+4).join(','),a.slice(i,i+2))}
    assert.strictEqual(quad.size,4);
    g.renderMutablePresentation=function(){this.mutableSprite('lamp_blue',x,y,opts)};
    const shot=capture(g);assert.strictEqual(shot.images.length,1);assert(cornerDistance(quad,textureCorners(g,shot.images[0]))<1e-9,'Canvas texture corners disagree with actual runtime mutable quad');
    if(anchor!=='center'){
      const c=new Canvas(640,360),p=new api.StaticPainter(g.art,g.luts);p.sprite(c.ctx,'lamp_blue',x,y,opts);
      assert(cornerDistance(quad,textureCorners(g,c.ctx.images[0]))>1,'old anchor pivot must fail the independent runtime-corner oracle');c.width=c.height=1;
    }
    cornerCases++;
  }
}
function cacheSnapshot(art){return{generation:art.normalTransformGeneration,caches:['tintCache','normalTransformCache'].map(name=>({name,map:art[name],entries:[...art[name]].map(([key,canvas])=>({key,canvas,width:canvas.width,height:canvas.height}))}))}}
function assertCacheUnchanged(art,before){
  assert.strictEqual(art.normalTransformGeneration,before.generation,'export advanced runtime normal generation');
  for(const saved of before.caches){
    assert.strictEqual(art[saved.name],saved.map,'export replaced a runtime cache Map');
    const entries=[...saved.map];assert.strictEqual(entries.length,saved.entries.length,'export changed runtime cache size');
    saved.entries.forEach((item,i)=>{assert.strictEqual(entries[i][0],item.key,'export reordered runtime cache entries');assert.strictEqual(entries[i][1],item.canvas,'export replaced a runtime source');assert.strictEqual(item.canvas.width,item.width,'export released a borrowed source width');assert.strictEqual(item.canvas.height,item.height,'export released a borrowed source height')});
  }
}
async function cacheOwnershipChecks(){
  for(const mode of ['snapshot','composition-failure','build-failure','encode-pending']){
    const g=sourceFor(),runtime=g.art;
    // Current metadata can differ from the originally loaded manifest. The
    // export must inherit those authoritative overrides with its image refs.
    runtime.regions={...runtime.regions,cache_probe:[0,0,2,3]};runtime.meta={...runtime.meta,cache_probe:{world_scale:1.5,element:'far_forest'}};
    runtime.roles={...runtime.roles,cache_probe:'cache_probe'};runtime.normalImg={width:4096,height:4096};
    runtime.tintedRegion('cache_probe','#112233',.17);runtime.tintedRegion('cache_probe','#223344',.18);
    runtime.transformedNormal('cache_probe',true,.35);runtime.transformedNormal('cache_probe',false,.45);
    const before=cacheSnapshot(runtime),owned=new Set(),owners=new Set(),evicted=new Set(),peaks={tintCache:0,normalTransformCache:0};
    for(const [method,cache] of [['tintedRegion','tintCache'],['transformedNormal','normalTransformCache']]){
      const original=runtime[method];runtime[method]=function(...args){
        assert.notStrictEqual(this,runtime,'export requested a runtime derived surface');
        const prior=new Set(this[cache].values()),canvas=original.apply(this,args);if(canvas)owned.add(canvas);
        const current=new Set(this[cache].values());for(const old of prior)if(!current.has(old)){assert(released(old),'private eviction retained its backing');evicted.add(old)}
        peaks[cache]=Math.max(peaks[cache],this[cache].size);return canvas;
      };
    }
    const populate=(art,draw)=>{for(let i=0;i<100;i++){
      if(draw)draw(i);else art.tintedRegion('cache_probe','#123456',.200+i/1000);
      art.transformedNormal('cache_probe',true,.01+i/100);
    }};
    buildHook=painter=>{
      const art=painter.art;owners.add(art);assert.notStrictEqual(art,runtime);
      for(const key of ['img','bumpImg','specImg','normalImg','manifest','regions','meta','roles','worldScale'])assert.strictEqual(art[key],runtime[key],'export lost current atlas authority '+key);
      for(const key of ['tintCache','normalTransformCache']){assert(Object.hasOwn(art,key));assert.notStrictEqual(art[key],runtime[key]);assert.strictEqual(art[key].size,0,'export copied borrowed cache entries')}
      assert(Object.hasOwn(art,'normalTransformGeneration'));assert.strictEqual(art.normalTransformGeneration,0);
      if(mode==='build-failure'){populate(art);throw Error('private-cache static build failure')}
    };
    g.renderMutablePresentation=function(){
      assert.strictEqual(this.art,this.painter.art,'mutable export retained the runtime art owner');assert.notStrictEqual(this.art,runtime);
      populate(this.art,i=>this.mutableSprite('cache_probe',20+i,40,{tintStrength:.200+i/1000}));
      if(mode==='composition-failure')throw Error('private-cache composition failure');
    };
    const assertClean=()=>{
      assert.strictEqual(owners.size,1);assert.strictEqual(owned.size,200,'real tint and transformed-normal requests were not exercised');
      assert.strictEqual(evicted.size,8,'both 96-entry caches must evict under 100 distinct requests');
      assert.deepStrictEqual(peaks,{tintCache:96,normalTransformCache:96});
      for(const art of owners){assert.strictEqual(art.tintCache.size,0);assert.strictEqual(art.normalTransformCache.size,0)}
      assert([...owned].every(released),'export retained a private derived backing');assertCacheUnchanged(runtime,before);
    };
    const oldEncoder=encoder;
    try{
      if(mode==='snapshot'){
        const shot=api.buildRasterSnapshot(g);assertClean();assert(!released(shot.canvas),'capture released color before its consumer');shot.canvas.width=shot.canvas.height=1;
      }else if(mode==='encode-pending'){
        api.setGame(g);sandbox.rmfEditor=null;let finish;
        encoder=canvas=>{assertClean();assert(!released(canvas));return new Promise(resolve=>finish=()=>resolve({type:'image/png'}))};
        const pending=api.exportRaster();assert(finish,'private cache cleanup did not reach the encoder');assertClean();finish();assert.strictEqual(await pending,true);
      }else assert.throws(()=>api.buildRasterSnapshot(g),/private-cache (composition|static build) failure/);
      assertClean();assertReleased();cacheOwnershipCases++;
    }finally{buildHook=null;encoder=oldEncoder}
  }
}
async function lifecycleChecks(){
  let g=sourceFor(),flushes=0;api.setGame(g);sandbox.rmfEditor={game:g,savedBaseline:{untouched:true},flushForPersistence(){flushes++}};
  const baseline=sandbox.rmfEditor.savedBaseline,room=g.room.key,completed=g.room.spec.objects.filter(o=>g.state.isDone(o.object_id)).map(o=>o.object_id),themes={...g.luts.themes};
  let finish;encoder=(canvas,options)=>{assert.strictEqual(options.type,'image/png');return new Promise(resolve=>finish=()=>resolve({type:'image/png',capture:canvas.ctx.events.slice()}))};
  issued.length=0;const pending=api.exportRaster(),count=builds.length,b=builds.at(-1);
  assert(finish);assert.strictEqual(flushes,1);assert.strictEqual(issued.length,0);assert(!released(b.canvas)&&released(b.normal)&&released(b.spec));
  assert.strictEqual(b.painter.art.tintCache.size,0);assert.strictEqual(b.painter.art.normalTransformCache.size,0);
  assert.strictEqual(await api.exportRaster(),false);assert.strictEqual(builds.length,count);
  g.room=new api.Room(1,structuredClone(story.rooms[1]),structuredClone(maps));g.state.completed=new Set(['later']);g.luts.themes.WORLD='later';
  finish();assert.strictEqual(await pending,true);assert.strictEqual(issued.length,2);
  assert.deepStrictEqual(issued.map(d=>d.name),[room+'-pretty39952-static.png',room+'-pretty39952-static.json']);
  assert.strictEqual(issued[1].semantic.room,room);assert.deepStrictEqual(issued[1].semantic.completed,completed);assert.deepStrictEqual(issued[1].semantic.channels,themes);assert.strictEqual(sandbox.rmfEditor.savedBaseline,baseline);assertReleased();
  issued.length=0;encoder=()=>Promise.reject(Error('injected encode failure'));assert.strictEqual(await api.exportRaster(),false);assert.strictEqual(issued.length,0);assertReleased();
  const render=g.renderMutablePresentation;g.renderMutablePresentation=()=>{throw Error('injected composition failure')};
  assert.strictEqual(await api.exportRaster(),false);assert.strictEqual(issued.length,0);assertReleased();g.renderMutablePresentation=render;
  const flush=sandbox.rmfEditor.flushForPersistence,first=builds.length;sandbox.rmfEditor.flushForPersistence=()=>{throw Error('injected flush failure')};
  assert.strictEqual(await api.exportRaster(),false);assert.strictEqual(builds.length,first);assert.strictEqual(issued.length,0);sandbox.rmfEditor.flushForPersistence=flush;
  encoder=async()=>({type:'image/png'});assert.strictEqual(await api.exportRaster(),true);assert.strictEqual(issued.length,2);assertReleased();
  api.setGame(null);assert.strictEqual(await api.exportRaster(),false);api.setGame(g);
  // Exercise the production editor capture handler before Game's bubbling key
  // handler. Input isolation and repeat suppression must precede export work.
  const editor=Object.create(sandbox.WysiwygEditor.prototype);editor.active=true;
  const event=(tag='DIV',repeat=false)=>({key:'F8',repeat,target:{tagName:tag,dataset:{}},prevented:false,stopped:false,preventDefault(){this.prevented=true},stopImmediatePropagation(){this.stopped=true}});
  for(const tag of ['INPUT','TEXTAREA','SELECT']){const e=event(tag),n=builds.length;editor.onKey(e);if(!e.stopped)g.keyDown(e);assert(e.stopped);assert.strictEqual(builds.length,n)}
  const e=event(),n=builds.length;editor.onKey(e);assert(!e.stopped,'active editor swallowed F8');g.keyDown(e);await new Promise(resolve=>setImmediate(resolve));assert(e.prevented);assert.strictEqual(builds.length,n+1);assertReleased();
  const repeat=event('DIV',true),level=g.levelMenuOpen;g.levelMenuOpen=()=>{throw Error('repeat reached menu/state lookup')};g.keyDown(repeat);g.levelMenuOpen=level;
  assert(repeat.prevented);assert.strictEqual(builds.length,n+1);assert.strictEqual(runtimeBuilds,0);assert.strictEqual(sandbox.rmfEditor.savedBaseline,baseline);
}
async function main(){contentChecks();rotationChecks();await cacheOwnershipChecks();await lifecycleChecks();console.log('RASTER EXPORT REGRESSION 4.15 PASS');console.log('  persistent presentation cases:',contentCases,'; independent runtime texture-corner cases:',cornerCases,'; private cache lifecycle cases:',cacheOwnershipCases);console.log('  isolated painter/material/cache ownership, captured async names/metadata, encode/composition/flush failures, retry, editor input and repeat routing')}
main().catch(error=>{console.error(error);process.exitCode=1});
