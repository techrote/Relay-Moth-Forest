'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '../..');
const Identity = require('../../editor_identity.js');
require('../../procedural_decor.js');
require('../../editor.js');

const WysiwygEditor = globalThis.WysiwygEditor;
const Policy = globalThis.RelayEditorPolicy;
assert(WysiwygEditor && Policy);

const baseMaps = JSON.parse(fs.readFileSync(path.join(ROOT,'relay_moth_maps.json'),'utf8'));
const clone = value => JSON.parse(JSON.stringify(value));

function bareEditor(maps,roomKey){
  const e=Object.create(WysiwygEditor.prototype);
  const toasts=[];
  e.game={
    maps,
    room:{key:roomKey},
    storyData:{rooms:[]},
    state:{room:0},
    toast(msg){toasts.push(String(msg))}
  };
  e.selection=[];
  e.clipboard=null;
  e.hover={x:0,y:0};
  e.nextDecorId=1000;
  e.paintVisited=new Set();
  e.dragStart=null;
  e.rebuildRoom=()=>{};
  e.beginTransaction=()=>true;
  e.commitTransaction=()=>true;
  e.collectItems=()=>{const r=e.rawRoom(),out=[];(r.editor_decor||[]).forEach((d,i)=>out.push({type:'decor',id:d.editor_id||`decor:${i}`,obj:d}));(r.grass_clumps||[]).forEach((d,i)=>out.push({type:'grass',id:`grass:${i}`,obj:d}));(r.decor_lamps||[]).forEach((d,i)=>out.push({type:'lamp',id:`lamp:${i}`,obj:d,tile:d.tile}));(r.decor_robots||[]).forEach((d,i)=>out.push({type:'robot',id:d.id||`robot:${i}`,obj:d,tile:d.tile}));(r.moth_pickups||[]).forEach((d,i)=>out.push({type:'moth',id:d.id||`moth:${i}`,obj:d,tile:d.tile}));(r.creature_groups||[]).forEach((d,i)=>out.push({type:'wildlife',id:d.id||`wildlife:${i}`,obj:d,tile:d.spawn}));(r.mini_robot_groups||[]).forEach((d,i)=>out.push({type:'mini',id:d.id||`mini:${i}`,obj:d,tile:d.spawn}));return out};
  return {e,toasts};
}

// The reusable checker sees the existing campaign as collision-free and allocates
// against every persistent namespace across every room.
{
  const report=Identity.scan(baseMaps);
  for(const [type,dupes] of Object.entries(report.duplicates))
    assert.strictEqual(dupes.length,0,`baseline duplicate ${type} IDs`);
  assert.strictEqual(report.crossTypeDuplicates.length,0,'baseline persistent IDs collide across types');
  const id=Identity.allocate(baseMaps,'moth','editor_moth');
  assert(!Identity.usedIds(baseMaps).has(id));
}

// Moving a persistent recruitable robot preserves every identity/property field.
{
  const maps=clone(baseMaps);
  const {e}=bareEditor(maps,'home_loop');
  const room=maps.rooms.home_loop;
  const moss=room.decor_robots.find(r=>r.id==='moss_bot');
  assert(moss,'moss_bot fixture missing');
  const before=clone(moss);
  const ref={type:'robot',id:moss.id,index:room.decor_robots.indexOf(moss),obj:moss,tile:[...moss.tile]};
  const [clip]=e.copySelectionData([ref]);
  e.removeRef(ref);
  e.pasteDataItem(clip,2,1,true);
  const moved=room.decor_robots.find(r=>r.id==='moss_bot');
  assert(moved,'move dropped moss_bot persistent ID');
  assert.deepStrictEqual(moved.tile,[before.tile[0]+2,before.tile[1]+1]);
  for(const field of ['id','variant','facing','name'])assert.strictEqual(moved[field],before[field],field);
}

