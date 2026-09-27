# v4.15 test matrix and release gates

## Existing editor tests

### wysiwyg_editor_regression_410.py
Mostly structural/source assertions:
- overlay exists;
- tools/functions exist;
- save endpoint exists;
- optional editor fields;
- right-click exclusion code exists.

### wysiwyg_editor_input_regression_411.py
Mostly source/CSS assertions:
- stacking order;
- pointer capture/release code;
- UI shielding;
- button types.

### object_editor_regression_412.py
Source assertions that object types/patterns exist.

### browser_render_regression_414.py
Provides real browser coverage for:
- same-count grass/water invalidation;
- palette ghost geometry;
- palette remains interactive after selection;
- Tab restores editor chrome;
- editor canvas is not filtered;
- no runtime browser errors.

These tests are useful but do not cover the dangerous state semantics found in the audit.

## Required new behavior tests

Create a dedicated v4.15 editor behavior suite using actual editor methods/DOM/browser state where feasible.

### 1. Tin Stream overlap reproduction
- load Tin Stream;
- identify generated bush at/near bridge;
- right-click it;
- generated decor becomes suppressed;
- `rivet_d` does not enter `object_fx_hidden`;
- objective remains visible/completable.

### 2. Tool-layer hit priority
Fixture with overlapping:
- decor
- objective
- gameplay actor/group
Right-click must affect decor only.
OBJECT must select objective/gameplay object.

### 3. Cross-room undo
- edit room A;
- switch to B;
- invoke undo;
- room B must not be replaced by A snapshot.

### 4. Persistent robot move
- move `moss_bot`;
- ID remains `moss_bot`.

### 5. Global moth-copy uniqueness
- copy/create moths across multiple rooms;
- all persistent IDs globally unique.

### 6. Wildlife logical group
- group count >1;
- editor selection contains one logical group ref;
- copy produces one new group.

### 7. Hidden objective recovery
- explicitly hide objective visual;
- editor shows hidden handle;
- explicit Show restores it.

### 8. Pattern/decor exclusion recovery
- suppress `nest:swirl`;
- show suppressed;
- restore without editing JSON.

### 9. Procedural reservation
- no generic generated decor on Tin Stream bridge cells/island;
- no generic generated decor on exact objective tiles across current rooms.

### 10. Snapped move preview
- tile-backed preview position equals commit position.

### 11. Pointer cancellation
- start mutation;
- dispatch pointercancel/Escape;
- room JSON equals pre-gesture state.

### 12. Semantic validator
Fixtures for:
- duplicate moth ID;
- missing objective placement;
- unknown map objective;
- blocked objective;
- malformed group;
and assert deterministic error/warning codes.

### 13. Dirty/save state
- edit => dirty;
- save baseline => clean;
- edit + undo to baseline => clean.

### 14. Incremental invalidation
- unrelated mutations do not reinitialise unrelated systems.

## Browser integration

Retain all v4.14 browser editor checks and add at least:
- inspector open/edit/undo;
- overlap cycling;
- hidden-content restoration;
- real right-click Tin Stream regression.

## Release gates

v4.15 is not accepted until:

- all inherited v4.14 tests pass;
- all new editor behavior tests pass;
- exact Tin Stream reported bug is covered;
- no generated decor sits on reserved current objective/bridge tiles;
- persistent IDs survive move;
- copied persistent IDs cannot collide;
- cross-room undo corruption is impossible;
- suppressed/hidden content is recoverable through UI;
- docs and Wiki match final behavior.
