#!/usr/bin/env python3
"""Isolated, test-only OOB row-call experiment; never production qualification.

Run the unchanged exact native audit with only production buildSurface row calls
redirected. Its frozen selected-policy full renderer keeps in-bounds reads.
Then compare the same source's in-bounds and OOB variants on the same browser,
with the original event actions and a real animation loop. Each timed result is
compared exactly against an in-bounds full reference after timing has finished.
No result from this script belongs in the production paired-source parser.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
from pathlib import Path
import platform
import re
import shutil
import subprocess
import sys

import browser_render_regression_414 as native
from state_change_performance_415 import (
    SCENARIO_JS, source_identity, summarize, validate_full_static_control,
)

ROOT = Path(__file__).resolve().parents[2]
EXPERIMENT_BASE = "d8456ff3afe7b61a7a5aa6ec9eb45a84bcfb6008"
FROZEN_INPUTS = {
    "game.js": "d7da5d34fcc16e018e501b363275347fbbdf6cdc66cc2749ea955c104c90efe1",
    "static_terrain.js": "bd3573efd69ec1187f0e357c5fe3a6a38b7704ff1e3d62883189af17bfe37ad8",
    "tests/current/static_terrain_browser_415.js": "17e6b9bb9c20195036e80b90346278a10b8e358e635998ba723cab1d84cc1050",
    "tests/current/state_change_performance_415.py": "0db33f90fa6a41de1cc44e2f7bda0c21b398acca8bf52fd414fa0f8dca7446fd",
    "tests/current/browser_render_regression_414.py": "0584f88df80cbbc6316fad1fae2485e9b6c8f3d52ae26690fb2fd7669ff70c99",
    ".github/workflows/validate.yml": "72c85f2b350c1c5816b57cc0663ed4ef4c5e45b755f90625b42794571c8687e9",
}
SCENARIOS = ("editor-water", "editor-path", "control-full-static")
CHANNELS = {"color", "normal", "specular"}
ENVIRONMENT_JS = """() => {
  const g=game.renderer.gl,d=g.getExtension('WEBGL_debug_renderer_info');
  return {userAgent:navigator.userAgent,dpr:devicePixelRatio,viewport:[innerWidth,innerHeight],
    canvas:[game.canvas.width,game.canvas.height],native:[game.renderer.nativeW,game.renderer.nativeH],
    requestedNative:[game.renderer.requestedNativeW,game.renderer.requestedNativeH],renderScale:game.renderer.renderScale,
    graphics:{...game.graphics},driver:{version:g.getParameter(g.VERSION),
      renderer:d?g.getParameter(d.UNMASKED_RENDERER_WEBGL):g.getParameter(g.RENDERER)}};
}"""
PARITY_JS = """label => {
  relayMothPerf.enable(false);
  return relayRowReadDiagnostic.withMode('inbounds','post-timing-original-policy-reference',()=>{
    const native=[game.renderer.nativeW,game.renderer.nativeH];
    const outputs=(game.staticRefreshStats?.regions||[]).map(r=>({channel:'color',x:r.x,y:native[1]-r.y-r.height,width:r.width,height:r.height}));
    return {native,maps:auditStaticTerrain.parity(label,null,outputs)};
  });
}"""


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2) + "\n", encoding="utf-8")


def input_record():
    actual = {name: hashlib.sha256((ROOT / name).read_bytes()).hexdigest() for name in FROZEN_INPUTS}
    assert actual == FROZEN_INPUTS, ("experiment modified production or its original gates", actual)
    return {**source_identity(ROOT), "experimentBase": EXPERIMENT_BASE,
            "frozenInputSha256": actual, "runId": os.environ.get("GITHUB_RUN_ID"),
            "runAttempt": os.environ.get("GITHUB_RUN_ATTEMPT"), "jobName": os.environ.get("GITHUB_JOB"),
            "platform": platform.platform(), "python": platform.python_version(),
            "node": subprocess.check_output(["node", "--version"], text=True).strip(), "diagnosticOnly": True}


def boot(page, html, mode, *, timing):
    # The shared helper intentionally disables RAF for synchronous native tests.
    # Save its actual browser function immediately before that fixture override;
    # only timing pages restore it and start the ordinary production loop once.
    setup = native.SETUP
    native.SETUP = "window.__rowOobNativeRAF=window.requestAnimationFrame.bind(window);\n" + setup
    try:
        native.boot_offline_runtime(page, html)
    finally:
        native.SETUP = setup
    page.add_script_tag(content=(ROOT / "tests/current/static_terrain_browser_415.js").read_text())
    page.add_script_tag(content=(ROOT / "tests/current/row_oob_diagnostic_415.js").read_text())
    page.evaluate("options => installRelayRowReadDiagnostic(options)", {"mode": mode, "timingAttribution": timing})
    page.evaluate(native.WATER_CHECK_SETUP)
    if timing:
        page.evaluate("""() => {
          if(typeof __rowOobNativeRAF!=='function')throw Error('Missing original browser RAF');
          window.__perfBaselineMaps=structuredClone(game.maps);
          window.requestAnimationFrame=__rowOobNativeRAF;
          requestAnimationFrame(time=>game.loop(time));
        }""")


def exact_maps(parity, expected_native=None):
    if expected_native is not None:
        assert parity["native"] == expected_native, parity
        maps = parity["maps"]
    else:
        maps = parity
    assert set(maps) == CHANNELS, maps
    for channel, difference in maps.items():
        assert all(difference[key] == 0 for key in ("bytes", "pixels", "max")), (channel, difference)
        for key in ("changedOutside", "changedOutsidePixels"):
            if key in difference:
                assert difference[key] == 0, (channel, difference)


def validate_trace(trace, mode, *, native_audit=False, event=None):
    assert trace["diagnosticOnly"] is True and trace["physicalReadbackClaim"] is False
    contexts = {context["id"]: context for context in trace["contexts"]}
    selected = [read for read in trace["nativeReads"] if read["productionRow"] and
                (event is None or read["eventId"] == event)]
    assert selected, "no production row calls were observed"
    for read in selected:
        context = contexts[read["contextId"]]
        assert context["kind"] == "production-buildSurface-color"
        assert context["explicitCreation"] == {"alpha": False, "willReadFrequently": False}
        assert context["acceptedAttributes"]["alpha"] is False and context["acceptedAttributes"]["willReadFrequently"] is False
        assert read["requested"] == [0, 0, 1, 1] and read["success"] is True, read
        assert read["mode"] == mode and read["substituted"] is (mode == "oob"), read
        assert read["forwarded"] == ([-1, -1, 1, 1] if mode == "oob" else [0, 0, 1, 1]), read
        assert read["forwardedRectangleOverlapPixels"] == (0 if mode == "oob" else 1)
        if mode == "oob":
            assert read["returnedBytes"] == 4 and read["returnedTransparentZero"] is True
    for build in trace["builds"]:
        if not build["success"] or (event is not None and build["eventId"] != event):
            continue
        assert build["colorContextId"] is not None, build
        assert build["rowAttempts"] == build["rowSuccesses"] == build["expectedRowCalls"], build
    outside = [read for read in trace["nativeReads"] if not read["productionRow"]]
    assert all(not read["substituted"] and read["forwarded"] == [0, 0, 1, 1] for read in outside)
    if native_audit:
        # 27 room/size pairs, warm and cold frozen selected-policy references.
        assert sum(not read["insideActiveBuild"] for read in outside) >= 27 * 2 * 19
    return selected


def requested_audit(value):
    """Do not relabel an outer wrapper's incoming coordinates as native calls."""
    if isinstance(value, list):
        return [requested_audit(item) for item in value]
    if isinstance(value, dict):
        return {"requestedGetImageDataCalls" if key == "readbacks" else key: requested_audit(item)
                for key, item in value.items()}
    return value


