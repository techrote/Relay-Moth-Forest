'use strict';

const assert=require('assert');
const fs=require('fs');
const path=require('path');
const ROOT=path.resolve(__dirname,'../..');
const Validation=require('../../editor_validation.js');

const maps0=JSON.parse(fs.readFileSync(path.join(ROOT,'relay_moth_maps.json'),'utf8'));
const story0=JSON.parse(fs.readFileSync(path.join(ROOT,'relay_moth_story.json'),'utf8'));
const atlas=JSON.parse(fs.readFileSync(path.join(ROOT,'hd_remake_atlas.json'),'utf8'));
const meta={roles:atlas.roles||{},regions:atlas.regions||{}};
const clone=v=>JSON.parse(JSON.stringify(v));
const validate=(maps,story=story0,baseline=maps0)=>Validation.validate(maps,story,meta,{baselineMaps:baseline});
const has=(list,code)=>list.some(d=>d.code===code);
const expectCode=(code,mutate,storyMutate=null)=>{
  const maps=clone(maps0),story=clone(story0);
  mutate?.(maps,story);
  storyMutate?.(story,maps);
  const list=validate(maps,story);
  assert(has(list,code),`missing diagnostic ${code}; got ${[...new Set(list.map(d=>d.code))].join(', ')}`);
  return list;
};
function rows(field,predicate=()=>true){
  const out=[];
  for(const [roomKey,room] of Object.entries(maps0.rooms||{}))for(const obj of room[field]||[])if(predicate(obj))out.push({roomKey,obj});
  return out;
}

const baseline=validate(clone(maps0));
assert.strictEqual(Validation.summary(baseline).errors,0,`baseline semantic errors: ${baseline.map(d=>d.code+':'+d.roomKey).join(', ')}`);
assert.deepStrictEqual(baseline,validate(clone(maps0)),'baseline diagnostics are not deterministic');

// Global persistent identity codes.
{
  const moths=rows('moth_pickups');assert(moths.length>=2);
  expectCode('DUPLICATE_MOTH_ID',maps=>{maps.rooms[moths[1].roomKey].moth_pickups.find(x=>x.id===moths[1].obj.id).id=moths[0].obj.id});
}
{
  const robots=rows('decor_robots',x=>x.id);assert(robots.length>=2);
  expectCode('DUPLICATE_ROBOT_ID',maps=>{maps.rooms[robots[1].roomKey].decor_robots.find(x=>x.id===robots[1].obj.id).id=robots[0].obj.id});
}
{
  const groups=rows('creature_groups');assert(groups.length>=2);
  expectCode('DUPLICATE_WILDLIFE_ID',maps=>{maps.rooms[groups[1].roomKey].creature_groups.find(x=>x.id===groups[1].obj.id).id=groups[0].obj.id});
}
{
  const groups=rows('mini_robot_groups');assert(groups.length>=2);
  expectCode('DUPLICATE_MINI_ID',maps=>{maps.rooms[groups[1].roomKey].mini_robot_groups.find(x=>x.id===groups[1].obj.id).id=groups[0].obj.id});
}

// Objective authority/join and approachable-placement errors.
{
  const sp=story0.rooms.find(r=>r.objects?.length),obj=sp.objects[0];
  expectCode('MISSING_OBJECTIVE_PLACEMENT',maps=>{delete maps.rooms[sp.key].objects[obj.object_id]});
  expectCode('UNKNOWN_MAP_OBJECTIVE',maps=>{maps.rooms[sp.key].objects.__unknown_objective=[5,5]});
  expectCode('OBJECTIVE_UNAPPROACHABLE',maps=>{
    const room=maps.rooms[sp.key],t=room.objects[obj.object_id],seen=new Set((room.walls||[]).map(p=>p.join(',')));
    room.walls=room.walls||[];
    for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const q=[t[0]+dx,t[1]+dy],k=q.join(',');if(q[0]>=0&&q[0]<40&&q[1]>=0&&q[1]<19&&!seen.has(k)){room.walls.push(q);seen.add(k)}}
  });
  expectCode('UNKNOWN_OBJECTIVE_KIND',(_maps,story)=>{story.rooms.find(r=>r.key===sp.key).objects[0].kind='__unknown_kind__'});
}

