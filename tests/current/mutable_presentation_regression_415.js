'use strict';

const assert=require('assert');
const fs=require('fs');
const path=require('path');
const ROOT=path.resolve(__dirname,'../..');
const js=fs.readFileSync(path.join(ROOT,'game.js'),'utf8');
const editor=fs.readFileSync(path.join(ROOT,'editor.js'),'utf8');
const material=require(path.join(ROOT,'sprite_material.js'));

const between=(start,end)=>{
  const a=js.indexOf(start),b=js.indexOf(end,a+start.length);
  assert(a>=0&&b>a,`missing source range ${start} .. ${end}`);
  return js.slice(a,b);
};

// StaticPainter no longer owns state-dependent or common authored presentation.
const staticBuild=between('  build(room,state,renderW=W,renderH=H){','\n}\n\nclass SpriteAtlas');
for(const token of ['this.drawEditorDecor(ctx,room)','this.drawRobots(ctx,room,state)','this.persistentObjective(ctx,obj','this.drawGates(ctx,room,state)']){
  assert(!staticBuild.includes(token),`mutable presentation leaked into static bake: ${token}`);
}
assert(staticBuild.includes('bridgeCell=room.bridgeCells.has(k)'),'bridge backing must be stage-invariant');

// Runtime progression paths must not fall back to the monolithic background API.
const robot=between('  checkRobotPickups(){','\n  checkObjectives(){');
assert(!robot.includes('ensureBackground(true)'));
assert(!robot.includes("this.bgKey=''"));
const objective=between('  checkObjectives(){','\n  completionText(obj)');
assert(!objective.includes('ensureBackground(true)'));
assert(objective.includes("this.room.key==='tin_stream'")&&objective.includes('this.refreshEditorWater()'));

// The static cache key is deliberately independent of completion/robot/bridge stage.
const sig=between('  bgSignature(){','\n  releaseCurrentStatic()');
for(const token of ['isDone(','hasRobot(','bridgeBuilt','bridgeProgress'])assert(!sig.includes(token),token);
assert(js.includes('renderMutablePresentation(){'));
for(const token of ['renderMutablePattern()','renderMutableEditorDecor()','renderMutableRobots()','renderMutableCompletedObjectives()','renderMutableGates()'])assert(js.includes(token),token);
assert(js.includes('this.renderMutablePresentation();this.renderFloaterFX(now)'));

// Mutable HD presentation has its own exact tint-strength attribute while retaining
// the same source normal/specular material contract as static/live v4.14 sprites.
assert(material.mutableVertex.includes('aTintStrength')&&material.mutableVertex.includes('vTintStrength'));
const mutableFragment=material.fragment('mutable');
assert(mutableFragment.includes('mix(t.rgb,vColor.rgb,clamp(vTintStrength'));
assert(mutableFragment.includes('uNormalTex')&&mutableFragment.includes('uSpecularTex'));
assert(mutableFragment.includes('shadeSprite('));
assert(js.includes('this.mutableHDProg=this.program(RelaySpriteMaterial.mutableVertex,RelaySpriteMaterial.fragment(\'mutable\'))'));
assert(js.includes('this.spriteFlushMutable()'));

// Common editor visual mutations use live presentation invalidation rather than
// scheduling another full native-resolution static/material bake.
assert(editor.includes('PRESENTATION:128'));
assert(editor.includes("if(type==='decor')return EDITOR_INVALIDATION.PRESENTATION"));
assert(editor.includes("if(ref.type==='decor')return EDITOR_INVALIDATION.PRESENTATION"));
const apply=editor.slice(editor.indexOf('    applyInvalidation('),editor.indexOf('    flushInvalidation(',editor.indexOf('    applyInvalidation(')));
assert(apply.includes('EDITOR_INVALIDATION.PRESENTATION'));
assert(!/if\(mask&EDITOR_INVALIDATION\.OBJECTS\)\{this\.game\.refreshEditorStatic/.test(apply));

console.log('MUTABLE PRESENTATION REGRESSION PERF-002 PASS');
console.log('  objective/robot/editor visuals bypass monolithic static baking; exact source-normal/specular mutable material path present');