// Copying a persistent robot creates a decorative copy with no persistent ID and
// the user receives an explicit explanation; original identity remains untouched.
{
  const maps=clone(baseMaps);
  const {e,toasts}=bareEditor(maps,'home_loop');
  const room=maps.rooms.home_loop,moss=room.decor_robots.find(r=>r.id==='moss_bot');
  const ref={type:'robot',id:moss.id,index:room.decor_robots.indexOf(moss),obj:moss,tile:[...moss.tile]};
  const [clip]=e.copySelectionData([ref]);
  e.clipboard={items:[clip],anchor:{x:clip.tx*16+8,y:clip.ty*16+8},persistentRobotCopies:1};
  e.hover={x:(clip.tx+3)*16+8,y:(clip.ty+1)*16+8};
  e.pasteClipboard();
  assert.strictEqual(room.decor_robots.filter(r=>r.id==='moss_bot').length,1);
  const copied=room.decor_robots.find(r=>r.tile?.[0]===clip.tx+3&&r.tile?.[1]===clip.ty+1);
  assert(copied,'decorative robot copy missing');
  assert(!copied.id,'persistent robot copy duplicated an ID');
  for(const field of ['variant','facing','name'])assert.strictEqual(copied[field],moss[field],field);
  assert(toasts.some(t=>t.includes('Copied as decorative robot; persistent ID not duplicated.')));
}

// Moth creation/copy in different rooms uses one global allocator; moving a moth
// keeps its original ID exactly.
{
  const maps=clone(baseMaps);
  const {e}=bareEditor(maps,'quiet_nest');
  const source=clone(maps.rooms.quiet_nest.moth_pickups[0]);
  const clip={type:'moth',kind:'tile',data:source,tx:source.tile[0],ty:source.tile[1]};
  e.pasteDataItem(clip,1,0,false);
  const copiedId=maps.rooms.quiet_nest.moth_pickups.at(-1).id;
  assert.notStrictEqual(copiedId,source.id);

  e.game.room={key:'lantern_lane'};
  e.choice={kind:'moth',variant:2,colour_index:123};
  e.paintVisited=new Set();e.dragStart=null;e.rebuildRoom=()=>{};
  e.paintAt({x:7*16+8,y:7*16+8});
  const createdId=maps.rooms.lantern_lane.moth_pickups.at(-1).id;
  assert.notStrictEqual(createdId,copiedId);
  assert(!Identity.scan(maps).duplicates.moth.length);

  e.game.room={key:'tin_stream'};
  const room=maps.rooms.tin_stream,moth=room.moth_pickups[0],id=moth.id;
  const ref={type:'moth',id,index:0,obj:moth,tile:[...moth.tile]};
  const [moveClip]=e.copySelectionData([ref]);
  e.removeRef(ref);e.pasteDataItem(moveClip,1,0,true);
  assert.strictEqual(room.moth_pickups.find(m=>m.id===id)?.id,id);
}

// One creature_group with four live members is one logical editor item whose union
// bbox supports one OBJECT-area selection rather than four duplicate refs.
{
  const raw={
    walls:[],water:[],path_cells:[],editor_decor:[],grass_clumps:[],decor_lamps:[],decor_robots:[],
    moth_pickups:[],creature_groups:[{id:'group4',kind:'rabbit',count:4,spawn:[10,10],seed:1}],
    mini_robot_groups:[],large_trees:[],blocker_styles:{},objects:{},pattern_exclusions:[],decor_exclusions:[]
  };
  const runtime={
    key:'test_room',index:0,spec:{key:'test_room',objects:[],pattern:'none'},walls:new Set(),water:new Set(),paths:new Set(),
    border:new Set(),decorExclusions:new Set(),bridgeCells:new Set(),bridgeIsland:[],foliageDensity:1,
    center(t){return[t[0]*16+8,t[1]*16+8]}
  };
  const e=Object.create(WysiwygEditor.prototype);
  const capture=new Set();
  Object.assign(e,{
    game:{
      maps:{rooms:{test_room:raw}},room:runtime,storyData:{rooms:[runtime.spec]},state:{room:0,roomComplete(){return false}},
      art:{roles:{creatures:{rabbit:{idle:'rabbit'}},moths:[],mini_robots:{}},regions:{}},
      painter:{spriteScale(_s,n){return n}},
      creatures:{units:[
        {id:'group4_0',x:150,y:150},{id:'group4_1',x:170,y:150},
        {id:'group4_2',x:150,y:175},{id:'group4_3',x:170,y:175}
      ]}
    },
    active:true,activeRoomKey:'test_room',selection:[],history:new Map(),transaction:null,
    overlay:{
      hasPointerCapture(id){return capture.has(id)},releasePointerCapture(id){capture.delete(id)},
      getBoundingClientRect(){return{left:0,top:0,width:640,height:360}}
    },
    pointerDown:true,pointerId:7,pointerButton:0,dragMode:'objectSelectBox',
    dragStart:{x:135,y:130},dragNow:{x:190,y:190},moveOriginal:null,paintVisited:new Set(),
    hover:{x:190,y:190},showGrid:false
  });
  e.renderOverlay=()=>{};e.updateStatus=()=>{};
  const wildlife=e.collectItems().filter(x=>x.type==='wildlife');
  assert.strictEqual(wildlife.length,1);
  assert.strictEqual(wildlife[0].id,'group4');
  assert(wildlife[0].bbox.x0<=150&&wildlife[0].bbox.x1>=170&&wildlife[0].bbox.y0<=150&&wildlife[0].bbox.y1>=175);

  e.onUp({pointerId:7,clientX:190,clientY:190,stopPropagation(){}});
  assert.strictEqual(e.selection.length,1,'OBJECT box selected duplicate group refs');
  assert.strictEqual(e.selection[0].id,'group4');
}

