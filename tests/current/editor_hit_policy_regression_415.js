'use strict';

const assert = require('assert');
require('../../editor.js');

const policy = globalThis.RelayEditorPolicy;
assert(policy, 'RelayEditorPolicy should be exported for executable policy tests');

const point = {x: 16, y: 16};
const bbox = {x0: 8, y0: 8, x1: 24, y1: 24};
const decor = policy.describe({type:'decor', id:'decor-a', bbox});
const objective = policy.describe({type:'objective', id:'objective-a', bbox});
const structural = policy.describe({type:'structural', id:'bridge-a', bbox});
const terrain = policy.describe({type:'path', id:'path-a', bbox});

assert.strictEqual(policy.pick([objective, decor], point, 'right-click')?.id, 'decor-a',
  'right-click must choose overlapping decoration, never the objective');
assert.strictEqual(policy.pick([decor, objective], point, 'object')?.id, 'objective-a',
  'OBJECT scope must choose gameplay objects');
assert.strictEqual(policy.pick([objective, decor], point, 'select')?.id, 'decor-a',
  'SELECT scope must ignore gameplay-only objects');
assert.strictEqual(policy.pick([objective], point, 'select'), null,
  'SELECT must not silently become OBJECT mode');
assert.strictEqual(policy.pick([decor], point, 'object'), null,
  'OBJECT scope must ignore ordinary decor');
assert.strictEqual(policy.pick([structural], point, 'erase'), null,
  'generic ERASE must not remove structural/protected items');
assert.strictEqual(policy.pick([objective], point, 'erase'), null,
  'generic ERASE must not remove gameplay objects');
assert.strictEqual(policy.pick([terrain], point, 'erase')?.id, 'path-a',
  'generic ERASE may remove explicitly removable terrain');

assert.strictEqual(policy.allows(objective, 'move'), true,
  'objectives must remain movable in OBJECT mode');
assert.strictEqual(policy.allows(objective, 'remove'), false,
  'objectives must be protected from generic delete');
assert.strictEqual(policy.allows(objective, 'copy'), false,
  'objective duplication is outside E415-01');

const decorA = policy.describe({type:'decor', id:'decor-a', bbox});
const decorB = policy.describe({type:'decor', id:'decor-b', bbox});
const first = policy.pick([decorA, decorB], point, 'select');
const reversed = policy.pick([decorB, decorA], point, 'select');
assert.strictEqual(first?.id, reversed?.id,
  'same-layer hit choice must not depend on collectItems insertion order');
assert.strictEqual(first?.id, 'decor-b',
  'deterministic tie-break should select the same explicit topmost item');

console.log('EDITOR HIT POLICY REGRESSION 4.15 PASS');
console.log('  scoped right-click/SELECT/OBJECT/ERASE and deterministic priority validated');
