'use strict';

const assert=require('assert');
const fs=require('fs');
const path=require('path');
const ROOT=path.resolve(__dirname,'../..');

let frameSeq=1;
const frames=new Map();
global.requestAnimationFrame=cb=>{const id=frameSeq++;frames.set(id,cb);return id};
global.cancelAnimationFrame=id=>frames.delete(id);
global.document={
  querySelector(){return null},
  querySelectorAll(){return[]},
  createElement(){return{className:'',textContent:'',children:[],dataset:{},append(...xs){this.children.push(...xs)},addEventListener(){},classList:{toggle(){},add(){},remove(){}}}},
  body:{classList:{toggle(){},remove(){},contains(){return false}}}
};

const Procedural=require('../../procedural_decor.js');
const Identity=require('../../editor_identity.js');
const Validation=require('../../editor_validation.js');
require('../../editor.js');
const WysiwygEditor=globalThis.WysiwygEditor;
const Policy=globalThis.RelayEditorPolicy;
const Invalidation=globalThis.RelayEditorInvalidation;
assert(WysiwygEditor&&Policy&&Invalidation);

const maps0=JSON.parse(fs.readFileSync(path.join(ROOT,'relay_moth_maps.json'),'utf8'));
const story=JSON.parse(fs.readFileSync(path.join(ROOT,'relay_moth_story.json'),'utf8'));
const atlas=JSON.parse(fs.readFileSync(path.join(ROOT,'hd_remake_atlas.json'),'utf8'));
const roles=atlas.roles||{},regions=atlas.regions||{};
const clone=v=>JSON.parse(JSON.stringify(v));
const cellKey=p=>Array.isArray(p)?p.join(','):String(p);
const roomIndex=key=>story.rooms.findIndex(r=>r.key===key);

