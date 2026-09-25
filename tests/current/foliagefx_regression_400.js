'use strict';
const ROOT=require('path').resolve(__dirname,'../..');
const fs=require('fs'),assert=require('assert');
const F=require(ROOT+'/foliagefx.js');
const atlas=JSON.parse(fs.readFileSync(ROOT+'/hd_remake_atlas.json','utf8'));
const registry=new F.FoliageRegistry(atlas);

assert.strictEqual(F.VERSION,'4.14');
assert.deepStrictEqual(F.CATEGORY_NAMES,['GROUND_MOSS','SHORT_GRASS','FERN','BROAD_LEAF','FLOWER_CLUSTER','BUSH']);

// 1/2 Root lock and progressive deformation.
for(const cat of F.CATEGORY_NAMES){const p=F.categoryProfile(cat);assert.strictEqual(F.RootedDeformation.weight(0,p,3),0,cat);assert.strictEqual(F.RootedDeformation.weight(p.root_cutoff,p,3),0,cat);assert(F.RootedDeformation.weight(.95,p,3)>F.RootedDeformation.weight(.60,p,3),cat)}

const descriptor={signature:'regression',seed:400,clumps:[{x:100,y:120,radius:28,seed:123,density:1.4},{x:180,y:150,radius:30,seed:456,density:1.3}]};
// 3 deterministic instance generation.
const a=F.generateFoliageInstances(descriptor,registry,3),b=F.generateFoliageInstances(descriptor,registry,3);
assert(a.length>0);assert.deepStrictEqual(Array.from(F.packInstances(a)),Array.from(F.packInstances(b)));
// 4 safe metadata defaults.
const fallback=registry.get('robot_warm');assert(fallback);assert(F.CATEGORY_NAMES.includes(fallback.category));assert(fallback.root_cutoff>0&&fallback.root_cutoff<1);
// 5 hard cap.
const many={signature:'many',seed:1,clumps:Array.from({length:100},(_,i)=>({x:(i%20)*30,y:60+Math.floor(i/20)*35,radius:40,seed:i+1,density:2.4}))};
assert(F.generateFoliageInstances(many,registry,3).length<=F.FOLIAGE_HARD_CAP);
// 6 bounded interaction list; quality tier also constrains it.
const field=new F.InteractionField(8),actors=Array.from({length:20},(_,i)=>({id:'a'+i,type:i?'follower':'player',priority:100-i,x:i*2,y:100,vx:20,vy:0}));
assert(field.update(.016,actors,3).length<=8);assert(field.update(.016,actors,1).length<=4);
// 7 physical material contract.
assert.strictEqual(F.MATERIAL_CONTRACT.additive,false);assert.strictEqual(F.MATERIAL_CONTRACT.emissive,0);assert.strictEqual(F.MATERIAL_CONTRACT.blend,'alpha');assert.strictEqual(F.MATERIAL_CONTRACT.opaqueSourceAlpha,true);
// 8 coherent neighboring wind sampling.
const wind=new F.WindField(),near=wind.neighborDelta([100,100],[108,102],2.5),far=wind.neighborDelta([100,100],[260,210],2.5);assert(near<.40,`near wind delta ${near}`);assert(near<far+0.05);
// 9 nearby interaction only.
const src={x:100,y:100,vx:40,vy:0,radius:35};assert(F.interactionInfluence({x:110,y:100},src)>.5);assert.strictEqual(F.interactionInfluence({x:300,y:300},src),0);
// 10 live bounded recovery events age/decay toward rest (no per-plant CPU state).
assert(F.interactionDecay(0,7,.89)>F.interactionDecay(.5,7,.89));assert(F.interactionDecay(.5,7,.89)>F.interactionDecay(1.5,7,.89));
const recoveryField=new F.InteractionField(8);recoveryField.update(.016,[{id:'p',type:'player',priority:100,x:80,y:100,vx:0,vy:0,radius:35}],3);let recoverySources=recoveryField.update(.016,[{id:'p',type:'player',priority:100,x:90,y:100,vx:100,vy:0,radius:35}],3);const recoveryEvent=[recoverySources[0].recoveryA,recoverySources[0].recoveryB].find(e=>e.strength>0);assert(recoveryEvent,'moving actor must leave a bounded recovery event');const eventAge=recoveryEvent.age;recoverySources=recoveryField.update(.10,[{id:'p',type:'player',priority:100,x:90,y:100,vx:0,vy:0,radius:35}],3);const aged=[recoverySources[0].recoveryA,recoverySources[0].recoveryB].find(e=>e.strength>0);assert(aged.age>eventAge,'recovery event age must advance while actor rests');const shaderSource=new F.FoliageMaterial(null,()=>null).vertexSource();assert(shaderSource.includes('uRecoveryA[8]')&&shaderSource.includes('exp(-ev.z*rate)'),'production shader must consume decaying recovery events');const fragmentSource=new F.FoliageMaterial(null,()=>null).fragmentSource();assert(fragmentSource.includes('if(uQuality>=2)')&&fragmentSource.includes('if(uQuality>=3)'),'quality 2 must enable bend normals and quality 3 must add bump+ bend detail');assert(shaderSource.includes('uQuality>=2?sin')&&shaderSource.includes('uQuality>=3?(.62')&&shaderSource.includes('uQuality==1?primary'),'quality ladder must use primary-only wind at Q1, secondary at Q2, gust envelope at Q3');
const foliageSource=fs.readFileSync(ROOT+'/foliagefx.js','utf8');assert(foliageSource.includes("ui('uQuality',animate?this.quality:0)")&&foliageSource.includes("uWindStrength',animate?"),'animation OFF must preserve static rendering while zeroing deformation');