def diagnostic_error(page):
    try:
        return page.evaluate("() => window.__staticRasterDiagnostics || null")
    except Exception as error:
        return {"diagnosticReadError": str(error)}


def finish_context(page, context, result):
    try:
        result["actualNativeReadTrace"] = page.evaluate("() => relayRowReadDiagnostic.snapshot()")
    except Exception as error:
        result["traceError"] = str(error)
    try:
        page.evaluate("() => relayRowReadDiagnostic.uninstall()")
        result["hooksRestored"] = True
    except Exception as error:
        result["hooksRestored"] = False
        result["restorationError"] = str(error)
    finally:
        try:
            context.close(); result["contextClosed"] = True
        except Exception as error:
            result["contextClosed"] = False
            result["contextCloseError"] = str(error)


def run_native(browser, html, out):
    context = browser.new_context(viewport={"width": 960, "height": 680}, device_scale_factor=1)
    page = context.new_page(); errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.on("console", lambda message: errors.append("console: " + message.text) if message.type == "error" else None)
    result = {"diagnosticOnly": True, "variant": "oob", "status": "running",
              "reference": "Frozen selected-policy full renderer retains original in-bounds row calls; original-default RGB1 bound unchanged.",
              "requestAccounting": "requestedAudit production pixel/read counters and requestedGetImageDataCalls are incoming API requests; actualNativeReadTrace.forwarded records the browser call, without a physical-readback claim."}
    try:
        boot(page, html, "oob", timing=False)
        result["environment"] = page.evaluate(ENVIRONMENT_JS)
        result["environment"]["browserVersion"] = browser.version
        write_json(out / "native-oob.json", result)
        audit = page.evaluate("() => auditStaticTerrain.run()")
        matrix = audit["parityMatrix"]
        assert matrix["completed"] and not matrix["aborted"] and not matrix["failures"] and len(matrix["cases"]) == 112
        for case in matrix["cases"]:
            assert case["parityPassed"] and case["diagnosticRepair"] is None
            exact_maps(case["maps"])
        assert len(audit["legacyCompatibility"]) == 27
        for case in audit["legacyCompatibility"]:
            exact_maps(case["textures"]); exact_maps(case["coldIndependentTextures"])
            assert case["defaultCompatibility"]["qualified"] and case["coldDefaultCompatibility"]["qualified"]
        result["requestedAudit"] = requested_audit(audit)
        validate_trace(page.evaluate("() => relayRowReadDiagnostic.snapshot()"), "oob", native_audit=True)
        assert not errors, errors
        result["status"] = "passed"
    except Exception as error:
        result["status"] = "failed"; result["error"] = str(error)
        result["failureDiagnostic"] = requested_audit(diagnostic_error(page))
    finally:
        result["pageErrors"] = errors
        finish_context(page, context, result)
        if errors or not result.get("hooksRestored") or not result.get("contextClosed"):
            result["status"] = "failed"
        write_json(out / "native-oob.json", result)
    print("ROW-OOB NATIVE DIAGNOSTIC " + result["status"].upper(), flush=True)
    return result["status"]