function runtimeRoom(maps,key){
  const raw=maps.rooms[key],spec=story.rooms.find(r=>r.key===key);
  assert(raw&&spec,`missing runtime fixture ${key}`);
  return{
    ...raw,key,index:spec.index,spec,
    walls:new Set((raw.walls||[]).map(cellKey)),
    water:new Set((raw.water||[]).map(cellKey)),
    paths:new Set((raw.path_cells||[]).map(cellKey)),
    border:new Set(),
    blockerStyles:raw.blocker_styles||{},
    decorExclusions:new Set((raw.decor_exclusions||[]).map(cellKey)),
    patternExclusions:new Set((raw.pattern_exclusions||[]).map(String)),
    objectFxHidden:new Set((raw.object_fx_hidden||[]).map(String)),
    bridgeCells:new Set((raw.bridge_cells||[]).map(cellKey)),
    bridgeIsland:raw.bridge_island||[],
    bridgeSegments:raw.bridge_segments||[],
    decorLamps:raw.decor_lamps||[],
    decorRobots:raw.decor_robots||[],
    mothPickups:raw.moth_pickups||[],
    creatureGroups:raw.creature_groups||[],
    miniRobotGroups:raw.mini_robot_groups||[],
    grassClumps:raw.grass_clumps||[],
    editorDecor:raw.editor_decor||[],
    objects:raw.objects||{},
    center(t){return[t[0]*16+8,t[1]*16+8]},
    walkablePixel(){return true},
    tile(x,y){return[Math.floor(x/16),Math.floor(y/16)]},
    nearestClearWalkable(t){return t}
  };
}
function artFixture(){
  return{
    roles,regions,
    worldSize(name,scale=1){const r=regions[name]||[0,0,16,16];return[(r[2]||16)*scale,(r[3]||16)*scale]},
    draw(){},
    region(name){return regions[name]||[0,0,16,16]}
  };
}
function makeEditor(roomKey='quiet_nest',maps=clone(maps0)){
  frames.clear();
  const calls={static:0,water:0,foliage:0,creatures:0,mini:0},toasts=[];
  const game={
    maps,storyData:story,state:{room:roomIndex(roomKey),roomComplete(){return false}},
    room:null,rooms:new Array(story.rooms.length),
    art:artFixture(),painter:{spriteScale(_s,n=1){return n}},
    creatures:{units:[],init(){calls.creatures++}},
    miniGuides:{units:[],init(){calls.mini++}},
    refreshEditorStatic(){calls.static++},
    refreshEditorWater(){calls.water++},
    refreshEditorFoliage(){calls.foliage++},
    toast(msg){toasts.push(String(msg))}
  };
  game.room=runtimeRoom(maps,roomKey);game.rooms[game.state.room]=game.room;
  const capture=new Set();
  const e=Object.create(WysiwygEditor.prototype);
  Object.assign(e,{
    game,active:true,activeRoomKey:roomKey,tool:'select',category:'tiles',choice:null,
    selection:[],clipboard:null,history:new Map(),transaction:null,inspectorEdit:null,overlapCycle:null,
    pointerDown:false,pointerButton:0,pointerId:null,dragMode:null,dragStart:null,dragNow:null,moveOriginal:null,
    paintVisited:new Set(),showSuppressed:false,showGrid:false,nextDecorId:1000,hover:{x:20,y:20},
    status:null,inspector:null,validationState:null,diagnosticsPanel:null,diagnostics:null,
    validationReferenceMaps:clone(maps),savedBaseline:Validation.snapshot(maps),validationCache:null,
    pendingPersistenceOverride:null,lastSavedAt:null,
    overlay:{
      style:{},
      setPointerCapture(id){capture.add(id)},
      hasPointerCapture(id){return capture.has(id)},
      releasePointerCapture(id){capture.delete(id)},
      getBoundingClientRect(){return{left:0,top:0,width:640,height:360}}
    }
  });
  e.renderOverlay=()=>{};
  e.updateStatus=()=>{};
  e.updateActionButtons=()=>{};
  e.buildInspector=()=>{};
  e.rebindRoomData=()=>{
    e.ensureInvalidationState();
    const key=e.roomKey(),idx=roomIndex(key);
    game.room=runtimeRoom(maps,key);game.state.room=idx;game.rooms[idx]=game.room;
    e.invalidationCounters.room++;
    return true;
  };
  return{e,game,maps,calls,toasts,capture};
}
function switchRoom(ctx,key){
  ctx.e.beforeRoomChange();
  ctx.game.state.room=roomIndex(key);
  ctx.game.room=runtimeRoom(ctx.maps,key);
  ctx.game.rooms[ctx.game.state.room]=ctx.game.room;
  ctx.e.onRoomChanged();
}
function pointer(extra={}){
  return{pointerId:7,clientX:20,clientY:20,button:0,key:'',altKey:false,shiftKey:false,
    preventDefault(){this.prevented=true},stopPropagation(){this.stopped=true},stopImmediatePropagation(){this.immediate=true},...extra};
}

// 1. Exact Tin Stream bush/rivet failure mode: DECOR wins right-click and rivet_d stays gameplay-visible.
{
  const raw=clone(maps0.rooms.tin_stream),overlap={x0:330,y0:150,x1:356,y1:184};
  const bush=Policy.describe({type:'procedural-decor',id:'generated:tin_stream:40',tile:[21,10],bbox:overlap});
  const rivet=Policy.describe({type:'objective',id:'rivet_d',tile:[20,10],bbox:overlap});
  assert.strictEqual(Policy.pick([rivet,bush],{x:344,y:170},'right-click')?.id,bush.id);
  const objectsBefore=JSON.stringify(raw.objects);
  Procedural.suppress(raw,bush);
  assert((raw.decor_exclusions||[]).some(p=>cellKey(p)==='21,10'));
  assert.strictEqual(JSON.stringify(raw.objects),objectsBefore);
  assert(!(raw.object_fx_hidden||[]).includes('rivet_d'));
}

// 2. Tool/layer policy with overlapping authoring and gameplay targets.
{
  const bbox={x0:8,y0:8,x1:24,y1:24},p={x:16,y:16};
  const decor=Policy.describe({type:'decor',id:'decor',bbox});
  const objective=Policy.describe({type:'objective',id:'objective',bbox});
  const moth=Policy.describe({type:'moth',id:'moth',bbox});
  assert.strictEqual(Policy.pick([objective,moth,decor],p,'right-click')?.id,'decor');
  assert.strictEqual(Policy.pick([objective,moth,decor],p,'select')?.id,'decor');
  assert(['objective','moth'].includes(Policy.pick([decor,moth,objective],p,'object')?.id));
  assert.strictEqual(Policy.pick([objective,moth],p,'right-click'),null);
}

