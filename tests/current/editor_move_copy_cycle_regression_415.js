'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '../..');
require('../../procedural_decor.js');
require('../../editor_identity.js');
require('../../editor.js');

const WysiwygEditor=globalThis.WysiwygEditor;
const Policy=globalThis.RelayEditorPolicy;
assert(WysiwygEditor&&Policy);

globalThis.document={
  querySelector(){return null},
  querySelectorAll(){return[]},
  body:{classList:{toggle(){},remove(){},contains(){return false}}}
};

const clone=v=>JSON.parse(JSON.stringify(v));
const box=(x,y,w=12,h=12)=>({x0:x,y0:y,x1:x+w,y1:y+h});

function fixture(){
  const room={
    editor_decor:[
      {editor_id:'decor_a',sprite:'bush_blue',x:100,y:120,scale:1,alpha:1},
      {editor_id:'decor_b',sprite:'bush_blue',x:130,y:140,scale:1,alpha:1}
    ],
    grass_clumps:[],decor_lamps:[],decor_robots:[],
    moth_pickups:[
      {id:'moth_a',tile:[2,3],variant:0,colour_index:50},
      {id:'moth_b',tile:[4,5],variant:1,colour_index:80}
    ],
    creature_groups:[],mini_robot_groups:[],
    walls:[],water:[],path_cells:[],large_trees:[],blocker_styles:{},
    objects:{objective_a:[8,8]},object_fx_hidden:[],decor_exclusions:[],pattern_exclusions:[]
  };
  const spec={key:'room_a',index:0,pattern:'none',objects:[{object_id:'objective_a',kind:'beacon',label:'Objective A'}]};
  const maps={rooms:{room_a:room,room_b:clone(room)}};
  const toasts=[];
  const overlay={
    style:{},
    capture:new Set(),
    setPointerCapture(id){this.capture.add(id)},
    hasPointerCapture(id){return this.capture.has(id)},
    releasePointerCapture(id){this.capture.delete(id)},
    getBoundingClientRect(){return{left:0,top:0,width:640,height:360}}
  };
  const e=Object.create(WysiwygEditor.prototype);
  Object.assign(e,{
    game:{
      maps,room:{key:'room_a',spec},storyData:{rooms:[spec]},state:{room:0},
      art:{roles:{moths:['m0','m1'],objective:{beacon:'orb_green'},robot_variants:{},creatures:{},mini_robots:{}},regions:{}},
      painter:{spriteScale(_s,n=1){return n}},
      creatures:{units:[]},miniGuides:{units:[]},toast(msg){toasts.push(String(msg))}
    },
    active:true,activeRoomKey:'room_a',tool:'select',choice:{label:'Path'},selection:[],clipboard:null,
    history:new Map(),transaction:null,inspectorEdit:null,overlapCycle:null,showSuppressed:false,showGrid:false,
    pointerDown:false,pointerButton:0,pointerId:null,dragMode:null,dragStart:null,dragNow:null,moveOriginal:null,
    paintVisited:new Set(),hover:{x:0,y:0},nextDecorId:20,status:null,overlay,inspector:null
  });
  e.renderOverlay=()=>{};
  e.updateStatus=()=>{};
  e.buildInspector=()=>{};
  e.rebuildRoom=()=>{};
  e.collectItems=()=>{
    const r=e.rawRoom(),items=[];
    (r.editor_decor||[]).forEach((d,i)=>items.push({type:'decor',id:d.editor_id||`decor:${i}`,index:i,obj:d,bbox:box(d.x-6,d.y-12)}));
    (r.moth_pickups||[]).forEach((m,i)=>items.push({type:'moth',id:m.id,index:i,obj:m,tile:[...m.tile],bbox:box(m.tile[0]*16+2,m.tile[1]*16+2)}));
    for(const obj of e.game.room.spec?.objects||[]){const tile=r.objects?.[obj.object_id];if(tile)items.push({type:'objective',id:obj.object_id,obj,tile:[...tile],bbox:box(tile[0]*16,tile[1]*16)})}
    return items.map(it=>Policy.describe(it));
  };
  return {e,maps,room,toasts,overlay};
}

