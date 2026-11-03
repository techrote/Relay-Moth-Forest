#!/usr/bin/env python3
"""PERF-001A deterministic browser timing harness for state-change rebuild stalls.

This is diagnostic evidence, not a universal CI latency benchmark. It drives the
production WebGL2 runtime from a localhost origin so localStorage, Canvas2D,
texture uploads, editor invalidation and the animation loop are real browser
operations. Chromium CPU throttling can be used to expose low-end sensitivity.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import shutil
import statistics
import subprocess
import sys
import threading
from contextlib import contextmanager
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SCENARIOS = [
    "objective-ordinary",
    "objective-rivet",
    "objective-final",
    "robot-recruit",
    "editor-decor",
    "editor-objective",
    "editor-grass",
    "editor-water",
    "editor-path",
    "control-wildlife",
]

SCENARIO_JS = r"""
async (name) => {
  const twoFrames=()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
  const waterCounters=()=>({
    fullRebuilds:game.renderer.surfaceFX?.water?.rebuilds||0,
    boundedUpdates:game.renderer.surfaceFX?.water?.boundedUpdates||0,
    fullLegacyUploads:game.renderer.waterMaskFullUploads||0,
    boundedLegacyUploads:game.renderer.waterMaskBoundedUploads||0,
  });
  let waterBefore=null;
  const decorate=r=>{
    const after=waterCounters();
    return {...r,staticDiagnostics:game.staticRefreshStats||null,waterDiagnostics:game.renderer.surfaceFX?.diagnostics?.().water||null,
      legacyWater:game.renderer.lastWaterMaskUpdate||null,
      waterSourceReadFrequently:game.waterMaskCanvas?.getContext('2d').getContextAttributes?.().willReadFrequently??null,
      waterWorkDelta:Object.fromEntries(Object.keys(after).map(k=>[k,after[k]-(waterBefore?.[k]??after[k])]))};
  };
  const reset=async(roomKey,completed=[],editor=false)=>{
    relayMothPerf.enable(false);relayMothPerf.clear();
    if(globalThis.rmfEditor?.active)rmfEditor.toggle(false);
    game.maps=structuredClone(window.__perfBaselineMaps);
    game.state.completed=new Set(completed);
    game.state.shown=new Set();
    game.state.moths=new Set();
    game.state.robots=new Set();
    game.robotCatalog=game.buildRobotCatalog();
    game.followers.units=[];
    game.rooms=game.storyData.rooms.map((sp,i)=>new Room(i,sp,game.maps));
    const idx=game.storyData.rooms.findIndex(r=>r.key===roomKey);
    if(idx<0)throw Error('Unknown performance room '+roomKey);
    game.enterRoom(idx,null);
    document.querySelector('#storyModal')?.classList.add('hidden');
    game.paused=true;
    if(editor)rmfEditor.toggle(true);
    await twoFrames();
    waterBefore=waterCounters();
    relayMothPerf.enable(true);relayMothPerf.clear();
  };
  const finish=async()=>{
    for(let i=0;i<8;i++){
      await new Promise(resolve=>requestAnimationFrame(resolve));
      const records=relayMothPerf.snapshot().records;
      if(records.length&&!records[records.length-1].pendingFrame)return decorate(records[records.length-1]);
    }
    const snap=relayMothPerf.snapshot();
    if(!snap.records.length)throw Error('Scenario '+name+' produced no timing record');
    throw Error('Scenario '+name+' did not reach a post-event frame: '+JSON.stringify(snap.records[snap.records.length-1]));
  };
  const manual=async(label,meta,fn)=>{
    waterBefore=waterCounters();
    const token=relayMothPerf.begin(label,meta);
    try{fn()}finally{relayMothPerf.end(token)}
    return finish();
  };

  if(name==='objective-ordinary'){
    await reset('lantern_lane');
    const obj=game.room.spec.objects[0],tile=game.room.objects[obj.object_id];
    [game.x,game.y]=game.room.center(tile);game.checkObjectives();
    return finish();
  }
  if(name==='objective-rivet'){
    await reset('tin_stream');
    const obj=game.room.spec.objects[0],tile=game.room.objects[obj.object_id];
    [game.x,game.y]=game.room.center(tile);game.checkObjectives();
    return finish();
  }
  if(name==='objective-final'){
    await reset('lantern_lane',['lane_a','lane_b']);
    // PERF-002 static backing is progression-invariant; only refresh objective/UI state.
    // Forcing a second full backing rebuild here would contaminate the first post-event
    // frame with unrelated warm-up GPU work.
    game.updateUI();
    await twoFrames();relayMothPerf.clear();
    const obj=game.room.spec.objects.find(o=>o.object_id==='lane_c'),tile=game.room.objects[obj.object_id];
    [game.x,game.y]=game.room.center(tile);game.checkObjectives();
    return finish();
  }
  if(name==='robot-recruit'){
    await reset('home_loop');
    const robot=game.room.decorRobots.find(r=>r.id==='moss_bot')||game.room.decorRobots.find(r=>r.id);
    if(!robot)throw Error('Persistent robot fixture missing');
    [game.x,game.y]=game.room.center(robot.tile);game.checkRobotPickups();
    return finish();
  }
  if(name==='editor-decor'){
    await reset('quiet_nest',[],true);
    const raw=rmfEditor.rawRoom(),sprite=(game.art.roles.decor_plants||game.art.roles.foliage_v401_all||[])[0];
    if(!sprite)throw Error('Decor sprite fixture missing');
    raw.editor_decor=raw.editor_decor||[];
    raw.editor_decor.push({editor_id:'perf_decor',x:116,y:142,sprite,scale:1,alpha:1});
    relayMothPerf.enable(false);rmfEditor.queueInvalidation(rmfEditor.invalidationForType('decor'),{sync:true});await twoFrames();
    relayMothPerf.enable(true);relayMothPerf.clear();
    return manual('editor-decor',{room:game.room.key,mutation:'free-position-decor'},()=>{
      raw.editor_decor.find(d=>d.editor_id==='perf_decor').x+=7;
      rmfEditor.queueInvalidation(rmfEditor.invalidationForType('decor'),{sync:true});
    });
  }
  if(name==='editor-objective'){
    await reset('lantern_lane',[],true);
    const raw=rmfEditor.rawRoom(),id='lane_a',old=raw.objects[id];
    return manual('editor-objective',{room:game.room.key,mutation:'objective-tile'},()=>{
      raw.objects[id]=[old[0]+1,old[1]];
      rmfEditor.queueInvalidation(rmfEditor.invalidationForType('objective'),{sync:true});
    });
  }
  if(name==='editor-grass'){
    await reset('quiet_nest',[],true);
    const raw=rmfEditor.rawRoom();if(!raw.grass_clumps?.length)throw Error('Grass fixture missing');
    return manual('editor-grass',{room:game.room.key,mutation:'grass-x'},()=>{
      raw.grass_clumps[0].x+=7;
      rmfEditor.queueInvalidation(RelayEditorInvalidation.FOLIAGE,{sync:true});
    });
  }
  if(name==='editor-water'){
    await reset('tin_stream',[],true);
    const raw=rmfEditor.rawRoom();if(!raw.water?.length)throw Error('Water fixture missing');
    // The first authored water cell sits under a wall. Move visible water into
    // open ground so this measures real color/material work on both sources.
    let move=null;
    for(let i=0;i<raw.water.length&&!move;i++){
      const [x,y]=raw.water[i],key=x+','+y;
      if(game.room.walls.has(key)||game.room.border.has(key))continue;
      for(const [nx,ny] of [[x-1,y],[x+1,y],[x,y-1],[x,y+1]]){
        const next=nx+','+ny;
        if(nx>0&&nx<39&&ny>0&&ny<18&&!game.room.walls.has(next)&&!game.room.water.has(next)&&!game.room.border.has(next)){move={index:i,tile:[nx,ny]};break}
      }
    }
    if(!move)throw Error('Visible same-count water move fixture missing');
    return manual('editor-water',{room:game.room.key,mutation:'water-tile'},()=>{
      raw.water[move.index]=move.tile;
      rmfEditor.queueInvalidation(RelayEditorInvalidation.TERRAIN,{sync:true});
    });
  }
  if(name==='editor-path'){
    await reset('quiet_nest',[],true);
    const raw=rmfEditor.rawRoom();raw.path_cells=raw.path_cells||[];
    let tile=null;
    for(let y=2;y<17&&!tile;y++)for(let x=2;x<38;x++){
      const key=x+','+y;
      if(!game.room.walls.has(key)&&!game.room.water.has(key)&&!game.room.paths.has(key)){tile=[x,y];break}
    }
    if(!tile)throw Error('Open path fixture missing');
    return manual('editor-path',{room:game.room.key,mutation:'ground-to-path'},()=>{
      raw.path_cells.push(tile);
      rmfEditor.queueInvalidation(RelayEditorInvalidation.TERRAIN,{sync:true});
    });
  }
  if(name==='control-wildlife'){
    await reset('quiet_nest',[],true);
    const raw=rmfEditor.rawRoom();if(!raw.creature_groups?.length)throw Error('Wildlife fixture missing');
    return manual('control-wildlife',{room:game.room.key,mutation:'creature-count'},()=>{
      raw.creature_groups[0].count=Math.max(1,Number(raw.creature_groups[0].count||1)+1);
      rmfEditor.queueInvalidation(RelayEditorInvalidation.CREATURES,{sync:true});
    });
  }
  throw Error('Unknown scenario '+name);
}
"""


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass

    def do_GET(self):
        if self.path.split("?", 1)[0] == "/favicon.ico":
            self.send_response(204)
            self.end_headers()
            return
        super().do_GET()


@contextmanager
def local_server(root=ROOT):
    handler = partial(QuietHandler, directory=str(root))
    server = ThreadingHTTPServer(("127.0.0.1", 0), handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield f"http://127.0.0.1:{server.server_address[1]}"
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=2)


def percentile(values, q):
    if not values:
        return None
    data = sorted(float(v) for v in values)
    if len(data) == 1:
        return data[0]
    pos = (len(data) - 1) * q
    lo, hi = math.floor(pos), math.ceil(pos)
    if lo == hi:
        return data[lo]
    return data[lo] + (data[hi] - data[lo]) * (pos - lo)


def stats(values):
    data = [float(v) for v in values if v is not None]
    if not data:
        return None
    return {
        "median": statistics.median(data),
        "p95": percentile(data, 0.95),
        "max": max(data),
        "samples": data,
    }


def summarize(records):
    summary = {
        "syncMs": stats([r.get("syncMs") for r in records]),
        "frameGapMs": stats([r.get("frameGapMs") for r in records]),
        "firstFrameAfterMs": stats([r.get("firstFrameAfterMs") for r in records]),
        "phases": {},
    }
    phase_names = sorted({k for r in records for k in r.get("phases", {})})
    for name in phase_names:
        summary["phases"][name] = stats([r.get("phases", {}).get(name, 0.0) for r in records])
    leaf = {
        k: v for k, v in summary["phases"].items()
        if v and not k.endswith(".total") and k not in {"foliage.descriptor.build", "water.upload"}
    }
    if leaf:
        dominant = max(leaf.items(), key=lambda kv: kv[1]["median"])
        summary["dominantMedianPhase"] = {"name": dominant[0], "ms": dominant[1]["median"]}
    return summary


def parse_args():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", type=Path, help="Write compact JSON evidence here.")
    ap.add_argument("--chromium", help="Explicit Chromium/Chrome executable.")
    ap.add_argument("--samples", type=int, default=3)
    ap.add_argument("--baseline-root", type=Path, help="First measure an accepted source checkout on this same host; candidate bounded-work assertions remain mandatory.")
    ap.add_argument(
        "--cpu-throttle",
        type=float,
        action="append",
        dest="throttles",
        help="Chromium CPU throttling rate. Repeat for multiple rates; default: 1.",
    )
    ap.add_argument("--viewport-width", type=int, default=1280)
    ap.add_argument("--viewport-height", type=int, default=800)
    return ap.parse_args()


def source_identity(root):
    """Keep archive benchmarking usable without pretending it has a Git SHA."""
    root = root.resolve()
    manifest = root / "SHA256SUMS.txt"
    record = {"commit": None, "tree": None, "trackedDirty": None,
              "manifestSha256": hashlib.sha256(manifest.read_bytes()).hexdigest() if manifest.is_file() else None}
    try:
        git = lambda *args: subprocess.check_output(["git", "-C", str(root), *args], text=True, stderr=subprocess.DEVNULL).strip()
        # An archive extracted inside another checkout is still an archive.
        if Path(git("rev-parse", "--show-toplevel")).resolve() == root:
            record.update(commit=git("rev-parse", "HEAD"), tree=git("rev-parse", "HEAD^{tree}"),
                          trackedDirty=bool(git("status", "--porcelain", "--untracked-files=no")))
    except (OSError, subprocess.CalledProcessError):
        pass
    return record


def measure_source(args, root, validate_static=True):
    if args.samples < 1:
        raise SystemExit("--samples must be >= 1")
    throttles = args.throttles or [1.0]
    from playwright.sync_api import sync_playwright

    result = {
        "schema": "relay-moth-perf-001a/v1",
        "note": "Diagnostic relative evidence; absolute CI milliseconds are not a universal performance target.",
        "samplesPerScenario": args.samples,
        "runs": [],
        "source": source_identity(root),
    }

    with local_server(root) as base, sync_playwright() as p:
        executable = args.chromium or shutil.which("chromium")
        flags = ["--no-sandbox", "--disable-dev-shm-usage", "--ignore-gpu-blocklist"]
        if sys.platform.startswith("linux"):
            flags += ["--use-gl=angle", "--use-angle=gl-egl", "--ozone-platform=headless"]
        launch = {"headless": True, "args": flags}
        if executable:
            launch["executable_path"] = executable
        browser = p.chromium.launch(**launch)
        context = browser.new_context(
            viewport={"width": args.viewport_width, "height": args.viewport_height},
            device_scale_factor=1,
        )
        page = context.new_page()
        errors = []
        page.on("pageerror", lambda e: errors.append("pageerror: " + str(e)))
        page.on("console", lambda m: errors.append("console: " + m.text) if m.type == "error" else None)
        page.goto(base + "/index.html", wait_until="load", timeout=60000)
        page.wait_for_function("document.body.dataset.ready==='1'", timeout=60000)
        page.evaluate("window.__perfBaselineMaps=structuredClone(game.maps)")
        if validate_static:
            page.add_script_tag(content=(ROOT / "tests/current/static_terrain_browser_415.js").read_text(encoding="utf-8"))
        cdp = context.new_cdp_session(page)

        for rate in throttles:
            if rate < 1:
                raise SystemExit("CPU throttle rate must be >= 1")
            cdp.send("Emulation.setCPUThrottlingRate", {"rate": rate})
            page.wait_for_timeout(150)
            env = page.evaluate(
                """()=>({
                    userAgent:navigator.userAgent,
                    dpr:devicePixelRatio,
                    viewport:[innerWidth,innerHeight],
                    canvas:[game.canvas.width,game.canvas.height],
                    requestedNative:[game.renderer.requestedNativeW,game.renderer.requestedNativeH],
                    native:[game.renderer.nativeW,game.renderer.nativeH],
                    renderScale:game.renderer.renderScale,
                    graphics:{...game.graphics},
                    driver:(()=>{const g=game.renderer.gl,d=g.getExtension('WEBGL_debug_renderer_info');return {
                      version:g.getParameter(g.VERSION),
                      renderer:d?g.getParameter(d.UNMASKED_RENDERER_WEBGL):g.getParameter(g.RENDERER)
                    }})()
                })"""
            )
            env["browserVersion"] = browser.version
            run = {"cpuThrottle": rate, "environment": env, "scenarios": {}}
            for scenario in SCENARIOS:
                records = []
                for sample in range(args.samples):
                    record = page.evaluate(SCENARIO_JS, scenario)
                    if validate_static and scenario in {"editor-water", "editor-path"}:
                        # The event and first post-event frame have finished. Verify
                        # every GPU byte at the actual responsive native size with
                        # the probe disabled; the next reset reenables measurement.
                        try:
                            record["staticParity"] = page.evaluate(
                                """label => {
                                    relayMothPerf.enable(false);
                                    const native=[game.renderer.nativeW,game.renderer.nativeH];
                                    // These are reported output bounds for failure
                                    // diagnostics, not timed upload instrumentation.
                                    const outputs=(game.staticRefreshStats?.regions||[]).map(r=>({
                                      channel:'color',x:r.x,y:native[1]-r.y-r.height,
                                      width:r.width,height:r.height
                                    }));
                                    return {
                                      native,
                                      maps:auditStaticTerrain.parity(label,null,outputs)
                                    };
                                }""",
                                f"performance {rate:g}x {scenario} sample {sample + 1}",
                            )
                        except Exception:
                            try:
                                diagnostics = page.evaluate("() => window.__staticRasterDiagnostics || null")
                            except Exception as diagnostic_error:
                                diagnostics = {"diagnosticReadError": str(diagnostic_error)}
                            evidence = {"scenario": scenario, "sample": sample + 1,
                                        "cpuThrottle": rate, "diagnostics": diagnostics}
                            print("PERF-004 PERFORMANCE STATIC RASTER DIAGNOSTICS " + json.dumps(evidence), flush=True)
                            if args.out:
                                diagnostic_path = args.out.with_name(args.out.stem + "-static-raster-diagnostics.json")
                                diagnostic_path.parent.mkdir(parents=True, exist_ok=True)
                                diagnostic_path.write_text(json.dumps(evidence, indent=2) + "\n", encoding="utf-8")
                                print(f"WROTE {diagnostic_path}", flush=True)
                            raise
                    records.append(record)
                if scenario in {"objective-rivet", "editor-water"}:
                    for record in records:
                        water = (record.get("waterDiagnostics") or {}).get("lastUpdate") or {}
                        legacy = record.get("legacyWater") or {}
                        assert water.get("mode") == "bounded", (scenario, "SurfaceFX did not use bounded update", water)
                        assert legacy.get("mode") == "bounded", (scenario, "legacy mask did not use bounded update", legacy)
                        field = water.get("field") or [0, 0]
                        assert water.get("uploadBytes", 10**12) < field[0] * field[1] * 4, (scenario, "bounded field uploaded full texture", water)
                        work = record.get("waterWorkDelta") or {}
                        assert work.get("fullRebuilds") == 0 and work.get("fullLegacyUploads") == 0, (scenario, "bounded event also ran a full refresh", work)
                        assert work.get("boundedUpdates") == 1 and work.get("boundedLegacyUploads") == 1, (scenario, "unexpected water refresh count", work)
                        assert 0 < water.get("distanceCells", 10**12) < field[0] * field[1], (scenario, "unbounded shore work", water)
                        assert 0 < water.get("acquirePixels", 10**12) < field[0] * field[1], (scenario, "unbounded mask acquisition", water)
                        assert 0 < legacy.get("uploadBytes", 10**12) < 640 * 360 * 4, (scenario, "unbounded legacy upload", legacy)
                        assert record.get("waterSourceReadFrequently") is True, (scenario, "CPU mask backing was not selected at context creation")
                if validate_static and scenario in {"editor-water", "editor-path"}:
                    for record in records:
                        static = record.get("staticDiagnostics") or {}
                        native_width, native_height = env["native"]
                        native_area = native_width * native_height
                        fractional = native_width % 640 != 0 or native_height % 360 != 0
                        scratch_mode = "native-clip" if fractional else "local"
                        regions = static.get("regions") or []
                        sync_reads = sum(region["ty1"] - region["ty0"] for region in regions)
                        assert static.get("colorPolicy") == "canvas2d-row-sync-v1", (scenario, "unexpected static color policy", static)
                        assert sync_reads > 0 and all(static.get(key) == sync_reads for key in ("colorSyncAttempts", "colorSyncReads", "colorSyncPixels", "readbackPixels")), (scenario, "color synchronization is not one pixel per painted floor row", static)
                        assert isinstance(static.get("colorSyncMs"), (int, float)) and math.isfinite(static["colorSyncMs"]) and static["colorSyncMs"] >= 0, (scenario, "missing color synchronization timing", static)
                        assert static.get("mode") == "patch", (scenario, "static backing did not use a bounded patch", static)
                        assert record.get("phaseCalls", {}).get("static.build", 0) == 0, (scenario, "small terrain edit invoked full painter")
                        assert 0 < static.get("rasterCells", 10**12) <= 40 * 19 * .35, (scenario, "unbounded floor raster", static)
                        assert 0 < static.get("rasterPixels", 10**12) <= native_area * .20, (scenario, "unbounded clipped redraw area", static)
                        assert 0 < static.get("pixels", 10**12) <= native_area * .20, (scenario, "unbounded output area", static)
                        assert 0 < static.get("uploadBytes", 10**12) < native_area * 4, (scenario, "full static color upload", static)
                        assert regions and static.get("uploadCalls") == len(regions), (scenario, "expected one color upload per region", static)
                        assert static.get("uploadBytes") == static.get("pixels", -1) * 4, (scenario, "color upload byte accounting differs", static)
                        capacities = []
                        for region in regions:
                            canvas_x, canvas_y = (0, 0) if fractional else (region["rasterX"], region["rasterY"])
                            canvas_width, canvas_height = env["native"] if fractional else (region["rasterWidth"], region["rasterHeight"])
                            assert region.get("canvasMode") == scratch_mode and region.get("canvasX") == canvas_x and region.get("canvasY") == canvas_y, (scenario, "wrong source canvas mode or origin", region)
                            assert region.get("canvasWidth") == canvas_width and region.get("canvasHeight") == canvas_height, (scenario, "wrong source canvas dimensions", region)
                            capacities.append(canvas_width * canvas_height)
                        assert static.get("scratchMode") == scratch_mode, (scenario, "wrong scratch policy for native scale", static)
                        assert static.get("scratchPixels") == max(capacities) and static.get("scratchBytes") == max(capacities) * 4, (scenario, "peak source canvas capacity accounting differs", static)
                        assert max(capacities) <= (1048576 if fractional else 262144), (scenario, "source canvas exceeds native4MiB/local1MiB capacity", static)
                        assert static.get("scratchAllocationAttempts") == len(regions) and static.get("scratchAllocations") == len(regions), (scenario, "unexpected scratch allocation count", static)
                        assert static.get("scratchAllocationPixels") == sum(capacities) and static.get("scratchAllocationBytes") == sum(capacities) * 4, (scenario, "cumulative source canvas allocation accounting differs", static)
                        assert sum(capacities) <= 2097152, (scenario, "source canvas allocations exceed8MiB cumulative capacity", static)
                        assert static.get("rasterPixels") == sum(region["rasterWidth"] * region["rasterHeight"] for region in regions), (scenario, "clipped redraw area conflates canvas capacity", static)
                        assert record.get("phaseCalls", {}).get("static.patch.upload.normal", 0) == 0 and record.get("phaseCalls", {}).get("static.patch.upload.specular", 0) == 0, (scenario, "unchanged material textures were uploaded", static)
                        assert static.get("retainedScratchPixels") == 0, (scenario, "retained scratch", static)
                run["scenarios"][scenario] = {
                    "summary": summarize(records),
                    "records": records,
                }
                med = run["scenarios"][scenario]["summary"]["syncMs"]["median"]
                gap = run["scenarios"][scenario]["summary"]["frameGapMs"]["median"]
                dom = run["scenarios"][scenario]["summary"].get("dominantMedianPhase", {})
                print(
                    f"PERF {rate:g}x {scenario}: sync median={med:.2f}ms "
                    f"frame-gap median={gap:.2f}ms dominant={dom.get('name')} "
                    f"{dom.get('ms', 0):.2f}ms",
                    flush=True,
                )
            result["runs"].append(run)

        cdp.send("Emulation.setCPUThrottlingRate", {"rate": 1})
        result["browserErrors"] = errors
        browser.close()

    if errors:
        raise AssertionError("Browser runtime errors during performance harness: " + "; ".join(errors))
    return result


def main():
    args = parse_args()
    baseline = measure_source(args, args.baseline_root.resolve(), validate_static=False) if args.baseline_root else None
    result = measure_source(args, ROOT)
    if baseline:
        result["baseline"] = baseline
        result["comparison"] = []
        for before, after in zip(baseline["runs"], result["runs"]):
            for scenario in SCENARIOS:
                old = before["scenarios"][scenario]["summary"]["syncMs"]["median"]
                new = after["scenarios"][scenario]["summary"]["syncMs"]["median"]
                result["comparison"].append({"cpuThrottle": after["cpuThrottle"], "scenario": scenario, "beforeMedianMs": old, "afterMedianMs": new, "ratio": new / old if old else None})
    if args.out:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
        print(f"WROTE {args.out}")
    print("PERF-001A STATE-CHANGE TIMING HARNESS PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
