#!/usr/bin/env node
/* Hook/control tests only. These do not emulate Canvas2D pixels or prove speed. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const hook=fs.readFileSync(path.join(__dirname,'row_oob_diagnostic_415.js'),'utf8');
let passed=0;

function harness(mode='oob',timingAttribution=false){
  const actual=[],measures=[],state={throwRead:false,nontransparentOob:false};let clock=0;
  class Context{
    constructor(canvas,options){this.canvas=canvas;this.attributes={alpha:options?.alpha??true,willReadFrequently:options?.willReadFrequently??false}}
    getContextAttributes(){return{...this.attributes}}
    getImageData(...args){
      actual.push({canvas:this.canvas,args:[...args]});
      if(state.throwRead)throw Error('read failure');
      const data=new Uint8ClampedArray(args[2]*args[3]*4);
      if(args[0]>=0||state.nontransparentOob)data.set([3,5,7,255]);
      return{data};
    }
  }
  class Canvas{
    constructor(width,height){this.width=width;this.height=height;this.context=null}
    getContext(type,options){assert.equal(type,'2d');return this.context||(this.context=new Context(this,options))}
  }
  class Painter{
    static COLOR_POLICY='canvas2d-row-sync-v1';
    patternDecor(){}
    buildSurface(room,state,width,height,region){
      const rows=region?region.ty1-region.ty0:19;
      const color=new Canvas(width,height),ctx=color.getContext('2d',{alpha:false,willReadFrequently:false});
      this.lastColor=ctx;
      if(room.sources){
        this.material=new Canvas(4,4).getContext('2d',{alpha:true});this.material.getImageData(0,0,1,1);
        this.source=new Canvas(4,4).getContext('2d',{willReadFrequently:true});this.source.getImageData(0,0,1,1);
        this.secondOpaque=new Canvas(4,4).getContext('2d',{alpha:false,willReadFrequently:false});this.secondOpaque.getImageData(0,0,1,1);
      }
      if(room.nested)this.buildSurface({key:'nested'},state,8,8,{tx0:0,ty0:0,tx1:1,ty1:1});
      for(let row=0;row<rows;row++)ctx.getImageData(0,0,1,1);
      if(room.nonrow)ctx.getImageData(2,3,2,1);
      this.patternDecor(ctx,room,state);
      if(room.afterOverlay)ctx.getImageData(0,0,1,1);
      return color;
    }
  }
  let active=null,serial=0;
  const probe={begin(name,meta){if(active)return null;active=++serial;return active},end(token){if(token===active)active=null},measure(label,action){if(active)measures.push(label);return action()}};
  const gl={getError(){return 0},isContextLost(){return false}};
  const release=canvas=>{canvas.width=canvas.height=1};
  const context=vm.createContext({OffscreenCanvas:Canvas,StaticPainter:Painter,relayMothPerf:probe,game:{renderer:{gl}},releaseCanvasBacking:release,
    performance:{now:()=>++clock},structuredClone,Uint8ClampedArray,console});
  const originals={getContext:Canvas.prototype.getContext,read:Context.prototype.getImageData,build:Painter.prototype.buildSurface,pattern:Painter.prototype.patternDecor,begin:probe.begin,end:probe.end,getError:gl.getError,isContextLost:gl.isContextLost,release};
  vm.runInContext(hook,context);context.installRelayRowReadDiagnostic({mode,timingAttribution});
  return{context,controller:context.relayRowReadDiagnostic,painter:new Painter(),Painter,Canvas,Context,actual,measures,state,probe,gl,originals};
}
function test(label,action){action();passed++;console.log('PASS '+label)}
const args=[{key:'quiet_nest'}, {},640,360];

test('production row requests forward OOB and return transparent zero',()=>{
  const h=harness();h.painter.buildSurface(...args);const trace=h.controller.snapshot();
  assert.equal(trace.nativeReads.length,19);assert.equal(trace.counters.forwardedOutOfBounds,19);
  assert(trace.nativeReads.every(read=>JSON.stringify(read.requested)==='[0,0,1,1]'&&JSON.stringify(read.forwarded)==='[-1,-1,1,1]'&&read.returnedTransparentZero));
  assert(h.actual.every(read=>JSON.stringify(read.args)==='[-1,-1,1,1]'));
  assert.equal(trace.contexts[0].explicitCreation.willReadFrequently,false);h.controller.uninstall();
});
test('inbounds variant forwards unchanged coordinates',()=>{
  const h=harness('inbounds');h.painter.buildSurface(...args);const trace=h.controller.snapshot();
  assert.equal(trace.counters.forwardedInBounds,19);assert.equal(trace.counters.forwardedOutOfBounds,0);
  assert(h.actual.every(read=>JSON.stringify(read.args)==='[0,0,1,1]'));h.controller.uninstall();
});
test('outer audit observations remain requests while innermost forwarding is OOB',()=>{
  const h=harness(),inner=h.Context.prototype.getImageData,requested=[];
  h.Context.prototype.getImageData=function(...values){requested.push(values);return inner.apply(this,values)};
  try{h.painter.buildSurface(...args)}finally{h.Context.prototype.getImageData=inner}
  assert.equal(requested.length,19);assert(requested.every(values=>JSON.stringify(values)==='[0,0,1,1]'));
  assert(h.actual.every(read=>JSON.stringify(read.args)==='[-1,-1,1,1]'));
  assert(h.controller.snapshot().nativeReads.every(read=>JSON.stringify(read.forwarded)==='[-1,-1,1,1]'));h.controller.uninstall();
});
test('material/source and second opaque contexts remain untouched',()=>{
  const h=harness();h.painter.buildSurface({...args[0],sources:true},...args.slice(1));
  assert.equal(h.actual.length,22);assert(h.actual.slice(0,3).every(read=>JSON.stringify(read.args)==='[0,0,1,1]'));
  assert.equal(h.controller.snapshot().counters.forwardedOutOfBounds,19);h.controller.uninstall();
});
test('frozen direct full reference retains all inbounds row reads',()=>{
  const h=harness(),canvas=new h.Canvas(640,360),ctx=canvas.getContext('2d',{alpha:false,willReadFrequently:false});
  for(let i=0;i<19;i++)ctx.getImageData(0,0,1,1);
  assert.equal(h.controller.snapshot().counters.outsideBuildInBoundsColorCalls,19);
  assert(h.actual.every(read=>JSON.stringify(read.args)==='[0,0,1,1]'));h.controller.uninstall();
});
test('nonrow dimensions and post-overlay reads are not substituted',()=>{
  const h=harness();h.painter.buildSurface({...args[0],nonrow:true,afterOverlay:true},...args.slice(1));
  assert.deepEqual(h.actual.at(-2).args,[2,3,2,1]);assert.deepEqual(h.actual.at(-1).args,[0,0,1,1]);
  assert.equal(h.controller.snapshot().counters.forwardedOutOfBounds,19);h.controller.uninstall();
});
test('nested production builds preserve active color identity',()=>{
  const h=harness();h.painter.buildSurface({...args[0],nested:true},...args.slice(1));
  const trace=h.controller.snapshot();assert.equal(trace.builds.length,2);assert.equal(trace.counters.forwardedOutOfBounds,20);
  assert.deepEqual(Array.from(trace.builds,row=>row.rowSuccesses),[19,1]);h.controller.uninstall();
});
test('native read failure unwinds build scope and remains fatal',()=>{
  const h=harness();h.state.throwRead=true;assert.throws(()=>h.painter.buildSurface(...args),/read failure/);
  const trace=h.controller.snapshot();assert.equal(trace.builds[0].success,false);assert.equal(trace.counters.productionRowSuccesses,0);
  h.state.throwRead=false;h.controller.setMode('inbounds');h.controller.uninstall();
});
test('nontransparent OOB return is rejected',()=>{
  const h=harness();h.state.nontransparentOob=true;assert.throws(()=>h.painter.buildSurface(...args),/transparent pixel/);
  assert.equal(h.controller.snapshot().builds[0].success,false);h.controller.uninstall();
});
test('temporary original-policy reference restores mode after failure',()=>{
  const h=harness();assert.throws(()=>h.controller.withMode('inbounds','reference',()=>{h.painter.buildSurface(...args);throw Error('reference failure')}),/reference failure/);
  assert.equal(h.controller.snapshot().mode,'oob');assert.equal(h.controller.snapshot().scope,'setup');
  assert.equal(h.controller.snapshot().counters.forwardedInBounds,19);h.controller.uninstall();
});
test('event attribution is identical and separate from static phases',()=>{
  const h=harness('oob',true);h.controller.setScope('warmup');const token=h.probe.begin('control-full-static',{room:'quiet_nest'});
  assert.equal(h.probe.begin('nested',{}),null);h.painter.buildSurface(...args);h.gl.getError();h.gl.isContextLost();h.context.releaseCanvasBacking({width:20,height:30});h.probe.end(null);h.probe.end(token);
  const trace=h.controller.snapshot();assert.equal(trace.events.length,1);assert.equal(trace.events[0].ended,true);
  assert(trace.nativeReads.every(read=>read.scope==='timed-event'&&read.eventId===1));
  assert.deepEqual(h.measures,['diagnostic.gl.getError','diagnostic.gl.isContextLost','diagnostic.releaseCanvasBacking']);h.controller.uninstall();
  assert.equal(h.gl.getError,h.originals.getError);assert.equal(h.gl.isContextLost,h.originals.isContextLost);assert.equal(h.context.releaseCanvasBacking,h.originals.release);
});
test('trace reset releases records and restores all methods exactly',()=>{
  const h=harness();h.painter.buildSurface(...args);h.controller.resetTrace();assert.equal(h.controller.snapshot().nativeReads.length,0);h.controller.uninstall();
  assert.equal(h.Canvas.prototype.getContext,h.originals.getContext);assert.equal(h.Context.prototype.getImageData,h.originals.read);
  assert.equal(h.Painter.prototype.buildSurface,h.originals.build);assert.equal(h.Painter.prototype.patternDecor,h.originals.pattern);
  assert.equal(h.probe.begin,h.originals.begin);assert.equal(h.probe.end,h.originals.end);assert.equal(h.context.relayRowReadDiagnostic,undefined);
});
console.log('ROW-OOB DIAGNOSTIC SCOPE PASS '+passed+' controls; no native-pixel/performance claim');
