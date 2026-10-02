'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '../..');
require('../../procedural_decor.js');
require('../../editor_identity.js');
require('../../editor.js');

const WysiwygEditor = globalThis.WysiwygEditor;
const Policy = globalThis.RelayEditorPolicy;
const mapsFixture = JSON.parse(fs.readFileSync(path.join(ROOT,'relay_moth_maps.json'),'utf8'));
const storyFixture = JSON.parse(fs.readFileSync(path.join(ROOT,'relay_moth_story.json'),'utf8'));
const clone = value => JSON.parse(JSON.stringify(value));

globalThis.document = {
  querySelector(){return null},
  querySelectorAll(){return []},
  body:{classList:{toggle(){},remove(){},contains(){return false}}}
};

function makeEditor(roomKey='quiet_nest'){
  const maps=clone(mapsFixture);
  const spec=clone(storyFixture.rooms.find(r=>r.key===roomKey));
  const raw=maps.rooms[roomKey];
  const runtime={
    key:roomKey,index:spec.index,spec,
    walls:new Set((raw.walls||[]).map(p=>p.join(','))),
    water:new Set((raw.water||[]).map(p=>p.join(','))),
    paths:new Set((raw.path_cells||[]).map(p=>p.join(','))),
    border:new Set(),decorExclusions:new Set((raw.decor_exclusions||[]).map(p=>p.join(','))),
    bridgeCells:new Set((raw.bridge_cells||[]).map(p=>p.join(','))),bridgeIsland:raw.bridge_island||[],
    foliageDensity:raw.foliage_density||1,
    center(t){return[t[0]*16+8,t[1]*16+8]}
  };
  const toasts=[];
  const e=Object.create(WysiwygEditor.prototype);
  Object.assign(e,{
    game:{
      maps,room:runtime,rooms:[runtime],storyData:{rooms:[spec]},state:{room:0,roomComplete(){return false}},
      art:{
        roles:{objective:{lamp:'lamp_blue',lantern:'lamp_blue',rivet:'orb_cyan',pip:'robot_warm',beacon:'orb_green',bell:'orb_cyan',star:'orb_cyan',dawn:'orb_orange'},moths:[],creatures:{},mini_robots:{},decor_plants:['foliage_v391_19'],foliage_mix:[]},
        regions:{lamp_blue:[0,0,16,24],orb_cyan:[0,0,16,16],robot_warm:[0,0,16,16],orb_green:[0,0,16,16],orb_orange:[0,0,16,16],swirl_large:[0,0,32,32],foliage_v391_19:[0,0,16,24]},
        worldSize(name,scale=1){const r=this.regions[name]||[0,0,16,16];return[r[2]*scale,r[3]*scale]},
        draw(){}
      },
      painter:{spriteScale(_s,n=1){return n}},
      creatures:{units:[]},miniGuides:{units:[]},
      toast(msg){toasts.push(String(msg))}
    },
    active:true,tool:'object',category:'tiles',choice:null,showSuppressed:false,showGrid:false,
    activeRoomKey:roomKey,selection:[],clipboard:null,history:new Map(),transaction:null,
    pointerDown:false,pointerButton:0,pointerId:null,dragMode:null,dragStart:null,dragNow:null,moveOriginal:null,
    paintVisited:new Set(),hover:{x:16,y:16},nextDecorId:900,status:null,overlay:null
  });
  e.updateStatus=()=>{};
  e.renderOverlay=()=>{};
  e.rebuildRoom=()=>{};
  return {e,maps,raw,spec,runtime,toasts};
}

// Explicit objective visual hide/show never alters objective placement or story authority.
{
  const {e,raw,spec,toasts}=makeEditor('quiet_nest');
  const id=spec.objects[0].object_id;
  const placement=clone(raw.objects[id]);
  const storyBefore=JSON.stringify(spec.objects);
  e.selection=[{type:'objective',id,obj:spec.objects[0],tile:[...placement],hiddenVisual:false}];
  e.toggleObjectiveVisual();
  assert((raw.object_fx_hidden||[]).includes(id));
  assert.deepStrictEqual(raw.objects[id],placement);
  assert.strictEqual(JSON.stringify(spec.objects),storyBefore);
  assert(toasts.some(t=>t.includes('gameplay unchanged')));

  e.selection=[{type:'objective',id,obj:spec.objects[0],tile:[...placement],hiddenVisual:true}];
  e.toggleObjectiveVisual();
  assert(!(raw.object_fx_hidden||[]).includes(id));
  assert.deepStrictEqual(raw.objects[id],placement);
}

// Hidden objectives remain logical OBJECT refs and source rendering labels them explicitly.
{
  const {e,raw,spec}=makeEditor('quiet_nest');
  const id=spec.objects[0].object_id;
  raw.object_fx_hidden=[id];
  const obj=e.collectItems().find(it=>it.type==='objective'&&it.id===id);
  assert(obj,'hidden objective disappeared from editor enumeration');
  assert.strictEqual(obj.hiddenVisual,true);
  assert.strictEqual(Policy.allows(obj,'object'),true);
  assert.strictEqual(Policy.allows(obj,'move'),true);
  const editorSrc=fs.readFileSync(path.join(ROOT,'editor.js'),'utf8');
  assert(editorSrc.includes("[VISUAL HIDDEN]"));
}

