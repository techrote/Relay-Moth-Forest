'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '../..');
const decor = require('../../procedural_decor.js');
require('../../editor.js');

const maps = JSON.parse(fs.readFileSync(path.join(ROOT, 'relay_moth_maps.json'), 'utf8'));
const story = JSON.parse(fs.readFileSync(path.join(ROOT, 'relay_moth_story.json'), 'utf8'));
const atlas = JSON.parse(fs.readFileSync(path.join(ROOT, 'hd_remake_atlas.json'), 'utf8'));
const roles = atlas.roles || {};
const clone = v => JSON.parse(JSON.stringify(v));
const cellKey = p => `${p[0]},${p[1]}`;

function roomFor(key, rawOverride=null){
  const spec = story.rooms.find(r => r.key === key);
  assert(spec, `missing story room ${key}`);
  const raw = clone(rawOverride || maps.rooms[key]);
  return {...raw, index:spec.index, key, spec};
}

const byRoom = new Map();
for(const spec of story.rooms){
  const room = roomFor(spec.key);
  const items = decor.enumerate(room, roles);
  byRoom.set(spec.key, items);

  const ids = new Set();
  const bridge = new Set([...(room.bridge_cells||[]), ...(room.bridge_island||[])].map(cellKey));
  const objectives = new Set(Object.values(room.objects||{}).map(cellKey));
  for(const item of items){
    assert.strictEqual(item.source, 'procedural');
    assert.strictEqual(item.order, item.generatorIndex);
    assert.strictEqual(item.id, `generated:${spec.key}:${item.generatorIndex}`);
    assert(!ids.has(item.id), `duplicate procedural id ${item.id}`);
    ids.add(item.id);
    assert(!bridge.has(cellKey(item.tile)), `${item.id} generated on bridge gameplay surface ${cellKey(item.tile)}`);
    assert(!objectives.has(cellKey(item.tile)), `${item.id} generated on objective ${cellKey(item.tile)}`);
  }
}

// Baseline non-reserved samples retain the exact old generator identity/placement.
const stable = [
  ['tin_stream', 1, [32,13], 'foliage_v391_19', 521, 226],
  ['dawn_tree', 9, [14,9], 'foliage_v401_grove_r1c1', 234, 164],
  ['quiet_nest', 0, [29,5], 'foliage_v401_ground_r1c3', 473, 102],
];
for(const [roomKey,index,tile,sprite,x,y] of stable){
  const item = byRoom.get(roomKey).find(d => d.generatorIndex === index);
  assert(item, `stable sample ${roomKey}:${index} disappeared`);
  assert.deepStrictEqual(item.tile, tile);
  assert.strictEqual(item.sprite, sprite);
  assert.strictEqual(item.x, x);
  assert.strictEqual(item.y, y);
}

// Exact v4.14 collisions are now removed by reservation, without reshuffling others.
const tin = byRoom.get('tin_stream');
for(const index of [10,40,102]) assert(!tin.some(d => d.generatorIndex === index), `Tin Stream bridge generator ${index} survived reservation`);
assert(!byRoom.get('dawn_tree').some(d => d.generatorIndex === 97), 'Dawn Heart generator 97 survived objective reservation');

// Suppression is deterministic and tile-scoped: removing one generated item removes
// that generated tile on the next enumeration without touching authored/gameplay data.
const tinRaw = clone(maps.rooms.tin_stream);
const tinRoom = roomFor('tin_stream', tinRaw);
const target = decor.enumerate(tinRoom, roles).find(d => d.generatorIndex === 1);
assert(target, 'expected stable Tin Stream suppression target');
assert(decor.suppress(tinRaw, target));
const afterSuppression = decor.enumerate(roomFor('tin_stream', tinRaw), roles);
assert(!afterSuppression.some(d => cellKey(d.tile) === cellKey(target.tile)), 'suppressed procedural tile was regenerated');

// Historical Tin Stream right-click reproduction: an overlapping generated DECOR
// candidate wins the right-click scope, its tile can be suppressed, and rivet_d
// objective visibility/data are left unchanged.
const policy = globalThis.RelayEditorPolicy;
assert(policy, 'RelayEditorPolicy not exported');
const overlap = {x0:330,y0:150,x1:356,y1:184};
const historicalBush = policy.describe({type:'procedural-decor',id:'generated:tin_stream:40',tile:[21,10],bbox:overlap});
const rivetD = policy.describe({type:'objective',id:'rivet_d',tile:[20,10],bbox:overlap});
assert.strictEqual(policy.pick([rivetD,historicalBush], {x:344,y:170}, 'right-click')?.id, historicalBush.id);
assert.strictEqual(policy.allows(historicalBush, 'move'), false);
assert.strictEqual(policy.allows(historicalBush, 'copy'), false);
assert.strictEqual(policy.allows(historicalBush, 'remove'), true);
assert.strictEqual(policy.allows(rivetD, 'remove'), false);
const reproduction = clone(maps.rooms.tin_stream);
const objectsBefore = JSON.stringify(reproduction.objects);
const hiddenBefore = JSON.stringify(reproduction.object_fx_hidden||[]);
assert(decor.suppress(reproduction, historicalBush));
assert((reproduction.decor_exclusions||[]).some(p => cellKey(p) === '21,10'));
assert.strictEqual(JSON.stringify(reproduction.objects), objectsBefore);
assert.strictEqual(JSON.stringify(reproduction.object_fx_hidden||[]), hiddenBefore);
assert(!(reproduction.object_fx_hidden||[]).includes('rivet_d'));

// Explicit authored decor is outside the generic-reservation authority and therefore
// remains legal even when intentionally placed on a reserved bridge tile.
const authored = roomFor('tin_stream');
authored.editor_decor = [{editor_id:'intentional_bridge_decor',x:19*16+8,y:9*16+16,sprite:'foliage_v391_19'}];
decor.enumerate(authored, roles);
assert.strictEqual(authored.editor_decor[0].editor_id, 'intentional_bridge_decor');

// Renderer and editor consume the same enumerator; neither owns a copied generator.
const gameSrc = fs.readFileSync(path.join(ROOT, 'game.js'), 'utf8');
const editorSrc = fs.readFileSync(path.join(ROOT, 'editor.js'), 'utf8');
const indexSrc = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
assert(gameSrc.includes('RelayProceduralDecor.enumerate(room,this.art.roles)'));
assert(editorSrc.includes('RelayProceduralDecor.enumerate(this.game.room,this.game.art.roles)'));
assert(!gameSrc.includes('const decorCount=Math.floor(78*'), 'legacy renderer-local generator still present');
assert(indexSrc.indexOf('procedural_decor.js') < indexSrc.indexOf('editor.js'));
assert(indexSrc.indexOf('procedural_decor.js') < indexSrc.indexOf('game.js'));

console.log('PROCEDURAL DECOR REGRESSION 4.15 PASS');
console.log('  shared descriptors, reserved surfaces, stable baseline samples and suppression validated');
