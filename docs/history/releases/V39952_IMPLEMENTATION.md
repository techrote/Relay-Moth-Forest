# Relay Moth Forest 3.995.2 — implementation notes

## Scope

3.995.2 implements the visual-coherence, ambient-life, water/grass, Tin Stream and grading pass requested after the 3.995.1 portal-memory hotfix. Player movement, objective progression, save compatibility and the 3.995.1 resource-lifetime safeguards are intentionally unchanged.

## Large-sprite lighting and occlusion

Large trees no longer use independently scaled trunk and canopy draw sources at runtime. `renderTreesBack()` submits the complete original tree through the HD colour/bump material at one logical scale. After live actors, `renderForegroundScenery()` redraws only the canopy-height portion by sampling a sub-rectangle from that *same full source region*. Its world rectangle exactly overlaps the corresponding pixels of the first draw, so world position, UV height samples, tint and scale remain continuous.

Tall non-tree blocker art receives a bounded upper-portion redraw after ambient actors. This produces foreground occlusion for mini robots/wildlife while retaining static precomposition for the bulk of scenery.

## Shadows

Caster descriptors now carry an explicit `contactY` and category. Projected strip geometry and contact AO begin at that ground-contact position. Width multipliers are user controls for `robot`, `largeDecor` and `smallDecor` categories.

Mini robots/wildlife remain non-shadow-casting ambient actors, preserving the established lightweight/non-solid presentation policy.

## Ambient mini robots

Mini robots remain no-BFS, non-colliding Tier-B actors. Candidate targets are snapped away from authored blockers/water and local repulsion steers away from nearby blocked cells. When objectives are incomplete, the existing diegetic objective-hint bias remains.

After room completion, mini robots free-wander and can merge into loose groups capped at three. When two distinct full groups meet, a bounded shared encounter state makes them orbit a common centre for several seconds, then wander for several seconds, then return to ordinary social wandering. Encounter cooldowns prevent immediate repetition.

## Wildlife

Wildlife now uses the same read-only obstacle-awareness helpers for safe targets and local blocker/water repulsion. It does not mutate the Room grid and does not use BFS.

Squirrels detect corner trapping and receive a short centre-directed escape jump. Cats hold a squirrel target for a bounded interval, then explicitly lose interest and enter a cooldown before reacquisition. Wildlife sprites render at another 1.5x multiplier relative to 3.995.1.

## Water interaction

`ParticleField.splash()` emits a small LUT-driven water spray. Wildlife moving through water and robots/followers moving beside water can trigger it at a throttled cadence. `Game.waterSplash()` also injects a bounded WaterField ripple so sprite spray and material disturbance correspond.

WaterField now combines stronger analytical multi-band slopes, quality-scaled detail, shoreline field response, foam, ripple sources, highlights and normal-driven sampling of the existing static scene texture for refraction. Water remains entirely mask-driven by authoritative exposed Room water.

## Grass

Grass remains deliberately sparse and visual-only, but derived room descriptors now target roughly 7–9 clumps. Blade dimensions and material contrast are larger, the quality caps are 320 / 760 / 1200 instances, and the absolute hard cap is 1200. Submission remains one WebGL2 instanced draw.

## Tin Stream bridge

The staged bridge is now four rows wide instead of two. Four rivet stages still add one cross-stream segment at a time and open exactly the matching water cells. The central island is also four rows deep. `bridge_deck_tile` and `bridge_island_tile` have dedicated colour/bump art in the shared atlas and a dedicated editable bridge sheet.

## Post processing

The final composite adds independent brightness, contrast and gamma plus temperature, green/magenta tint, shadow lift and highlight gain. These operate after semantic LUT selection; they do not replace LUT authority.

## Validation

See `VALIDATION_LOG_39952.txt`. The baseline movement/input/NPC/jitter/fault/transition-memory tests and SurfaceFX tests pass, along with new ambient-AI and widened-bridge regressions. Hardware WebGL2 visual tuning must still be judged on a real browser/GPU; automated tests validate contracts and source behavior rather than final image aesthetics.
