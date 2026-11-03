# PERF-003 bounded water topology and completion review

Issue: [#33](https://github.com/techrote/Relay-Moth-Forest/issues/33). Review date: **3 November 2026**.

## Recovered source and historical evidence

Accepted parent `main` was `e4628f63fee57b7e4ccd32aff4bc331d7d06605b`, the PERF-002
merge. Existing branch `perf-003/bounded-water-topology-33` was three commits ahead
at `50e6b5b72115d14d6ad798067ecca6ed53b979ed`, with no pull request or main drift.
This continuation preserves those commits and completes their implementation,
validation, documentation and source manifest.

[Historical exact-head run 37676706899](https://github.com/techrote/Relay-Moth-Forest/actions/runs/37676706899)
passed deterministic, browser and bounded-work checks. Its `perf-003-evidence`
artifact, ID `11508040554`, was recovered and verified against SHA-256
`88a023ecdb4caffed1da40eb1d9e728bb9b586693c4fb1260ab99bc2d80b0903`.

That green run still recorded 1x legacy `water.upload` medians of **219.3 ms** for
a Tin Stream rivet and **990.9 ms** for an editor water edit. SurfaceFX itself
already took only **1.6 ms** and **1.7 ms** respectively. The historical run
demonstrated bounded shore work, but did not establish removal of the remaining
synchronous legacy-mask stall.

## Implemented behavior

- Game compares effective wet/dry cells after authority rebinding. Open bridge
  cells are excluded immediately, and same-count moves change revision identity.
- Bridge collision and water commit before optional celebratory particles/effects.
  A previously completed objective can therefore not leave an obsolete water mask
  behind when one of those optional effects throws.
- The active logical mask remains owned by Game; replacing a room mask releases
  its old canvas backing. SurfaceFX retains bounded mask/field caches.
- Revision-bound logical rectangles drive bounded legacy texture uploads and
  conservative quality-resolution mask acquisition.
- The shore-field output halo equals its integer distance cap (10/16/22/22 pixels
  at q1/q2/q3/q4); another halo supplies replacement-shore context. Production
  float32 chamfer passes and independent integer-channel quantization are retained.
- Fragmentation, excessive work, missing/stale baseline, changed source, quality
  change and fresh renderer recovery use explicit full rebuilds.
- Legacy mask readback now uses a CPU-oriented canvas selected on the **first**
  `getContext` call. Separate readback and texture-upload timers expose the cost.
- Diagnostics report full/bounded/no-op updates, mask acquisition, distance and
  encoding work, changed cells and upload bytes/calls. No-op/disabled updates
  correctly report zero last-upload bytes.

No gameplay, wave appearance, schema, progression or material contract changes
are intended. Optional SurfaceFX failure retains the legacy renderer.

## Local controlled before/after experiment

The same Chromium/ANGLE/Mesa llvmpipe host, viewport, graphics settings and
three-sample scenarios were used. The before source is the recovered branch with
only readback/upload subphase instrumentation. The after source additionally
requests `{willReadFrequently:true}` when Game first creates its water mask.

Full raw samples and environments are retained in
[PERF-003-local-before.json](PERF-003-local-before.json) and
[PERF-003-local-after.json](PERF-003-local-after.json).

| Scenario / phase | Before median | After median |
| --- | ---: | ---: |
| Tin Stream rivet: complete synchronous event | 128.4 ms | 4.9 ms |
| Tin Stream rivet: water refresh total | 128.0 ms | 1.1 ms |
| Tin Stream rivet: legacy canvas readback | 125.0 ms | 0.1 ms |
| Tin Stream rivet: legacy texture subupload | 0.1 ms | 0.0 ms |
| Editor water edit: water refresh total | 816.5 ms | 0.8 ms |
| Editor water edit: legacy canvas readback | 815.3 ms | 0.1 ms |
| Editor water edit: legacy texture subupload | 0.0 ms | 0.0 ms |
| Editor water edit: complete synchronous event | 1028.1 ms | 901.4 ms |

Zero at this timer resolution does not mean zero work. This experiment attributes
the old stall to canvas readback, not the small texture transfer. The remaining
editor event is still dominated by its existing static terrain rebuild (602.9 ms
median in the after run, with substantial software-rendering variability).
PERF-003 does not claim to make all terrain editing interactive on this host.

At the default q3, representative rivet and editor deltas upload **2,496** and
**3,072** SurfaceFX bytes, compared with **230,400** for the full field. Their
legacy masks upload **4,096** and **2,048** bytes rather than **921,600**. The
performance harness checks that the measured event performs no full rebuild or
legacy full upload, exactly one bounded update on each path, and less-than-full
mask acquisition, distance work and upload size. It also verifies the first-
context readback hint. Absolute milliseconds remain diagnostic, not a universal
CI threshold.

## Executable acceptance

`waterfield_bounded_regression_415.js` compares the **entire** resulting field
against an independent clean rebuild and separately reconstructs the reported
texture subuploads. Its 14,005 comparisons include exhaustive small masks,
q1-q4 wet/dry, bridge, disjoint, interacting and edge changes, 136 sequential
bounded updates, no-op behavior, explicit fallback and invalid-batch isolation.

The native browser suite runs actual Canvas2D and WebGL2. It checks every encoded
CPU byte and every GPU texture byte against fresh references for:

- all four Tin Stream stages at every q1-q4 quality, including immediate collision
  and water authority;
- injected particle and both bridge-effect failures, proving topology has already
  committed and does not depend on a completed objective being retried;
- asymmetric same-count water movement, coalesced editor work, synchronous
  pointerup commit, undo and redo;
- multirow asymmetric legacy subuploads;
- no-op diagnostics, q0 edits followed by re-enabling, quality changes, stale
  revision, replacement source, fragmented/work-budget fallback and fresh field
  recreation.

The inherited complete self-test and all-nine-room browser/editor/material suite
remain required. This includes 27 staged objective/exit routes, gameplay/input,
follower recovery, shader compilation and genuine GLES rendered pixels. Missing
GLES cannot be reported as a rendered CI pass.

## Continuing qualification and remaining work

[Validate source and runtime](https://github.com/techrote/Relay-Moth-Forest/actions/workflows/validate.yml)
now runs one GitHub-hosted job for each PR head and accepted main push. It records
the exact tested commit and tree in `source.json`, verifies the complete source
manifest before and after tests, runs deterministic/GLES/browser checks and
retains raw 1x/4x timing evidence. The PR checks and their source record establish
the final candidate identity; historical results are not substituted for a fresh
head pass.

Linux software-rendered validation does not certify Windows/Firefox hardware
frame times. Physical playtesting remains useful for the child-facing experience.
The next measured rendering opportunity is bounded static terrain/material
refresh for editor terrain changes; it requires its own visual/material authority
analysis and should not weaken these water guarantees.
