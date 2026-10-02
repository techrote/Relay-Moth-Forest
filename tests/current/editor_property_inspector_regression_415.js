'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '../..');
require('../../procedural_decor.js');
require('../../editor_identity.js');
require('../../editor.js');

const WysiwygEditor = globalThis.WysiwygEditor;
assert(WysiwygEditor, 'WysiwygEditor export missing');

class FakeElement {
  constructor(tag='div'){
    this.tagName=String(tag).toUpperCase();
    this.children=[];
    this.dataset={};
    this.listeners={};
    this.className='';
    this.textContent='';
    this.value='';
    this.checked=false;
    this.readOnly=false;
    this.disabled=false;
    this.type='';
    this.tabIndex=0;
    this.min='';this.max='';this.step='';
    this.classList={toggle(){},add(){},remove(){},contains(){return false}};
  }
  append(...nodes){this.children.push(...nodes)}
  addEventListener(type,fn){(this.listeners[type]??=[]).push(fn)}
  blur(){for(const fn of this.listeners.blur||[])fn({target:this})}
  set innerHTML(_v){this.children=[]}
  get innerHTML(){return''}
}
const fakeDocument={
  createElement(tag){return new FakeElement(tag)},
  querySelector(){return null},
  querySelectorAll(){return[]},
  body:{classList:{toggle(){},remove(){},contains(){return false}}}
};
globalThis.document=fakeDocument;

const clone=v=>JSON.parse(JSON.stringify(v));
function fixture(){
  const room={
    editor_decor:[{editor_id:'decor_1',sprite:'bush_blue',x:100,y:120,scale:1.2,rot:.2,flip:true,alpha:.8,element:'far_forest',tint_strength:.12}],
    grass_clumps:[{x:130,y:140,radius:22,density:1.25,seed:123}],
    decor_lamps:[{tile:[4,5],lamp:'lamp_blue',base:'orb_pillar'}],
    decor_robots:[{id:'moss_bot',tile:[6,7],variant:'ivy',facing:'right',name:'Moss Bot'}],
    moth_pickups:[{id:'moth_test',tile:[8,9],variant:2,colour_index:77}],
    creature_groups:[{id:'wild_test',spawn:[10,11],kind:'rabbit',count:4,seed:456}],
    mini_robot_groups:[{id:'mini_test',spawn:[12,13],variant:'teal',count:3,seed:789,requires:'pip'}],
    objects:{obj_test:[14,15]},
    object_fx_hidden:[],decor_exclusions:[],pattern_exclusions:[],
    walls:[],water:[],path_cells:[],large_trees:[],blocker_styles:{}
  };
  const spec={key:'test_room',index:0,pattern:'none',objects:[{object_id:'obj_test',kind:'lamp',label:'Test objective'}]};
  const maps={rooms:{test_room:room}};
  const toasts=[];
  const e=Object.create(WysiwygEditor.prototype);
  Object.assign(e,{
    game:{maps,room:{key:'test_room',spec},storyData:{rooms:[spec]},state:{room:0},toast(msg){toasts.push(String(msg))}},
    active:true,tool:'select',choice:{label:'Path'},category:'tiles',activeRoomKey:'test_room',
    selection:[],clipboard:null,history:new Map(),transaction:null,inspectorEdit:null,
    showSuppressed:true,showGrid:true,nextDecorId:40,paintVisited:new Set(),
    pointerDown:false,pointerButton:0,pointerId:null,dragMode:null,dragStart:null,dragNow:null,moveOriginal:null,
    hover:{x:0,y:0},status:null,overlay:null,inspector:new FakeElement('div')
  });
  e.renderOverlay=()=>{};
  e.updateStatus=()=>{};
  e.rebuildRoom=()=>{};
  e.refreshSelection=()=>{};
  return {e,maps,room,spec,toasts};
}
const refs=room=>({
  decor:{type:'decor',id:'decor_1',index:0,obj:room.editor_decor[0]},
  grass:{type:'grass',id:'grass:0',index:0,obj:room.grass_clumps[0]},
  lamp:{type:'lamp',id:'lamp:0',index:0,obj:room.decor_lamps[0],tile:[4,5]},
  robot:{type:'robot',id:'moss_bot',index:0,obj:room.decor_robots[0],tile:[6,7]},
  moth:{type:'moth',id:'moth_test',index:0,obj:room.moth_pickups[0],tile:[8,9]},
  wildlife:{type:'wildlife',id:'wild_test',index:0,obj:room.creature_groups[0],tile:[10,11]},
  mini:{type:'mini',id:'mini_test',index:0,obj:room.mini_robot_groups[0],tile:[12,13]},
  objective:{type:'objective',id:'obj_test',obj:{object_id:'obj_test',kind:'lamp',label:'Test objective'},tile:[14,15],hiddenVisual:false},
  procedural:{type:'procedural-decor',id:'generated:test_room:1',obj:{id:'generated:test_room:1',tile:[16,10],x:266,y:174,sprite:'foliage_v391_19',scale:1,alpha:.92,flip:false,element:'far_forest'},tile:[16,10]},
  suppressed:{type:'suppressed-pattern',id:'none:legacy',obj:{label:'Legacy hidden'},suppressed:true}
});
function flatten(el){
  const out=[el];
  for(const c of el.children||[])out.push(...flatten(c));
  return out;
}
function fieldKeys(e,ref){
  e.selection=[ref];
  e.inspector=new FakeElement('div');
  e.buildInspector();
  return flatten(e.inspector).map(x=>x.dataset?.editorProperty).filter(Boolean);
}

