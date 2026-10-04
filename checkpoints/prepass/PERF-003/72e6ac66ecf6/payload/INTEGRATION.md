# Integration contract and implementation order

This document proposes interfaces; it does not install them. The additive patch contains the CPU prepass only. Assessed symbols are pinned in `evidence/SOURCES.md`.

## Smallest useful state and API

Keep gameplay authority in Room. Keep SurfaceFX independent of Room, objectives and the editor. Introduce a versioned update description at the game/renderer seam and a binary-mask description at the field seam:

```ts
type Rect = { x0: number; y0: number; x1: number; y1: number }; // half-open

type WaterTopologyDelta = {
  roomKey: string;
  fromRevision: string;
  toRevision: string;
  logicalWidth: number;
  logicalHeight: number;
  // Effective water, after bridge exclusions. Include old AND new footprints.
  changes: Array<{ tx: number; ty: number; wasWet: boolean; isWet: boolean }>;
};

type FieldMaskDelta = {
  fromRevision: string;
  toRevision: string;
  quality: 1 | 2 | 3 | 4;
  width: number;
  height: number;
  encoding: 'legacy-f32-shore-rgba-v1';
  // Final values, verified against retained quality-sized mask.
  changes: Array<[linearIndex: number, wet: 0 | 1]>;
};

type FieldUpdate = {
  mode: 'noop' | 'bounded' | 'full';
  reason: string | null;
  regions: Array<{ output: Rect; source: Rect }>;
  distanceCells: number;
  encodedCells: number;
  changedCells: number;
  uploads: Array<{ rect: Rect; bytes: Uint8Array }>;
  uploadBytes: number;
};

// Application seam (proposed):
// Game.refreshEditorWater(delta?: WaterTopologyDelta)
// Renderer.updateWaterMask(sourceCanvas, signature, settings, delta?)
// SurfaceFX.updateWaterMask(sourceCanvas, signature, settings, delta?)
// WaterField.prepareMaskUpdate(delta: FieldMaskDelta): prepared candidate
// WaterField.commitPreparedUpdate(candidate): FieldUpdate
```

Retain the quality mask, RGBA array, room/source revision, q, width/height, encoding version and texture generation. The game adapter can retain the 40 x 19 effective-water bitmap (760 bits/bytes). Comparing this fixed-size authority is cheap and catches same-count moves, replacements, undo and bridge exclusions without relying on mutation metadata being complete. It is not a full quality-field rebuild. Dirty bookkeeping can use this fixed-size bitmap plus at most eight output rectangles.

Do not merely add an optional rectangle argument to a revision gate and trust it. Check `fromRevision` against the last successfully committed source; validate all indices and values first. A future/stale revision, changed dimensions, missing baseline or unknown source semantics selects full rebuild. Commit the new cache identity only after the relevant texture updates have been issued successfully. The existing `RevisionGate.shouldRebuild` changes its key before `rebuild`; do not propagate that success-before-upload pattern into the new delta state machine.

The CPU prototype validates malformed inputs before mutation but does not provide allocation-failure rollback or WebGL error handling. Production preparation should allocate/recompute packed candidate regions first, retain enough old data or a valid full source for recovery, then update the live cache/texture in one synchronous commit boundary. Never leave a partially updated cache marked current.

## Mask acquisition is a distinct correctness gate

Existing `Game.buildWaterMask()` creates a 640 x 360 Canvas2D surface and fills exact 16 x 16 white tiles for `room.water.has(k) && !room.bridgeOpen(k)`. WaterField downsamples with smoothing disabled, then thresholds alpha > 20 AND red > 20. The distance proof starts at the resulting binary field samples.

**Recommended first adapter:** retain the logical source canvas and quality-sized acquisition canvas. Patch the effective logical tiles. Redraw under destination clips while keeping the exact same whole-source `drawImage(source,0,0,w,h)` scale and origin, then read only the certified destination footprints and compare against the cached mask. Do not downsample separately cropped tiles into independently rounded destination widths: that can shift the sampling phase. Do not replace thresholding with “any covered pixel is wet.” Preserve the full source, especially the dry bottom band.

For ideal centre sampling, a logical interval [a,b) contributes destination centres in

    [ceil(a*w/logicalW - 0.5), ceil(b*w/logicalW - 0.5)).

Outward geometric bounds `[floor(a*w/logicalW), ceil(b*w/logicalW))` contain those centres. This is a derivation for that sampling rule, not proof that every browser uses it. WHATWG explicitly leaves downscaling details unspecified. The current backend must establish equality against the current full Canvas path, including threshold and crop behavior, before using these footprints as a correctness boundary. Keep the old full acquisition/rebuild fallback for an uncertified or ambiguous adapter; do not claim the bounded production performance gate has passed in that fallback mode.

