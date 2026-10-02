'use strict';

const assert = require('assert');
require('../../editor.js');

const WysiwygEditor = globalThis.WysiwygEditor;
assert(WysiwygEditor, 'WysiwygEditor should be exported for behavior regressions');

function classList(){
  const values = new Set();
  return {
    toggle(name,on){if(on===undefined){values.has(name)?values.delete(name):values.add(name)}else if(on)values.add(name);else values.delete(name)},
    add(name){values.add(name)},
    remove(name){values.delete(name)},
    contains(name){return values.has(name)}
  };
}
globalThis.document = {
  body:{classList:classList()},
  querySelector(){return null},
  querySelectorAll(){return []}
};

function makeEditor(){
  const capture = new Set();
  const game = {
    maps:{rooms:{
      quiet_nest:{value:0,editor_decor:[{editor_id:'a',x:10,y:20,sprite:'x'}]},
      tin_stream:{value:100,editor_decor:[{editor_id:'b',x:30,y:40,sprite:'x'}]}
    }},
    room:{key:'quiet_nest'},
    storyData:{rooms:[{key:'quiet_nest'},{key:'tin_stream'}]},
    state:{room:0},
    toast(){},
  };
  const e = Object.create(WysiwygEditor.prototype);
  Object.assign(e,{
    game,active:true,tool:'brush',category:'tiles',choice:{kind:'path',label:'Path'},
    overlay:{
      style:{},classList:classList(),
      setPointerCapture(id){capture.add(id)},
      hasPointerCapture(id){return capture.has(id)},
      releasePointerCapture(id){capture.delete(id)},
      getBoundingClientRect(){return {left:0,top:0,width:640,height:360}}
    },
    panel:{classList:classList()},
    history:new Map(),transaction:null,activeRoomKey:'quiet_nest',
    pointerDown:false,pointerButton:0,pointerId:null,dragMode:null,dragStart:null,dragNow:null,moveOriginal:null,
    selection:[],clipboard:null,paintVisited:new Set(),hover:{x:16,y:16},showGrid:true,nextDecorId:1
  });
  e.renderOverlay=()=>{};
  e.updateStatus=()=>{};
  e.rebuildRoom=()=>{};
  e.recountIds=()=>{};
  e.buildPalette=()=>{};
  return {e,game,capture};
}
const event = (extra={}) => ({
  pointerId:7,clientX:16,clientY:16,button:0,key:'',
  preventDefault(){this.prevented=true},
  stopPropagation(){this.stopped=true},
  stopImmediatePropagation(){this.immediate=true},
  ...extra
});

// Per-room history cannot cross-write rooms and redo is exact.
{
  const {e,game}=makeEditor();
  e.beginTransaction('quiet edit');
  game.maps.rooms.quiet_nest.value=1;
  assert(e.commitTransaction());
  assert.strictEqual(e.historyFor('quiet_nest').undo.length,1);

  e.beforeRoomChange();
  game.room={key:'tin_stream'}; game.state.room=1;
  e.onRoomChanged();
  const quietAfterCommit=JSON.stringify(game.maps.rooms.quiet_nest);
  const tinBefore=JSON.stringify(game.maps.rooms.tin_stream);
  assert.strictEqual(e.undoOne(),false,'Tin Stream must not see Quiet Nest history');
  assert.strictEqual(JSON.stringify(game.maps.rooms.tin_stream),tinBefore);
  assert.strictEqual(JSON.stringify(game.maps.rooms.quiet_nest),quietAfterCommit);

  e.beginTransaction('tin edit');
  game.maps.rooms.tin_stream.value=101;
  e.commitTransaction();
  assert(e.undoOne());
  assert.strictEqual(game.maps.rooms.tin_stream.value,100);
  assert.strictEqual(game.maps.rooms.quiet_nest.value,1);
  assert(e.redoOne());
  assert.strictEqual(game.maps.rooms.tin_stream.value,101);

  e.beforeRoomChange();
  game.room={key:'quiet_nest'}; game.state.room=0;
  e.onRoomChanged();
  assert(e.undoOne());
  assert.strictEqual(game.maps.rooms.quiet_nest.value,0);
  assert.strictEqual(game.maps.rooms.tin_stream.value,101);
  assert(e.redoOne());
  assert.strictEqual(game.maps.rooms.quiet_nest.value,1);
}

// An in-flight transaction is restored before a room switch and stale selection/capture is cleared.
{
  const {e,game,capture}=makeEditor();
  const before=JSON.stringify(game.maps.rooms.quiet_nest);
  e.beginTransaction('partial');
  game.maps.rooms.quiet_nest.value=9;
  e.selection=[{type:'decor',id:'a'}];
  e.pointerDown=true;e.pointerId=7;e.dragMode='paint';capture.add(7);
  e.beforeRoomChange();
  assert.strictEqual(JSON.stringify(game.maps.rooms.quiet_nest),before);
  assert.strictEqual(e.transaction,null);
  assert.deepStrictEqual(e.selection,[]);
  assert.strictEqual(e.pointerDown,false);
  assert.strictEqual(e.dragMode,null);
  assert(!capture.has(7));
  game.room={key:'tin_stream'};game.state.room=1;e.onRoomChanged();
  assert.strictEqual(e.activeRoomKey,'tin_stream');
}

