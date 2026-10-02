'use strict';

const assert=require('assert');
const fs=require('fs');
const path=require('path');
const ROOT=path.resolve(__dirname,'../..');

// Deterministic fake frame scheduler: queued editor work does not run until the
// test explicitly advances one animation frame.
let nextFrame=1;
const frames=new Map();
global.requestAnimationFrame=cb=>{const id=nextFrame++;frames.set(id,cb);return id};
global.cancelAnimationFrame=id=>frames.delete(id);
global.document={querySelector(){return null},querySelectorAll(){return[]},body:{classList:{toggle(){},remove(){},contains(){return false}}}};

require('../../editor.js');
const WysiwygEditor=globalThis.WysiwygEditor;
const I=globalThis.RelayEditorInvalidation;
assert(WysiwygEditor&&I);

const clone=v=>JSON.parse(JSON.stringify(v));
const baseRoom=()=>({
  editor_decor:[{editor_id:'d1',x:20,y:30,sprite:'flower_white'}],
  grass_clumps:[{x:100,y:120,radius:22,density:1.2,seed:10}],
  water:[[3,4],[4,4]],walls:[],path_cells:[],large_trees:[],blocker_styles:{},
  decor_lamps:[],decor_robots:[],moth_pickups:[{id:'m1',tile:[5,5],variant:0,colour_index:90}],
  creature_groups:[{id:'wild1',kind:'rabbit',count:2,spawn:[8,8],seed:20}],
  mini_robot_groups:[{id:'mini1',variant:'teal',count:2,spawn:[9,9],seed:30}],
  objects:{obj1:[10,10]},object_fx_hidden:[],decor_exclusions:[],pattern_exclusions:[]
});

function makeEditor(){
  frames.clear();
  const raw=baseRoom(),calls={static:0,water:0,foliage:0,creatures:0,mini:0};
  const signatures={water:null,foliage:null};
  const game={
    maps:{rooms:{room_a:raw}},
    room:{key:'room_a'},
    rooms:[{key:'room_a'}],
    storyData:{rooms:[{key:'room_a',index:0,objects:[{object_id:'obj1',kind:'beacon'}]}]},
    state:{room:0},
    refreshEditorStatic(){calls.static++},
    refreshEditorWater(){calls.water++;signatures.water=JSON.stringify((this.maps.rooms.room_a.water||[]).map(x=>[...x]))},
    refreshEditorFoliage(){calls.foliage++;signatures.foliage=JSON.stringify(this.maps.rooms.room_a.grass_clumps||[])},
    creatures:{init(){calls.creatures++}},
    miniGuides:{init(){calls.mini++}},
    toast(){}
  };
  const e=Object.create(WysiwygEditor.prototype);
  Object.assign(e,{
    game,active:true,activeRoomKey:'room_a',selection:[],clipboard:null,history:new Map(),
    transaction:null,inspectorEdit:null,overlapCycle:null,pointerDown:false,pointerButton:0,pointerId:null,
    dragMode:null,dragStart:null,dragNow:null,moveOriginal:null,paintVisited:new Set(),showSuppressed:false,
    showGrid:false,tool:'select',choice:null,status:null,inspector:null,validationCache:null,
    overlay:{hasPointerCapture(){return false},releasePointerCapture(){}}
  });
  e.renderOverlay=()=>{};
  e.updateStatus=()=>{};
  e.refreshSelection=()=>{};
  e.selectionKeys=()=>[];
  e.syncRoomContext=()=>false;
  e.rebindRoomData=()=>{e.ensureInvalidationState();e.invalidationCounters.room++;return true};
  return{e,raw,calls,signatures};
}
function runFrames(){
  const pending=[...frames.entries()];
  frames.clear();
  for(const [,cb] of pending)cb();
}

// Invalidation classes are explicit and stable.
assert.strictEqual(I.STATIC,1);
assert(I.TERRAIN&&I.FOLIAGE&&I.CREATURES&&I.MINI_ROBOTS&&I.OBJECTS&&I.ROOM_DATA);

// Moving authored decor refreshes static presentation only.
{
  const {e,raw,calls}=makeEditor();
  raw.editor_decor[0].x+=11;
  e.queueInvalidation(I.STATIC,{sync:true});
  assert.deepStrictEqual(calls,{static:1,water:0,foliage:0,creatures:0,mini:0});
}

// Grass changes rebuild only grass/foliage descriptors; same-count movement changes identity.
{
  const {e,raw,calls,signatures}=makeEditor();
  e.queueInvalidation(I.FOLIAGE,{sync:true});
  const before=signatures.foliage;
  raw.grass_clumps[0].x+=13;
  e.queueInvalidation(I.FOLIAGE,{sync:true});
  assert.notStrictEqual(signatures.foliage,before);
  assert.strictEqual(calls.foliage,2);
  assert.strictEqual(calls.water,0);
  assert.strictEqual(calls.creatures,0);
  assert.strictEqual(calls.mini,0);
}

