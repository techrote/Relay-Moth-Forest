'use strict';
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const src=fs.readFileSync(__dirname+'/game.js','utf8');
const helperA=src.indexOf('function roomCellKey'),helperB=src.indexOf('\nclass StoryState',helperA);
const miniA=src.indexOf('class MiniRobotGuides'),miniB=src.indexOf('\nclass FireflyField',miniA);
const wildA=src.indexOf('class WoodlandCreatures'),wildB=src.indexOf('\nclass GamepadInput',wildA);
assert(helperA>=0&&miniA>=0&&wildA>=0);
const pre=`const W=640,H=360,TILE=16,GRID_W=40,GRID_H=19,PLAY_H=304,TAU=Math.PI*2;\n`+
`const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));const lerp=(a,b,t)=>a+(b-a)*t;const dist=(a,b,c,d)=>Math.hypot(a-c,b-d);\n`+
`function hash32(a,b=0,c=0){let x=(a*374761393+b*668265263+c*2246822519)>>>0;x=(x^(x>>>13))*1274126177>>>0;return (x^(x>>>16))>>>0}const h01=(a,b=0,c=0)=>hash32(a,b,c)/4294967295;\n`;
const code=pre+src.slice(helperA,helperB)+src.slice(miniA,miniB)+src.slice(wildA,wildB)+'\n;globalThis.M=MiniRobotGuides;globalThis.C=WoodlandCreatures;globalThis.safe=safeActorPoint;';
const ctx={Math,console,globalThis:null};ctx.globalThis=ctx;vm.createContext(ctx);vm.runInContext(code,ctx);
const room={
 water:new Set(['10,10']),walls:new Set(['11,10']),border:new Set(),bridgeOpen:()=>false,
 tile:(x,y)=>[Math.max(0,Math.min(39,Math.floor(x/16))),Math.max(0,Math.min(18,Math.floor(y/16)))],
 center:t=>[t[0]*16+8,t[1]*16+8],walkable(t){const k=t.join(',');return t[0]>0&&t[0]<39&&t[1]>0&&t[1]<18&&!this.water.has(k)&&!this.walls.has(k)},
 nearestWalkable(t){if(this.walkable(t))return t;for(let r=1;r<8;r++)for(let y=-r;y<=r;y++)for(let x=-r;x<=r;x++){const q=[t[0]+x,t[1]+y];if(this.walkable(q))return q}return[2,2]}
};
// Safe targets never resolve to water/blocked authority.
const pt=ctx.safe(room,10*16+8,10*16+8,1);assert(!room.water.has(room.tile(...pt).join(',')));assert(!room.walls.has(room.tile(...pt).join(',')));

// Six completed-room minis can form two groups of at most three, then perform a full-group encounter.
const M=ctx.M,m=new M();m.units=[];for(let i=0;i<6;i++)m.units.push({id:'m'+i,x:100+(i%3)*3,y:100+Math.floor(i/3)*8,groupId:null,encounterId:null,groupCooldown:0,wanderSeed:i+1,phase:i,think:0,targetX:100,targetY:100,vx:0,vy:0});
m._mergeEncounteringGroups();const sizes=[...m.groups().values()].map(g=>g.length);assert(sizes.length>=2);assert(Math.max(...sizes)<=3);assert(sizes.reduce((a,b)=>a+b,0)===6);
const game={room,state:{roomComplete:()=>true},currentObjective:null,x:320,y:152,waterSplash(){}};room.spec={};m.wasCompleted=false;m.units.forEach(u=>{u.groupId=null;u.encounterId=null;u.think=0;u.splashClock=1;u.groupCooldown=0;u.desiredSpeed=24});m.update(1/60,1000,game);const seeded=[...m.groups().values()].map(g=>g.length);assert(seeded.length>=2);assert(Math.max(...seeded)<=3);assert(seeded.filter(n=>n===3).length>=2,'completion edge did not seed full groups');m.encounters=[];m.units.forEach(u=>{u.encounterId=null;u.groupCooldown=0});m._startFullGroupEncounter(1,game);assert.strictEqual(m.encounters.length,1);assert.strictEqual(m.encounters[0].phase,'circle');assert.strictEqual(m.units.filter(u=>u.encounterId).length,6);
m.encounters[0].until=0;m._updateEncounters(5,game);assert.strictEqual(m.encounters[0].phase,'scatter');m.encounters[0].until=0;m._updateEncounters(10,game);assert.strictEqual(m.encounters.length,0);assert(m.units.every(u=>u.encounterId==null));

// Cats periodically relinquish a squirrel and enter a disinterest interval.
const C=ctx.C,c=new C();const cat={id:'cat',kind:'cat',x:100,y:100,homeX:100,homeY:100,phase:0,wanderSeed:11,catTargetId:null,catInterestUntil:0,catRestUntil:0};const sq={id:'sq',kind:'squirrel',x:120,y:100,homeX:120,homeY:100,phase:1,wanderSeed:12};c.units=[cat,sq];c.chooseWaypoint(cat,0,1,game);assert.strictEqual(cat.catTargetId,'sq');cat.catInterestUntil=.5;c.chooseWaypoint(cat,0,2,game);assert.strictEqual(cat.catTargetId,null);assert(cat.catRestUntil>2);

// Edge squirrels trigger a centre-directed escape jump instead of remaining trap-able.
const corner={id:'corner',kind:'squirrel',x:20,y:20,homeX:20,homeY:20,vx:0,vy:0,phase:0,wanderSeed:17,targetX:20,targetY:20,think:1,cornerCooldown:0,jumpTimer:0,splashClock:1};c.units=[corner];c.update(1/60,1000,game);assert(corner.cornerCooldown>0);assert(corner.jumpTimer>0);assert(corner.vx>0&&corner.vy>0);
console.log('AMBIENT AI REGRESSION 3.995.3 PASS');
console.log('  completion-edge group seeding + safe avoidance + circle/scatter encounter validated');
console.log('  cat interest cooldown + squirrel edge escape validated');
