# Relay Moth Forest v4.11 — WYSIWYG Editor Input Fix

The palette/toolbar lockout was a stacking-context and pointer-ownership bug. `editorOverlay` was above the `wysiwygEditor` parent stacking context, so the canvas could intercept clicks intended for palette/menu controls.

## Changes

- `wysiwygEditor` stacking context is now above `editorOverlay`.
- Toolbar and palette remain explicit pointer-enabled UI islands; the rest of the editor shell stays pointer-transparent.
- Canvas pointer capture is only acquired for valid world-edit gestures.
- Pointer capture is explicitly released on pointer-up/cancel and editor transitions.
- Editor UI pointer events are shielded from canvas/game handlers.
- Editor buttons are explicitly `type=button`.

The result is that selecting a palette item no longer makes the rest of the palette or toolbar inaccessible.