// Shared movement geometry drives both commit and render, including exact tile snap.
{
  const {e,maps}=fixture();
  const items=e.collectItems(),decor=items.find(x=>x.id==='decor_a'),moth=items.find(x=>x.id==='moth_a');
  e.selection=[decor,moth];
  e.dragStart={x:10,y:10};
  e.moveOriginal=e.captureSelectionState();
  const p={x:33.37,y:19.42};
  const plan=e.movementPlan(p);
  assert.strictEqual(plan.length,2);
  const pd=plan.find(x=>x.state.ref.id==='decor_a'),pt=plan.find(x=>x.state.ref.id==='moth_a');
  assert.strictEqual(pd.kind,'pixel');
  assert.strictEqual(pd.x,123.37);
  assert.strictEqual(pd.y,129.42);
  assert.strictEqual(pt.kind,'tile');
  assert.deepStrictEqual([pt.tx,pt.ty],[3,4]);
  assert(e.applyMove(p));
  const movedDecor=maps.rooms.room_a.editor_decor.find(d=>d.editor_id==='decor_a');
  const movedMoth=maps.rooms.room_a.moth_pickups.find(m=>m.id==='moth_a');
  assert.deepStrictEqual([movedDecor.x,movedDecor.y],[pd.x,pd.y],'pixel commit differs from preview plan');
  assert.deepStrictEqual(movedMoth.tile,[pt.tx,pt.ty],'tile commit differs from preview plan');
  assert.strictEqual(e.selection.length,2,'move lost current selection');
  assert(e.selection.every(ref=>e.collectItems().some(now=>now.type===ref.type&&now.id===ref.id&&now.obj===ref.obj)),'move left stale refs');
  const src=fs.readFileSync(path.join(ROOT,'editor.js'),'utf8');
  assert(src.includes("const plan=this.movementPlan(this.dragNow)"),'render path does not consume shared movement plan');
}

// Multi-tile move preserves relative geometry and persistent identity; group-edge
// clamping applies one common tile delta rather than compressing the selection.
{
  const {e,maps}=fixture();
  const moths=e.collectItems().filter(x=>x.type==='moth');
  e.selection=moths;
  e.dragStart={x:0,y:0};
  e.moveOriginal=e.captureSelectionState();
  let plan=e.movementPlan({x:2000,y:2000});
  assert.strictEqual(plan[0].tdx,plan[1].tdx);
  assert.strictEqual(plan[0].tdy,plan[1].tdy);
  const beforeDelta=[moths[1].tile[0]-moths[0].tile[0],moths[1].tile[1]-moths[0].tile[1]];
  assert(e.applyMove({x:2000,y:2000}));
  const a=maps.rooms.room_a.moth_pickups.find(m=>m.id==='moth_a'),b=maps.rooms.room_a.moth_pickups.find(m=>m.id==='moth_b');
  assert(a&&b,'persistent IDs were lost during multi-move');
  assert.deepStrictEqual([b.tile[0]-a.tile[0],b.tile[1]-a.tile[1]],beforeDelta);
}

// Paste returns/re-resolves all new logical items and makes them immediately selected.
{
  const {e,maps}=fixture();
  const items=e.collectItems();
  e.selection=[items.find(x=>x.id==='decor_a'),items.find(x=>x.id==='moth_a')];
  e.copySelection();
  assert.strictEqual(e.clipboard.items.length,2);
  e.hover={x:300,y:180};
  e.pasteClipboard();
  assert.strictEqual(e.selection.length,2,'pasted logical objects were not selected');
  assert(e.selection.some(x=>x.type==='decor')&&e.selection.some(x=>x.type==='moth'));
  for(const ref of e.selection){
    const current=e.collectItems().find(x=>x.type===ref.type&&x.id===ref.id);
    assert(current,'pasted selection cannot be re-resolved');
    assert.strictEqual(current.obj,ref.obj,'pasted selection contains stale object refs');
  }
  assert.strictEqual(new Set(maps.rooms.room_a.moth_pickups.map(m=>m.id)).size,maps.rooms.room_a.moth_pickups.length,'paste duplicated a persistent moth ID');
}

// Objective copy is explicitly unsupported and never creates an objective clipboard entry.
{
  const {e,toasts}=fixture();
  const items=e.collectItems(),objective=items.find(x=>x.type==='objective'),decor=items.find(x=>x.id==='decor_a');
  e.selection=[objective];
  e.copySelection();
  assert(!e.clipboard,'objective-only Copy created a clipboard');
  assert(toasts.some(t=>t.includes('Objectives cannot be copied')&&t.includes('story + map authority')));

  e.selection=[objective,decor];
  e.copySelection();
  assert.strictEqual(e.clipboard.items.length,1);
  assert(!e.clipboard.items.some(x=>x.type==='objective'));
  assert(toasts.some(t=>t.includes('objective skipped')));
}

