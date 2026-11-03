'use strict';
// Reconstructed after workspace loss; the pre-fix raster below is retained as
// an independent composition oracle and a safely capped defect reproducer.
const assert=require('assert'),fs=require('fs'),path=require('path'),vm=require('vm');
const ROOT=path.resolve(__dirname,'../..'),text=fs.readFileSync(path.join(ROOT,'game.js'),'utf8');
const Validation=require(path.join(ROOT,'editor_validation.js'));
const section=(a,b)=>{const i=text.indexOf(a),j=text.indexOf(b,i+a.length);assert(i>=0&&j>i);return text.slice(i,j)};
let instructions=0,legacyCappedInstructions=0;
function legacyBaseTile(ctx,tx,ty,seed,type){
  const x=tx*TILE,y=ty*TILE,micro=this.microtile||FLOOR_TILE;
  let e='ground',lo=40,hi=116;if(type==='path'){e='path';lo=72;hi=160}else if(type==='water'){e='water';lo=38;hi=126}else if(type==='blocker'){e='ground';lo=25;hi=76}
  for(let sy=0;sy<TILE;sy+=micro)for(let sx=0;sx<TILE;sx+=micro){const h=hash32(seed,sx+sy*17,3909),idx=lo+(h%Math.max(1,hi-lo));this.px(ctx,x+sx,y+sy,micro,micro,this.col(e,idx));
    for(let i=0;i<(type==='path'?6:type==='water'?4:5);i++){const q=hash32(h,i,1701),fx=x+sx+1+(q%(micro-2)),fy=y+sy+1+((q>>>8)%(micro-2)),fi=clamp(idx+((q>>>16)%84)-42,0,255);this.dot(ctx,fx,fy,this.col(e,fi),.65+((q>>>25)&1)*.55,.18+((q>>>27)&3)*.045)}
    if(type==='ground'||type==='blocker'){if((h%5)===0)this.px(ctx,x+sx+2,y+sy+micro-2,3,1,this.col('far_forest',105+(h%90)),.22);if((h%11)===0)this.dot(ctx,x+sx+micro-2,y+sy+2,this.col('tree_lights',120+(h%100)),.8,.23)}
    if(type==='path'){this.px(ctx,x+sx,y+sy,micro,1,this.col('path',Math.max(5,idx-36)),.38);if(h&1)this.px(ctx,x+sx+2,y+sy+4,Math.max(2,micro-3),1,this.col('path',Math.min(250,idx+28)),.13)}
    if(type==='water'){for(let i=0;i<2;i++){const q=hash32(h,i,77);this.px(ctx,x+sx+1,y+sy+2+i*3,4+(q%3),1,this.col('water',165+(q%75)),.20)}}
  }
}
class Context{
  save(){}restore(){}translate(){}scale(){}
  fillRect(...args){assert(args.every(Number.isFinite));instructions++}strokeRect(...args){assert(args.every(Number.isFinite));instructions++}
  beginPath(){}arc(...args){assert(args.every(Number.isFinite));instructions++}fill(){}
  createLinearGradient(){return{addColorStop(){}}}createRadialGradient(){return{addColorStop(){}}}
}
class Canvas{constructor(w,h){this.width=w;this.height=h;this.ctx=new Context()}getContext(){return this.ctx}}
const code=[
  'const W=640,H=360,TILE=16,FLOOR_TILE=4,GRID_W=40,GRID_H=19,PLAY_H=304,BOTTOM_H=56,TAU=Math.PI*2;',
  'const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));',
  section('function hash32(','\nfunction h01('),
  section('function releaseCanvasBacking(','\n\n// PERF-001A:'),
  section('class Room{','\n// Low-cost steering helpers'),
  section('class StaticPainter{','\nclass SpriteAtlas'),
  legacyBaseTile.toString(),'({Room,StaticPainter,legacyBaseTile});'
].join('\n');
const {Room,StaticPainter,legacyBaseTile:legacy}=vm.runInNewContext(code,{OffscreenCanvas:Canvas,perfMeasure:(_name,fn)=>fn()});
function draws(method,micro,type,cap=1000,finite=true){
  const result=[],push=(name,values,colour,alpha)=>{if(result.length>=cap)throw Error('instruction cap');if(finite){assert(values.concat(alpha).every(Number.isFinite),'nonfinite primitive');instructions++}else legacyCappedInstructions++;result.push([name,...values,colour,alpha])};
  const painter={microtile:micro,col:(element,index)=>element+':'+index,
    px:(_ctx,x,y,w,h,colour,alpha=1)=>push('px',[x,y,w,h],colour,alpha),
    dot:(_ctx,x,y,colour,size=2,alpha=1)=>push('dot',[x,y,size],colour,alpha)};
  method.call(painter,null,3,7,1234567,type);return result;
}
const omitted=Symbol('omitted'),spec={key:'fixture',pattern:'fixture',objects:[]};
const cases=[
  {value:omitted,wanted:4,valid:true},
  ...[3,3.25,3.5,4,5.5,8,12.25,15.999,16].map(value=>({value,wanted:value,valid:true})),
  ...[undefined,null,false,true,0,-0,-1,2,2.999,16.001,17,1e-12,NaN,Infinity,-Infinity,'','0','4','3.5',[],{},3n,Symbol('invalid'),()=>4].map(value=>({value,wanted:4,valid:false}))
];
let authorityCases=0,buildCases=0;
for(const test of cases){
  const raw={walls:[],water:[],path_cells:[],objects:{}};if(test.value!==omitted)raw.floor_microtile=test.value;
  const original=raw.floor_microtile,own=Object.hasOwn(raw,'floor_microtile'),maps={rooms:{fixture:raw,orphan:{...raw}}};
  const room=new Room(0,spec,maps);
  assert.strictEqual(Room.normalizeFloorMicrotile(test.value===omitted?undefined:test.value),test.wanted);
  assert.strictEqual(room.floorMicrotile,test.wanted);assert(Object.is(raw.floor_microtile,original));assert.strictEqual(Object.hasOwn(raw,'floor_microtile'),own);
  const errors=Validation.validate(maps,{rooms:[spec]},{regions:{},roles:{}}).filter(d=>d.code==='INVALID_FLOOR_MICROTILE');
  assert.deepStrictEqual(errors.map(d=>d.roomKey).sort(),test.valid?[]:['fixture','orphan'],'present invalid fields must be errors in story and map-only rooms');
  assert(errors.every(d=>d.severity==='error'&&d.ref?.field==='floor_microtile'));assert(Object.is(raw.floor_microtile,original));
  for(const kind of ['ground','path','water','blocker'])assert.deepStrictEqual(draws(StaticPainter.prototype.baseTile,test.value===omitted?undefined:test.value,kind),draws(legacy,test.wanted,kind),'direct painter safety preserves accepted composition');
  room.border.clear();room.floorMicrotile=test.value===omitted?undefined:test.value;
  const painter=new StaticPainter({regions:{},roles:{}},{hex:()=> '#123456'}),state={isDone:()=>false};
  const canvas=painter.buildPatch(room,state,640,360,{x:0,y:0,width:16,height:16,tx0:0,ty0:0,tx1:1,ty1:1});
  assert.strictEqual(painter.microtile,test.wanted,'buildSurface cannot trust manually assigned room values');assert.strictEqual(painter.lastMaterialMaps,null);canvas.width=canvas.height=1;buildCases++;
  authorityCases++;
}
// Full builds also normalize at their entry point. The actual per-tile raster
// was checked above; this spy verifies all 760 calls inherit the bounded value.
for(const value of [-1,'0',3.5,16]){
  const room=new Room(0,spec,{rooms:{fixture:{}}});room.floorMicrotile=value;room.border.clear();
  const painter=new StaticPainter({regions:{},roles:{}},{hex:()=> '#123456'}),seen=[];
  painter.baseTile=function(){seen.push(this.microtile)};
  const canvas=painter.build(room,{isDone:()=>false},640,360),maps=painter.lastMaterialMaps;
  assert.strictEqual(seen.length,760);assert(seen.every(n=>n===([-1,'0'].includes(value)?4:value)));
  for(const c of [canvas,maps.normal,maps.spec])c.width=c.height=1;buildCases++;
}
// Historical loops are executed under an instruction cap, never a timeout.
for(const value of [-1,1e-12,'0'])assert.throws(()=>draws(legacy,value,'ground',80,false),/instruction cap/);
assert.throws(()=>draws(legacy,2,'ground'),/nonfinite primitive/,'the old 2px modulo produces NaN coordinates');
const shipped=JSON.parse(fs.readFileSync(path.join(ROOT,'relay_moth_maps.json'),'utf8'));
const story=JSON.parse(fs.readFileSync(path.join(ROOT,'relay_moth_story.json'),'utf8'));
for(const [i,sp] of story.rooms.entries()){assert.strictEqual(shipped.rooms[sp.key].floor_microtile,4);assert.strictEqual(new Room(i,sp,shipped).floorMicrotile,4)}
assert.strictEqual(Validation.validate(shipped,story).filter(d=>d.code==='INVALID_FLOOR_MICROTILE').length,0);
console.log('FLOOR MICROTILE REGRESSION 4.15 PASS');
console.log('  authority cases:',authorityCases,'; build entry cases:',buildCases,'; finite primitive instructions:',instructions,'; capped legacy instructions:',legacyCappedInstructions);
console.log('  raw source preserved; story/map-only invalid diagnostics; bounded legacy-loop controls; exact supported fractional composition');
