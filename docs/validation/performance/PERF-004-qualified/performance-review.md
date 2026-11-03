# PERF-004 paired evidence review

Validation passed: matching paired environment records, clean exact source identities, companion CI source binding, and 36/36 candidate water/path map results with zero differing bytes/pixels and zero maximum error.

The warmed forced full control is present at both throttle rates: 18/18 additional candidate map results are exact, for 54/54 candidate map checks in total.

- baseline: commit `5e6ea67c0ca8ba4d00b35d0e68ac4bb4d573680d`, tree `bc51d8dc9d5fac881966cebe554b7b1475fee62a`, manifest SHA256 `8cfb1fc277f8aedee2a54d25d18730d3a26c22645acffd1bd6408383e6253aa1`.
- candidate: commit `afabaa080489c980157306667ea03817e1827c29`, tree `ab3bbbd50cbf30366f10b66370d05c97cebcd7df`, manifest SHA256 `1efb9ef05c253cb7b52f9bd611767121603ba61244bf6a07e7b67e6931e2a94e`.
- CI run/attempt: 41590918373/1; platform: Linux-7.0.0-1014-aws-x86_64-with-glibc2.39.
- 1x: native [1278, 718], viewport [1280, 800], DPR 1, render scale 1; environment SHA256 `f0aecf1cc0d365d903117cd76a5cad400c7bc9ed59e911fb000b4780ea36be72`.
- 4x: native [1278, 718], viewport [1280, 800], DPR 1, render scale 1; environment SHA256 `f0aecf1cc0d365d903117cd76a5cad400c7bc9ed59e911fb000b4780ea36be72`.
- Browser: Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/155.0.0.0 Safari/537.36; driver: {"renderer": "ANGLE (Mesa, llvmpipe (LLVM 20.1.2 256 bits), OpenGL ES 3.2)", "version": "WebGL 2.0 (OpenGL ES 3.0 Chromium)"}.

## Timings

Milliseconds: median [minimum–maximum] across three records. Ratio = candidate / baseline.

