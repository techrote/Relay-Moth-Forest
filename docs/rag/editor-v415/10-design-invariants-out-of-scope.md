# Accepted design invariants and out-of-scope work

This editor pass must not accidentally reopen settled rendering/gameplay decisions.

## Preserve: WYSIWYG normal game view

The editor stays on the normal rendered game canvas. Do not bring back the old separate mini-map editor.

## Preserve: mouse ownership

Mouse/pointer is for menus/editor. Normal gameplay movement remains keyboard/gamepad-driven.

## Preserve: whole-sprite foliage depth

Readable physical plants remain whole sprites around actors.

Do not reintroduce:
- actor-shaped foliage masks;
- lower-body sliced plant fragments;
- face masks;
- moving clip contours.

The v4.09+ whole-sprite transition with v4.14 opacity correction remains canonical.

## Preserve: casual followers

Persistent robots remain a casual social group, not exact formation slots.

Current intended comfort band is roughly 46–104 logical pixels with independent stuck recovery.

Editor work may expose robot placement/properties but must not retune follower simulation.

## Preserve: source-normal/specular material pipeline

v4.14 shared sprite material behavior must remain intact. Editor visual work should consume the runtime atlas/material contract rather than creating a separate renderer.

## Preserve: Tin Stream gameplay authority

Bridge progression/water/walkability remains gameplay authority.

The editor may warn/protect bridge structural edits, but generic procedural decor should simply avoid bridge reserved surfaces.

## Out of scope for v4.15

- adding a full story/objective creation wizard;
- renderer redesign;
- new sprite-art pipeline;
- new foliage occlusion model;
- follower gameplay retuning;
- campaign expansion;
- arbitrary plugin/mod scripting framework;
- changing JSON schema versions solely to match release number.

## Compatibility

Existing v4.14 map files must remain loadable. New editor metadata should be optional and backwards-compatible.
