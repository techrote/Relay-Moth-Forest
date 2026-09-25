'use strict';
// Evaluate production shader construction; do not extract unexpanded template literals.
const fs=require('fs'),path=require('path'),vm=require('vm');
const root=path.resolve(process.argv[2]||path.join(__dirname,'../..'));
let serial=0;const captured=[],gl=new Proxy({
 createShader(type){return {id:++serial,type};},shaderSource(shader,src){shader.source=src;},compileShader(){},getShaderParameter(){return true;},getShaderInfoLog(){return '';},
 createProgram(){return {id:++serial,shaders:[]};},attachShader(p,s){p.shaders.push(s);},linkProgram(p){const [v,f]=p.shaders;captured.push({vertex:v.source,fragment:f.source});},getProgramParameter(){return true;},getProgramInfoLog(){return '';},getUniformLocation(){return null;},getAttribLocation(){return 0;},getParameter(){return 4096;},checkFramebufferStatus(){return 1;},FRAMEBUFFER_COMPLETE:1
},{get(t,n){if(n in t)return t[n];if(/^[A-Z][A-Z_0-9]*$/.test(n))return 1;return ()=>({id:++serial});}});
const source=fs.readFileSync(path.join(root,'game.js'),'utf8'),start=source.indexOf('class GLRenderer'),end=source.indexOf('\nclass ParticleField',start);
const ctx={console,Math,Float32Array,Uint8Array,W:640,H:360,PLAY_H:304,TAU:Math.PI*2,clamp:(x,a,b)=>Math.max(a,Math.min(b,x)),RelaySpriteMaterial:fs.existsSync(path.join(root,'sprite_material.js'))?require(path.join(root,'sprite_material.js')):null};
vm.createContext(ctx);vm.runInContext(source.slice(start,end)+'\nglobalThis.Renderer=GLRenderer;',ctx);
const renderer=Object.create(ctx.Renderer.prototype);Object.assign(renderer,{gl,atlas:{canvas:{}},hdArt:{img:{width:4096,height:4096}},bumpImg:{},specImg:{},normalImg:{}});
const programs={};renderer.resizeToDisplaySize=()=>true;renderer.program=(v,f)=>({vertex:v,fragment:f});renderer.init();
for(const [name,v] of Object.entries(renderer))if(v&&typeof v.vertex==='string'&&typeof v.fragment==='string')programs[name]=v;
const F=require(path.join(root,'foliagefx.js')),m=new F.FoliageMaterial(null);programs.foliage={vertex:m.vertexSource(),fragment:m.fragmentSource()};
// Constructor emits contact and debug programs through the normal production compilation path.
const fx=new F.FoliageFX(gl,{manifest:{}});if(!fx.ready)throw new Error(fx.error);
if(captured.length>=3){programs.foliageContact=captured.at(-2);programs.foliageDebug=captured.at(-1);}
const S=require(path.join(root,'surfacefx.js'));const offset=captured.length;const surface=new S.SurfaceFX(gl);if(!surface.ready)throw Error('SurfaceFX shader capture failed');if(captured.length>=offset+2){programs.surfaceWater=captured[offset];programs.surfaceGrass=captured[offset+1];}
console.log(JSON.stringify(programs));
