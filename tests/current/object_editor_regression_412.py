from pathlib import Path
import json
R=Path(__file__).resolve().parents[2]
e=(R/'editor.js').read_text(); g=(R/'game.js').read_text(); h=(R/'index.html').read_text()
assert 'data-editor-tool="object"' in h and 'data-editor-category="moths"' in h and 'data-editor-category="wildlife"' in h and 'data-editor-category="ambient"' in h
for token in ["this.tool==='object'", "type:'objective'", "type:'moth'", "type:'wildlife'", "type:'mini'", "type:'pattern'", 'patternItems(r)', "'nest:swirl'", "kind:'moth'", "kind:'wildlife'", "kind:'mini'", "kind:'ambient'"]:
    assert token in e, token
assert 'this.patternExclusions=new Set' in g and 'this.objectFxHidden=new Set' in g
assert "skip('nest:swirl')" in g and 'this.room.objectFxHidden?.has(obj.object_id)' in g
print('OBJECT EDITOR REGRESSION 4.12 PASS')
