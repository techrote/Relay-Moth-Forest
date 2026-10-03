# PERF-002 mutable-presentation validation

Issue: #32. Parent investigation: PERF-001 / #27.

## Candidate

Validated branch head: `322e8145736d09235496e4366a511c161542a152`.

Actions run **37090240644**, job `111108847419`: **PASS** for the complete repository self-test, native Chromium/WebGL2 integration and the PERF-001A state-change timing harness. Artifact **11262362195 / `perf-002-evidence`** retains raw timing JSON and browser screenshots/results.

Environment: Ubuntu 24.04 hosted runner, Chromium 153, DPR 1, ANGLE/Mesa llvmpipe software WebGL2. Absolute milliseconds are diagnostic; the structural removal of the monolithic phases is the acceptance authority.

## Change in ownership

PERF-002 makes the native-resolution colour/normal/specular static room backing invariant under small progression and common authoring changes.

The live mutable background layer now owns:

- deterministic generated decor;
- authored `editor_decor`;
- unrecruited persistent robot placements;
- completed-objective presentation;
- gate state;
- completion-sensitive pattern/glow presentation;
- Tin Stream bridge-stage art.

It renders before SurfaceFX water, matching the old baked layer's water/shadow ordering. HD mutable sprites use the same source normal/specular material math plus an explicit per-item tint-strength attribute. A rendered-pixel oracle checks the mutable shader against the equivalent static tinted material composition.

Structural terrain and exclusion-sensitive static interstitials remain legitimate static-bake users. Tin Stream collision/water topology remains synchronous and is the separate PERF-003 / #33 scope.

## Before / after evidence

PERF-001A baseline used the same general software-rendered CI class. PERF-002 final measurements use three samples at 1× Chromium CPU rate.

| Scenario | PERF-001A sync median | PERF-002 sync median | Result |
| --- | ---: | ---: | --- |
| ordinary objective | 689.3 ms | **0.4 ms** | full static bake removed |
| final non-water objective | 1034.3 ms | **0.4 ms** | static bake/gate rebake removed |
| persistent robot recruitment | 588.3 ms | **0.4 ms** | static robot rebake removed |
| editor authored decor | 1144.8 ms | **18.0 ms** | PRESENTATION + Room rebind; no static build |
| editor objective move | 826.3 ms | **16.0 ms** | object/presentation rebind; no static build |
| Tin Stream rivet | 1096.3 ms | **167.0 ms** | static bake removed; WaterField remains |
| editor water/terrain | 1103.9 ms | **1105.2 ms** | structural static + WaterField intentionally remains for #33 |
| editor grass | 16.9 ms | **15.1 ms** | scoped path preserved |
| wildlife-only control | 12.1 ms | **16.7 ms** | scoped path preserved |

For ordinary objective, final objective and robot recruitment the measured event path contains no `static.build` or water/foliage refresh phase.

For authored decor and objective edits, the event path contains no `static.build`; the remaining synchronous work is primarily editor status/validation UI plus a sub-millisecond Room rebind where required.

Tin Stream is now cleanly isolated: the rivet path is dominated by `surface.water.refresh` (~166 ms median in this run). That is exactly the bounded topology problem owned by #33.

Frame-gap measurements on llvmpipe remain noisy because they include complete software rendering after the event. They are retained in the artifact but are not treated as hardware FPS certification.

## Correctness gates

The accepted run passed:

- `python self_test.py`, including all inherited gameplay/editor/material tests;
- mutable/static tinted material rendered-pixel equivalence (max error within the existing 2-code-value tolerance);
- PERF-002 structural ownership regression;
- E415-09 invalidation/coalescing/flush regressions;
- procedural reserved-surface and suppression regressions;
- Tin Stream bridge gameplay regression;
- native Chromium all-nine-room renderer/editor interactions with no reported runtime failure;
- the complete state-change timing harness.

## Limits / next work

PERF-002 deliberately does not optimize the WaterField shore-distance/topology rebuild. Water/terrain editing also still performs a genuine static terrain rebuild. PERF-003 / #33 owns bounded water-field updates and retains a full-field fallback for room entry, quality changes and recovery.

Generated-decor suppression can still require a static refresh because the historical `decor_exclusions` authority is also consumed by baked vegetation interstitials; ordinary objective moves do not require that refresh because procedural decor itself is live and re-evaluates reserved objective cells after Room rebinding.