def validate_record(record, trace, mode, native_size):
    events = trace["events"]
    assert len(events) == 1 and events[0]["ended"] and events[0]["name"] == record["name"], events
    rows = validate_trace(trace, mode, event=events[0]["id"])
    stats = record["staticDiagnostics"]
    expected = 19 if record["name"] == "control-full-static" else sum(region["ty1"] - region["ty0"] for region in stats["regions"])
    assert len(rows) == expected and all(stats[key] == expected for key in ("colorSyncAttempts", "colorSyncReads", "colorSyncPixels", "readbackPixels"))
    assert stats["colorPolicy"] == "canvas2d-row-sync-v1"
    exact_maps(record["staticParity"], native_size)
    if record["name"] == "control-full-static":
        validate_full_static_control(record, native_size, True)
        phases = ("static.plan", "static.build", "static.upload.color", "static.upload.normal", "static.upload.specular")
    else:
        assert stats["mode"] == "patch" and record["phaseCalls"].get("static.build", 0) == 0
        assert stats["uploadCalls"] == len(stats["regions"]) == 1
        assert record["phaseCalls"].get("static.patch.upload.normal", 0) == record["phaseCalls"].get("static.patch.upload.specular", 0) == 0
        assert stats["retainedScratchPixels"] == 0 and stats["scratchAllocations"] == 1
        assert stats["pixels"] <= native_size[0] * native_size[1] * .20 and stats["rasterPixels"] <= native_size[0] * native_size[1] * .20
        assert stats["rasterCells"] <= 760 * .35 and stats["scratchBytes"] <= 4194304 and stats["scratchAllocationBytes"] <= 8388608
        phases = ("static.plan", "static.patch.build", "static.patch.upload.color")
    for key in ("syncMs", "firstFrameAfterMs", "frameGapMs"):
        assert isinstance(record[key], (int, float)) and math.isfinite(record[key]) and record[key] >= 0
    assert not record["pendingFrame"]
    total = sum(record["phases"].get(phase, 0) for phase in phases)
    record["diagnosticStaticCombinedMs"] = total
    record["diagnosticEventOutsideStaticMs"] = record["syncMs"] - total
    record["diagnosticAttribution"] = {
        "nonadditive": True,
        "note": "These component scopes can overlap static phases; never add them to combined static time or to each other to infer the residual.",
        "phases": {key: value for key, value in record["phases"].items() if key.startswith("diagnostic.")},
        "phaseCalls": {key: value for key, value in record["phaseCalls"].items() if key.startswith("diagnostic.")},
    }
    record["timedNativeRows"] = rows