| Rate | Scenario | Metric | Baseline | Candidate | Ratio |
|---|---|---|---:|---:|---:|
| 1x | objective-ordinary | syncMs | 0.300 [0.300–0.600] | 0.500 [0.200–0.600] | 1.6667 |
| 1x | objective-rivet | syncMs | 2.400 [1.500–6.700] | 1.900 [1.400–5.700] | 0.7917 |
| 1x | objective-final | syncMs | 0.500 [0.300–0.500] | 0.400 [0.300–0.400] | 0.8000 |
| 1x | robot-recruit | syncMs | 0.500 [0.200–0.600] | 0.300 [0.100–0.600] | 0.6000 |
| 1x | editor-decor | syncMs | 16.200 [14.600–19.700] | 17.900 [15.100–20.100] | 1.1049 |
| 1x | editor-objective | syncMs | 16.300 [10.500–19.600] | 13.900 [13.700–14.200] | 0.8528 |
| 1x | editor-grass | syncMs | 16.300 [14.900–21.400] | 14.000 [13.600–14.000] | 0.8589 |
| 1x | editor-water | syncMs | 662.700 [647.300–731.100] | 186.400 [186.200–197.800] | 0.2813 |
| 1x | editor-water | firstFrameAfterMs | 814.400 [736.600–830.400] | 204.400 [195.400–215.200] | 0.2510 |
| 1x | editor-water | frameGapMs | 814.500 [736.600–830.600] | 204.500 [195.400–215.300] | 0.2511 |
| 1x | editor-water | staticCombinedMs | 651.000 [635.600–719.800] | 139.800 [134.000–143.900] | 0.2147 |
| 1x | editor-path | syncMs | 663.000 [632.100–676.700] | 159.600 [151.700–167.000] | 0.2407 |
| 1x | editor-path | firstFrameAfterMs | 745.200 [669.100–770.700] | 172.000 [163.600–181.500] | 0.2308 |
| 1x | editor-path | frameGapMs | 745.200 [669.300–770.800] | 172.000 [163.700–181.500] | 0.2308 |
| 1x | editor-path | staticCombinedMs | 652.700 [619.300–657.600] | 121.300 [121.100–133.500] | 0.1858 |
| 1x | control-wildlife | syncMs | 13.200 [9.500–14.200] | 13.300 [12.900–14.600] | 1.0076 |
| 1x | control-full-static | syncMs | 480.200 [477.000–649.100] | 861.500 [859.900–876.900] | 1.7940 |
| 1x | control-full-static | firstFrameAfterMs | 632.200 [560.900–755.800] | 868.100 [867.100–882.700] | 1.3731 |
| 1x | control-full-static | frameGapMs | 632.200 [560.900–755.900] | 868.200 [867.300–882.700] | 1.3733 |
| 1x | control-full-static | staticCombinedMs | 479.600 [476.000–648.000] | 710.800 [705.000–725.400] | 1.4821 |
| 4x | objective-ordinary | syncMs | 1.100 [0.300–1.100] | 0.700 [0.200–0.800] | 0.6364 |
| 4x | objective-rivet | syncMs | 4.300 [3.300–8.900] | 1.400 [1.200–9.900] | 0.3256 |
| 4x | objective-final | syncMs | 0.400 [0.300–1.100] | 0.300 [0.300–3.400] | 0.7500 |
| 4x | robot-recruit | syncMs | 0.600 [0.300–2.900] | 0.300 [0.200–0.500] | 0.5000 |
| 4x | editor-decor | syncMs | 58.500 [56.100–59.700] | 61.900 [53.400–64.100] | 1.0581 |
| 4x | editor-objective | syncMs | 39.300 [39.000–47.400] | 63.700 [48.700–114.700] | 1.6209 |
| 4x | editor-grass | syncMs | 43.000 [41.700–51.900] | 56.500 [50.100–64.700] | 1.3140 |
| 4x | editor-water | syncMs | 726.500 [698.200–743.300] | 285.500 [284.400–298.000] | 0.3930 |
| 4x | editor-water | firstFrameAfterMs | 764.600 [730.900–779.800] | 317.600 [313.700–321.100] | 0.4154 |
| 4x | editor-water | frameGapMs | 764.700 [730.900–779.800] | 317.700 [313.800–321.900] | 0.4155 |
| 4x | editor-water | staticCombinedMs | 667.800 [650.600–700.400] | 157.900 [155.300–168.900] | 0.2364 |
| 4x | editor-path | syncMs | 1112.700 [710.500–1180.100] | 266.800 [259.600–267.000] | 0.2398 |
| 4x | editor-path | firstFrameAfterMs | 1144.100 [739.900–1215.200] | 285.000 [278.700–286.200] | 0.2491 |
| 4x | editor-path | frameGapMs | 1144.200 [740.000–1215.300] | 285.900 [279.300–286.300] | 0.2499 |
| 4x | editor-path | staticCombinedMs | 1072.700 [665.500–1124.100] | 142.400 [139.000–145.300] | 0.1327 |
| 4x | control-wildlife | syncMs | 39.100 [39.000–46.900] | 45.500 [32.100–61.700] | 1.1637 |
| 4x | control-full-static | syncMs | 801.400 [622.600–932.800] | 1330.500 [1312.100–1340.600] | 1.6602 |
| 4x | control-full-static | firstFrameAfterMs | 840.700 [641.700–963.200] | 1355.700 [1327.600–1370.900] | 1.6126 |
| 4x | control-full-static | frameGapMs | 840.800 [641.900–963.300] | 1355.700 [1327.700–1371.600] | 1.6124 |
| 4x | control-full-static | staticCombinedMs | 799.100 [620.700–930.900] | 1196.500 [1174.900–1214.700] | 1.4973 |

Static combined time sums each record first: terrain baseline `static.build` + three `static.upload.*` phases; candidate terrain `static.plan` + `static.patch.build` + `static.patch.upload.color`. For the forced full control, each side includes `static.build` + all three `static.upload.*` phases and additionally `static.plan` when its explicitly observed capability identifies the current planner. A legacy full control must explicitly lack the planner, policy and optimized diagnostics. Nested scratch/floor/color-sync/overlay/footer phases are excluded from the sum because their work is already inside the build phase.

