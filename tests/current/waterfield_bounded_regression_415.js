'use strict';
const ROOT=require('path').resolve(__dirname,'../..');
const assert=require('assert');
const S=require(ROOT+'/surfacefx.js');
let comparisons=0;

function finalMask(mask,edits){const out=mask.slice();for(const [i,v] of edits)out[i]=v;return out}
function verify(mask,w,h,edits,md,label,options={}){
  const initial=S.buildShoreField(mask,w,h,md),m=mask.slice(),rgba=initial.rgba.slice(),got=S.applyBoundedShoreField(m,rgba,w,h,edits,md,options),wantMask=finalMask(mask,edits),want=S.buildShoreField(wantMask,w,h,md);
  assert.deepStrictEqual(Buffer.from(m),Buffer.from(wantMask),label+' mask');
  assert.deepStrictEqual(Buffer.from(rgba),Buffer.from(want.rgba),label+' complete encoded field');
  // Reconstruct from the advertised upload payloads, not only the mutated CPU
  // cache: a missing rectangle or a bad packed row must fail independently.
  const uploaded=initial.rgba.slice();
  for(const {rect:r,bytes} of got.uploads){
    const rowBytes=(r.x1-r.x0)*4;
    assert.strictEqual(bytes.length,rowBytes*(r.y1-r.y0),label+' packed length');
    for(let y=r.y0;y<r.y1;y++)uploaded.set(bytes.subarray((y-r.y0)*rowBytes,(y-r.y0+1)*rowBytes),(y*w+r.x0)*4);
  }
  assert.deepStrictEqual(Buffer.from(uploaded),Buffer.from(want.rgba),label+' uploaded complete field');
  comparisons++;
  return got;
}
function fixture(w,h){const m=new Uint8Array(w*h);for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++)m[y*w+x]=1;for(const [x,y] of [[3,3],[w-4,3],[Math.floor(w/2),Math.floor(h/2)]])if(x>0&&y>0&&x<w&&y<h)m[y*w+x]=0;return m}
function namedCases(){
  for(let q=1;q<=4;q++){
    const [w,h]=S.fieldResolutionForQuality(q),md=S.shoreMaxDistanceForQuality(q),base=fixture(w,h),center=Math.floor(h/2)*w+Math.floor(w/2),wet=center+1,edge=w+1;
    const one=verify(base,w,h,[[wet,0]],md,`q${q} wet-to-dry`);
    assert.strictEqual(one.mode,'bounded');
    assert(one.distanceCells<w*h&&one.uploadBytes<4*w*h,`q${q} one-cell work must stay bounded`);
    verify(base,w,h,[[center,1]],md,`q${q} dry-to-wet`);
    verify(base,w,h,[[wet,0],[wet+1,0],[wet+2,0]],md,`q${q} bridge segment`);
    verify(base,w,h,[[wet,0],[(h-3)*w+(w-3),0]],md,`q${q} disjoint edits`);
    verify(base,w,h,[[wet,0],[wet+1,0]],md,`q${q} interacting edits`);
    verify(base,w,h,[[edge,0]],md,`q${q} field edge`);
  }
}
function exhaustiveSmall(){
  for(const md of [1,2,3])for(let bits=0;bits<512;bits++){const mask=new Uint8Array(9);for(let i=0;i<9;i++)mask[i]=(bits>>i)&1;for(let i=0;i<9;i++)verify(mask,3,3,[[i,mask[i]?0:1]],md,`small md${md} mask${bits} edit${i}`,{maxWorkRatio:10})}
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
function sequentialEditsAndFallbacks(){
  let seed=0x415003,bounded=0;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296};
  for(let q=1;q<=4;q++){
    const [w,h]=S.fieldResolutionForQuality(q),md=S.shoreMaxDistanceForQuality(q);
    let mask=fixture(w,h);
    for(let n=0;n<36;n++){
      const edits=[],x=2+(random()*(w-5)|0),y=2+(random()*(h-5)|0);
      for(let k=0;k<1+n%4;k++){const i=(y+k%2)*w+x+(k>>1);edits.push([i,mask[i]?0:1])}
      if(n%5===0)edits.push([edits[0][0],mask[edits[0][0]]]);
      const got=verify(mask,w,h,edits,md,`q${q} sequential ${n}`);
      if(got.mode==='bounded')bounded++;
      mask=finalMask(mask,edits);
    }
    const noop=verify(mask,w,h,[],md,`q${q} empty batch`);
    assert.strictEqual(noop.mode,'noop');assert.strictEqual(noop.uploadBytes,0);
    const i=(h>>1)*w+(w>>1),budget=verify(mask,w,h,[[i,mask[i]?0:1]],md,`q${q} work-budget fallback`,{maxWorkRatio:0});
    assert.strictEqual(budget.mode,'full');assert.strictEqual(budget.reason,'source-work-budget');
  }
  assert(bounded>=120,'sequential oracle must exercise actual bounded updates');
  const mask=fixture(8,8),rgba=S.buildShoreField(mask,8,8,2).rgba,maskBefore=mask.slice(),rgbaBefore=rgba.slice();
  assert.throws(()=>S.applyBoundedShoreField(mask,rgba,8,8,[[9,0],[-1,1]],2),RangeError);
  assert.deepStrictEqual(mask,maskBefore,'invalid batch must not partially mutate authority');
  assert.deepStrictEqual(rgba,rgbaBefore,'invalid batch must not partially mutate encoded cache');
  assert.strictEqual(S.logicalRectsToFieldRects([{x0:NaN,y0:0,x1:1,y1:1}],8,8,640,360),null);
  return bounded;
}
namedCases();
exhaustiveSmall();
counterexampleAndPlanning();
const sequential=sequentialEditsAndFallbacks();
console.log('WATERFIELD BOUNDED REGRESSION PERF-003 PASS');
console.log('  exact complete-field and reconstructed-upload comparisons:',comparisons);
console.log('  q1-q4 wet/dry/bridge/disjoint/interacting/edge cases + nearest-shore counterexample');
console.log('  sequential bounded updates:',sequential,'; no-op, budget/fragmentation fallback and invalid-batch isolation');
console.log('  production bridge/editor and GPU byte parity are exercised by the native browser suite');