// API-level WebGL2 smoke: exercise constructor, static upload, all normal passes,
// animation-off static rendering, debug drawing, and runtime/descriptor fault isolation.
function mockGL(){
  const g={ARRAY_BUFFER:1,STATIC_DRAW:2,DYNAMIC_DRAW:3,FLOAT:4,VERTEX_SHADER:5,FRAGMENT_SHADER:6,COMPILE_STATUS:7,LINK_STATUS:8,TEXTURE0:9,TEXTURE1:10,TEXTURE_2D:11,BLEND:12,FUNC_ADD:13,SRC_ALPHA:14,ONE_MINUS_SRC_ALPHA:15,TRIANGLES:16,LINES:17,drawInstanced:0,drawPlain:0};
  for(const n of ['blendFuncSeparate','bufferSubData','deleteShader','deleteProgram','bindBuffer','bufferData','shaderSource','compileShader','attachShader','linkProgram','bindVertexArray','enableVertexAttribArray','vertexAttribPointer','vertexAttribDivisor','useProgram','uniform1i','uniform1f','uniform2f','uniform3f','uniform2fv','uniform4fv','uniform1fv','uniform4f','activeTexture','bindTexture','enable','blendEquation','blendFunc'])g[n]=()=>{};
  g.createBuffer=g.createShader=g.createProgram=g.createVertexArray=()=>({});g.getShaderParameter=g.getProgramParameter=()=>true;g.getShaderInfoLog=g.getProgramInfoLog=()=>'';g.getUniformLocation=(_p,n)=>n;g.drawArraysInstanced=()=>{g.drawInstanced++};g.drawArrays=()=>{g.drawPlain++};return g;
}
const gl=mockGL(),fx=new F.FoliageFX(gl,{manifest:atlas});assert.strictEqual(fx.ready,true);assert.strictEqual(fx.setDescriptor(descriptor,{foliageQuality:3}),true);assert(fx.instanceBuffer.count>0);const liveActors=actors.slice(0,8);fx.update(.016,liveActors,{foliageFX:true,foliageQuality:3},1);fx.beginFrame();assert(fx.render('background',{foliageFX:true,foliageQuality:3,foliageWindStrength:.8,foliageWindSpeed:.8,foliageInteractionStrength:1,foliageBendAmount:1,foliageShadingStrength:.9,lighting:true,bump:true},{baseColor:[.4,.7,.5]},[100,100],{},{}));assert(fx.render('foreground',{foliageFX:true,foliageQuality:3,foliageWindStrength:.8,foliageWindSpeed:.8,foliageInteractionStrength:1,foliageBendAmount:1,foliageShadingStrength:.9,lighting:true,bump:true},{baseColor:[.4,.7,.5]},[100,100],{},{}));assert(fx.renderContactMask({foliageFX:true,foliageQuality:3,ao:true,aoStrength:.16,foliageShadingStrength:.9},{}));assert.strictEqual(fx.drawCalls,3,'normal FoliageFX draw budget must be two foliage passes + contact AO');fx.renderDebug({foliageFX:true,foliageShowRoots:true,foliageShowInteractionRadii:true});assert.strictEqual(fx.drawCalls,4,'debug overlay must be one extra bounded draw');
fx.update(.016,liveActors,{foliageFX:false,foliageQuality:3},2);assert.strictEqual(fx.interactionField.bounded().length,0);fx.beginFrame();assert(fx.render('background',{foliageFX:false,foliageQuality:3,foliageShadingStrength:.9,lighting:true},{baseColor:[.4,.7,.5]},[100,100],{},{}),'animation OFF must still render static physical foliage');
const glFail=mockGL(),runtimeFail=new F.FoliageFX(glFail,{manifest:atlas});runtimeFail.setDescriptor(descriptor,{foliageQuality:3});glFail.drawArraysInstanced=()=>{throw new Error('forced draw fault')};const oldErr2=console.error;console.error=()=>{};assert.strictEqual(runtimeFail.render('background',{foliageFX:true,foliageQuality:3},{baseColor:[1,1,1]},[0,0],{},{}),false);console.error=oldErr2;assert.strictEqual(runtimeFail.ready,false);assert(runtimeFail.error.includes('forced draw fault'));
const descriptorFail=new F.FoliageFX(mockGL(),{manifest:atlas});descriptorFail.instanceBuffer.upload=()=>{throw new Error('forced upload fault')};console.error=()=>{};assert.doesNotThrow(()=>descriptorFail.setDescriptor({...descriptor,signature:'upload-fault'},{foliageQuality:3}));console.error=oldErr2;assert.strictEqual(descriptorFail.ready,false);assert(descriptorFail.error.includes('forced upload fault'));