// Wildlife and mini copies receive globally unique IDs; moves preserve the originals.
// Repeated pastes across rooms cannot introduce a persistent-ID duplicate.
{
  const maps=clone(baseMaps);
  const {e}=bareEditor(maps,'lantern_lane');

  const wild=maps.rooms.lantern_lane.creature_groups.find(g=>g.count===4);
  assert(wild);
  const wildId=wild.id;
  const wref={type:'wildlife',id:wild.id,index:maps.rooms.lantern_lane.creature_groups.indexOf(wild),obj:wild,tile:[...wild.spawn]};
  const [wclip]=e.copySelectionData([wref]);
  e.removeRef(wref);e.pasteDataItem(wclip,1,0,true);
  assert(maps.rooms.lantern_lane.creature_groups.some(g=>g.id===wildId),'wildlife move changed ID');

  e.game.room={key:'quiet_nest'};
  e.pasteDataItem(wclip,2,0,false);
  const wildCopy=maps.rooms.quiet_nest.creature_groups.at(-1);
  assert.notStrictEqual(wildCopy.id,wildId);
  assert.strictEqual(wildCopy.count,wild.count);

  e.game.room={key:'home_loop'};
  const mini=maps.rooms.home_loop.mini_robot_groups[0],miniId=mini.id;
  const mref={type:'mini',id:mini.id,index:0,obj:mini,tile:[...mini.spawn]};
  const [mclip]=e.copySelectionData([mref]);
  e.removeRef(mref);e.pasteDataItem(mclip,1,0,true);
  assert(maps.rooms.home_loop.mini_robot_groups.some(g=>g.id===miniId),'mini move changed ID');

  for(const roomKey of ['quiet_nest','lantern_lane','tin_stream','fern_hollow']){
    e.game.room={key:roomKey};
    e.pasteDataItem(mclip,2,0,false);
    e.pasteDataItem(wclip,3,0,false);
  }

  const report=Identity.scan(maps);
  for(const type of ['moth','robot','wildlife','mini'])
    assert.strictEqual(report.duplicates[type].length,0,`duplicate ${type} ID after repeated paste`);
  assert.strictEqual(report.crossTypeDuplicates.length,0,'cross-type persistent ID collision after repeated paste');
}

// Selection refresh replaces stale refs with the current logical item by stable ID.
{
  const maps=clone(baseMaps);
  const {e}=bareEditor(maps,'home_loop');
  const stale={type:'mini',id:'stable',obj:{old:true}};
  const fresh={type:'mini',id:'stable',obj:{fresh:true}};
  e.selection=[stale];
  e.collectItems=()=>[fresh];
  const keys=e.selectionKeys();
  e.refreshSelection(keys);
  assert.strictEqual(e.selection.length,1);
  assert.strictEqual(e.selection[0],fresh);
  assert.notStrictEqual(e.selection[0],stale);
}

console.log('EDITOR IDENTITY/GROUP REGRESSION 4.15 PASS');
console.log('  global IDs, identity-preserving moves, decorative robot copy and logical group editing validated');
