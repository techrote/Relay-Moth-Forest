#!/usr/bin/env python3
"""PERF-001A deterministic browser timing harness for state-change rebuild stalls.

This is diagnostic evidence, not a universal CI latency benchmark. It drives the
production WebGL2 runtime from a localhost origin so localStorage, Canvas2D,
texture uploads, editor invalidation and the animation loop are real browser
operations. Chromium CPU throttling can be used to expose low-end sensitivity.
"""
from __future__ import annotations

import argparse
import json
import math
import shutil
import statistics
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
    "control-wildlife",
]

SCENARIO_JS = r"""
async (name) => {
  const twoFrames=()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
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
    relayMothPerf.enable(true);relayMothPerf.clear();
  };
  const finish=async()=>{
    for(let i=0;i<8;i++){
      await new Promise(resolve=>requestAnimationFrame(resolve));
      const records=relayMothPerf.snapshot().records;
      if(records.length&&!records[records.length-1].pendingFrame)return records[records.length-1];
    }
    const snap=relayMothPerf.snapshot();
    if(!snap.records.length)throw Error('Scenario '+name+' produced no timing record');
    throw Error('Scenario '+name+' did not reach a post-event frame: '+JSON.stringify(snap.records[snap.records.length-1]));
  };
  const manual=async(label,meta,fn)=>{
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
    game.bgKey='';game.ensureBackground(true);game.updateUI();
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
    return manual('editor-water',{room:game.room.key,mutation:'water-tile'},()=>{
      const [x,y]=raw.water[0];raw.water[0]=[Math.max(1,x-1),y];
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
def local_server():
    handler = partial(QuietHandler, directory=str(ROOT))
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
        if v and not k.endswith(".total") and k not in {"foliage.descriptor.build"}
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


def main():
    args = parse_args()
    if args.samples < 1:
        raise SystemExit("--samples must be >= 1")
    throttles = args.throttles or [1.0]
    from playwright.sync_api import sync_playwright

    result = {
        "schema": "relay-moth-perf-001a/v1",
        "note": "Diagnostic relative evidence; absolute CI milliseconds are not a universal performance target.",
        "samplesPerScenario": args.samples,
        "runs": [],
    }

    with local_server() as base, sync_playwright() as p:
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
            run = {"cpuThrottle": rate, "environment": env, "scenarios": {}}
            for scenario in SCENARIOS:
                records = []
                for _ in range(args.samples):
                    record = page.evaluate(SCENARIO_JS, scenario)
                    records.append(record)
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
    if args.out:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
        print(f"WROTE {args.out}")
    print("PERF-001A STATE-CHANGE TIMING HARNESS PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
