'use strict';
const ROOT=require('path').resolve(__dirname,'../..');
const fs=require('fs'),vm=require('vm');
const src=fs.readFileSync(ROOT+'/game.js','utf8');
const TAU=Math.PI*2,clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),lerp=(a,b,t)=>a+(b-a)*t,dist=(a,b,c,d)=>Math.hypot(a-c,b-d),TILE=32,W=640,PLAY_H=320;
function hash32(a,b=0,c=0){let x=(a*374761393+b*668265263+c*2246822519)>>>0;x=(x^(x>>>13))*1274126177>>>0;return (x^(x>>>16))>>>0}
function nearestWaterInfo(){return null}
const a=src.indexOf('class Followers'),b=src.indexOf('class MiniRobotGuides');if(a<0||b<a)throw new Error('Followers class not found');
const ctx={Math,performance,TAU,clamp,lerp,dist,hash32,TILE,W,PLAY_H,nearestWaterInfo,console,globalThis:null};ctx.globalThis=ctx;vm.createContext(ctx);vm.runInContext(src.slice(a,b)+'\n;globalThis.__Followers=Followers;',ctx);const Followers=ctx.__Followers;
const room={nearestWalkable:t=>t,tile:(x,y)=>[Math.round(x/16),Math.round(y/16)],center:t=>[t[0]*16+8,t[1]*16+8],findPath:(a,b)=>[a,b],walkablePixel:(x,y)=>x>0&&x<640&&y>0&&y<320,walkable:()=>true,move:(x,y,dx,dy)=>[x+dx,y+dy]};
const f=new Followers({}),particles={teleport(){}},fx={add(){}};f.units=[f.makeUnit({id:'a'},250,220),f.makeUnit({id:'b'},280,225),f.makeUnit({id:'c'},305,215)];
const before=f.units.map(u=>[u.followTargetX,u.followTargetY]);for(let i=0;i<90;i++)f.update(1/60,i*1000/60,320+(i<45?0:3),160,room,particles,fx,{vx:0,vy:0,waterSplash(){}});
if(!f.units.every(u=>Number.isFinite(u.x)&&Number.isFinite(u.y)))throw new Error('non-finite follower');
const code=src.slice(a,b);if(!code.includes('comfortable=distance>=46&&distance<=104'))throw new Error('broad casual follow zone missing');
if(!code.includes('if(groupD>80)'))throw new Error('mild only-when-separated cohesion missing');
if(!code.includes('if(rd<29)'))throw new Error('loose separation radius missing');
if(code.includes('formationTargets=this.units.map'))throw new Error('followers must not chase exact formation slots every frame');
console.log('FOLLOWERS CASUAL GROUP REGRESSION 4.14 PASS');
// A stuck member must not hold back the rest of the group.
const f2=new Followers({});
f2.units=[f2.makeUnit({id:'stuck'},92,88),f2.makeUnit({id:'free1'},108,94),f2.makeUnit({id:'free2'},116,82)];
const initialFree=f2.units.slice(1).map(u=>dist(u.x,u.y,420,190));
for(let i=0;i<240;i++){
  f2.update(1/60,i*1000/60,420,190,room,particles,fx,{vx:38,vy:0,waterSplash(){}});
  f2.units[0].x=92;f2.units[0].y=88;f2.units[0].vx=f2.units[0].vy=0;
}
for(let i=1;i<3;i++)if(dist(f2.units[i].x,f2.units[i].y,420,190)>initialFree[i-1]-55)throw new Error('free follower was held back by stuck group member');
console.log('  independent stuck recovery validated');
