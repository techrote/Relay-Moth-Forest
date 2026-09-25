# Relay Moth Forest v4.04 — Stable Grass Ordering / Follower Occlusion Fix

## Problem fixed

Moving grass and foliage could rapidly change pass membership while robots/followers moved through it. The visible symptom was unstable sort order and grass popping in/out around robot followers.

## Root cause

The CPU `DepthClassifier` computed a stable foreground/background split with hysteresis, but the production FoliageFX vertex shader ignored that result and re-derived pass membership directly from transient per-frame actor overlap. That bypassed the hold logic and caused classification flicker. The previous hold implementation also only persisted while a plant was still touched, so it did not actually smooth the transition once contact ended.

## Fix

- Foreground/background pass membership now comes from a stable per-instance flag written by `DepthClassifier`.
- Classifier flags are synchronized to the GPU instance buffer through `syncDynamic(...)` whenever classification changes.
- Hysteresis now persists briefly even after overlap/contact ends.
- Interaction deformation still uses live actor sources, but render pass membership no longer reclassifies directly in the vertex shader.

## Result

Grass/foliage keeps a stable ordering around the player and robot followers and no longer pops in/out as followers move through it.