// pointercancel during paint restores byte-equivalent room state and releases all gesture state.
{
  const {e,game,capture}=makeEditor();
  const before=JSON.stringify(game.maps.rooms.quiet_nest);
  e.beginTransaction('paint');
  game.maps.rooms.quiet_nest.value=55;
  e.pointerDown=true;e.pointerId=7;e.dragMode='paint';e.dragStart={x:1,y:1};e.dragNow={x:2,y:2};capture.add(7);
  e.onCancel(event());
  assert.strictEqual(JSON.stringify(game.maps.rooms.quiet_nest),before);
  assert.strictEqual(e.transaction,null);
  assert.strictEqual(e.pointerDown,false);
  assert.strictEqual(e.pointerId,null);
  assert.strictEqual(e.dragMode,null);
  assert.strictEqual(e.dragStart,null);
  assert.strictEqual(e.dragNow,null);
  assert(!capture.has(7));
}

// pointercancel during move restores the original item position.
{
  const {e,game,capture}=makeEditor();
  const before=JSON.stringify(game.maps.rooms.quiet_nest.editor_decor);
  e.beginTransaction('move selection');
  game.maps.rooms.quiet_nest.editor_decor[0].x=77;
  game.maps.rooms.quiet_nest.editor_decor[0].y=88;
  e.pointerDown=true;e.pointerId=7;e.dragMode='move';e.moveOriginal=[{x:10,y:20}];capture.add(7);
  e.onCancel(event());
  assert.strictEqual(JSON.stringify(game.maps.rooms.quiet_nest.editor_decor),before);
  assert.strictEqual(e.moveOriginal,null);
  assert(!capture.has(7));
}

// Escape during a captured gesture cancels, restores and releases capture/state.
{
  const {e,game,capture}=makeEditor();
  const before=JSON.stringify(game.maps.rooms.quiet_nest);
  e.beginTransaction('escape paint');
  game.maps.rooms.quiet_nest.value=88;
  e.pointerDown=true;e.pointerId=7;e.dragMode='paint';capture.add(7);
  const ev=event({key:'Escape',target:null});
  e.onKey(ev);
  assert(ev.prevented);
  assert.strictEqual(JSON.stringify(game.maps.rooms.quiet_nest),before);
  assert.strictEqual(e.transaction,null);
  assert.strictEqual(e.pointerDown,false);
  assert.strictEqual(e.dragMode,null);
  assert(!capture.has(7));
}

// Closing F2 mid-gesture cancels the incomplete mutation rather than committing it.
{
  const {e,game,capture}=makeEditor();
  const before=JSON.stringify(game.maps.rooms.quiet_nest);
  e.beginTransaction('close paint');
  game.maps.rooms.quiet_nest.value=44;
  e.pointerDown=true;e.pointerId=7;e.dragMode='paint';capture.add(7);
  e.toggle(false);
  assert.strictEqual(e.active,false);
  assert.strictEqual(JSON.stringify(game.maps.rooms.quiet_nest),before);
  assert.strictEqual(e.transaction,null);
  assert(!capture.has(7));
  assert.strictEqual(e.historyFor('quiet_nest').undo.length,0);
}

// Normal pointerup still commits and produces an undoable transaction.
{
  const {e,game,capture}=makeEditor();
  const before=JSON.stringify(game.maps.rooms.quiet_nest);
  e.beginTransaction('normal paint');
  game.maps.rooms.quiet_nest.value=7;
  e.pointerDown=true;e.pointerId=7;e.dragMode='paint';capture.add(7);
  e.onUp(event());
  assert.strictEqual(e.transaction,null);
  assert.strictEqual(e.pointerDown,false);
  assert(!capture.has(7));
  assert.strictEqual(e.historyFor('quiet_nest').undo.length,1);
  assert(e.undoOne());
  assert.strictEqual(JSON.stringify(game.maps.rooms.quiet_nest),before);
}

// History remains bounded per room.
{
  const {e,game}=makeEditor();
  for(let i=0;i<55;i++){
    e.beginTransaction('bounded '+i);
    game.maps.rooms.quiet_nest.value=i+1;
    e.commitTransaction();
  }
  assert.strictEqual(e.historyFor('quiet_nest').undo.length,48);
}

console.log('EDITOR TRANSACTION REGRESSION 4.15 PASS');
console.log('  room-bound undo/redo, cancellation, close, pointerup and bounded history validated');
