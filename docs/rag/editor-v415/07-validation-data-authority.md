# Semantic validation and data authority

## Authority split

### relay_moth_story.json
Owns:
- room order and keys;
- room text;
- objective definitions/kinds;
- previous/next room relationships.

### relay_moth_maps.json
Owns:
- geometry;
- water/path/walls;
- objective tile placement;
- trees/decor/grass;
- moths;
- wildlife;
- mini robots;
- bridge geometry;
- editor metadata/exclusions.

### relay_moth_pixel_luts.json
Owns semantic colour themes.

### relay_moth_effects.json
Owns effect presets and objective-effect mapping.

## Objective join

Story:

```json
{"object_id":"rivet_d","kind":"rivet"}
```

Map:

```json
"objects":{"rivet_d":[20,10]}
```

The ID is the join key.

Current room completion is based on every story objective ID being completed.

## Story fields not used for current placement

Current story objective entries retain:

- `x_fraction`
- `y_fraction`
- `required`

Current v4.14 `game.js` does not use them for objective placement. Do not build editor semantics around those retained fields.

## Existing server validation

The localhost save endpoint validates only structural basics such as:

- payload size;
- valid JSON object;
- maps schema prefix;
- rooms object;
- then backup + atomic replace.

That is intentionally not a complete semantic map validator.

## Required v4.15 semantic diagnostics

At minimum detect:

### Errors
- duplicate global moth IDs;
- duplicate persistent robot IDs;
- duplicate wildlife group IDs;
- duplicate mini-robot group IDs;
- story objective missing map placement;
- map objective key not present in story room;
- selected/edited objective placed on a non-walkable tile when the objective requires approach;
- malformed tile coordinates outside grid;
- malformed group count/spawn;
- missing referenced sprite/variant/kind where runtime cannot render it.

### Strong warnings
- modification of Tin Stream bridge structural cells;
- objective directly covered by generated decor (should be prevented by generator after E415-02);
- pickup on blocked/unreachable tile;
- transition region obstructed;
- structural water/bridge changes likely to affect route tests.

The validator should distinguish warning from error; an advanced editor should still allow deliberate unusual layouts.

## Save behavior target

Before Save/Download:
1. run validation;
2. show deterministic summary;
3. refuse only on clear structural/data-integrity errors unless user has an explicit force path;
4. warnings should be visible and reviewable;
5. successful save records saved baseline for dirty-state calculation.

## Reuse

Prefer one shared validation module/function usable by:
- editor UI;
- tests;
- optional server-side validation later.

Do not implement one validator in tests and a different one in editor code.