// 3. Room A history cannot write its snapshot into room B.
{
  const ctx=makeEditor('quiet_nest');
  ctx.e.beginTransaction('room A edit');
  ctx.maps.rooms.quiet_nest.foliage_density=(ctx.maps.rooms.quiet_nest.foliage_density??1)+.25;
  ctx.e.queueInvalidation(Invalidation.FOLIAGE);
  ctx.e.commitTransaction();
  const aAfter=JSON.stringify(ctx.maps.rooms.quiet_nest);
  switchRoom(ctx,'tin_stream');
  const bBefore=JSON.stringify(ctx.maps.rooms.tin_stream);
  assert.strictEqual(ctx.e.undoOne(),false);
  assert.strictEqual(JSON.stringify(ctx.maps.rooms.tin_stream),bBefore);
  assert.strictEqual(JSON.stringify(ctx.maps.rooms.quiet_nest),aAfter);
}

// 4. Persistent moss_bot move keeps the exact ID and unrelated fields.
{
  const ctx=makeEditor('home_loop'),room=ctx.maps.rooms.home_loop;
  const moss=room.decor_robots.find(r=>r.id==='moss_bot');assert(moss);
  const before=clone(moss),ref={type:'robot',id:moss.id,index:room.decor_robots.indexOf(moss),obj:moss,tile:[...moss.tile]};
  const [clip]=ctx.e.copySelectionData([ref]);ctx.e.removeRef(ref);ctx.e.pasteDataItem(clip,2,1,true);
  const moved=room.decor_robots.find(r=>r.id==='moss_bot');assert(moved);
  assert.deepStrictEqual(moved.tile,[before.tile[0]+2,before.tile[1]+1]);
  for(const k of ['id','variant','facing','name'])assert.strictEqual(moved[k],before[k]);
}

// 5. Moth copy/create allocation is global across rooms.
{
  const ctx=makeEditor('quiet_nest'),source=clone(ctx.maps.rooms.quiet_nest.moth_pickups[0]);
  const clip={type:'moth',kind:'tile',data:source,tx:source.tile[0],ty:source.tile[1]};
  ctx.e.pasteDataItem(clip,1,0,false);
  switchRoom(ctx,'lantern_lane');
  ctx.e.pasteDataItem(clip,2,0,false);
  const report=Identity.scan(ctx.maps);
  assert.strictEqual(report.duplicates.moth.length,0);
  assert.strictEqual(report.crossTypeDuplicates.length,0);
}

// 6. A count>1 wildlife group is one logical selectable/copyable item.
{
  const roomKey=story.rooms.map(r=>r.key).find(k=>(maps0.rooms[k].creature_groups||[]).some(g=>(g.count||1)>1));
  assert(roomKey,'no count>1 wildlife fixture');
  const ctx=makeEditor(roomKey),group=ctx.maps.rooms[roomKey].creature_groups.find(g=>(g.count||1)>1);
  const [sx,sy]=ctx.game.room.center(group.spawn);
  ctx.game.creatures.units=Array.from({length:group.count},(_,i)=>({id:`${group.id}_${i}`,x:sx+(i%2)*12,y:sy+Math.floor(i/2)*10}));
  const logical=ctx.e.collectItems().filter(x=>x.type==='wildlife'&&x.id===group.id);
  assert.strictEqual(logical.length,1);
  const copied=ctx.e.copySelectionData(logical);
  assert.strictEqual(copied.length,1);
  const beforeCount=ctx.maps.rooms[roomKey].creature_groups.length;
  ctx.e.pasteDataItem(copied[0],1,0,false);
  assert.strictEqual(ctx.maps.rooms[roomKey].creature_groups.length,beforeCount+1);
  assert.strictEqual(Identity.scan(ctx.maps).duplicates.wildlife.length,0);
}

