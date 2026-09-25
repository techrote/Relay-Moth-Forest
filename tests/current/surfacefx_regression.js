'use strict';
const ROOT=require('path').resolve(__dirname,'../..');
const assert=require('assert');
const fs=require('fs');
const path=require('path');
const S=require(ROOT+'/surfacefx.js');

function testShoreField(){
  const w=7,h=7,mask=new Uint8Array(w*h);
  for(let y=1;y<6;y++)for(let x=1;x<6;x++)mask[y*w+x]=1;
  const f=S.buildShoreField(mask,w,h,8),at=(x,y,c)=>f.rgba[(y*w+x)*4+c];
  assert.strictEqual(at(0,0,0),0,'dry cell became water');
  assert.strictEqual(at(1,1,0),255,'wet cell missing');
  assert(at(3,3,1)>at(1,1,1),'shore distance does not increase toward water interior');
}
function testInvalidation(){
  const g=new S.RevisionGate();assert(g.shouldRebuild('tin_stream|bridge:0',2));assert(!g.shouldRebuild('tin_stream|bridge:0',2));assert(g.shouldRebuild('tin_stream|bridge:1',2));assert(g.shouldRebuild('tin_stream|bridge:1',3));assert.strictEqual(g.rebuilds,3);
}
function testBoundedRipples(){
  const q=new S.BoundedSources(3);for(let i=0;i<8;i++)q.add({id:i,age:0,life:1});assert.strictEqual(q.items.length,3);assert.deepStrictEqual(q.items.map(x=>x.id),[5,6,7]);q.update(2);assert.strictEqual(q.items.length,0);
}
function testQuality(){
  assert.deepStrictEqual(S.fieldResolutionForQuality(0),[0,0]);assert.deepStrictEqual(S.fieldResolutionForQuality(1),[128,72]);assert.deepStrictEqual(S.fieldResolutionForQuality(2),[224,126]);assert.deepStrictEqual(S.fieldResolutionForQuality(3),[320,180]);assert.deepStrictEqual(S.fieldResolutionForQuality(4),[416,234]);
}
function testGrass(){
  const desc={signature:'room-a',clumps:[{x:100,y:100,radius:18,seed:1},{x:200,y:130,radius:20,seed:2},{x:330,y:170,radius:16,seed:3}]},before=JSON.stringify(desc);
  const a=S.generateGrassInstances(desc,3,2.5),b=S.generateGrassInstances(desc,3,2.5);assert.strictEqual(a.count,b.count);assert(a.count<=S.GRASS_HARD_CAP);assert.deepStrictEqual(Array.from(a.data),Array.from(b.data),'grass generation is not deterministic');assert.strictEqual(JSON.stringify(desc),before,'SurfaceFX mutated visual descriptor/collision source');
}
function testShaderFailureFallback(){
  const gl={ARRAY_BUFFER:1,STATIC_DRAW:2,TEXTURE_2D:3,TEXTURE_MIN_FILTER:4,TEXTURE_MAG_FILTER:5,TEXTURE_WRAP_S:6,TEXTURE_WRAP_T:7,LINEAR:8,CLAMP_TO_EDGE:9,RGBA8:10,RGBA:11,UNSIGNED_BYTE:12,
    createBuffer:()=>({}),bindBuffer(){},bufferData(){},createTexture:()=>({}),bindTexture(){},texParameteri(){},texImage2D(){},createShader(){throw new Error('forced shader failure')}};
  const oldError=console.error;console.error=()=>{};let fx;try{fx=new S.SurfaceFX(gl,{logicalWidth:640,logicalHeight:360})}finally{console.error=oldError}const d=fx.diagnostics();assert.strictEqual(d.ready,false);assert(d.errors.length>=2,'shader failures were not reported/isolated');
}
function testIntegrationContracts(){
  const root=ROOT,js=fs.readFileSync(path.join(root,'game.js'),'utf8'),html=fs.readFileSync(path.join(root,'index.html'),'utf8'),sfx=fs.readFileSync(path.join(root,'surfacefx.js'),'utf8');
  assert(html.indexOf('surfacefx.js')<html.indexOf('game.js'),'SurfaceFX must load before game.js');
  assert(js.includes("if(this.room.bridgeOpen(k))continue"),'bridge-open cells are not excluded from water mask');
  assert(js.includes("relayMothGraphics3999")&&js.includes("relayMothGraphics39981")&&js.includes("relayMothGraphics3998")&&js.includes("relayMothGraphics39955")&&js.includes("relayMothGraphics39954")&&js.includes("relayMothGraphics39953")&&js.includes("relayMothGraphics39952")&&js.includes("relayMothGraphics3995")&&js.includes("relayMothGraphics399"),'graphics settings migration missing');
  assert(js.includes("settings.waterQuality??2")&&js.includes("this.waterProg"),'legacy/off water fallback missing');
  assert(js.includes("buildGrassSurfaceDescriptor")&&js.includes("room.walls.has(k)||room.water.has(k)||room.border.has(k)||room.bridgeCells.has(k)"),'grass adapter does not respect authored surface exclusions');
  assert(sfx.includes('drawArraysInstanced'),'grass is not instanced');
  assert(sfx.includes('MAX_RIPPLES=12')&&sfx.includes('GRASS_HARD_CAP=4600'),'surface budgets are not explicit');
  assert(sfx.includes('sampler2D uScene')&&sfx.includes('uRefractionStrength')&&sfx.includes('uNormalStrength'),'water refraction/material controls missing');
  assert(sfx.includes('height=(13.2')&&sfx.includes('*1.24,width=(2.10')&&sfx.includes('*1.10;'),'v4.02 taller grass tuning missing');
}

for(const fn of [testShoreField,testInvalidation,testBoundedRipples,testQuality,testGrass,testShaderFailureFallback,testIntegrationContracts])fn();
console.log('SURFACEFX REGRESSION 3.999 PASS');
console.log('  shoreline field + rebuild invalidation validated');
console.log('  ripple list bounded; legacy/off fallback contract present');
console.log('  sparse grass generation deterministic and hard-capped');
console.log('  shader failure isolates SurfaceFX instead of aborting game startup');
