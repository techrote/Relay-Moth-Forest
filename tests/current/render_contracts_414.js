'use strict';
// Behavioral integration checks: actual runtime methods, not renamed source tokens.
const assert=require('assert'),fs=require('fs'),path=require('path'),vm=require('vm');
const ROOT=path.resolve(__dirname,'../..');const F=require(ROOT+'/foliagefx.js'),M=require(ROOT+'/sprite_material.js');
const gameSource=fs.readFileSync(ROOT+'/game.js','utf8');
const ctx={console,Math,Float32Array,Uint8Array,JSON,Set,Map,RelaySpriteMaterial:M,W:640,H:360,PLAY_H:304,TILE:16,TAU:Math.PI*2,clamp:(x,a,b)=>Math.max(a,Math.min(b,x)),hexRgb:()=>[1,1,1]};
vm.createContext(ctx);let a=gameSource.indexOf('class GLRenderer'),b=gameSource.indexOf('\nclass ParticleField',a);vm.runInContext(gameSource.slice(a,b)+'\nglobalThis.R=GLRenderer',ctx);
const r=Object.create(ctx.R.prototype);r.hdNormal=[];r.hdTintNormal=[];r.hdProg='normal';r.hdTintProg='tinted';r.hdTex={};const uv={u0:0,v0:0,u1:1,v1:1};
r._pushQuad(r.hdNormal,uv,50,160,10,20,[1,1,1],1,0);r._pushQuad(r.hdTintNormal,uv,50,80,10,20,[1,1,1],1,0);r._pushQuad(r.hdTintNormal,uv,50,240,10,20,[1,1,1],1,0);
const draws=[];r.spriteFlush=(data,pr)=>draws.push({pr,bottom:Math.max(...data.filter((_,i)=>i%8===1))});r.flushWorldHD();assert.deepStrictEqual(draws.map(d=>d.pr),['tinted','normal','tinted']);assert.deepStrictEqual(draws.map(d=>d.bottom),[90,170,250]);
// Fallback rooted grass is a connected mesh. Adjacent strips share both positions and UVs.
r.groundHDGrassNormal=[];r.grassFrontHDNormal=[];r.hdArt={regions:{p:[0,0,32,64]},region:()=>[0,0,32,64],uv:()=>uv};
r.addHDRootedGrass('p',100,150,32,64,[1,1,1],1,12,false,false);const f=r.groundHDGrassNormal;assert.equal(f.length,4*6*8);
for(let i=0;i<3;i++){const off=i*48,next=(i+1)*48;assert.deepStrictEqual(f.slice(off+16,off+20),f.slice(next,next+4));assert.deepStrictEqual(f.slice(off+40,off+44),f.slice(next+8,next+12));}
// Global lighting and bump toggles really disable local material shading.
for(const settings of [{lighting:false},{bump:false},{lighting:false,bump:true}])assert.deepStrictEqual(M.materialState(settings),{enabled:false,bump:0,specular:0});
assert(M.materialState({}).enabled);
// No double-alpha/colour change for the same whole plant when nobody stands behind it.
for(const a of [0,.001,.1,.4,.5,.8,1])for(let k=0;k<=100;k++){const blend=k/100,ab=F.opacityForPass(a,blend,0),af=F.opacityForPass(a,blend,1);assert(Math.abs(ab*(1-af)+af-a)<1e-7);}
// Bounded grid must return every overlapping sprite, including oversized multi-tile shapes.
const instances=[];for(let i=0;i<80;i++)instances.push({index:i,x:(i%10)*61,rootY:60+Math.floor(i/10)*45,w:14+i%7*12,h:30+i%8*10,depthBias:0,flags:0});instances.push({index:80,x:320,rootY:300,w:620,h:290,depthBias:0,flags:0});
const grid=new F.DepthClassifier();grid.setInstances(instances);
for(let y=15;y<304;y+=17)for(let x=10;x<640;x+=19){const source={x,y,halfW:10,halfH:30};const candidates=new Set(grid.candidates(source).map(p=>p.index));for(const p of instances)if(F.aabbOverlap(p,source))assert(candidates.has(p.index),`missed multi-tile sprite ${p.index}`);}
// Depth changes must not reallocate or regenerate the static instance layout.
let allocations=0,subuploads=0;const gl={ARRAY_BUFFER:1,STATIC_DRAW:2,createBuffer:()=>({}),bindBuffer(){},bufferData(){allocations++},bufferSubData(){subuploads++}};
const registry=new F.FoliageRegistry(JSON.parse(fs.readFileSync(ROOT+'/hd_remake_atlas.json'))),descriptor={signature:'same-count',clumps:[{x:120,y:150,radius:24,seed:1,density:1}],playHeight:304};
const plants=F.generateFoliageInstances(descriptor,registry,3);const buffer=new F.FoliageInstanceBuffer(gl);buffer.upload(plants);const before=Array.from(buffer.packed);plants[0].flags=.5;buffer.syncDynamic(plants);assert.equal(allocations,1);assert.equal(subuploads,1);for(let i=0;i<before.length;i++)if(i!==23)assert.equal(before[i],buffer.packed[i]);
// Pure-geometry descriptors changed in-place must trigger reupload, even when counts/signature remain the same.
const owner=Object.create(F.FoliageFX.prototype);Object.assign(owner,{ready:true,gl:{bindVertexArray(){}},registry,instanceBuffer:new F.FoliageInstanceBuffer(null),depthClassifier:new F.DepthClassifier(),interactionField:new F.InteractionField(),categoryCounts:{}});
assert(owner.setDescriptor(descriptor,{foliageQuality:3}));const oldX=owner.instanceBuffer.instances[0].x;descriptor.clumps[0].x+=17;assert(owner.setDescriptor(descriptor,{foliageQuality:3}));assert(Math.abs(owner.instanceBuffer.instances[0].x-oldX-17)<1e-5);assert(!owner.setDescriptor(descriptor,{foliageQuality:3}));
// Editor grass roots outside the play area never paint into the footer.
const edge=F.generateFoliageInstances({clumps:[{x:630,y:300,radius:40,seed:99,density:2}],logicalWidth:640,playHeight:304},registry,3);assert(edge.every(p=>p.x>=0&&p.x<=640&&p.rootY>=0&&p.rootY<=304));
// An upload failure disables only optional FoliageFX and restores a safe VAO binding.
const originalError=console.error;console.error=()=>{};try{owner.instanceBuffer.upload=()=>{throw Error('injected-upload-fault')};descriptor.clumps[0].x++;assert.equal(owner.setDescriptor(descriptor,{foliageQuality:3}),false);assert.equal(owner.ready,false);}finally{console.error=originalError;}
console.log('RENDER BEHAVIOR CONTRACTS 4.14 PASS');
console.log('  mixed-material order, shared fallback vertices, toggle truth table, opacity conservation, multi-tile spatial grid, subuploads, same-count edits, footer root bounds, fault isolation');
// An optional instanced GrassField must never poison default-VAO divisors on failure.
const S=require(ROOT+'/surfacefx.js');let currentVAO=null,nextID=0,drawFault=false;
const attribState=new Map([[null,new Map()]]);
const stubGL=new Proxy({
  createVertexArray(){const obj={vao:++nextID};attribState.set(obj,new Map());return obj},
  bindVertexArray(v){currentVAO=v},createBuffer:()=>({}),createShader:()=>({}),createProgram:()=>({}),
  getShaderParameter:()=>true,getProgramParameter:()=>true,getShaderInfoLog:()=>'',getProgramInfoLog:()=>'',
  getUniformLocation:()=>null,getAttribLocation:(_p,n)=>({aBlade:0,aInstance:1,aMeta:2}[n]??0),
  vertexAttribDivisor(loc,v){attribState.get(currentVAO).set(loc,v)},
  drawArraysInstanced(){if(drawFault)throw Error('injected-grass-draw-fault')}
},{get(t,n){if(n in t)return t[n];if(/^[A-Z_0-9]+$/.test(n))return 1;return ()=>{}}});
const grass=new S.GrassField(stubGL);assert(grass.ready);grass.setDescriptor({signature:'vao',clumps:[{x:100,y:120,radius:20,density:1,seed:9}]},{grassQuality:3,grassDensity:1});
assert(grass.render({grassFX:true,surfaceFX:true,grassQuality:3,grassDensity:1},{},1,[]));assert.equal(currentVAO,null);assert.equal(attribState.get(null).size,0);
drawFault=true;assert.throws(()=>grass.render({grassFX:true,surfaceFX:true,grassQuality:3,grassDensity:1},{},1,[]),/injected-grass-draw/);assert.equal(currentVAO,null);assert.equal(attribState.get(null).size,0);
console.log('  optional SurfaceFX instancing restores VAO on success and injected draw failure');