// 7. Hidden objective stays an editor ghost and Show restores only visibility, not placement.
{
  const roomKey=story.rooms.find(r=>r.objects?.length).key,ctx=makeEditor(roomKey);
  const obj=story.rooms.find(r=>r.key===roomKey).objects[0],tile=clone(ctx.maps.rooms[roomKey].objects[obj.object_id]);
  let ref=ctx.e.collectItems().find(x=>x.type==='objective'&&x.id===obj.object_id);assert(ref);
  ctx.e.selection=[ref];ctx.e.toggleObjectiveVisual();
  assert((ctx.maps.rooms[roomKey].object_fx_hidden||[]).includes(obj.object_id));
  ref=ctx.e.collectItems().find(x=>x.type==='objective'&&x.id===obj.object_id);
  assert(ref&&ref.hiddenVisual===true,'hidden objective ghost missing');
  ctx.e.selection=[ref];ctx.e.toggleObjectiveVisual();
  assert(!(ctx.maps.rooms[roomKey].object_fx_hidden||[]).includes(obj.object_id));
  assert.deepStrictEqual(ctx.maps.rooms[roomKey].objects[obj.object_id],tile);
}

// 8. Pattern and generated suppression are discoverable under SHOW SUPPRESSED and restorable.
{
  const ctx=makeEditor('quiet_nest');ctx.e.showSuppressed=true;
  ctx.maps.rooms.quiet_nest.pattern_exclusions=['nest:swirl'];ctx.e.rebindRoomData();
  let pattern=ctx.e.patternItems(ctx.maps.rooms.quiet_nest,true).find(x=>x.type==='suppressed-pattern'&&x.id==='nest:swirl');
  assert(pattern);ctx.e.selection=[Policy.describe(pattern)];ctx.e.restoreSelectedSuppressed();
  assert(!(ctx.maps.rooms.quiet_nest.pattern_exclusions||[]).includes('nest:swirl'));

  ctx.e.rebindRoomData();
  const generated=Procedural.enumerate(ctx.game.room,roles)[0];assert(generated);
  Procedural.suppress(ctx.maps.rooms.quiet_nest,generated);ctx.e.rebindRoomData();
  const suppressed=Procedural.enumerate(ctx.game.room,roles,{includeSuppressed:true}).find(x=>x.id===generated.id&&x.suppressed);
  assert(suppressed);
  ctx.e.selection=[Policy.describe({type:'suppressed-procedural',id:suppressed.id,obj:suppressed,tile:suppressed.tile,bbox:{x0:suppressed.x-8,y0:suppressed.y-16,x1:suppressed.x+8,y1:suppressed.y}})];
  ctx.e.restoreSelectedSuppressed();
  assert(!(ctx.maps.rooms.quiet_nest.decor_exclusions||[]).some(p=>cellKey(p)===cellKey(generated.tile)));
}

// 9. Shared procedural authority never emits generic decor on current bridge/island/objective surfaces.
{
  for(const spec of story.rooms){
    const room={...clone(maps0.rooms[spec.key]),key:spec.key,index:spec.index,spec};
    const reservedBridge=new Set([...(room.bridge_cells||[]),...(room.bridge_island||[])].map(cellKey));
    const objectives=new Set(Object.values(room.objects||{}).map(cellKey));
    for(const item of Procedural.enumerate(room,roles)){
      assert(!reservedBridge.has(cellKey(item.tile)),`${item.id} emitted on bridge/island`);
      assert(!objectives.has(cellKey(item.tile)),`${item.id} emitted on objective`);
    }
  }
}

// 10. Tile-backed preview plan is exactly the committed snapped position.
{
  const roomKey=story.rooms.map(r=>r.key).find(k=>(maps0.rooms[k].moth_pickups||[]).length);const ctx=makeEditor(roomKey);
  const ref=ctx.e.collectItems().find(x=>x.type==='moth');assert(ref);
  ctx.e.selection=[ref];ctx.e.dragStart={x:ref.tile[0]*16+8,y:ref.tile[1]*16+8};ctx.e.moveOriginal=ctx.e.captureSelectionState();
  const p={x:ctx.e.dragStart.x+23.4,y:ctx.e.dragStart.y+9.1},plan=ctx.e.movementPlan(p)[0];
  assert(plan&&plan.kind==='tile');ctx.e.applyMove(p);
  const moved=ctx.maps.rooms[roomKey].moth_pickups.find(m=>m.id===ref.id);assert(moved);
  assert.deepStrictEqual(moved.tile,[plan.tx,plan.ty]);
}