// SHOW SUPPRESSED describes and restores a pattern exclusion, including records whose
// conditional pattern visual is not currently active.
{
  const {e,raw}=makeEditor('quiet_nest');
  raw.pattern_exclusions=['nest:swirl','legacy:unknown'];
  e.showSuppressed=true;
  const suppressed=e.patternItems(raw,true).filter(it=>it.type==='suppressed-pattern');
  assert(suppressed.some(it=>it.id==='nest:swirl'));
  assert(suppressed.some(it=>it.id==='legacy:unknown'),'unrendered exclusion lacks recovery handle');
  e.selection=[suppressed.find(it=>it.id==='nest:swirl')];
  e.restoreSelectedSuppressed();
  assert(!raw.pattern_exclusions.includes('nest:swirl'));
  assert(raw.pattern_exclusions.includes('legacy:unknown'));
}

// Every decor exclusion is represented when SHOW SUPPRESSED is enabled and can be
// restored even if there is no current generated descriptor for that tile.
{
  const {e,raw}=makeEditor('quiet_nest');
  raw.decor_exclusions=[[3,3]];
  e.game.room.decorExclusions=new Set(['3,3']);
  e.showSuppressed=true;
  const item=e.collectItems().find(it=>it.type==='suppressed-decor-tile'&&it.tile?.[0]===3&&it.tile?.[1]===3);
  assert(item,'tile-only decor exclusion lacks recovery handle');
  e.selection=[item];
  e.restoreSelectedSuppressed();
  assert(!(raw.decor_exclusions||[]).some(p=>p[0]===3&&p[1]===3));
}

// Converting generated decor is one atomic transaction: suppress original + create
// visually equivalent authored item, then undo/redo restores both sides together.
{
  const {e,raw}=makeEditor('quiet_nest');
  raw.decor_exclusions=[];
  raw.editor_decor=raw.editor_decor||[];
  const generated={
    id:'generated:quiet_nest:999',tile:[12,8],x:201,y:151,sprite:'foliage_v391_19',
    scale:.82,alpha:.91,flip:true,element:'far_forest',tintIndex:180,tintStrength:.13,source:'procedural'
  };
  e.selection=[{type:'procedural-decor',id:generated.id,obj:generated,tile:[...generated.tile],bbox:{x0:190,y0:125,x1:212,y1:152}}];
  e.collectItems=()=>[
    ...raw.editor_decor.map(d=>({type:'decor',id:d.editor_id,obj:d,bbox:{x0:d.x-8,y0:d.y-16,x1:d.x+8,y1:d.y}}))
  ];
  const before=JSON.stringify(raw);
  e.convertProceduralSelection();
  assert((raw.decor_exclusions||[]).some(p=>p[0]===12&&p[1]===8));
  assert.strictEqual(raw.editor_decor.length,1);
  const authored=raw.editor_decor[0];
  for(const field of ['x','y','sprite','scale','alpha','flip','element'])assert.deepStrictEqual(authored[field],generated[field],field);
  assert.strictEqual(authored.tint_index,180);
  assert.strictEqual(authored.tint_strength,.13);
  assert.strictEqual(e.historyFor('quiet_nest').undo.length,1);

  e.undoOne();
  assert.strictEqual(JSON.stringify(e.game.maps.rooms.quiet_nest),before,'conversion undo did not restore both sides atomically');
  e.redoOne();
  assert.strictEqual(e.game.maps.rooms.quiet_nest.editor_decor.length,1);
  assert(e.game.maps.rooms.quiet_nest.decor_exclusions.some(p=>p[0]===12&&p[1]===8));
}

// Generic Delete and a bare right-click on an objective never alter objective
// authority/visibility and provide explicit feedback instead.
{
  const {e,raw,spec,toasts}=makeEditor('quiet_nest');
  const id=spec.objects[0].object_id,placement=clone(raw.objects[id]);
  raw.object_fx_hidden=[];
  e.selection=[Policy.describe({type:'objective',id,obj:spec.objects[0],tile:[...placement],bbox:{x0:0,y0:0,x1:20,y1:20}})];
  e.deleteSelection();
  assert.deepStrictEqual(raw.objects[id],placement);
  assert.deepStrictEqual(raw.object_fx_hidden,[]);
  assert(toasts.some(t=>t.includes('use HIDE VISUAL')));

  e.hitAt=(_p,scope)=>scope==='object'?e.selection[0]:null;
  e.eraseAt({x:8,y:8},'right-click');
  assert.deepStrictEqual(raw.objects[id],placement);
  assert.deepStrictEqual(raw.object_fx_hidden,[]);
  assert(toasts.filter(t=>t.includes('use HIDE VISUAL')).length>=2);
}

// Moving a hidden objective no longer acts as an accidental restore mechanism.
{
  const src=fs.readFileSync(path.join(ROOT,'editor.js'),'utf8');
  assert(!src.includes("r.object_fx_hidden=(r.object_fx_hidden||[]).filter(id=>id!==c.data.object_id)"));
  assert(src.includes("Objective is protected; use HIDE VISUAL."));
  assert(src.includes("CONVERT TO AUTHORED")||fs.readFileSync(path.join(ROOT,'index.html'),'utf8').includes("CONVERT TO AUTHORED"));
}

console.log('EDITOR SUPPRESSION/VISIBILITY REGRESSION 4.15 PASS');
console.log('  objective visibility, suppressed recovery, conversion atomicity and protected generic actions validated');
