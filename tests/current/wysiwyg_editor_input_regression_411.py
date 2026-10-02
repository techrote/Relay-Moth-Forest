#!/usr/bin/env python3
from pathlib import Path
R=Path(__file__).resolve().parents[2]
css=(R/'style.css').read_text(); ed=(R/'editor.js').read_text(); html=(R/'index.html').read_text()
# DOM editor UI must be in a stacking context above the pointer-owning overlay.
assert '#editorOverlay{position:absolute;inset:0;width:100%;height:100%;z-index:105' in css
assert '#wysiwygEditor{position:absolute;inset:0;z-index:106' in css
assert '#editorToolbar' in css and 'pointer-events:auto;touch-action:auto;z-index:108' in css
assert '#editorPalette' in css and 'pointer-events:auto;touch-action:auto;z-index:107' in css
assert '#editorInspector' in css and 'pointer-events:auto;touch-action:auto;z-index:107' in css
assert '#editorDiagnostics' in css and 'pointer-events:auto;touch-action:auto;z-index:109' in css
# Pointer capture is only acquired by actual canvas gestures and explicitly released.
assert "if(p.y>=PLAY_H||![0,2].includes(e.button)){this.releasePointer(e.pointerId);return}" in ed
assert 'this.overlay.setPointerCapture?.(e.pointerId)' in ed
assert 'const id=pointerId??this.pointerId' in ed and 'this.overlay.hasPointerCapture?.(id)' in ed and 'this.overlay.releasePointerCapture(id)' in ed
assert 'this.pointerId=e.pointerId' in ed and 'this.resetPointerState(e.pointerId)' in ed
assert "this.overlay.addEventListener('pointercancel',e=>this.onCancel(e))" in ed
assert 'onCancel(e)' in ed and 'this.cancelGesture(e.pointerId)' in ed
# UI events are shielded from canvas/game handlers, and all buttons are explicit button controls.
assert "for(const ui of [this.toolbar,this.palettePanel,this.inspectorPanel,this.diagnosticsPanel])" in ed
assert "this.panel?.querySelectorAll('button').forEach(b=>b.type='button')" in ed
assert "b.type='button';b.className='editorPaletteItem'" in ed
assert '<canvas id="editorOverlay"' in html and '<div id="wysiwygEditor"' in html and 'id="editorInspector"' in html and 'id="editorInspectorBody"' in html and 'id="editorDiagnostics"' in html
print('WYSIWYG EDITOR INPUT REGRESSION 4.11 PASS')
