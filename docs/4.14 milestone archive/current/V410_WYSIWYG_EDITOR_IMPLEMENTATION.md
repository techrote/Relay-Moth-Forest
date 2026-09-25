# Relay Moth Forest v4.10 — WYSIWYG Editor Implementation

v4.10 replaces the non-WYSIWYG F2 miniature map editor with a direct on-canvas authoring surface. The normal renderer remains authoritative for visual feedback, while `editor.js` owns editor input, palette, selection, clipboard, undo/redo, and room mutation.

The implementation deliberately does not turn mouse input back into gameplay input. When F2 edit mode is active, `Game.isModal()` suspends simulation updates and the editor overlay owns pointer events. Exiting the editor returns mouse ownership to menus/system cursor behavior; keyboard/gamepad remain the world-control authorities during gameplay.

The editor supports immediate in-memory room rebuilds plus localhost persistence through `relay_moth_server.py`. Existing external map/story/LUT authority remains unchanged: the editor mutates the map JSON structure rather than creating a parallel scene format.