// Selecting each major authoring type produces its typed DOM controls.
{
  const {e,room}=fixture(),r=refs(room);
  const expected={
    decor:['sprite','x','y','scale','rot','flip','alpha','element','tint_strength'],
    grass:['x','y','radius','density','seed'],
    lamp:['tile_x','tile_y','lamp','base'],
    robot:['id','tile_x','tile_y','variant','facing','name'],
    moth:['id','tile_x','tile_y','variant','colour_index'],
    wildlife:['id','spawn_x','spawn_y','kind','count','seed'],
    mini:['id','spawn_x','spawn_y','variant','count','seed','requires'],
    objective:['object_id','kind','story_label','tile_x','tile_y','visual_visible'],
    procedural:['source','sprite','tile','position'],
    suppressed:['source','identity']
  };
  for(const [name,keys] of Object.entries(expected)){
    const got=fieldKeys(e,r[name]);
    for(const key of keys)assert(got.includes(key),`${name} inspector missing ${key}`);
  }
}

// Read-only persistent/story identities are visibly read-only and cannot be mutated.
{
  const {e,room}=fixture(),r=refs(room);
  const robot=e.inspectorModel(r.robot),objective=e.inspectorModel(r.objective);
  assert(robot.fields.find(f=>f.key==='id')?.readOnly);
  assert(objective.fields.find(f=>f.key==='object_id')?.readOnly);
  assert(objective.fields.find(f=>f.key==='kind')?.readOnly);
  assert(objective.fields.find(f=>f.key==='story_label')?.readOnly);
  const beforeRobot=room.decor_robots[0].id;
  e.selection=[r.robot];
  assert.strictEqual(e.applyInspectorProperty(e.inspectorRefKey(r.robot),'id','changed'),false);
  assert.strictEqual(room.decor_robots[0].id,beforeRobot);
  e.selection=[r.objective];
  assert.strictEqual(e.applyInspectorProperty(e.inspectorRefKey(r.objective),'object_id','changed'),false);
  assert(room.objects.obj_test);
}

// A property edit is one transaction; Undo restores its exact prior value.
{
  const {e,maps,room}=fixture(),r=refs(room),key=e.inspectorRefKey(r.decor);
  e.selection=[r.decor];
  e.beginInspectorEdit(key,'x');
  assert(e.applyInspectorProperty(key,'x','222.5'));
  e.commitInspectorEdit();
  assert.strictEqual(maps.rooms.test_room.editor_decor[0].x,222.5);
  assert.strictEqual(e.historyFor('test_room').undo.length,1);
  assert(e.undoOne());
  assert.strictEqual(maps.rooms.test_room.editor_decor[0].x,100);
}

// Escape through the editor's capture-phase key owner cancels an active field edit.
{
  const {e,maps,room}=fixture(),r=refs(room),key=e.inspectorRefKey(r.grass);
  e.selection=[r.grass];
  e.beginInspectorEdit(key,'density');
  e.applyInspectorProperty(key,'density','5.5');
  assert.strictEqual(maps.rooms.test_room.grass_clumps[0].density,5.5);
  const target=new FakeElement('input');target.dataset.editorProperty='density';
  const ev={key:'Escape',target,prevented:false,stopped:false,preventDefault(){this.prevented=true},stopImmediatePropagation(){this.stopped=true}};
  e.onKey(ev);
  assert(ev.prevented&&ev.stopped);
  assert.strictEqual(maps.rooms.test_room.grass_clumps[0].density,1.25);
  assert.strictEqual(e.historyFor('test_room').undo.length,0);
}