// Coordinate, group and render-reference errors.
{
  const moth=rows('moth_pickups')[0];
  expectCode('TILE_OUT_OF_BOUNDS',maps=>{maps.rooms[moth.roomKey].moth_pickups.find(x=>x.id===moth.obj.id).tile=[99,-3]});
}
{
  const g=rows('creature_groups')[0];
  expectCode('MALFORMED_GROUP',maps=>{const x=maps.rooms[g.roomKey].creature_groups.find(x=>x.id===g.obj.id);x.spawn=[99,99];x.count=0});
}
{
  const roomKey=story0.rooms[0].key;
  expectCode('MISSING_SPRITE',maps=>{(maps.rooms[roomKey].editor_decor??=[]).push({editor_id:'bad_sprite',x:100,y:100,sprite:'__missing_sprite__'})});
}
{
  const r=rows('decor_robots')[0];
  expectCode('UNKNOWN_ROBOT_VARIANT',maps=>{maps.rooms[r.roomKey].decor_robots.find(x=>(x.id||'')===(r.obj.id||'')).variant='__bad_robot__'});
}
{
  const m=rows('moth_pickups')[0];
  expectCode('UNKNOWN_MOTH_VARIANT',maps=>{maps.rooms[m.roomKey].moth_pickups.find(x=>x.id===m.obj.id).variant=999});
}
{
  const g=rows('creature_groups')[0];
  expectCode('UNKNOWN_WILDLIFE_KIND',maps=>{maps.rooms[g.roomKey].creature_groups.find(x=>x.id===g.obj.id).kind='__bad_creature__'});
}
{
  const g=rows('mini_robot_groups')[0];
  expectCode('UNKNOWN_MINI_VARIANT',maps=>{maps.rooms[g.roomKey].mini_robot_groups.find(x=>x.id===g.obj.id).variant='__bad_mini__'});
}

// Strong warnings.
{
  expectCode('TIN_STREAM_BRIDGE_GEOMETRY_CHANGED',maps=>{(maps.rooms.tin_stream.bridge_island??=[]).push([1,1])});
}
{
  const m=rows('moth_pickups')[0];
  expectCode('PICKUP_BLOCKED',maps=>{const room=maps.rooms[m.roomKey],blocked=(room.walls||[])[0]||(room.water||[])[0];assert(blocked);room.moth_pickups.find(x=>x.id===m.obj.id).tile=[...blocked]});
}
{
  const sp=story0.rooms.find(r=>r.next_side||r.previous_side);assert(sp);
  expectCode('TRANSITION_OBSTRUCTED',maps=>{
    const side=sp.next_side||sp.previous_side,f=sp.next_side?sp.next_fraction:sp.previous_fraction,t=Validation.sideTile(side,f,1),room=maps.rooms[sp.key],seen=new Set((room.walls||[]).map(p=>p.join(',')));
    if(!seen.has(t.join(',')))(room.walls??=[]).push(t);
  });
}
{
  const sp=story0.rooms.find(r=>r.objects?.length),obj=sp.objects[0],tile=maps0.rooms[sp.key].objects[obj.object_id],sprite=(atlas.roles.decor_plants||atlas.roles.foliage_mix||[])[0]||Object.keys(atlas.regions)[0];
  expectCode('AUTHORED_RESERVED_SURFACE',maps=>{(maps.rooms[sp.key].editor_decor??=[]).push({editor_id:'reserved_authored_test',x:tile[0]*16+8,y:tile[1]*16+8,sprite})});
}

// A multi-defect fixture must yield byte-for-byte stable ordering.
{
  const bad=clone(maps0);
  const moths=rows('moth_pickups');
  bad.rooms[moths[1].roomKey].moth_pickups.find(x=>x.id===moths[1].obj.id).id=moths[0].obj.id;
  bad.rooms[story0.rooms[0].key].objects.__unknown=[99,99];
  const a=validate(bad),b=validate(clone(bad));
  assert.deepStrictEqual(a,b);
  for(let i=1;i<a.length;i++){
    const prev=a[i-1],cur=a[i];
    if(prev.severity==='warning')assert.strictEqual(cur.severity,'warning','error appeared after warning');
  }
}

console.log('EDITOR SEMANTIC VALIDATION REGRESSION 4.15 PASS');
console.log(`  baseline=${Validation.summary(baseline).errors}E/${Validation.summary(baseline).warnings}W; stable codes, authority joins, render refs, placement and warnings validated`);
