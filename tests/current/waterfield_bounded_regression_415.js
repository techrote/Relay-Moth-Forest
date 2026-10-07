'use strict';
const ROOT=require('path').resolve(__dirname,'../..');
const assert=require('assert');
const fs=require('fs');
const path=require('path');
const S=require(ROOT+'/surfacefx.js');

function finalMask(mask,edits){const out=mask.slice();for(const [i,v] of edits)out[i]=v;return out}
function verify(mask,w,h,edits,md,label,options={}){
  const initial=S.buildShoreField(mask,w,h,md),m=mask.slice(),rgba=initial.rgba.slice(),got=S.applyBoundedShoreField(m,rgba,w,h,edits,md,options),wantMask=finalMask(mask,edits),want=S.buildShoreField(wantMask,w,h,md);
  assert.deepStrictEqual(Buffer.from(m),Buffer.from(wantMask),label+' mask');
  assert.deepStrictEqual(Buffer.from(rgba),Buffer.from(want.rgba),label+' complete encoded field');
  return got;
}
function fixture(w,h){const m=new Uint8Array(w*h);for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++)m[y*w+x]=1;for(const [x,y] of [[3,3],[w-4,3],[Math.floor(w/2),Math.floor(h/2)]])if(x>0&&y>0&&x<w&&y<h)m[y*w+x]=0;return m}
function namedCases(){
  for(let q=1;q<=4;q++){
    const [w,h]=S.fieldResolutionForQuality(q),md=S.shoreMaxDistanceForQuality(q),base=fixture(w,h),center=Math.floor(h/2)*w+Math.floor(w/2),wet=center+1,edge=w+1;
    verify(base,w,h,[[wet,0]],md,`q${q} wet-to-dry`);
    verify(base,w,h,[[center,1]],md,`q${q} dry-to-wet`);
    verify(base,w,h,[[wet,0],[wet+1,0],[wet+2,0]],md,`q${q} bridge segment`);
    verify(base,w,h,[[wet,0],[(h-3)*w+(w-3),0]],md,`q${q} disjoint edits`);
    verify(base,w,h,[[wet,0],[wet+1,0]],md,`q${q} interacting edits`);
    verify(base,w,h,[[edge,0]],md,`q${q} field edge`);
  }
}
function exhaustiveSmall(){
  let comparisons=0;
  for(const md of [1,2,3])for(let bits=0;bits<512;bits++){const mask=new Uint8Array(9);for(let i=0;i<9;i++)mask[i]=(bits>>i)&1;for(let i=0;i<9;i++){verify(mask,3,3,[[i,mask[i]?0:1]],md,`small md${md} mask${bits} edit${i}`,{maxWorkRatio:10});comparisons++}}
  return comparisons;
}
function counterexampleAndPlanning(){
  const mask=Uint8Array.from([0,1,1,0]),md=2,plan=S.planShoreDirty([0],4,1,md,{maxWorkRatio:10});
  assert.strictEqual(plan.mode,'bounded');assert.deepStrictEqual(plan.regions[0].output,{x0:0,y0:0,x1:3,y1:1});assert.deepStrictEqual(plan.regions[0].source,{x0:0,y0:0,x1:4,y1:1});
  verify(mask,4,1,[[0,1]],md,'nearest-shore-removal counterexample',{maxWorkRatio:10});
  const mapped=S.logicalRectsToFieldRects([{x0:16,y0:16,x1:32,y1:32}],224,126,640,360);assert(mapped&&mapped.length===1);assert(mapped[0].x0<=5&&mapped[0].x1>=12,'logical projection must conservatively cover the tile');
  const fragmented=verify(fixture(80,50),80,50,[[81,0],[158,0],[2401,0],[2478,0]],8,'fragmented fallback',{maxRects:1,maxWorkRatio:10});assert.strictEqual(fragmented.mode,'full');
  assert.strictEqual(S.buildShoreField(Uint8Array.from([1,0]),2,1,10).rgba[2],230,'blue quantization remains independent');
  verify(Uint8Array.from([1,1,1,1,1,1,1,1,1]),3,3,[[4,0]],2,'all-wet gains first shoreline',{maxWorkRatio:10});
  verify(Uint8Array.from([0,1,1,1,1,1,1,1,1,1,1,1,0]),13,1,[[0,1]],3,'removed nearest shore uses replacement outside output',{maxWorkRatio:10});
  const overlap=fixture(20,8),overlapEdits=[[2*20+5,0],[2*20+12,0]];
  verify(overlap,20,8,overlapEdits,3,'disjoint outputs with overlapping source halos',{maxWorkRatio:10});
}
function integrationContracts(){
  const game=fs.readFileSync(path.join(ROOT,'game.js'),'utf8'),editor=fs.readFileSync(path.join(ROOT,'editor.js'),'utf8');
  for(const token of ['water.authority.diff','water.mask.patch','surface.water.total','water.bridge.commit.total','logicalRects','texSubImage2D'])assert(game.includes(token),token);
  assert(game.includes("if(this.room.bridgeOpen(k))continue"),'effective bridge-open exclusion missing');
  assert(editor.includes("if(mask&EDITOR_INVALIDATION.TERRAIN)")&&editor.includes("this.game.refreshEditorWater?.()"),'editor TERRAIN flush no longer reaches water refresh');
  assert(editor.includes("if(sync)return this.flushInvalidation(skipInspector)")&&editor.includes("this.commitTransaction()"),'synchronous final flush contract missing');
}
namedCases();
const small=exhaustiveSmall();
counterexampleAndPlanning();
integrationContracts();
console.log('WATERFIELD BOUNDED REGRESSION PERF-003 PASS');
console.log('  exact complete-field comparisons:',small+24);
console.log('  q1-q4 wet/dry/bridge/disjoint/interacting/edge cases + nearest-shore counterexample');
console.log('  bounded planner, full fallback and bridge/editor integration contracts validated');
