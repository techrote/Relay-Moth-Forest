# F8 room-background export

Press **F8** to download a 640×360 PNG and a matching semantic JSON sidecar for
the current room. F8 also works while the F2 editor is open, except while a text
field or form control owns keyboard input. Held-key repeats do not start more
exports.

## Included content

The exported background combines the static room with the same persistent
presentation authority used by the live renderer:

| Layer | Captured behavior |
| --- | --- |
| Static room | Floor, water/path classification, static scenery, patterns, mounted lamps and footer |
| Generated and authored decor | Current placements, suppression, tint, scale, alpha, flip and rotation |
| Decorative/recruitable robots | Current placements; already recruited persistent robots are omitted |
| Completed objectives | Completion presentation, respecting hidden-visual metadata |
| Gates | Current open/completed state |
| Bridge and stateful patterns | Current progression stage |

The exported composition uses the current semantic palettes. Live animated
water, fine grass, FoliageFX, cursor, relay moths, followers, ambient actors,
foreground scenery, unfinished-objective animation, completion particles,
dialogue/HUD, dynamic lighting and postprocessing remain live layers. The JSON
sidecar records both included and live layer lists.

## One coherent snapshot

Before capture, export flushes pending editor changes through the existing
persistence boundary. This commits an active field transaction and cancels an
unfinished pointer gesture according to the editor's normal save behavior.

Pixels, room basename, completed objectives, recruited robot IDs and channel
palette choices are captured synchronously. The sidecar is serialized before
PNG encoding begins. Moving to another room, editing or changing a palette while
the encoder is pending does not rename or change that captured export.

Only one export can be in progress. A concurrent request reports that an export
is already running and returns without starting a second capture. After successful
encoding, export issues the PNG followed by its JSON sidecar. Encoder failure
issues neither file, reports the failure and permits a later retry. A browser
download request does not establish that the user has saved the file to disk.

F8 does not mark map data saved or change the editor's clean/dirty baseline. Use
the editor's Save to Project or Download JSON action to preserve the editable map.

## Compatibility and ownership

Existing names remain compatible:

```text
<room-key>-pretty39952-static.png
<room-key>-pretty39952-static.json
```

The sidecar schema remains `relay-moth-raster/v3.9952`. Layer and recruitment
fields are additive; historical version strings are not release labels.

An isolated `StaticPainter` owns the export canvases. Persistent presentation
uses the shared placement/state methods, with sprite anchors converted to the
runtime's center before rotation and flipping. Persistent sprite draws precede
their glow pass, matching the live batch order. The runtime painter, GPU
textures, sprite queues and rendered authority remain untouched by capture.

Normal/specular export canvases are released immediately after composition.
Only the color canvas remains while PNG encoding is pending; it is released on
both success and failure. Export shares the loaded atlas images and current
metadata, but owns fresh, empty tint and transformed-normal caches. Each keeps
the existing 96-entry limit and releases evicted backings. All remaining private
backings are released before PNG encoding starts, including on composition
failure. Runtime cache maps, entry order, source canvases and normal-generation
state remain unchanged.

## Regression coverage

The deterministic export suite exercises persistent content across all rooms,
bridge progression, hidden/recruited content, actual runtime rotation geometry,
state capture before asynchronous encoding, concurrent requests, failures,
cleanup and editor keyboard routing.

The native browser suite decodes the actual PNG, compares its pixels, checks
filenames and metadata after delayed navigation, and rejects the former
bottom-anchor rotation behavior with an independent position reference. It also
pressures the export's private tint cache, checks eviction and cleanup while
preserving every runtime cache entry, and immediately paints terrain, requiring
bounded work and exact three-texture parity without an intervening reference
rebuild. Terrain and export checks run independently so either failure retains
its own evidence. These native checks are mandatory in CI; a local syntax or
deterministic pass alone is not rendered qualification.