- 1x editor-water combined static raw samples (ms): {"baseline": [651.0, 635.6000000000349, 719.7999999999884], "candidate": [143.89999999990687, 133.99999999988358, 139.79999999993015]}
- 1x editor-path combined static raw samples (ms): {"baseline": [657.6000000000349, 652.7000000000698, 619.2999999999884], "candidate": [133.5, 121.29999999993015, 121.09999999997672]}
- 1x control-full-static combined static raw samples (ms): {"baseline": [648.0, 479.6000000000349, 476.0], "candidate": [710.8000000000466, 725.4000000000233, 705.0]}
- 4x editor-water combined static raw samples (ms): {"baseline": [700.3999999999651, 667.7999999999884, 650.5999999999767], "candidate": [157.90000000002328, 155.30000000016298, 168.90000000002328]}
- 4x editor-path combined static raw samples (ms): {"baseline": [1124.0999999999767, 1072.6999999999534, 665.5], "candidate": [145.30000000004657, 139.0, 142.40000000002328]}
- 4x control-full-static combined static raw samples (ms): {"baseline": [799.0999999999767, 930.9000000000233, 620.7000000000116], "candidate": [1214.7000000000698, 1174.8999999999069, 1196.4999999998836]}

## Measured candidate static work

Each numeric cell is median [minimum–maximum] over all three samples. `pixels` counts uploaded output; `rasterPixels` sums explicitly guarded redraw clips. `scratchPixels` reports peak source-canvas capacity; `scratchBytes` reports peak simultaneously allocated capacity. `scratchAllocationPixels`/`Bytes` sum all successful canvas allocations across each event, while attempts and successful counts are reported separately.

| Counter | 1x editor-water | 1x editor-path | 1x control-full-static | 4x editor-water | 4x editor-path | 4x control-full-static |
|---|---:|---:|---:|---:|---:|---:|
| colorPolicy | canvas2d-row-sync-v1 | canvas2d-row-sync-v1 | canvas2d-row-sync-v1 | canvas2d-row-sync-v1 | canvas2d-row-sync-v1 | canvas2d-row-sync-v1 |
| scratchMode | native-clip | native-clip | full | native-clip | native-clip | full |
| changedCells | 2 [2–2] | 1 [1–1] | 0 [0–0] | 2 [2–2] | 1 [1–1] | 0 [0–0] |
| rasterCells | 30 [30–30] | 25 [25–25] | 760 [760–760] | 30 [30–30] | 25 [25–25] | 760 [760–760] |
| pixels | 2627 [2627–2627] | 1443 [1443–1443] | 917604 [917604–917604] | 2627 [2627–2627] | 1443 [1443–1443] | 917604 [917604–917604] |
| rasterPixels | 20480 [20480–20480] | 16384 [16384–16384] | 917604 [917604–917604] | 20480 [20480–20480] | 16384 [16384–16384] | 917604 [917604–917604] |
| scratchPixels | 917604 [917604–917604] | 917604 [917604–917604] | 917604 [917604–917604] | 917604 [917604–917604] | 917604 [917604–917604] | 917604 [917604–917604] |
| scratchBytes | 3670416 [3670416–3670416] | 3670416 [3670416–3670416] | 11011248 [11011248–11011248] | 3670416 [3670416–3670416] | 3670416 [3670416–3670416] | 11011248 [11011248–11011248] |
| scratchAllocationAttempts | 1 [1–1] | 1 [1–1] | 3 [3–3] | 1 [1–1] | 1 [1–1] | 3 [3–3] |
| scratchAllocations | 1 [1–1] | 1 [1–1] | 3 [3–3] | 1 [1–1] | 1 [1–1] | 3 [3–3] |
| scratchAllocationPixels | 917604 [917604–917604] | 917604 [917604–917604] | 2752812 [2752812–2752812] | 917604 [917604–917604] | 917604 [917604–917604] | 2752812 [2752812–2752812] |
| scratchAllocationBytes | 3670416 [3670416–3670416] | 3670416 [3670416–3670416] | 11011248 [11011248–11011248] | 3670416 [3670416–3670416] | 3670416 [3670416–3670416] | 11011248 [11011248–11011248] |
| uploadCalls | 1 [1–1] | 1 [1–1] | 3 [3–3] | 1 [1–1] | 1 [1–1] | 3 [3–3] |
| uploadBytes | 10508 [10508–10508] | 5772 [5772–5772] | 11011248 [11011248–11011248] | 10508 [10508–10508] | 5772 [5772–5772] | 11011248 [11011248–11011248] |
| colorSyncAttempts | 5 [5–5] | 5 [5–5] | 19 [19–19] | 5 [5–5] | 5 [5–5] | 19 [19–19] |
| colorSyncReads | 5 [5–5] | 5 [5–5] | 19 [19–19] | 5 [5–5] | 5 [5–5] | 19 [19–19] |
| colorSyncPixels | 5 [5–5] | 5 [5–5] | 19 [19–19] | 5 [5–5] | 5 [5–5] | 19 [19–19] |
| readbackPixels | 5 [5–5] | 5 [5–5] | 19 [19–19] | 5 [5–5] | 5 [5–5] | 19 [19–19] |
| retainedScratchPixels | 0 [0–0] | 0 [0–0] | 0 [0–0] | 0 [0–0] | 0 [0–0] | 0 [0–0] |
| regions | 1 [1–1] | 1 [1–1] | 0 [0–0] | 1 [1–1] | 1 [1–1] | 0 [0–0] |
| colorSyncMs | 129.700 [124.100–130.300] | 112.300 [111.700–124.300] | 598.700 [595.500–602.400] | 124.300 [122.700–130.100] | 111.300 [109.300–112.500] | 714.000 [679.800–728.100] |
| colorSyncPhaseMs | 129.700 [124.100–130.300] | 112.300 [111.700–124.300] | 598.700 [595.500–602.400] | 124.300 [122.700–130.200] | 111.300 [109.300–112.500] | 714.000 [680.400–729.000] |

