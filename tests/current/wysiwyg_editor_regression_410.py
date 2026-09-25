#!/usr/bin/env python3
from pathlib import Path
import json,re
R=Path(__file__).resolve().parents[2]
editor=(R/'editor.js').read_text()
game=(R/'game.js').read_text()
html=(R/'index.html').read_text()
css=(R/'style.css').read_text()
server=(R/'relay_moth_server.py').read_text()
maps=json.loads((R/'relay_moth_maps.json').read_text())

# Direct normal-game-view overlay, not a separate miniature map editor.
assert '<canvas id="editorOverlay" width="640" height="360"' in html
assert '<div id="wysiwygEditor" class="hidden">' in html
assert 'id="mapEditor"' not in html and 'id="mapCanvas"' not in html
assert html.index('surfacefx.js') < html.index('foliagefx.js') < html.index('editor.js') < html.index('game.js')
assert '#editorOverlay{position:absolute;inset:0' in css
assert 'body.wysiwygEdit #game' in css

# Required interaction model.
for token in (
    'class WysiwygEditor', "this.tool='brush'", "data-editor-tool", 'onDown(e)', 'onMove(e)', 'onUp(e)',
    'eraseAt(p,decorOnly=false)', 'selectBox', 'captureSelectionState()', 'copySelection()', 'pasteClipboard()',
    'Ctrl+C/V', 'SAVE TO PROJECT', 'DOWNLOAD JSON'
):
    # data-editor-tool and text tokens may live in HTML rather than editor source.
    assert token in editor or token in html, token
for tool in ('brush','select','move','erase'):
    assert f'data-editor-tool="{tool}"' in html
for cat in ('tiles','blockers','trees','decor','grass','lamps','robots'):
    assert f'data-editor-category="{cat}"' in html
assert "if(e.button===2){this.beginTransaction('remove decoration')" in editor and "if(this.tool==='erase'){this.beginTransaction('erase')" in editor
assert "(e.ctrlKey||e.metaKey)&&k==='c'" in editor and "(e.ctrlKey||e.metaKey)&&k==='v'" in editor
assert "e.key==='Delete'||e.key==='Backspace'" in editor

# Live preview and persistent authored decoration path.
assert 'this.editorDecor=r.editor_decor||[]' in game
assert 'drawEditorDecor(ctx,room)' in game
assert 'this.drawEditorDecor(ctx,room)' in game
assert 'new Room(idx,spec,this.game.maps)' in editor
assert "this.game.bgKey=''" in editor and 'this.game.ensureBackground(true)' in editor
assert "if(k==='f2'){e.preventDefault();toggleWysiwygEditor();return}" in game
assert '!!globalThis.rmfEditor?.active' in game

# Right-click can suppress generated room decorations when no explicit item exists.
assert 'decorExclusions=new Set' in game
assert 'room.decorExclusions?.has(k)' in game
assert 'r.decor_exclusions=r.decor_exclusions||[]' in editor

# Localhost project-save endpoint is constrained and validates the map shape.
assert "path != '/__editor/save_maps'" in server
assert 'length > 4 * 1024 * 1024' in server
assert "not str(data.get('schema','')).startswith('relay-moth-maps/')" in server
assert "backups = ROOT / 'editor_backups'" in server
assert "tmp.replace(target)" in server
assert "fetch('/__editor/save_maps'" in editor

# Editor fields remain optional and maps continue to load without migration.
assert maps['schema'].startswith('relay-moth-maps/')
for room in maps['rooms'].values():
    assert isinstance(room.get('walls',[]),list)
    assert isinstance(room.get('grass_clumps',[]),list)

print('WYSIWYG EDITOR REGRESSION 4.10 PASS')
print('  on-canvas painting/right-erase/select-move/copy-paste/live-preview/project-save contracts validated')