def measure_variant(browser, html, out, mode, samples):
    context = browser.new_context(viewport={"width": 1280, "height": 800}, device_scale_factor=1)
    page = context.new_page(); errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.on("console", lambda message: errors.append("console: " + message.text) if message.type == "error" else None)
    result = {"diagnosticOnly": True, "variant": mode, "status": "running", "runs": [],
              "postTimingOracle": "exact all3 GPU maps versus original in-bounds production full renderer",
              "measurementOrder": "inbounds variant first, then oob; each1x then4x; three original scenarios; no interleaving"}
    try:
        boot(page, html, mode, timing=True)
        cdp = context.new_cdp_session(page)
        for rate in (1, 4):
            cdp.send("Emulation.setCPUThrottlingRate", {"rate": rate}); page.wait_for_timeout(150)
            environment = page.evaluate(ENVIRONMENT_JS)
            environment["browserVersion"] = browser.version
            run = {"cpuThrottle": rate, "environment": environment, "scenarios": {}}
            result["runs"].append(run)
            for scenario in SCENARIOS:
                records = []; run["scenarios"][scenario] = {"records": records}
                for sample in range(samples):
                    page.evaluate("mode => {relayRowReadDiagnostic.resetTrace();relayRowReadDiagnostic.setMode(mode);relayRowReadDiagnostic.setScope('warmup');}", mode)
                    record = page.evaluate(SCENARIO_JS, scenario)
                    # Event + first presented frame have completed before any
                    # snapshot/parity work. The reference is explicitly inbounds.
                    trace = page.evaluate("() => relayRowReadDiagnostic.snapshot()")
                    record["diagnosticVariant"] = mode
                    record["diagnosticActualNativeTrace"] = trace
                    records.append(record)  # Preserve timing even if its later exact oracle fails.
                    record["staticParity"] = page.evaluate(PARITY_JS, f"ROW-OOB diagnostic {mode} {rate}x {scenario} sample{sample+1}")
                    validate_record(record, trace, mode, environment["native"])
                    after = page.evaluate("() => relayRowReadDiagnostic.snapshot()")
                    reference = [read for read in after["nativeReads"] if read["scope"] == "post-timing-original-policy-reference" and read["productionRow"]]
                    assert len(reference) == 19 and all(read["forwarded"] == [0, 0, 1, 1] and not read["substituted"] for read in reference)
                    record["postTimingReferenceRows"] = reference
                    record["diagnosticActualNativeTrace"] = after
                    write_json(out / ("performance-" + mode + ".json"), result)
                run["scenarios"][scenario]["summary"] = summarize(records)
                print("ROW-OOB TIMING " + json.dumps({"variant": mode, "rate": rate, "scenario": scenario,
                      "syncMs": [record["syncMs"] for record in records],
                      "firstFrameAfterMs": [record["firstFrameAfterMs"] for record in records],
                      "staticCombinedMs": [record["diagnosticStaticCombinedMs"] for record in records]}), flush=True)
        assert not errors, errors
        result["status"] = "passed"
    except Exception as error:
        result["status"] = "failed"; result["error"] = str(error)
        result["failureDiagnostic"] = requested_audit(diagnostic_error(page))
    finally:
        result["pageErrors"] = errors
        finish_context(page, context, result)
        if errors or not result.get("hooksRestored") or not result.get("contextClosed"):
            result["status"] = "failed"
        write_json(out / ("performance-" + mode + ".json"), result)
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--chromium")
    parser.add_argument("--samples", type=int, default=3)
    args = parser.parse_args()
    assert args.samples == 3, "this diagnostic fixes three samples per variant"
    args.out.mkdir(parents=True, exist_ok=True)
    source = input_record(); write_json(args.out / "source.json", source)
    html = re.sub(r'<script\b[^>]*>.*?</script>', '', (ROOT / 'index.html').read_text(), flags=re.S)
    html = re.sub(r'<link[^>]*rel="stylesheet"[^>]*>', '', html)
    from playwright.sync_api import sync_playwright
    with sync_playwright() as playwright:
        flags = ["--no-sandbox", "--disable-dev-shm-usage", "--ignore-gpu-blocklist"]
        if sys.platform.startswith("linux"):
            flags += ["--use-gl=angle", "--use-angle=gl-egl", "--ozone-platform=headless"]
        executable = args.chromium or shutil.which("chromium")
        browser = playwright.chromium.launch(executable_path=executable, headless=True, args=flags)
        try:
            native_status = run_native(browser, html, args.out)
            variants = [measure_variant(browser, html, args.out, mode, args.samples) for mode in ("inbounds", "oob")]
            statuses = {"nativeOob": native_status, **{variant["variant"]: variant["status"] for variant in variants}}
            if all(variant["status"] == "passed" for variant in variants):
                for first, second in zip(variants[0]["runs"], variants[1]["runs"]):
                    assert first["cpuThrottle"] == second["cpuThrottle"] and first["environment"] == second["environment"], "same-source timing environments differ"
            write_json(args.out / "result.json", {"diagnosticOnly": True, "source": source,
                       "browserVersion": browser.version, "statuses": statuses,
                       "qualifiedForProduction": False,
                       "interpretation": "Experimental API substitution only; original production validation remains independent and fatal. No physical-readback or universal latency claim."})
            print("ROW-OOB DIAGNOSTIC RESULT " + json.dumps(statuses), flush=True)
            return 0 if all(status == "passed" for status in statuses.values()) else 1
        finally:
            browser.close()


if __name__ == "__main__":
    raise SystemExit(main())