// 11. pointercancel and Escape restore byte-equivalent pre-gesture room state.
{
  for(const mode of ['pointercancel','escape']){
    const ctx=makeEditor('quiet_nest'),before=JSON.stringify(ctx.maps.rooms.quiet_nest);
    ctx.e.beginTransaction(mode);ctx.maps.rooms.quiet_nest.foliage_density=(ctx.maps.rooms.quiet_nest.foliage_density??1)+.5;
    ctx.e.queueInvalidation(Invalidation.FOLIAGE);
    ctx.e.pointerDown=true;ctx.e.pointerId=7;ctx.e.dragMode='paint';ctx.capture.add(7);
    if(mode==='pointercancel')ctx.e.onCancel(pointer());
    else ctx.e.onKey(pointer({key:'Escape',target:null}));
    assert.strictEqual(JSON.stringify(ctx.maps.rooms.quiet_nest),before,`${mode} did not restore room`);
    assert.strictEqual(ctx.e.transaction,null);
    assert.strictEqual(ctx.e.pointerDown,false);
  }
}

// 12. Semantic validator returns deterministic stable errors for old-danger fixtures.
{
  const bad=clone(maps0),spec=story.rooms.find(r=>r.objects?.length),obj=spec.objects[0];
  const moths=[];for(const [roomKey,r] of Object.entries(bad.rooms))for(const m of r.moth_pickups||[])moths.push({roomKey,m});
  assert(moths.length>=2);moths[1].m.id=moths[0].m.id;
  delete bad.rooms[spec.key].objects[obj.object_id];
  bad.rooms[spec.key].objects.__unknown=[99,99];
  const groupRoom=Object.keys(bad.rooms).find(k=>(bad.rooms[k].creature_groups||[]).length);
  if(groupRoom){bad.rooms[groupRoom].creature_groups[0].count=0;bad.rooms[groupRoom].creature_groups[0].spawn=[99,99]}
  const a=Validation.validate(bad,story,{roles,regions},{baselineMaps:maps0}),b=Validation.validate(clone(bad),story,{roles,regions},{baselineMaps:maps0});
  assert.deepStrictEqual(a,b);
  for(const code of ['DUPLICATE_MOTH_ID','MISSING_OBJECTIVE_PLACEMENT','UNKNOWN_MAP_OBJECTIVE','TILE_OUT_OF_BOUNDS','MALFORMED_GROUP'])assert(a.some(d=>d.code===code&&d.severity==='error'),code);
}

// 13. Dirty -> save baseline clean -> edit -> undo clean -> redo dirty.
{
  const ctx=makeEditor('quiet_nest');
  ctx.e.beginTransaction('dirty A');ctx.maps.rooms.quiet_nest.foliage_density=(ctx.maps.rooms.quiet_nest.foliage_density??1)+.1;ctx.e.queueInvalidation(Invalidation.FOLIAGE);ctx.e.commitTransaction();
  assert(ctx.e.dirtyInfo().project);
  ctx.e.markSavedBaseline('save');assert(!ctx.e.dirtyInfo().project);
  ctx.e.beginTransaction('dirty B');ctx.maps.rooms.quiet_nest.foliage_density+=.2;ctx.e.queueInvalidation(Invalidation.FOLIAGE);ctx.e.commitTransaction();
  assert(ctx.e.dirtyInfo().project);
  assert(ctx.e.undoOne());assert(!ctx.e.dirtyInfo().project);
  assert(ctx.e.redoOne());assert(ctx.e.dirtyInfo().project);
}

// 14. Incremental invalidation leaves unrelated subsystem counters unchanged.
{
  const ctx=makeEditor('quiet_nest');
  ctx.e.queueInvalidation(Invalidation.STATIC,{sync:true});
  assert.deepStrictEqual(ctx.calls,{static:1,water:0,foliage:0,creatures:0,mini:0});
  ctx.e.queueInvalidation(Invalidation.CREATURES,{sync:true});
  assert.deepStrictEqual(ctx.calls,{static:1,water:0,foliage:0,creatures:1,mini:0});
  ctx.e.queueInvalidation(Invalidation.MINI_ROBOTS,{sync:true});
  assert.deepStrictEqual(ctx.calls,{static:1,water:0,foliage:0,creatures:1,mini:1});
}

console.log('EDITOR BEHAVIOR REGRESSION 4.15 PASS');
console.log('  14 programme safety cases exercise live policy, mutation, identity, suppression, validation, history and invalidation code');