// Primitive ranges clamp deterministically.
{
  const {e,room,maps}=fixture(),r=refs(room);
  e.selection=[r.decor];e.applyInspectorProperty(e.inspectorRefKey(r.decor),'alpha','9');assert.strictEqual(maps.rooms.test_room.editor_decor[0].alpha,1);
  e.applyInspectorProperty(e.inspectorRefKey(r.decor),'scale','-4');assert.strictEqual(maps.rooms.test_room.editor_decor[0].scale,.05);
  e.selection=[r.moth];e.applyInspectorProperty(e.inspectorRefKey(r.moth),'colour_index','999');assert.strictEqual(maps.rooms.test_room.moth_pickups[0].colour_index,255);
  e.selection=[r.wildlife];e.applyInspectorProperty(e.inspectorRefKey(r.wildlife),'count','-8');assert.strictEqual(maps.rooms.test_room.creature_groups[0].count,0);
  e.selection=[r.objective];e.applyInspectorProperty(e.inspectorRefKey(r.objective),'tile_x','-99');assert.strictEqual(maps.rooms.test_room.objects.obj_test[0],0);
}

// Objective visibility uses the explicit E415-05 suppression semantics.
{
  const {e,room,maps}=fixture(),r=refs(room),key=e.inspectorRefKey(r.objective);
  e.selection=[r.objective];
  e.applyInspectorProperty(key,'visual_visible',false);
  assert(maps.rooms.test_room.object_fx_hidden.includes('obj_test'));
  e.applyInspectorProperty(key,'visual_visible',true);
  assert(!maps.rooms.test_room.object_fx_hidden.includes('obj_test'));
  assert(maps.rooms.test_room.objects.obj_test,'objective placement was removed');
}

// Inspector procedural conversion invokes the existing atomic E415-05 operation.
{
  const {e,room,maps}=fixture(),r=refs(room);
  e.selection=[r.procedural];
  e.collectItems=()=>maps.rooms.test_room.editor_decor.map((d,i)=>({type:'decor',id:d.editor_id||`decor:${i}`,obj:d}));
  e.inspectorAction('convert-procedural');
  assert(maps.rooms.test_room.decor_exclusions.some(p=>p[0]===16&&p[1]===10));
  assert(maps.rooms.test_room.editor_decor.some(d=>d.sprite==='foliage_v391_19'&&d.x===266&&d.y===174));
  assert.strictEqual(e.historyFor('test_room').undo.length,1);
}

// Multi-selection exposes a summary only; no unsafe mixed fields are generated.
{
  const {e,room}=fixture(),r=refs(room);
  e.selection=[r.decor,r.robot,r.moth];
  e.inspector=new FakeElement('div');
  e.buildInspector();
  const all=flatten(e.inspector);
  assert.strictEqual(all.filter(x=>x.dataset?.editorProperty).length,0);
  assert(all.some(x=>String(x.textContent).includes('mixed properties are not edited')));
}

// DOM/input ownership contract: inspector is above canvas, pointer-enabled, and shielded.
{
  const html=fs.readFileSync(path.join(ROOT,'index.html'),'utf8');
  const css=fs.readFileSync(path.join(ROOT,'style.css'),'utf8');
  const src=fs.readFileSync(path.join(ROOT,'editor.js'),'utf8');
  assert(html.includes('id="editorInspector"')&&html.includes('id="editorInspectorBody"'));
  assert(css.includes('#editorInspector{')&&css.includes('pointer-events:auto;touch-action:auto;z-index:107'));
  assert(src.includes('for(const ui of [this.toolbar,this.palettePanel,this.inspectorPanel,this.diagnosticsPanel])'));
  assert(src.includes("b.type='button'")||src.includes("b.type='button';"));
  assert(src.includes('dataset.editorProperty'));
}

console.log('EDITOR PROPERTY INSPECTOR REGRESSION 4.15 PASS');
console.log('  typed DOM models, read-only IDs, atomic edit/undo/cancel, clamping and E415-05 actions validated');
