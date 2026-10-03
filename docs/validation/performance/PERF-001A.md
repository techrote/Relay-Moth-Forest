# PERF-001A state-change hitch measurement

Issue: #28 under PERF-001 / #27.

This record defines the measurement method for the v4.15 state-change hitch investigation. It is diagnostic evidence, not a release FPS target.

## Reported symptom

Manual testing before instrumentation found a visible pause when an objective activates:

- a Ryzen 5 2600X shows a pause on the order of a few dozen milliseconds;
- an older laptop can approach roughly half a second;
- persistent robot recruitment and F2 editor mutations appear to show the same class of stall.

Those observations motivated the investigation but do not establish the root cause.

## Instrumentation

`game.js` exposes an opt-in `window.relayMothPerf` probe. It is disabled during normal play and changes neither scheduling nor invalidation decisions. When enabled it records:

- progression JSON serialization and localStorage write;
- synchronous event duration;
- `StaticPainter.build()` total;
- colour / normal / specular background texture uploads separately;
- water-mask construction and upload;
- SurfaceFX water/grass refresh;
- FoliageFX descriptor generation/refresh;
- Pip-specific mini-robot/follower work where applicable;
- editor Room rebind, creature/mini reinit and editor UI work;
- the main-thread frame gap from the last completed render loop before the event to the first completed render loop after it.

The static painter currently generates colour, normal and specular output together while drawing the room, so CPU raster/material generation inside `StaticPainter.build()` is reported as one phase. GPU texture uploads are separated.

## Browser harness

Run:

```text
python tests/current/state_change_performance_415.py --out /tmp/perf-001a.json --samples 3
```

For controlled low-end sensitivity:

```text
python tests/current/state_change_performance_415.py \
  --out /tmp/perf-001a-throttled.json \
  --samples 3 \
  --cpu-throttle 1 \
  --cpu-throttle 4 \
  --cpu-throttle 6
```

The harness uses the production localhost-loaded runtime in Chromium, real localStorage, Canvas2D, WebGL2 texture uploads, SurfaceFX/FoliageFX and the normal animation loop. CPU throttling uses Chromium DevTools emulation and is not equivalent to any specific physical CPU.

Measured scenarios:

1. ordinary non-final Lantern Lane objective;
2. Tin Stream rivet;
3. final Lantern Lane objective / gate state;
4. persistent robot recruitment;
5. free-position editor decor change;
6. editor objective-tile change;
7. editor grass change;
8. editor water/terrain change;
9. wildlife-only editor change as a non-static-rebuild control.

Each scenario is warmed before the probe is enabled. Results retain raw samples plus median, p95 and maximum values for total synchronous duration, frame gap and every observed phase.

## Interpretation rules

- Compare phase proportions and scaling before drawing conclusions from absolute CI milliseconds.
- A CPU-throttled Chromium run is controlled relative evidence, not a claim about a named laptop/desktop.
- Software-rendered Linux WebGL results do not certify Windows/browser/driver latency.
- A large `background.refresh.total` only establishes that the refresh path dominates; use child phases such as `static.build`, texture uploads, water and foliage refresh to attribute the work.
- Do not treat moving the same synchronous work to a later timer as a fix.
- Correctness gates from E415-09 remain authoritative: water/grass same-count edits, WYSIWYG immediacy, transaction flushes and scoped ambient-system refresh must not regress.

## First reproducible CI evidence

Actions run **37087472117**, job `111100636454`, passed the complete existing `python self_test.py`, the native nine-room Chromium/WebGL2 regression, and the PERF-001A harness on commit `64e785d1e688fb828606a1adc4ac4930667122e5`. Artifact **11261277156 / `perf-001a-evidence`** retains the raw JSON and browser evidence.

Environment: Ubuntu 24.04 runner, Chromium 153, DPR 1, requested/native backing **1278×718**, ANGLE/Mesa llvmpipe (LLVM 20.1.2, OpenGL ES 3.2). Three samples were taken at Chromium CPU rates 1× and 4×.

| Scenario | 1× sync median | 1× dominant measured phase | 4× sync median | 4× dominant measured phase |
| --- | ---: | --- | ---: | --- |
| ordinary objective | 689.3 ms | `static.build` 684.3 ms | 915.4 ms | `static.build` 893.2 ms |
| Tin Stream rivet | 1096.3 ms | `surface.water.refresh` 865.8 ms | 1673.5 ms | `surface.water.refresh` 899.1 ms; `static.build` 770.8 ms |
| final objective / gate state | 1034.3 ms | `static.build` 518.2 ms; colour upload 514.9 ms median | 864.7 ms | `static.build` 840.2 ms |
| persistent robot recruitment | 588.3 ms | `static.build` 354.4 ms | 1180.8 ms | `static.build` 1156.7 ms |
| editor decor | 1144.8 ms | `static.build` 682.1 ms | 860.2 ms | `static.build` 789.3 ms |
| editor objective | 826.3 ms | `static.build` 556.1 ms | 996.6 ms | `static.build` 926.0 ms |
| editor grass | 16.9 ms | editor/status work 15.1 ms | 56.9 ms | editor/status work 51.8 ms |
| editor water/terrain | 1103.9 ms | `surface.water.refresh` 853.6 ms | 1732.6 ms | `surface.water.refresh` 918.7 ms; `static.build` 750.4 ms |
| wildlife-only control | 12.1 ms | editor/status work 12.0 ms | 51.0 ms | editor/status work 50.3 ms |

The absolute values are specific to software-rendered CI and have substantial variance in some colour-upload samples. The attribution is much more stable than the absolute latency:

- ordinary objective, robot recruitment, editor decor and editor objective changes all converge on the full static-room build path;
- Tin Stream / water-terrain changes add a second large cost in `SurfaceFX.WaterField` refresh;
- progression serialization/localStorage is negligible in these samples (typically 0–0.4 ms);
- grass-only and wildlife-only controls avoid the monolithic static/water work and remain one to two orders of magnitude cheaper synchronously;
- the reported user symptom therefore has a shared measured mechanism rather than being dominated by save/UI work.

Frame-gap evidence is retained in the artifact. At 1×, the wildlife control median frame gap was 17.3 ms while the static/water scenarios were roughly 0.7–1.16 s. At 4×, software rendering itself became expensive enough that even the controls could have 0.76–0.82 s frame gaps; use that rate for phase attribution and scaling, not as a physical-hardware FPS claim.

Manual slow-hardware samples can be added separately with CPU, browser, viewport/DPR and graphics settings recorded.
