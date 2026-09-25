'use strict';
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const src=fs.readFileSync(__dirname+'/game.js','utf8');
const a=src.indexOf('const GRAPHICS_DEFAULTS=');
const b=src.indexOf('\nclass LUTManager',a);
assert(a>=0&&b>a);
function run(store){
  const data=new Map(Object.entries(store||{}));
  const localStorage={getItem:k=>data.has(k)?data.get(k):null,setItem:(k,v)=>data.set(k,String(v)),removeItem:k=>data.delete(k)};
  const ctx={localStorage,JSON,Math,console,globalThis:null};ctx.globalThis=ctx;vm.createContext(ctx);
  vm.runInContext(src.slice(a,b)+'\n;globalThis.result=loadGraphicsSettings();',ctx);
  return{result:ctx.result,data};
}
let r=run({relayMothGraphics39952:JSON.stringify({waterQuality:2,waterStrength:.96,shoreFoamStrength:1.08,waterNormalStrength:1.28,grassQuality:2,grassDensity:1.08,brightness:.12})});
assert.strictEqual(r.result.waterQuality,3);assert.strictEqual(r.result.waterStrength,1.05);assert.strictEqual(r.result.grassQuality,3);assert.strictEqual(r.result.grassDensity,1.62);assert.strictEqual(r.result.brightness,.12);assert(r.data.has('relayMothGraphics39954'));
r=run({relayMothGraphics39952:JSON.stringify({waterQuality:3,waterStrength:1.5,grassQuality:3,grassDensity:2.1})});
assert.strictEqual(r.result.waterStrength,1.5);assert.strictEqual(r.result.grassDensity,2.1);
r=run({relayMothGraphics39954:JSON.stringify({waterQuality:1,waterStrength:.4,grassDensity:.3})});
assert.strictEqual(r.result.waterQuality,1);assert.strictEqual(r.result.waterStrength,.4);assert.strictEqual(r.result.grassDensity,.3);
console.log('GRAPHICS MIGRATION REGRESSION 3.995.3 PASS');
console.log('  old default SurfaceFX values promoted; deliberate user values preserved');