An optional CPU Canvas2D browser probe is included. Two bounded attempts here timed out without a result (an initial full tile-position batch and one reduced batch). Therefore neither ideal centre sampling nor clipped regional acquisition is browser-verified by this prepass. `results/canvas-acquisition.json` records this limit. The retained reduced probe is finite and uses no WebGL context. Once regional Canvas parity is proved, its exact changed samples feed the already-tested distance algorithm. A direct logical-bitmask sampler is a possible later simplification, but is not the initial compatibility recommendation.

Ownership detail: `WaterField.setSource` currently shrinks a replaced source canvas to 1 x 1. Decide one explicit owner for the retained logical canvas; never replace/release a canvas still borrowed by the acquisition or legacy upload path. Reuse the same canvas on delta updates and release only at the appropriate full replacement/destruction boundary.

## Both water textures must commit

`Renderer.setWaterMask` uploads the complete logical canvas into the legacy `waterMaskTex` before invoking SurfaceFX. WaterField separately uploads RGBA shore bytes. Optimizing only the latter leaves an avoidable whole legacy-mask upload and can produce divergent fallback presentation.

Patch the legacy texture over the logical dirty tiles/merged rectangles, and the field texture over the packed encoded-byte rectangles. Preserve dimensions and texture storage on the bounded path; use `texSubImage2D`, not `texImage2D` reallocation. A packed RGBA rectangle contains correct unchanged pixels inside its bounding box as well as changed pixels.

The existing 2D uploads use `UNPACK_FLIP_Y_WEBGL=true`. For top-down CPU rows in a half-open rectangle [x0,x1) x [y0,y1), preserve this convention: upload at x=x0, y=fieldH-y1 with width=x1-x0 and height=y1-y0, flipping the packed rows once. Do not pass the CPU y0 directly or reverse rows as well as enabling the flip. WebGL 2D typed-array uploads can use this flip; the restriction associated with a PIXEL_UNPACK_BUFFER is different. Keep the pixel-unpack buffer unbound for this path, make row-length/skip/alignment assumptions explicit, and restore modified pixel-store state in `finally` (especially flip). The current RGBA row byte count is naturally aligned to four.

Retain LINEAR filtering and CLAMP_TO_EDGE. There are no field mipmaps to regenerate. Matching every texture texel already preserves interpolation; a separate screen-space filter footprint is not extra distance work. GPU orientation, subimage bounds, error handling, legacy/field parity and context loss still need WebGL integration tests. The included upload-patch reconstruction is CPU-only.

## Tin Stream transaction

Current chain:

    Game.checkObjectives
      -> StoryState.complete
      -> bridgeProgress / bridgeBuilt assignment
      -> rivet particles / ripple / live mutable bridge art state
      -> refreshEditorWater
      -> Renderer.setWaterMask -> legacy upload -> SurfaceFX rebuild
      -> remaining update / next player update

Capture the previous effective-water bitmap before progression changes (or use the last committed bitmap with its matching revision). After assigning stage/built, derive final effective wetness using `Room.bridgeOpen`. Final completion opens every `bridgeCells` member; it is not necessarily equivalent to only the last visual `bridgeSegments` entry. `bridgePhases` may also come from `bridge_phases` rather than `bridge_segments`. Compare actual authority, not just the visual effects' selected segment.

Prepare and commit the new mask/field/legacy texture in the same synchronous call chain. No requestAnimationFrame, worker completion or idle callback may leave collision open while the old water mask remains visible before the next player update. GPU commands may execute later normally, but the submission/order and logical cache must commit coherently. Keep SurfaceFX's established failure isolation and legacy fallback; if SurfaceFX fails, disable that stale effect and make the legacy water mask current. An unrecoverable graphics failure must not silently label stale water as a successful current field.

PERF-002 already owns mutable bridge rendering. Do not reintroduce a static room rebake for progression. Existing ripple caps and effect lifetimes remain unchanged.

## Editor coalescing and synchronous final flush

Preserve `queueInvalidation`'s one-rAF scheduling and class-bit accumulation. Add water-delta bookkeeping alongside it, not another independent timer. On `applyInvalidation`, obtain the old committed effective-water bitmap, rebind Room exactly where it already rebinds, synchronize bridge stage, and derive final wetness. A no-water-change TERRAIN edit may still need static/foliage work but should not refresh the water field.

