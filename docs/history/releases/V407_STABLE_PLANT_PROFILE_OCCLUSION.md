# Relay Moth Forest v4.08 — Stable Plant-Profile Occlusion

## Problem
The v4.06 lower-edge/grouped logic improved staging, but the foreground grass still looked glitchy in motion because the visible top boundary of the foreground portion was effectively derived from moving actor-local clipping. That produced a noticeable sliding/cutoff profile on grass blades.

## Fix
Foreground foliage still uses grouped lower-edge actor logic to decide where foreground coverage appears, but its visible vertical extent is now controlled by a **stable plant-local profile**. The foreground pass draws only the lower portion of a plant with a soft alpha falloff and a small fixed irregular contour based on the plant's own local coordinates and instance variation.

## Result
The background/full plant remains continuous, while the foreground contribution has a stable, less glitchy silhouette that does not visibly slide around with the actor. This greatly reduces flicker and makes movement through grass read more naturally.
