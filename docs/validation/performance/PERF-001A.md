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

## Evidence status

The first checked-in harness/instrumentation change establishes reproducible collection. Concrete CI run IDs and phase results should be added here after the branch is validated. Manual slow-hardware samples can be added separately with CPU, browser, viewport/DPR and graphics settings recorded.