Color synchronization uses policy `canvas2d-row-sync-v1`. For every terrain sample, attempts, successful reads, pixels, `readbackPixels`, and `static.patch.color-sync` phase calls must each equal the sum of independently validated painted floor-row counts across all regions. Overlapping regions are charged separately. These counts describe the same work and are not added together. `colorSyncMs` measures read-body time; `colorSyncPhaseMs` reports the enclosing probe phase. Both are nonadditive components already included in `static.patch.build` and combined static time.

The separate current-policy full control requires all 760 floor cells, three simultaneously allocated native maps, one upload per map, and 19 successful one-pixel color reads. Its `colorSyncPhaseMs` is `static.full.color-sync`, nested inside `static.build`; it is reported without adding it to the parent. Current-policy controls require one planning call; legacy controls require zero planning/synchronization calls and null diagnostics. Unknown/missing capabilities are rejected. Neither side may execute any partial phase or unrelated water work. After the timed refresh and first post-event frame, both sides must show a coherent background key and released full CPU surfaces. Candidate full/terrain parity is captured after the timed event and frame by the harness.

- 1x full-control observed policies/planner: {"baseline": {"colorPolicy": null, "hasStaticPlanner": false}, "candidate": {"colorPolicy": "canvas2d-row-sync-v1", "hasStaticPlanner": true}}
- 4x full-control observed policies/planner: {"baseline": {"colorPolicy": null, "hasStaticPlanner": false}, "candidate": {"colorPolicy": "canvas2d-row-sync-v1", "hasStaticPlanner": true}}

Partial-event capacity validation applies the 1MiB local peak, 4MiB native peak, and 8MiB cumulative color-allocation limits. Source-canvas mode/dimensions, local 32px aligned guards, floor-input halos, and flipped source crops are independently derived from each region. Allocation counters must match those capacities in every sample; no repair, full build, material upload, or retained scratch is accepted in a partial event. Full controls instead require the independently computed three-map native capacity, without applying partial-work ceilings.

- 1x editor-water, 3/3 samples: `[{"canvas":[0,0,1278,718],"clip":[432,16,160,128],"output":[479,63,71,37],"sourceCells":[13,0,19,5],"unpackSkips":[479,618]}]`
- 1x editor-path, 3/3 samples: `[{"canvas":[0,0,1278,718],"clip":[16,16,128,128],"output":[63,63,39,37],"sourceCells":[0,0,5,5],"unpackSkips":[63,618]}]`
- 4x editor-water, 3/3 samples: `[{"canvas":[0,0,1278,718],"clip":[432,16,160,128],"output":[479,63,71,37],"sourceCells":[13,0,19,5],"unpackSkips":[479,618]}]`
- 4x editor-path, 3/3 samples: `[{"canvas":[0,0,1278,718],"clip":[16,16,128,128],"output":[63,63,39,37],"sourceCells":[0,0,5,5],"unpackSkips":[63,618]}]`

The 20% guarded-redraw limit does not bound total GPU writes or physical GPU memory: allocating or initializing a native canvas can touch the full target. Build timing includes that work. performance.json reports region geometry and observed capacity counters; independent Canvas clip/transform traces belong to the native browser qualification fixture, not this timing artifact.

## Baseline counter availability