Do not detect water changes only in the water brush. `placeTile` removes existing water when placing path, solid, clear, blocker or tree; `removeRef` and move/paste also affect old footprints. Comparing effective authority once at the coalesced flush is the robust small first implementation. Preview movement is currently overlay-only; `applyMove` commits the final move synchronously. Its old and new footprints must both be represented.

`flushInvalidation` cancels the pending rAF and must drain the water delta with the class mask. `commitTransaction` flushes before saving the final history snapshot. `cancelTransaction` restores the before-image and performs a synchronous update. Undo and redo flush current work before restoring a snapshot and synchronously applying the result. Delta bases must follow the last actually committed field, not always the transaction's initial before-image.

`flushForPersistence` commits inspector edits, but cancels an active pointer gesture according to the existing editor contract; it then flushes invalidation. Preserve that distinction rather than claiming save always commits the gesture. Save/download must serialize the topology that this existing boundary leaves final. Room change clears stale pending water revisions. Keep CREATURES and MINI_ROBOTS scoped to their own existing bits; a water update must not initialize either subsystem.

## Measurements: split work before claiming improvement

Inject an optional measurement callback into SurfaceFX/WaterField rather than making the reusable module depend on the Game global. Keep the outer event/refresh timer, with distinct child names:

| Phase | Work to include |
|---|---|
| `water.authority.diff` | bridge exclusions / 760-cell effective-mask diff / dirty descriptor |
| `water.mask.patch` | logical canvas patching (full construction on fallback) |
| `surface.water.acquire.downsample` | quality canvas allocation/reuse, clipped or full draw |
| `surface.water.acquire.read-mask` | getImageData, threshold, exact changed sample extraction |
| `surface.water.plan` | validation, coalescing, fallback decision |
| `surface.water.distance` | source crop copy, initialization and two scans |
| `surface.water.encode` | output-only byte encoding, comparison and patch packing |
| `surface.water.upload` | shore texture allocation/subimage call and pixel-store setup |
| `water.upload` | separate legacy water-mask texture upload |

Record full/bounded/no-op counters, fallback reason, field dimensions/q/M, logical changed cells, changed mask cells, rectangle counts, summed source cells (including overlap), encoded cells, changed encoded cells, uploaded bytes and upload calls for each texture. Distinguish distance scan visits (twice source area) from initialization/copy/encoding work. Record source acquisition pixel counts too, so a full readback cannot hide behind a bounded distance counter.

The present Tin Stream outer `water.refresh.total` wraps `refreshEditorWater`, which itself measures the same label around the renderer call. Rename the outer transaction wrapper or otherwise avoid double counting that nested identical label. Inclusive timings must not be summed as mutually exclusive phases.

CPU duration around a GL call measures submission and possible driver blocking, not isolated GPU execution. Do not insert gl.finish into the ordinary path to force attribution. Use the existing PERF-001A harness's event duration and first-frame gap, with optional separately labelled diagnostic GPU timing only if needed.

## Fallback policy and worker sequence

Prototype defaults are at most eight output rectangles and full rebuild when summed source-crop work exceeds 65% of the field. These are concrete initial resource policies, not tuned performance findings. Count source area, not just dirty output area. Sequential deterministic insertion can trigger fragmentation fallback before later regions would merge; this is safe, bounded and documented. Tune thresholds only from subsequent measurements.

Always full-rebuild for initial entry, room/size/quality changes, texture/context generation changes, missing committed mask, unknown encoding/source mapping, mismatched base revision, large or over-fragmented edits. A q=0 update can retain current logical authority/legacy mask while marking the quality cache invalid; re-enable fully unless an exact retained baseline is established.

Implementation order:

1. Land split telemetry and counters without algorithm changes; retain before evidence in the existing harness.
2. Add the CPU seam/tests and retained mask/RGBA lifecycle. Verify the packet against the full assessed source. Keep the full implementation authoritative.
3. Establish regional mask acquisition parity on the target browsers using full Canvas masks, q1–4, tile boundaries and threshold cases. This is the outstanding representation gate.
4. Wire game effective-authority deltas and editor flush bookkeeping; preserve full fallback initially.
5. Connect the proved bounded transform and both texture subimage paths; add orientation, failure and context-loss tests.
6. Run E415-09, Tin Stream and existing shader/pixel regressions plus PERF-001A before/after. Prove that representative bounded edits avoid full acquisition/distance/upload, while genuine static terrain work remains separately attributed.

No runtime code, CI jobs or remote repository state was changed in this prepass.
