# Relay Moth Forest 3.995.2 — SurfaceFX Validation

## Baseline before modification

The supplied 3.99 archive was unpacked and tested before implementation.

| Test | Baseline result |
| --- | --- |
| `python3 self_test.py` | PASS |
| `python3 movement_regression_397.py` | PASS |
| `node input_regression.js` | PASS |
| `node npc_regression_399.js` | PASS |
| `python3 jitter_regression.py` | PASS |
| `python3 fault_regression_398.py` | FAIL only on obsolete literal `...diagnostics-398.json` assertion, as documented in the handoff |

## 3.995 validation suite

After SurfaceFX integration:

| Test | Result |
| --- | --- |
| `python3 self_test.py` | PASS |
| `python3 movement_regression_397.py` | PASS — 30,072 cases; all 15,036 free diagonals preserve both axes |
| `node input_regression.js` | PASS |
| `node npc_regression_399.js` | PASS — forced no-route follower survives 240 frames |
| `python3 jitter_regression.py` | PASS — 10,740 cases; 0 unintended lateral displacement |
| `python3 fault_regression.py` | PASS — 5 critical + 8 optional isolated update systems |
| `python3 fault_regression_398.py` | PASS compatibility wrapper into the version-agnostic regression |
| `node surfacefx_regression.js` | PASS |
| `node --check game.js` | PASS |
| `node --check surfacefx.js` | PASS |

## SurfaceFX regression coverage

`surfacefx_regression.js` validates:

- shoreline-distance output grows from boundary toward water interior;
- resource invalidation rebuilds only when mask signature or quality changes;
- ripple list hard bound / expiry;
- quality 0/1/2/3 field-resolution contract;
- deterministic grass generation;
- grass hard instance budget;
- visual descriptor is not mutated by grass generation;
- SurfaceFX shader/program construction failure is captured as subsystem disable rather than game-start exception;
- `surfacefx.js` loads before `game.js`;
- Tin Stream bridge-open exclusion remains present in `buildWaterMask()`;
- graphics settings migrate from 3.99 to 3.995;
- legacy water fallback remains present;
- GrassField uses WebGL2 instanced drawing.

## Static/current bounds

- Water ripple hard cap: 8.
- Water field resolution: 96×54 / 160×90 / 256×144.
- Grass instance hard cap: 1200; default quality-2 cap 760.
- Grass push field cap: 4.
- No per-frame shoreline rebuild.
- No per-blade draw call.
- Existing 16-light, 48-wall-caster, FX, particle and split-canopy bounds remain unchanged.

## Browser/GPU validation status

A Chromium hardware/software-WebGL smoke run was attempted in the execution container. Chromium's ANGLE/EGL GPU process could not initialise (`EGL_NOT_INITIALIZED`, including the SwiftShader/SwANGLE path) and never reached page rendering. This environment therefore cannot provide a truthful shader compile/link or frame-time measurement.

The project intentionally leaves runtime shader error isolation/fallback in place and reports SurfaceFX status through F10 diagnostics. **Run the archive on a hardware-accelerated desktop browser before promoting 3.995 to the 4.0 base.** Recommended checks:

1. open Tin Stream and confirm richer water is constrained to exposed water;
2. complete each rivet and confirm the newly open bridge cells immediately lose WaterField coverage;
3. pulse near water and observe a bounded transient ripple rather than full-screen fizz;
4. inspect 4–5 sparse grass clumps per room and verify player/followers bend blades without collision effects;
5. set SurfaceFX master OFF or Water quality 0 and confirm the legacy 3.99 water path is restored;
6. cycle all five LUT theme banks and verify water/grass materials recolour coherently;
7. inspect F10 diagnostics for field/instance/rebuild counters;
8. profile quality 1/2/3 on target hardware before increasing default quality or grass density.

## Container CPU microbenchmarks (non-browser)

These measurements exercise only the pure CPU derivation helpers under Node in this build container; they are not substitutes for browser/GPU profiling.

| Operation | Observed |
| --- | ---: |
| shoreline field Q1 96×54 | ~0.32 ms/build |
| shoreline field Q2 160×90 | ~0.22 ms/build |
| shoreline field Q3 256×144 | ~0.59 ms/build |
| default-density grass generation | ~0.02–0.03 ms/build in the synthetic five-clump test |

Generated 3.99 maps currently produce the intended sparse scope at default quality: 7–9 sparse derived clumps per room, bounded by the quality-2 cap of 760 and absolute cap of 1200. Exact visible instance count is reported by F10 diagnostics.


## 3.995.1 field hotfix validation

A Windows field report exposed transition-time memory pressure after using an in-game portal. 3.995.1 adds explicit static-canvas lifetime control, framebuffer pixel guarding, bounded recovery reloads, and bounded localhost transfer concurrency. `transition_memory_regression.py` passes, and a 24-way concurrent request stress run against the largest runtime atlas completed without server exceptions while the server admitted at most four transfer threads. Hardware-browser reproduction of the original user's exact machine remains the required final confirmation.

A subsequent automated Chromium portal-loop attempt in the build environment could not navigate to the local test server because loopback navigation is blocked by administrator policy (`ERR_BLOCKED_BY_ADMINISTRATOR`). This is an environment restriction, not a passing browser runtime test. The user's Windows/browser reproduction remains decisive.


## 3.995.2 validation addendum

3.995.2 adds stronger water material response/refraction, more legible sparse grass, continuous
large-tree lighting/foreground cropping, completed-room mini-robot social states, wildlife
avoidance/recovery behavior and the four-row dedicated Tin Stream bridge. The automated suite
adds `ambient_ai_regression_39952.js` and `bridge_regression_39952.py` while retaining every
3.99/3.995/3.995.1 regression. See `VALIDATION_LOG_39952.txt` for the final packaged run.

No hardware-accelerated browser image-quality claim is made by the automated suite; final
water/grass/light tuning remains subject to visual confirmation on the user's WebGL2 machine.