// 16 constructor/shader-path failure is fault isolated.
let failed=null;const oldError=console.error;console.error=()=>{};assert.doesNotThrow(()=>{failed=new F.FoliageFX({createBuffer(){return{};}},{manifest:atlas})});console.error=oldError;assert.strictEqual(failed.ready,false);assert(failed.error);

assert(registry.pool().some(n=>n.startsWith('foliage_v401_')),'v4.11 pool must include new foliage families');
const flowerOnly=['flower_meadow','flower_pink','flower_blue','flower_white','flower_bush','flower_hd_bell','flower_hd_star','flower_hd_circuit'];
for(const n of flowerOnly)assert(!registry.pool().includes(n),`pure flower sprite should be excluded from physical pool: ${n}`);
const grassProfile=F.categoryProfile('SHORT_GRASS'),flowerProfile=F.categoryProfile('FLOWER_CLUSTER');assert(grassProfile.height_scale>=1.3&&grassProfile.width_scale>1,'moving grass must be enlarged');assert.strictEqual(flowerProfile.height_scale,1,'flowers must not inherit grass enlargement');for(let i=1;i<a.length;i++)assert(a[i-1].rootY<=a[i].rootY,'foliage instances must be deterministic back-to-front root-Y ordered');
console.log('FOLIAGEFX REGRESSION 4.14 PASS');
console.log(`  deterministic instances=${a.length} hardCap=${F.FOLIAGE_HARD_CAP} maxSources=${F.MAX_INTERACTION_SOURCES}`);
