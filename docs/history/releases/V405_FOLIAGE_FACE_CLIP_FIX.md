# Relay Moth Forest v4.05 — Face-safe Foliage Occlusion Fix

## Problem
The v4.05 actor-local foliage occlusion removed whole-sprite popping, but its local overlay still used the actor's full silhouette. This allowed a short floor plant to draw over a robot's face when their projected screen regions overlapped.

## Fix
Foreground foliage overlay is now restricted to a lower-body occlusion band derived from each actor source. The overlay can cover the lower body / feet region, but is rejected above that band so ground plants cannot cover the face or head. The background pass remains fully continuous and stable.

## Technical change
Inside `foregroundOcclusionMask()` the per-source local mask is clipped to a lower-body band (`bandTop` .. `bandBottom`) and the compact rounded occlusion shape is evaluated within that band.

## Result
Plants on the floor can still appear in front of the lower body when appropriate, but they no longer draw over robot faces.
