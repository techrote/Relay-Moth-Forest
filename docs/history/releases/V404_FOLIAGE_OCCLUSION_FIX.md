# Relay Moth Forest v4.05 — Actor-local Foliage Occlusion Fix

The supplied v4.03 video exposed the remaining structural problem in the depth model: even after classification was stabilized, an entire foliage sprite still moved between the background and foreground passes. Large/tall grass therefore visibly changed ordering as a robot crossed its root-Y threshold, and one follower could cause a whole plant to cover other nearby actors.

## v4.05 model

1. Every physical foliage instance is always rendered once in the background pass. It never disappears from that pass when depth state changes.
2. `DepthClassifier` computes a stable per-source bitmask (up to 8 interaction actors) instead of one global foreground boolean.
3. The foreground pass is only an occlusion overlay. A plant is redrawn only where its deformed pixels overlap the compact rounded silhouette of an actor whose bit is set.
4. Therefore only the actor/plant intersection changes occlusion; the rest of the plant remains visually invariant.
5. Hysteresis is tracked per plant + source ID, preventing a follower from flipping another follower's depth relation.

This keeps the performant two-pass GPU architecture while eliminating the visually disruptive whole-sprite reordering shown in the supplied recording.
