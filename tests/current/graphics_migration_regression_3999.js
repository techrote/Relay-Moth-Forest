'use strict';
const ROOT=require('path').resolve(__dirname,'../..');
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const src=fs.readFileSync(ROOT+'/game.js','utf8');
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
let r=run({relayMothGraphics39981:JSON.stringify({grassDensity:2.65,grassWindStrength:1.02,grassWindSpeed:.92,grassPushStrength:1.10,grassHeroStrength:1.08,waterStrength:1.05,floaterFX:true})});
assert.strictEqual(r.result.grassDensity,2.15);assert.strictEqual(r.result.grassWindStrength,.82);assert.strictEqual(r.result.grassWindSpeed,.82);assert.strictEqual(r.result.grassPushStrength,.95);assert.strictEqual(r.result.grassHeroStrength,1.0);assert.strictEqual(r.result.floaterFX,false);assert.strictEqual(r.result.grassFineFX,false);assert(r.data.has('relayMothGraphics3999'));
r=run({relayMothGraphics39981:JSON.stringify({grassDensity:.5,grassWindStrength:.4,grassHeroStrength:.25,waterQuality:4,floaterFX:true,floaterStrength:2.1})});
assert.strictEqual(r.result.grassDensity,.5);assert.strictEqual(r.result.grassWindStrength,.4);assert.strictEqual(r.result.grassHeroStrength,.25);assert.strictEqual(r.result.waterQuality,4);assert.strictEqual(r.result.floaterFX,false);assert.strictEqual(r.result.floaterStrength,2.1);
r=run({relayMothGraphics3999:JSON.stringify({grassHeroStrength:1.7,floaterFX:true,floaterStrength:.3})});
assert.strictEqual(r.result.grassHeroStrength,1.7);assert.strictEqual(r.result.floaterFX,true);assert.strictEqual(r.result.floaterStrength,.3);
console.log('GRAPHICS MIGRATION REGRESSION 3.999 PASS');
console.log('  v3.998.1 settings migrate to decor-integrated grass; legacy Floater-FX is hidden by default');