- 1x editor-water: missing samples per counter {"changedCells": 3, "colorSyncAttempts": 3, "colorSyncMs": 3, "colorSyncPixels": 3, "colorSyncReads": 3, "pixels": 3, "rasterCells": 3, "rasterPixels": 3, "readbackPixels": 3, "retainedScratchPixels": 3, "scratchAllocationAttempts": 3, "scratchAllocationBytes": 3, "scratchAllocationPixels": 3, "scratchAllocations": 3, "scratchBytes": 3, "scratchPixels": 3, "uploadBytes": 3, "uploadCalls": 3}.
- 1x editor-path: missing samples per counter {"changedCells": 3, "colorSyncAttempts": 3, "colorSyncMs": 3, "colorSyncPixels": 3, "colorSyncReads": 3, "pixels": 3, "rasterCells": 3, "rasterPixels": 3, "readbackPixels": 3, "retainedScratchPixels": 3, "scratchAllocationAttempts": 3, "scratchAllocationBytes": 3, "scratchAllocationPixels": 3, "scratchAllocations": 3, "scratchBytes": 3, "scratchPixels": 3, "uploadBytes": 3, "uploadCalls": 3}.
- 1x control-full-static: missing samples per counter {"changedCells": 3, "colorSyncAttempts": 3, "colorSyncMs": 3, "colorSyncPixels": 3, "colorSyncReads": 3, "pixels": 3, "rasterCells": 3, "rasterPixels": 3, "readbackPixels": 3, "retainedScratchPixels": 3, "scratchAllocationAttempts": 3, "scratchAllocationBytes": 3, "scratchAllocationPixels": 3, "scratchAllocations": 3, "scratchBytes": 3, "scratchPixels": 3, "uploadBytes": 3, "uploadCalls": 3}.
- 4x editor-water: missing samples per counter {"changedCells": 3, "colorSyncAttempts": 3, "colorSyncMs": 3, "colorSyncPixels": 3, "colorSyncReads": 3, "pixels": 3, "rasterCells": 3, "rasterPixels": 3, "readbackPixels": 3, "retainedScratchPixels": 3, "scratchAllocationAttempts": 3, "scratchAllocationBytes": 3, "scratchAllocationPixels": 3, "scratchAllocations": 3, "scratchBytes": 3, "scratchPixels": 3, "uploadBytes": 3, "uploadCalls": 3}.
- 4x editor-path: missing samples per counter {"changedCells": 3, "colorSyncAttempts": 3, "colorSyncMs": 3, "colorSyncPixels": 3, "colorSyncReads": 3, "pixels": 3, "rasterCells": 3, "rasterPixels": 3, "readbackPixels": 3, "retainedScratchPixels": 3, "scratchAllocationAttempts": 3, "scratchAllocationBytes": 3, "scratchAllocationPixels": 3, "scratchAllocations": 3, "scratchBytes": 3, "scratchPixels": 3, "uploadBytes": 3, "uploadCalls": 3}.
- 4x control-full-static: missing samples per counter {"changedCells": 3, "colorSyncAttempts": 3, "colorSyncMs": 3, "colorSyncPixels": 3, "colorSyncReads": 3, "pixels": 3, "rasterCells": 3, "rasterPixels": 3, "readbackPixels": 3, "retainedScratchPixels": 3, "scratchAllocationAttempts": 3, "scratchAllocationBytes": 3, "scratchAllocationPixels": 3, "scratchAllocations": 3, "scratchBytes": 3, "scratchPixels": 3, "uploadBytes": 3, "uploadCalls": 3}.

No missing baseline counters are converted to zero or inferred from native dimensions. Independently, baseline phaseCalls verify one full build and one upload per color/normal/specular channel in each reviewed static event. Baseline static parity is not required by this harness; candidate parity is required for every water/path sample and every full-control sample when present.

Environment equality and CI provenance support the same-host pairing; performance.json does not contain an independent host identifier. The harness measures the baseline first, then the candidate, without interleaving. Three samples provide diagnostic medians/ranges, not a tail-latency or physical-device guarantee. firstFrameAfterMs runs from event start to the first post-event frame marker after the JavaScript render loop; frameGapMs spans the last pre-event and first post-event markers. These are CPU-side markers, not GPU-completion fences or measurements of display scanout. Zero-duration phases can reflect timer resolution. Historical PERF-003 measurements are not used in these ratios.
