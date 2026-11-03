#!/usr/bin/env python3
"""Validate and summarize a paired PERF-004 performance.json artifact.

Study-specific evidence reader, not a performance benchmark or evidence itself.
Requires the artifact's companion source.json (auto-discovered beside
performance.json, or --source-record). Only an embedded same-invocation baseline
is accepted; unrelated historical PERF-003 timings are never substituted.

The water/path study requires the pre-PERF-004 baseline to perform a full static
build and three uploads, while the candidate performs bounded color updates.
It intentionally does not accept later patch-versus-patch baseline comparisons.
Historical study files without the warmed full control remain readable by
default. Final candidate24 qualification requires --require-full-control;
that flag adds the paired forced-full accounting and exact texture checks.
Full controls can identify either a legacy or known current-policy baseline.

Example final review:
  python tools/summarize_perf004.py evidence/performance.json \
    --expect-baseline BASE_SHA --expect-candidate CANDIDATE_SHA \
    --require-full-control --all-scenarios

Standard library only. Reads the requested evidence and prints its review;
it does not rewrite evidence, update the repository or impose latency targets.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
import statistics
import sys
from pathlib import Path

FOCUS = ("editor-water", "editor-path")
FULL_CONTROL = "control-full-static"
FULL_CONTROL_META = {"room":"quiet_nest", "mutation":"none", "refresh":"forced-static", "warmup":"room-entry-two-frames"}
FULL_CONTROL_STATE = {"backgroundKeyMatches":True, "retainedCurrentStatic":False, "retainedMaterialMaps":False}
METRICS = ("syncMs", "firstFrameAfterMs", "frameGapMs")
BASE_PHASES = ("static.build", "static.upload.color", "static.upload.normal", "static.upload.specular")
PATCH_PHASES = ("static.plan", "static.patch.build", "static.patch.upload.color")
COLOR_POLICY = "canvas2d-row-sync-v1"
COLOR_SYNC_PHASE = "static.patch.color-sync"
FULL_COLOR_SYNC_PHASE = "static.full.color-sync"
COUNTERS = ("changedCells", "rasterCells", "pixels", "rasterPixels", "scratchPixels",
            "scratchBytes", "scratchAllocationAttempts", "scratchAllocations",
            "scratchAllocationPixels", "scratchAllocationBytes", "uploadCalls",
            "uploadBytes", "colorSyncAttempts", "colorSyncReads", "colorSyncPixels",
            "readbackPixels", "retainedScratchPixels")
REGION_NUMBERS = ("x", "y", "width", "height", "rasterX", "rasterY", "rasterWidth", "rasterHeight",
                  "canvasX", "canvasY", "canvasWidth", "canvasHeight", "tx0", "ty0", "tx1", "ty1")
LOCAL_PEAK_PIXELS, NATIVE_PEAK_PIXELS, CUMULATIVE_PIXELS = 262144, 1048576, 2097152
ENV_KEYS = {"userAgent", "dpr", "viewport", "canvas", "requestedNative", "native", "renderScale", "graphics", "driver"}


class EvidenceError(ValueError):
    pass


def need(condition, message):
    if not condition:
        raise EvidenceError(message)


def number(value, where, integer=False):
    need(type(value) in (int, float) and math.isfinite(value) and value >= 0, f"{where}: missing/invalid nonnegative number")
    if integer:
        need(type(value) is int, f"{where}: expected integer")
    return value


def stats(values):
    return {"median": statistics.median(values), "min": min(values), "max": max(values), "samples": values}


def source_identity(value, where):
    need(isinstance(value, dict), f"{where}: missing exact source identity")
    for key in ("commit", "tree"):
        need(isinstance(value.get(key), str) and re.fullmatch(r"[0-9a-f]{40}|[0-9a-f]{64}", value[key]), f"{where}.{key}: missing exact Git SHA")
    need(value.get("trackedDirty") is False, f"{where}: tracked source must be explicitly clean")
    need(isinstance(value.get("manifestSha256"), str) and re.fullmatch(r"[0-9a-f]{64}", value["manifestSha256"]), f"{where}: missing manifest SHA256")
    return value


def phase_sum(record, names, where):
    phases, calls = record.get("phases", {}), record.get("phaseCalls", {})
    for name in names:
        need(number(calls.get(name), f"{where}.phaseCalls.{name}", True) > 0, f"{where}: required phase did not run: {name}")
    # Sum each event first, then take a median across events. The whitelists use
    # parent build phases, excluding their scratch/floor/overlay/footer children.
    return sum(number(phases.get(name), f"{where}.phases.{name}") for name in names)


def parity(record, native, where, required):
    value = record.get("staticParity")
    if value is None:
        need(not required, f"{where}: missing post-timing staticParity")
        return 0
    need(value.get("native") == native, f"{where}: parity native size differs from timed environment")
    maps = value.get("maps", {})
    need(set(maps) == {"color", "normal", "specular"}, f"{where}: incomplete parity maps")
    for channel, result in maps.items():
        for key in ("bytes", "pixels", "max"):
            need(number(result.get(key), f"{where}.{channel}.{key}", True) == 0, f"{where}: {channel} {key} is nonzero")
        need(result.get("examples") == [], f"{where}: unexpected parity mismatch examples")
        if "changedOutside" in result:
            need(result["changedOutside"] == 0, f"{where}: exterior bytes changed")
    return 3


def bounded(record, native, where):
    d = record.get("staticDiagnostics")
    need(isinstance(d, dict) and d.get("mode") == "patch", f"{where}: expected bounded static patch")
    need(d.get("colorPolicy") == COLOR_POLICY, f"{where}: missing or unexpected static color policy")
    for name in COUNTERS:
        number(d.get(name), f"{where}.staticDiagnostics.{name}", True)
    sync_ms = number(d.get("colorSyncMs"), f"{where}.staticDiagnostics.colorSyncMs")
    regions = d.get("regions")
    need(isinstance(regions, list) and 0 < len(regions) <= 8, f"{where}: missing/excessive patch regions")
    width, height = native
    mode = "local" if (width, height) == (640, 360) else "native-clip"
    need(d.get("scratchMode") == mode, f"{where}: scratch mode disagrees with actual native scale")
    output = raster = cells = scratch = allocated = sync_rows = 0
    geometry = []
    for i, r in enumerate(regions):
        need(isinstance(r, dict), f"{where}.regions[{i}]: invalid region")
        for name in REGION_NUMBERS:
            number(r.get(name), f"{where}.regions[{i}].{name}", True)
        x, y, w, h = (r[k] for k in ("x", "y", "width", "height"))
        rx, ry, rw, rh = (r[k] for k in ("rasterX", "rasterY", "rasterWidth", "rasterHeight"))
        cx, cy, cw, ch = (r[k] for k in ("canvasX", "canvasY", "canvasWidth", "canvasHeight"))
        need(w > 0 and h > 0 and rw > 0 and rh > 0 and cw > 0 and ch > 0
             and 0 <= cx <= rx <= x < x+w <= rx+rw <= cx+cw <= width
             and 0 <= cy <= ry <= y < y+h <= ry+rh <= cy+ch <= height, f"{where}: invalid output/guard/canvas containment")
        # Derive local guards from the output independently of reported work
        # counters. Full-native capacity must not turn the clip into a prefix.
        guard = (max(0, (x-32)//16*16), max(0, (y-32)//16*16),
                 min(width, (x+w+32+15)//16*16), min(height, (y+h+32+15)//16*16))
        need((rx, ry, rx+rw, ry+rh) == guard, f"{where}: clip is not the local aligned 32px guard")
        expected_canvas = (0, 0, width, height) if mode == "native-clip" else (rx, ry, rw, rh)
        need(r.get("canvasMode") == mode and (cx, cy, cw, ch) == expected_canvas, f"{where}: wrong source canvas mode/origin/dimensions")
        need(0 <= r["tx0"] < r["tx1"] <= 40 and 0 <= r["ty0"] < r["ty1"] <= 19, f"{where}: invalid floor-cell bounds")
        # Select contributing source intervals by exact integer comparisons.
        # This checks the four-logical/two-native input halo without rounding
        # the planner's floating-point cell-index expression a second time.
        def source_indices(lo, hi, extent, logical_extent, count):
            low = (lo-2)*logical_extent-4*extent
            high = (hi+2)*logical_extent+4*extent
            selected = [j for j in range(count) if (j+1)*16*extent > low and j*16*extent < high]
            need(bool(selected), f"{where}: guarded clip has no source cells")
            return selected[0], selected[-1]+1
        expected_x = source_indices(rx, rx+rw, width, 640, 40)
        expected_y = source_indices(ry, ry+rh, height, 360, 19)
        need((r["tx0"], r["tx1"]) == expected_x and (r["ty0"], r["ty1"]) == expected_y, f"{where}: floor inputs disagree with guarded clip halo")
        skip_x, skip_rows = x-cx, ch-(y-cy)-h
        need(0 <= skip_x and skip_x+w <= cw and 0 <= skip_rows and skip_rows+h <= ch, f"{where}: invalid flipped canvas-source crop")
        output += w*h
        raster += rw*rh
        scratch = max(scratch, cw*ch)
        allocated += cw*ch
        cells += (r["tx1"]-r["tx0"])*(r["ty1"]-r["ty0"])
        # Charge each region's rows separately, even when guards overlap. Their
        # independently derived floor bounds identify separate painted canvases.
        sync_rows += expected_y[1]-expected_y[0]
        geometry.append({"canvas":[cx,cy,cw,ch], "clip":[rx,ry,rw,rh], "output":[x,y,w,h],
                         "sourceCells":[r["tx0"],r["ty0"],r["tx1"],r["ty1"]], "unpackSkips":[skip_x,skip_rows]})
    expected = {"pixels": output, "rasterPixels": raster, "rasterCells": cells, "scratchPixels": scratch,
                "scratchBytes": scratch*4, "scratchAllocationAttempts": len(regions), "scratchAllocations": len(regions),
                "scratchAllocationPixels": allocated, "scratchAllocationBytes": allocated*4,
                "uploadBytes": output*4, "uploadCalls": len(regions),
                "colorSyncAttempts": sync_rows, "colorSyncReads": sync_rows,
                "colorSyncPixels": sync_rows, "readbackPixels": sync_rows, "retainedScratchPixels": 0}
    for key, value in expected.items():
        need(d[key] == value, f"{where}: {key} disagrees with actual region accounting")
    need(0 < d["changedCells"] <= 16 and 0 < cells <= 760*.35, f"{where}: changed/floor-cell budget exceeded")
    need(0 < output <= width*height*.20 and 0 < raster <= width*height*.20, f"{where}: output/clipped redraw pixel budget exceeded")
    peak_limit = NATIVE_PEAK_PIXELS if mode == "native-clip" else LOCAL_PEAK_PIXELS
    need(scratch <= peak_limit, f"{where}: {mode} canvas peak budget exceeded")
    need(allocated <= CUMULATIVE_PIXELS, f"{where}: cumulative canvas allocation budget exceeded")
    calls = record["phaseCalls"]
    for name in BASE_PHASES + ("static.patch.upload.normal", "static.patch.upload.specular"):
        need(calls.get(name, 0) == 0, f"{where}: full/material work unexpectedly ran: {name}")
    need(calls.get("static.plan") == 1 and calls.get("static.patch.build") == len(regions) and calls.get("static.patch.upload.color") == len(regions), f"{where}: event phase counts disagree with regions")
    need(number(calls.get(COLOR_SYNC_PHASE), f"{where}.phaseCalls.{COLOR_SYNC_PHASE}", True) == sync_rows,
         f"{where}: color synchronization phase calls disagree with painted region rows")
    sync_phase_ms = number(record.get("phases", {}).get(COLOR_SYNC_PHASE), f"{where}.phases.{COLOR_SYNC_PHASE}")
    return {**{k:d[k] for k in COUNTERS}, "regions": len(regions), "scratchMode": mode, "geometry": geometry,
            "colorPolicy": d["colorPolicy"], "colorSyncMs": sync_ms, "colorSyncPhaseMs": sync_phase_ms}


def full_control(record, native, where):
    """Validate observed full work; partial-path capacity limits do not apply."""
    d = record.get("staticDiagnostics")
    need(isinstance(d, dict) and d.get("mode") == "full" and d.get("reason") == "forced", f"{where}: expected forced full static refresh")
    need(d.get("colorPolicy") == COLOR_POLICY, f"{where}: missing or unexpected static color policy")
    need(d.get("scratchMode") == "full" and d.get("regions") == [], f"{where}: full control has partial canvas mode/regions")
    for name in COUNTERS:
        number(d.get(name), f"{where}.staticDiagnostics.{name}", True)
    area = native[0]*native[1]
    expected = {"changedCells":0, "rasterCells":760, "pixels":area, "rasterPixels":area,
                "scratchPixels":area, "scratchBytes":area*12, "scratchAllocationAttempts":3,
                "scratchAllocations":3, "scratchAllocationPixels":area*3, "scratchAllocationBytes":area*12,
                "uploadCalls":3, "uploadBytes":area*12, "colorSyncAttempts":19, "colorSyncReads":19,
                "colorSyncPixels":19, "readbackPixels":19, "retainedScratchPixels":0}
    for key, value in expected.items():
        need(d[key] == value, f"{where}: full {key} disagrees with three-map/19-row accounting")
    sync_ms = number(d.get("colorSyncMs"), f"{where}.staticDiagnostics.colorSyncMs")
    need(number(record.get("phaseCalls", {}).get(FULL_COLOR_SYNC_PHASE), f"{where}.phaseCalls.{FULL_COLOR_SYNC_PHASE}", True) == 19,
         f"{where}: full color synchronization phase calls disagree with 19 painted rows")
    sync_phase_ms = number(record.get("phases", {}).get(FULL_COLOR_SYNC_PHASE), f"{where}.phases.{FULL_COLOR_SYNC_PHASE}")
    return {**{k:d[k] for k in COUNTERS}, "regions":0, "scratchMode":"full", "geometry":[],
            "colorPolicy":d["colorPolicy"], "colorSyncMs":sync_ms, "colorSyncPhaseMs":sync_phase_ms}


def full_control_event(record, where, require_current):
    need(record.get("name") == FULL_CONTROL and record.get("meta") == FULL_CONTROL_META, f"{where}: full-control name/warmed metadata differs")
    state = record.get("fullStaticControl")
    state_keys = set(FULL_CONTROL_STATE)|{"colorPolicy","hasStaticPlanner"}
    need(isinstance(state, dict) and set(state) == state_keys, f"{where}: full-control capability/policy observation missing")
    need(all(state[k] is value for k,value in FULL_CONTROL_STATE.items()), f"{where}: full-control background coherence or released surfaces not verified")
    current = state["colorPolicy"] == COLOR_POLICY and state["hasStaticPlanner"] is True
    legacy = state["colorPolicy"] is None and state["hasStaticPlanner"] is False
    need(current or legacy, f"{where}: unknown or inconsistent full-control capability/policy")
    need(not require_current or current, f"{where}: candidate full control lacks required current policy/planner")
    if legacy:
        need("staticDiagnostics" in record and record["staticDiagnostics"] is None, f"{where}: legacy full control must explicitly lack optimized diagnostics")
    else:
        need(isinstance(record.get("staticDiagnostics"), dict), f"{where}: current-policy full control lacks optimized diagnostics")
    water = record.get("waterWorkDelta")
    water_keys = ("fullRebuilds", "boundedUpdates", "fullLegacyUploads", "boundedLegacyUploads")
    need(isinstance(water, dict) and set(water) == set(water_keys), f"{where}: full-control water-work observation missing")
    for key in water_keys:
        need(number(water[key], f"{where}.waterWorkDelta.{key}", True) == 0, f"{where}: full control contains unrelated water work")
    calls = record.get("phaseCalls", {})
    for name in BASE_PHASES:
        need(number(calls.get(name), f"{where}.phaseCalls.{name}", True) == 1, f"{where}: full control must build once and upload each map once")
    need(number(calls.get("static.plan", 0), f"{where}.phaseCalls.static.plan", True) == int(current), f"{where}: full-control planner call count differs")
    if legacy:
        need(number(record.get("phases", {}).get("static.plan", 0), f"{where}.phases.static.plan") == 0, f"{where}: baseline unexpectedly contains planning time")
        need(number(calls.get(FULL_COLOR_SYNC_PHASE, 0), f"{where}.phaseCalls.{FULL_COLOR_SYNC_PHASE}", True) == 0 and number(record.get("phases", {}).get(FULL_COLOR_SYNC_PHASE, 0), f"{where}.phases.{FULL_COLOR_SYNC_PHASE}") == 0, f"{where}: legacy full control unexpectedly synchronizes color")
    for name, count in calls.items():
        if name.startswith("static.patch."):
            need(number(count, f"{where}.phaseCalls.{name}", True) == 0, f"{where}: full control contains partial work")
    return current


def summarize(data, source_record, expect_baseline=None, expect_candidate=None, require_full_control=False):
    baseline = data.get("baseline")
    need(isinstance(baseline, dict), "No embedded same-invocation baseline; do not substitute historical PERF-003 timings")
    identities = {}
    for label, payload in (("baseline", baseline), ("candidate", data)):
        need(payload.get("schema") == "relay-moth-perf-001a/v1", f"{label}: unsupported schema")
        need(payload.get("samplesPerScenario") == 3, f"{label}: expected all three samples per scenario")
        need(payload.get("browserErrors") == [], f"{label}: missing or nonempty browserErrors")
        identities[label] = source_identity(payload.get("source"), label)
    need(identities["baseline"]["commit"] != identities["candidate"]["commit"] and identities["baseline"]["tree"] != identities["candidate"]["tree"], "Baseline and candidate must identify different sources")
    need(isinstance(source_record, dict), "Missing companion source.json")
    for key in ("commit", "tree"):
        need(source_record.get(key) == identities["candidate"][key], f"source.json {key} does not match the measured candidate; event_sha is not used")
    for label, expected in (("baseline", expect_baseline), ("candidate", expect_candidate)):
        if expected:
            need(identities[label]["commit"] == expected, f"{label}: source differs from expected commit")
    runs = {}
    for label, payload in (("baseline", baseline), ("candidate", data)):
        values = payload.get("runs", [])
        need(isinstance(values, list) and len(values) == 2, f"{label}: expected separate 1x and 4x runs")
        runs[label] = {r.get("cpuThrottle"): r for r in values}
        need(set(runs[label]) == {1, 4}, f"{label}: missing/duplicate 1x or 4x rate")
    rows, environments, maps_checked = [], {}, {"candidate": 0, "baseline": 0}
    full_maps_checked, full_presence, full_source_modes = {"candidate":0, "baseline":0}, [], {}
    for rate in (1, 4):
        old, new = runs["baseline"][rate], runs["candidate"][rate]
        env = new.get("environment")
        need(isinstance(env, dict) and ENV_KEYS <= set(env), f"{rate}x: incomplete environment identity")
        need(old.get("environment") == env, f"{rate}x: baseline/candidate environments differ")
        native = env["native"]
        need(isinstance(native, list) and len(native) == 2 and all(type(n) is int and n > 0 for n in native), f"{rate}x: invalid native canvas")
        environments[rate] = env
        old_scenarios, new_scenarios = old.get("scenarios", {}), new.get("scenarios", {})
        need(set(old_scenarios) == set(new_scenarios) and set(FOCUS) <= set(new_scenarios), f"{rate}x: scenario sets differ or omit water/path")
        full_presence.append(FULL_CONTROL in new_scenarios)
        need(not require_full_control or full_presence[-1], f"{rate}x: required {FULL_CONTROL} missing")
        for scenario in new_scenarios:
            row = {"rate":rate, "scenario":scenario, "native":native}
            signatures = []
            for label, group in (("baseline", old_scenarios[scenario]), ("candidate", new_scenarios[scenario])):
                where = f"{rate}x {scenario} {label}"
                records = group.get("records", [])
                need(len(records) == 3, f"{where}: not all three records are present")
                need(all(r.get("pendingFrame") is False for r in records), f"{where}: incomplete post-event frame")
                signatures.append({json.dumps([r.get("name"), r.get("meta")], sort_keys=True) for r in records})
                values = {k:stats([number(r.get(k), where+"."+k) for r in records]) for k in METRICS}
                for key in METRICS:
                    reported = number(group.get("summary", {}).get(key, {}).get("median"), where+".summary."+key)
                    need(math.isclose(reported, values[key]["median"], abs_tol=1e-8, rel_tol=1e-10), f"{where}: stored {key} median differs from raw records")
                is_full = scenario == FULL_CONTROL
                if scenario in FOCUS or is_full:
                    current_full = False
                    if is_full:
                        full_modes = [full_control_event(r,where+f" sample{i+1}",label == "candidate") for i,r in enumerate(records)]
                        need(len(set(full_modes)) == 1, f"{where}: full-control capability changes between samples")
                        current_full = full_modes[0]
                        if label in full_source_modes:
                            need(full_source_modes[label] == current_full, f"{where}: full-control capability changes between throttle rates")
                        full_source_modes[label] = current_full
                        values["fullControlPolicy"] = COLOR_POLICY if current_full else None
                        values["fullControlHasPlanner"] = current_full
                    names = (("static.plan", *BASE_PHASES) if current_full else BASE_PHASES) if is_full else (BASE_PHASES if label == "baseline" else PATCH_PHASES)
                    values["staticCombinedMs"] = stats([phase_sum(r, names, where+f" sample{i+1}") for i,r in enumerate(records)])
                    sync_phase = FULL_COLOR_SYNC_PHASE if is_full else COLOR_SYNC_PHASE
                    reported_phases = (*names, sync_phase) if label == "candidate" or current_full else names
                    values["phaseCalls"] = {name:[r.get("phaseCalls", {}).get(name, 0) for r in records] for name in reported_phases}
                    for i, record in enumerate(records):
                        counts = full_maps_checked if is_full else maps_checked
                        counts[label] += parity(record, native, where+f" sample{i+1}", label == "candidate")
                        if not is_full and label == "baseline":
                            need(all(record["phaseCalls"].get(name) == 1 for name in BASE_PHASES), f"{where}: baseline is not one full build and three uploads")
                            need(record.get("phaseCalls", {}).get("static.patch.build", 0) == 0, f"{where}: baseline contains patch work")
                    if label == "candidate" or current_full:
                        check_work = full_control if is_full else bounded
                        counters = [check_work(r,native,where+f" sample{i+1}") for i,r in enumerate(records)]
                        values["counters"] = {key:stats([r[key] for r in counters]) for key in (*COUNTERS,"regions","colorSyncMs","colorSyncPhaseMs")}
                        values["colorPolicies"] = [r["colorPolicy"] for r in counters]
                        values["scratchModes"] = [r["scratchMode"] for r in counters]
                        values["geometrySamples"] = [r["geometry"] for r in counters]
                        if label == "baseline":
                            values["missingCounters"] = {key:0 for key in (*COUNTERS,"colorSyncMs")}
                    else:
                        values["counters"] = {}
                        values["missingCounters"] = {}
                        for key in (*COUNTERS,"colorSyncMs"):
                            measured = [(r.get("staticDiagnostics") or {}).get(key) for r in records]
                            values["missingCounters"][key] = sum(v is None for v in measured)
                            present = [number(v,where+"."+key,key != "colorSyncMs") for v in measured if v is not None]
                            if present:
                                values["counters"][key] = stats(present)
                row[label] = values
            need(len(signatures[0]) == 1 and signatures[0] == signatures[1], f"{rate}x {scenario}: timed event metadata differs between samples/sources")
            rows.append(row)
    need(maps_checked["candidate"] == 36, "Expected 12 candidate water/path parity records × three maps")
    need(all(full_presence) or not any(full_presence), f"{FULL_CONTROL} must be present at both throttle rates")
    if all(full_presence):
        need(full_maps_checked["candidate"] == 18, "Expected six candidate full-control parity records × three maps")
    return {"identities":identities, "job":source_record, "environments":environments, "rows":rows,
            "mapsChecked":{side:maps_checked[side]+full_maps_checked[side] for side in maps_checked},
            "waterPathMapsChecked":maps_checked, "fullControlMapsChecked":full_maps_checked,
            "fullControlPresent":all(full_presence), "fullControlRequired":bool(require_full_control)}


def span(value, precision=3):
    fmt = (lambda n:f"{n:.{precision}f}") if precision else (lambda n:str(int(n)))
    return fmt(value["median"])+" ["+fmt(value["min"])+"–"+fmt(value["max"])+"]"


def render(report, all_scenarios=False):
    print("# PERF-004 paired evidence review\n")
    print("Validation passed: matching paired environment records, clean exact source identities, companion CI source binding, and 36/36 candidate water/path map results with zero differing bytes/pixels and zero maximum error.\n")
    if report["fullControlPresent"]:
        print("The warmed forced full control is present at both throttle rates: 18/18 additional candidate map results are exact, for 54/54 candidate map checks in total.\n")
    else:
        print("Historical evidence: no warmed forced full control is present. This file does not qualify the new row policy's full-rebuild overhead; use --require-full-control for final qualification.\n")
    for label, identity in report["identities"].items():
        print(f"- {label}: commit `{identity['commit']}`, tree `{identity['tree']}`, manifest SHA256 `{identity['manifestSha256']}`.")
    job = report["job"]
    print(f"- CI run/attempt: {job.get('run_id','unrecorded')}/{job.get('run_attempt','unrecorded')}; platform: {job.get('platform','unrecorded')}.")
    for rate, env in report["environments"].items():
        fingerprint = hashlib.sha256(json.dumps(env,sort_keys=True,separators=(',',':')).encode()).hexdigest()
        print(f"- {rate}x: native {env['native']}, viewport {env['viewport']}, DPR {env['dpr']}, render scale {env['renderScale']}; environment SHA256 `{fingerprint}`.")
    env = report["environments"][1]
    print(f"- Browser: {env['userAgent']}; driver: {json.dumps(env['driver'],sort_keys=True)}.\n")
    print("## Timings\n\nMilliseconds: median [minimum–maximum] across three records. Ratio = candidate / baseline.\n")
    print("| Rate | Scenario | Metric | Baseline | Candidate | Ratio |\n|---|---|---|---:|---:|---:|")
    focus_rows = [r for r in report["rows"] if r["scenario"] in FOCUS]
    control_rows = [r for r in report["rows"] if r["scenario"] == FULL_CONTROL]
    static_rows = [r for r in report["rows"] if r["scenario"] in (*FOCUS,FULL_CONTROL)]
    for row in report["rows"]:
        if row["scenario"] not in (*FOCUS,FULL_CONTROL) and not all_scenarios:
            continue
        keys = (*METRICS,"staticCombinedMs") if row["scenario"] in (*FOCUS,FULL_CONTROL) else ("syncMs",)
        for key in keys:
            before, after = row["baseline"][key], row["candidate"][key]
            ratio = f"{after['median']/before['median']:.4f}" if before["median"] else "undefined (baseline zero)"
            print(f"| {row['rate']}x | {row['scenario']} | {key} | {span(before)} | {span(after)} | {ratio} |")
    print("\nStatic combined time sums each record first: terrain baseline `static.build` + three `static.upload.*` phases; candidate terrain `static.plan` + `static.patch.build` + `static.patch.upload.color`. For the forced full control, each side includes `static.build` + all three `static.upload.*` phases and additionally `static.plan` when its explicitly observed capability identifies the current planner. A legacy full control must explicitly lack the planner, policy and optimized diagnostics. Nested scratch/floor/color-sync/overlay/footer phases are excluded from the sum because their work is already inside the build phase.\n")
    for row in static_rows:
        raw = {side:row[side]["staticCombinedMs"]["samples"] for side in ("baseline","candidate")}
        print(f"- {row['rate']}x {row['scenario']} combined static raw samples (ms): {json.dumps(raw)}")
    print("\n## Measured candidate static work\n\nEach numeric cell is median [minimum–maximum] over all three samples. `pixels` counts uploaded output; `rasterPixels` sums explicitly guarded redraw clips. `scratchPixels` reports peak source-canvas capacity; `scratchBytes` reports peak simultaneously allocated capacity. `scratchAllocationPixels`/`Bytes` sum all successful canvas allocations across each event, while attempts and successful counts are reported separately.\n")
    print("| Counter | "+" | ".join(f"{r['rate']}x {r['scenario']}" for r in static_rows)+" |")
    print("|---|"+"---:|"*len(static_rows))
    print("| colorPolicy | "+" | ".join(", ".join(sorted(set(r['candidate']['colorPolicies']))) for r in static_rows)+" |")
    print("| scratchMode | "+" | ".join(", ".join(sorted(set(r['candidate']['scratchModes']))) for r in static_rows)+" |")
    for key in (*COUNTERS,"regions"):
        print("| "+key+" | "+" | ".join(span(r['candidate']['counters'][key],0) for r in static_rows)+" |")
    for key in ("colorSyncMs","colorSyncPhaseMs"):
        print("| "+key+" | "+" | ".join(span(r['candidate']['counters'][key]) for r in static_rows)+" |")
    print("\nColor synchronization uses policy `"+COLOR_POLICY+"`. For every terrain sample, attempts, successful reads, pixels, `readbackPixels`, and `static.patch.color-sync` phase calls must each equal the sum of independently validated painted floor-row counts across all regions. Overlapping regions are charged separately. These counts describe the same work and are not added together. `colorSyncMs` measures read-body time; `colorSyncPhaseMs` reports the enclosing probe phase. Both are nonadditive components already included in `static.patch.build` and combined static time.\n")
    if control_rows:
        print("The separate current-policy full control requires all 760 floor cells, three simultaneously allocated native maps, one upload per map, and 19 successful one-pixel color reads. Its `colorSyncPhaseMs` is `static.full.color-sync`, nested inside `static.build`; it is reported without adding it to the parent. Current-policy controls require one planning call; legacy controls require zero planning/synchronization calls and null diagnostics. Unknown/missing capabilities are rejected. Neither side may execute any partial phase or unrelated water work. After the timed refresh and first post-event frame, both sides must show a coherent background key and released full CPU surfaces. Candidate full/terrain parity is captured after the timed event and frame by the harness.\n")
        for row in control_rows:
            print(f"- {row['rate']}x full-control observed policies/planner: "+json.dumps({side:{'colorPolicy':row[side]['fullControlPolicy'],'hasStaticPlanner':row[side]['fullControlHasPlanner']} for side in ('baseline','candidate')},sort_keys=True))
    print("\nPartial-event capacity validation applies the 1MiB local peak, 4MiB native peak, and 8MiB cumulative color-allocation limits. Source-canvas mode/dimensions, local 32px aligned guards, floor-input halos, and flipped source crops are independently derived from each region. Allocation counters must match those capacities in every sample; no repair, full build, material upload, or retained scratch is accepted in a partial event. Full controls instead require the independently computed three-map native capacity, without applying partial-work ceilings.\n")
    for row in focus_rows:
        groups = {}
        for geometry in row["candidate"]["geometrySamples"]:
            encoded = json.dumps(geometry,sort_keys=True,separators=(',',':'))
            groups[encoded] = groups.get(encoded,0)+1
        for geometry, count in groups.items():
            print(f"- {row['rate']}x {row['scenario']}, {count}/3 samples: `{geometry}`")
    print("\nThe 20% guarded-redraw limit does not bound total GPU writes or physical GPU memory: allocating or initializing a native canvas can touch the full target. Build timing includes that work. performance.json reports region geometry and observed capacity counters; independent Canvas clip/transform traces belong to the native browser qualification fixture, not this timing artifact.")
    print("\n## Baseline counter availability\n")
    for row in static_rows:
        values = row["baseline"]
        missing = {k:n for k,n in values["missingCounters"].items() if n}
        print(f"- {row['rate']}x {row['scenario']}: missing samples per counter {json.dumps(missing,sort_keys=True)}.")
        if values["counters"]:
            print("  Available measured ranges: "+json.dumps({k:[v['min'],v['max']] for k,v in values['counters'].items()},sort_keys=True))
    print("\nNo missing baseline counters are converted to zero or inferred from native dimensions. Independently, baseline phaseCalls verify one full build and one upload per color/normal/specular channel in each reviewed static event. Baseline static parity is not required by this harness; candidate parity is required for every water/path sample and every full-control sample when present.")
    print("\nEnvironment equality and CI provenance support the same-host pairing; performance.json does not contain an independent host identifier. The harness measures the baseline first, then the candidate, without interleaving. Three samples provide diagnostic medians/ranges, not a tail-latency or physical-device guarantee. firstFrameAfterMs runs from event start to the first post-event frame marker after the JavaScript render loop; frameGapMs spans the last pre-event and first post-event markers. These are CPU-side markers, not GPU-completion fences or measurements of display scanout. Zero-duration phases can reflect timer resolution. Historical PERF-003 measurements are not used in these ratios.")


def load(path):
    def reject(value):
        raise EvidenceError(f"{path}: nonfinite JSON number {value}")
    return json.loads(path.read_text(encoding="utf-8"),parse_constant=reject)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("performance",type=Path)
    parser.add_argument("--source-record",type=Path,help="Default: source.json beside performance.json")
    parser.add_argument("--expect-baseline",help="Expected exact baseline commit SHA")
    parser.add_argument("--expect-candidate",help="Expected exact tested candidate commit SHA")
    parser.add_argument("--all-scenarios",action="store_true",help="Also report sync medians for all other scenarios")
    parser.add_argument("--require-full-control",action="store_true",help="Require paired warmed forced full-static controls at both throttle rates")
    args = parser.parse_args()
    try:
        report = summarize(load(args.performance),load(args.source_record or args.performance.with_name("source.json")),args.expect_baseline,args.expect_candidate,require_full_control=args.require_full_control)
    except (OSError,ValueError,TypeError,KeyError) as error:
        print("EVIDENCE NOT ACCEPTED: "+str(error),file=sys.stderr)
        return 1
    render(report,args.all_scenarios)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