// Creature-group and mini-group refreshes do not touch unrelated subsystems.
{
  const {e,raw,calls}=makeEditor();
  raw.creature_groups[0].count=3;
  e.queueInvalidation(I.CREATURES,{sync:true});
  assert.deepStrictEqual(calls,{static:0,water:0,foliage:0,creatures:1,mini:0});
  raw.mini_robot_groups[0].count=4;
  e.queueInvalidation(I.MINI_ROBOTS,{sync:true});
  assert.deepStrictEqual(calls,{static:0,water:0,foliage:0,creatures:1,mini:1});
}

// Terrain/water mutation reconstructs Room authority and refreshes static, water and
// foliage. Same-count water movement changes the water signature.
{
  const {e,raw,calls,signatures}=makeEditor();
  e.queueInvalidation(I.TERRAIN,{sync:true});
  const before=signatures.water;
  raw.water[0]=[6,4];
  e.queueInvalidation(I.TERRAIN,{sync:true});
  assert.notStrictEqual(signatures.water,before);
  assert.strictEqual(calls.water,2);
  assert.strictEqual(calls.static,2);
  assert.strictEqual(calls.foliage,2);
  assert.strictEqual(calls.creatures,0);
  assert.strictEqual(calls.mini,0);
  assert.strictEqual(e.getInvalidationDiagnostics().counters.room,2);
}

// Many mutations in one browser frame coalesce to one expensive refresh.
{
  const {e,calls}=makeEditor();
  for(let i=0;i<40;i++)e.queueInvalidation(I.STATIC);
  assert.strictEqual(frames.size,1);
  assert.strictEqual(calls.static,0);
  assert.strictEqual(e.getInvalidationDiagnostics().counters.scheduled,1);
  runFrames();
  assert.strictEqual(calls.static,1);
  const d=e.getInvalidationDiagnostics();
  assert.strictEqual(d.counters.frames,1);
  assert.strictEqual(d.counters.flushes,1);
  assert.strictEqual(d.pending,0);
}

// Pointer-up/transaction commit synchronously flushes the final queued state.
{
  const {e,raw,calls}=makeEditor();
  e.beginTransaction('paint');
  raw.editor_decor[0].x=44;
  e.queueInvalidation(I.STATIC);
  e.pointerDown=true;e.pointerId=7;e.dragMode='paint';
  e.logical=()=>({x:44,y:44});
  e.onUp({pointerId:7,stopPropagation(){}});
  assert.strictEqual(calls.static,1);
  assert.strictEqual(e.getInvalidationDiagnostics().pending,0);
  assert.strictEqual(e.historyFor('room_a').undo.length,1);
}

// Undo/redo use the transaction's original scope plus a Room-data rebind; a decor
// undo does not suddenly reinit ambient creatures/minis or rebuild water.
{
  const {e,raw,calls}=makeEditor();
  e.beginTransaction('decor property');
  raw.editor_decor[0].x=90;
  e.queueInvalidation(I.STATIC);
  e.commitTransaction();
  const afterCommit={...calls};
  assert(e.undoOne());
  assert.strictEqual(e.game.maps.rooms.room_a.editor_decor[0].x,20);
  assert(e.redoOne());
  assert.strictEqual(e.game.maps.rooms.room_a.editor_decor[0].x,90);
  assert.strictEqual(calls.water,afterCommit.water);
  assert.strictEqual(calls.creatures,afterCommit.creatures);
  assert.strictEqual(calls.mini,afterCommit.mini);
  assert(calls.static>=afterCommit.static+2);
}

// Persistence/validation flush path cannot observe a queued stale descriptor.
{
  const {e,raw,calls}=makeEditor();
  raw.grass_clumps[0].radius=31;
  e.queueInvalidation(I.FOLIAGE);
  assert.strictEqual(calls.foliage,0);
  e.flushForPersistence();
  assert.strictEqual(calls.foliage,1);
  assert.strictEqual(e.getInvalidationDiagnostics().pending,0);
}

// Source-level guard: the old rebuildRoom compatibility entry remains available,
// but ordinary paint/property paths declare scoped invalidations and persistence flushes them.
{
  const src=fs.readFileSync(path.join(ROOT,'editor.js'),'utf8');
  assert(src.includes('rebuildRoom(skipInspector=false){return this.queueInvalidation(EDITOR_INVALIDATION.ALL'));
  assert(src.includes('this.queueInvalidation(this.invalidationForChoice(c))')||src.includes('this.queueInvalidation(invalidation)'));
  assert(src.includes('this.queueInvalidation(this.invalidationForInspector(ref,field),{skipInspector:true})'));
  assert(src.includes('flushForPersistence(){')&&src.includes('this.flushInvalidation();this.validationCache=null'));
}

console.log('EDITOR INVALIDATION REGRESSION 4.15 PASS');
console.log('  scoped subsystem refresh, same-count signatures, frame coalescing and synchronous flush boundaries validated');
