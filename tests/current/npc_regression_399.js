'use strict';
const ROOT=require('path').resolve(__dirname,'../..');
const fs=require('fs'), vm=require('vm');
const src=fs.readFileSync(ROOT+'/game.js','utf8');
const TAU=Math.PI*2, clamp=(v,a,b)=>Math.max(a,Math.min(b,v)), lerp=(a,b,t)=>a+(b-a)*t, dist=(a,b,c,d)=>Math.hypot(a-c,b-d);
function hash32(a,b=0,c=0){let x=(a*374761393+b*668265263+c*2246822519)>>>0;x=(x^(x>>>13))*1274126177>>>0;return (x^(x>>>16))>>>0}
const a=src.indexOf('class Followers'), b=src.indexOf('class MiniRobotGuides');
if(a<0||b<a) throw new Error('Followers class not found');
const code=src.slice(a,b)+'\n;globalThis.__Followers=Followers;';
const ctx={Math,performance,TAU,clamp,lerp,dist,hash32,console,globalThis:null};ctx.globalThis=ctx;vm.createContext(ctx);vm.runInContext(code,ctx);
const Followers=ctx.__Followers;
const room={
 nearestWalkable:t=>t, tile:(x,y)=>[Math.round(x/16),Math.round(y/16)], center:t=>[t[0]*16+8,t[1]*16+8],
 findPath:()=>[], walkablePixel:(x,y)=>x>0&&x<640&&y>0&&y<304, walkable:()=>true,
 move:(x,y,dx,dy)=>[x+dx,y+dy]
};
const particles={teleport(){}}, fx={add(){}};
const f=new Followers({r1:{variant:'cream',name:'R1'}});f.units=[f.makeUnit({id:'r1',variant:'cream'},80,80)];
for(let i=0;i<240;i++) f.update(1/60,i*1000/60,500,220,room,particles,fx);
const u=f.units[0];
if(!Number.isFinite(u.x)||!Number.isFinite(u.y))throw new Error('follower position became non-finite');
if(!Number.isInteger(u.failCount)||u.failCount<0||u.failCount>3)throw new Error('invalid failCount '+u.failCount);
if(!Array.isArray(u.path))throw new Error('path not array');
console.log('NPC REGRESSION 3.99 PASS');
console.log('no-route follower survived 240 frames; failCount='+u.failCount+' position='+u.x.toFixed(1)+','+u.y.toFixed(1));