// Even a legacy/manually constructed objective clipboard entry fails explicitly
// rather than reaching pasteDataItem and silently doing nothing.
{
  const {e,toasts}=fixture();
  e.clipboard={items:[{type:'objective',kind:'tile',data:{object_id:'objective_a'},tx:8,ty:8}],anchor:{x:136,y:136},persistentRobotCopies:0};
  e.hover={x:200,y:200};
  e.pasteClipboard();
  assert.strictEqual(e.selection.length,0);
  assert(toasts.some(t=>t.includes('Objective clipboard entries cannot be pasted')&&t.includes('story + map authority')));
}

// Alt-cycle stays inside the active scope, follows deterministic ordering, and
// resets after cursor/tool/room changes.
{
  const {e}=fixture();
  const overlap=[
    Policy.describe({type:'decor',id:'decor_low',obj:{sprite:'a'},bbox:box(10,10,30,30)}),
    Policy.describe({type:'procedural-decor',id:'generated:1',obj:{sprite:'b'},bbox:box(10,10,30,30)}),
    Policy.describe({type:'objective',id:'obj_high',obj:{kind:'beacon'},bbox:box(10,10,30,30)}),
    Policy.describe({type:'moth',id:'moth_high',obj:{},bbox:box(10,10,30,30)})
  ];
  e.collectItems=()=>overlap;
  e.tool='select';
  let a=e.cycleAt({x:20,y:20},'select');
  let b=e.cycleAt({x:20,y:20},'select');
  assert.strictEqual(a.type,'procedural-decor');
  assert.strictEqual(b.type,'decor');
  assert(![a,b].some(x=>x.layer==='gameplay'),'SELECT cycle crossed into gameplay scope');

  let reset=e.cycleAt({x:40,y:40},'select');
  assert.strictEqual(reset.type,'procedural-decor');
  assert.strictEqual(e.overlapCycle.index,0,'material cursor move did not reset cycle');

  e.overlay.style={};e.setTool('object');
  assert.strictEqual(e.overlapCycle,null,'tool change did not reset cycle');
  let o1=e.cycleAt({x:20,y:20},'object'),o2=e.cycleAt({x:20,y:20},'object');
  assert.strictEqual(o1.type,'objective');
  assert.strictEqual(o2.type,'moth');
  assert(![o1,o2].some(x=>x.layer!=='gameplay'),'OBJECT cycle crossed scope boundary');

  e.game.room={key:'room_b',spec:e.game.room.spec};
  const roomReset=e.cycleAt({x:20,y:20},'object');
  assert.strictEqual(e.overlapCycle.index,0);
  assert.strictEqual(roomReset.type,'objective');
}

// The actual Alt+pointer gesture uses cycleAt rather than changing ordinary-click behavior.
{
  const {e,overlay}=fixture();
  const overlap=[
    Policy.describe({type:'decor',id:'decor_low',obj:{sprite:'a'},bbox:box(10,10,30,30)}),
    Policy.describe({type:'procedural-decor',id:'generated:1',obj:{sprite:'b'},bbox:box(10,10,30,30)})
  ];
  e.collectItems=()=>overlap;e.tool='select';e.logical=()=>({x:20,y:20});e.activeRoomKey='room_a';
  const ev={button:0,pointerId:4,altKey:true,shiftKey:false,preventDefault(){},stopPropagation(){}};
  e.onDown(ev);
  assert(overlay.capture.has(4));
  assert.strictEqual(e.selection.length,1);
  assert.strictEqual(e.selection[0].id,'generated:1');
  assert.strictEqual(e.overlapCycle.count,2);
}

// An immovable member makes a multi-selection move fail explicitly, not disappear.
{
  const {e,toasts}=fixture();
  const movable=Policy.describe({type:'decor',id:'d',bbox:box(10,10,20,20)});
  const fixed=Policy.describe({type:'procedural-decor',id:'p',bbox:box(10,10,20,20)});
  e.selection=[movable,fixed];e.tool='move';e.logical=()=>({x:15,y:15});e.activeRoomKey='room_a';
  e.onDown({button:0,pointerId:9,altKey:false,shiftKey:false,preventDefault(){},stopPropagation(){}});
  assert(toasts.some(t=>t.includes('Move refused')&&t.includes('immovable')));
  assert.strictEqual(e.transaction,null);
}

console.log('EDITOR MOVE/COPY/CYCLE REGRESSION 4.15 PASS');
console.log('  truthful movement, paste selection, explicit objective-copy refusal and scoped Alt-cycle validated');
