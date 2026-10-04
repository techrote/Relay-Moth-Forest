# Source identities and evidence boundaries

## Repository reads

Read via the connected GitHub GET/read tools. No mutation tools were invoked. Assessed `main` resolves to `e4628f63fee57b7e4ccd32aff4bc331d7d06605b`, tree `d3e9a06fa1d9a2325c8c69f094bb4993fa80bfee`. This is newer than issue #33's creation baseline `d3ae298c00fe1be81e66afefcc001fa933f2a732`.

- Issue #33, PERF-003, entire body (zero comments at retrieval): https://github.com/techrote/Relay-Moth-Forest/issues/33
- Corrective design issue #30 and its two comments: https://github.com/techrote/Relay-Moth-Forest/issues/30
- Main commit and PERF-002 patch: https://github.com/techrote/Relay-Moth-Forest/commit/e4628f63fee57b7e4ccd32aff4bc331d7d06605b and https://github.com/techrote/Relay-Moth-Forest/pull/34
- `surfacefx.js`, complete connector read; key source lines 20–26 quality sizing, 41–69 distance/encoding, 124–126 source/quality/rebuild, and SurfaceFX wrapper near the file end: https://github.com/techrote/Relay-Moth-Forest/blob/e4628f63fee57b7e4ccd32aff4bc331d7d06605b/surfacefx.js
- `game.js`: `Room.bridgeOpen`, `blocked`, constructor bridge phases; `Renderer.setWaterMask`; `Game.buildWaterMask`, `syncEditorRenderStage`, `refreshEditorWater`, `checkObjectives`, `ensureBackground`, `enterRoom`; `RelayPerfProbe`: https://github.com/techrote/Relay-Moth-Forest/blob/e4628f63fee57b7e4ccd32aff4bc331d7d06605b/game.js
- `editor.js`, especially lines 110–170 queue/rebind/apply/flush/transactions, `placeTile`, `removeRef`, `applyMove`, and `flushForPersistence` / `preparePersistence`: https://github.com/techrote/Relay-Moth-Forest/blob/e4628f63fee57b7e4ccd32aff4bc331d7d06605b/editor.js
- Existing performance method/evidence: https://github.com/techrote/Relay-Moth-Forest/blob/e4628f63fee57b7e4ccd32aff4bc331d7d06605b/docs/validation/performance/PERF-001A.md
- Existing post-split findings: https://github.com/techrote/Relay-Moth-Forest/blob/e4628f63fee57b7e4ccd32aff4bc331d7d06605b/docs/validation/performance/PERF-002.md

`surfacefx.js` Git blob identity returned by the connector is `a74d6636a3f692082cbe12fac88d76ea8dc6a76c`; its complete-file SHA-256 recorded in the repository is `584e4c9f834ff3d9ed7f191bb942325c713ec3f7047ea307ff122d0e727670d1`. These identify the **whole source file**, not the excerpt in this packet. `evidence/reference-shore.cjs` contains the two relevant function bodies plus their clamp and an added CommonJS export, transcribed from the connector read. Its packet hash is separately in SHA256SUMS. There was no successful full checkout/download into this environment, and no claim of locally hashing the complete source blob. `verify-reference.cjs` is an additional worker check, not a check falsely reported as executed here.

## External primary specifications

Consulted 2026-10-04 to distinguish specification guarantees from assumptions:

- WHATWG HTML Living Standard, Canvas 2D drawing images / `imageSmoothingEnabled`: https://html.spec.whatwg.org/multipage/canvas.html — exact downscaling algorithm is not specified. This is why the ideal centre-sampling CPU fixture is not accepted as browser parity.
- Khronos WebGL 1 specification, Pixel Storage Parameters / `UNPACK_FLIP_Y_WEBGL`: https://registry.khronos.org/webgl/specs/latest/1.0/ — defines the vertical unpack flip used by 2D image/subimage operations.
- Khronos WebGL 2 specification, texture image/subimage and pixel unpack buffer restrictions: https://registry.khronos.org/webgl/specs/latest/2.0/ — typed-array 2D uploads and buffer-backed uploads have different restrictions. Do not incorrectly apply the PBO or 3D flip restriction to this 2D typed-array path.

## Historical timings are not this turn's results

PERF-001A reports software-rendered CI water refresh medians of 865.8 ms for a Tin Stream rivet and 853.6 ms for editor water/terrain. PERF-002 subsequently reports Tin Stream water refresh around 166 ms after the static/mutable presentation split, with editor water/terrain still including genuine static work. Both are historical records with different runs/conditions. This prepass neither reran them nor infers hardware speedup from its source-cell counts.

## New evidence

All `.rgba`, comparison/count/counterexample outputs and the proof/API documents were produced locally for this task. Fixtures are explicitly synthetic. The CPU reference and candidate share the intended scan/encoding semantics; their independently arranged crop/full computation is the tested equivalence. This does not independently validate the artistic or physical suitability of the legacy representation. No new WebGL, Canvas parity, full repository regression, gameplay capture, native target or CI pass is claimed.
