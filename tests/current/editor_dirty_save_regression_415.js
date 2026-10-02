'use strict';

const assert=require('assert');
const fs=require('fs');
const path=require('path');
const ROOT=path.resolve(__dirname,'../..');
const Validation=require('../../editor_validation.js');
require('../../procedural_decor.js');
require('../../editor_identity.js');
require('../../editor.js');

const WysiwygEditor=globalThis.WysiwygEditor;
const maps0=JSON.parse(fs.readFileSync(path.join(ROOT,'relay_moth_maps.json'),'utf8'));
const story=JSON.parse(fs.readFileSync(path.join(ROOT,'relay_moth_story.json'),'utf8'));
const atlas=JSON.parse(fs.readFileSync(path.join(ROOT,'hd_remake_atlas.json'),'utf8'));
const clone=v=>JSON.parse(JSON.stringify(v));

const nodes={
  '#editorSave':{textContent:'SAVE TO PROJECT'},
  '#editorDownload':{textContent:'DOWNLOAD JSON'}
};
globalThis.document={
  querySelector(sel){return nodes[sel]||null},
  querySelectorAll(){return[]},
  createElement(){return{className:'',textContent:'',children:[],append(...xs){this.children.push(...xs)},classList:{toggle(){},add(){},remove(){}}}},
  body:{classList:{toggle(){},remove(){},contains(){return false}}}
};

function fixture(){
  const maps=clone(maps0),roomKey=story.rooms[0].key,toasts=[];
  const e=Object.create(WysiwygEditor.prototype);
  Object.assign(e,{
    game:{
      maps,storyData:story,room:{key:roomKey},state:{room:0},
      art:{roles:atlas.roles||{},regions:atlas.regions||{}},
      toast(msg){toasts.push(String(msg))}
    },
    active:true,activeRoomKey:roomKey,selection:[],clipboard:null,history:new Map(),
    transaction:null,inspectorEdit:null,overlapCycle:null,pointerDown:false,pointerId:null,dragMode:null,
    dragStart:null,dragNow:null,moveOriginal:null,paintVisited:new Set(),showSuppressed:false,showGrid:false,
    tool:'select',choice:{label:'Path'},status:null,inspector:null,validationState:null,diagnosticsPanel:null,diagnostics:null,
    validationReferenceMaps:clone(maps),savedBaseline:Validation.snapshot(maps),validationCache:null,
    pendingPersistenceOverride:null,lastSavedAt:null
  });
  e.renderOverlay=()=>{};
  e.updateActionButtons=()=>{};
  e.buildInspector=()=>{};
  e.rebuildRoom=()=>{e.updateStatus()};
  return{e,maps,toasts,roomKey};
}

// Initial load is clean; edit/undo/redo follows exact saved-baseline content.
{
  const {e,maps,roomKey}=fixture();
  assert.strictEqual(e.dirtyInfo().project,false);
  assert.strictEqual(e.dirtyInfo().room,false);

  e.beginTransaction('dirty test');
  const before=maps.rooms[roomKey].foliage_density??1;
  maps.rooms[roomKey].foliage_density=before+.125;
  e.commitTransaction();
  assert.strictEqual(e.dirtyInfo().project,true);
  assert.strictEqual(e.dirtyInfo().room,true);

  assert(e.undoOne());
  assert.strictEqual(e.dirtyInfo().project,false,'Undo to saved snapshot must clear dirty state');
  assert.strictEqual(e.dirtyInfo().room,false);

  assert(e.redoOne());
  assert.strictEqual(e.dirtyInfo().project,true,'Redo away from baseline must restore dirty state');

  e.markSavedBaseline('save');
  assert.strictEqual(e.dirtyInfo().project,false,'successful baseline mark must be clean');
}

// beforeunload warns only for destructive page navigation while project data is dirty.
{
  const {e,maps,roomKey}=fixture();
  const clean={prevented:false,returnValue:null,preventDefault(){this.prevented=true}};
  assert.strictEqual(e.onBeforeUnload(clean),undefined);
  assert.strictEqual(clean.prevented,false);

  maps.rooms[roomKey].foliage_density=(maps.rooms[roomKey].foliage_density??1)+.2;
  const dirty={prevented:false,returnValue:null,preventDefault(){this.prevented=true}};
  assert.strictEqual(e.onBeforeUnload(dirty),'');
  assert.strictEqual(dirty.prevented,true);
  assert.strictEqual(dirty.returnValue,'');
}

// Validation errors block the first local-save attempt and expose an explicit,
// signature-bound SAVE ANYWAY second step.
{
  const {e,maps}=fixture();
  const moths=[];
  for(const [roomKey,room] of Object.entries(maps.rooms))for(const m of room.moth_pickups||[])moths.push({roomKey,m});
  assert(moths.length>=2);
  moths[1].m.id=moths[0].m.id;

  assert.strictEqual(e.preparePersistence('save'),false);
  assert(e.pendingPersistenceOverride);
  assert.strictEqual(nodes['#editorSave'].textContent,'SAVE ANYWAY');
  assert(e.lastDiagnosticsShown.some(d=>d.code==='DUPLICATE_MOTH_ID'));
  assert.strictEqual(e.preparePersistence('save'),true,'explicit second SAVE ANYWAY must proceed');

  // Changing data invalidates the prior override token.
  maps.rooms[moths[1].roomKey].foliage_density=(maps.rooms[moths[1].roomKey].foliage_density??1)+.01;
  e.updateValidationChrome();
  assert.strictEqual(e.pendingPersistenceOverride,null);
  assert.strictEqual(nodes['#editorSave'].textContent,'SAVE TO PROJECT');
  assert.strictEqual(e.preparePersistence('save'),false,'changed data must require a fresh explicit override');
}

// Hosted download uses the same validator gate and explicit DOWNLOAD ANYWAY override.
{
  const {e,maps}=fixture();
  const sp=story.rooms.find(r=>r.objects?.length),id=sp.objects[0].object_id;
  delete maps.rooms[sp.key].objects[id];
  assert.strictEqual(e.preparePersistence('download'),false);
  assert.strictEqual(nodes['#editorDownload'].textContent,'DOWNLOAD ANYWAY');
  assert(e.lastDiagnosticsShown.some(d=>d.code==='MISSING_OBJECTIVE_PLACEMENT'));
  assert.strictEqual(e.preparePersistence('download'),true);
}

// Warnings are visible but do not block Save/Download.
{
  const {e,maps}=fixture();
  maps.rooms.tin_stream.bridge_island=[...(maps.rooms.tin_stream.bridge_island||[]),[1,1]];
  const state=e.currentValidation(true);
  assert.strictEqual(state.summary.errors,0);
  assert(state.diagnostics.some(d=>d.code==='TIN_STREAM_BRIDGE_GEOMETRY_CHANGED'));
  assert.strictEqual(e.preparePersistence('save'),true);
  assert.strictEqual(e.preparePersistence('download'),true);
}

// An exported baseline is trustworthy: mark clean, then a new edit is dirty again.
{
  const {e,maps,roomKey}=fixture();
  maps.rooms[roomKey].foliage_density=(maps.rooms[roomKey].foliage_density??1)+.3;
  assert(e.dirtyInfo().project);
  e.markSavedBaseline('download');
  assert.strictEqual(e.dirtyInfo().project,false);
  maps.rooms[roomKey].foliage_density+=.1;
  assert.strictEqual(e.dirtyInfo().project,true);
}

console.log('EDITOR DIRTY/SAVE REGRESSION 4.15 PASS');
console.log('  clean/dirty undo-redo baseline, beforeunload, shared validation gates and explicit overrides validated');
