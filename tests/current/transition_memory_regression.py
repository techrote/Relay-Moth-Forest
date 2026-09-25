#!/usr/bin/env python3
from pathlib import Path
import re
ROOT=Path(__file__).resolve().parents[2]
js=(ROOT/'game.js').read_text(encoding='utf-8')
server=(ROOT/'relay_moth_server.py').read_text(encoding='utf-8')
assert 'MAX_FRAMEBUFFER_PIXELS=8294400' in js
assert 'releaseCurrentStatic()' in js
assert 'finally{releaseCanvasBacking(staticCanvas);releaseCanvasBacking(materialMaps?.normal);releaseCanvasBacking(materialMaps?.spec);this.painter.lastMaterialMaps=null}' in js
assert 'retainedStaticCanvas:!!this.currentStatic' in js
assert 'relayMothContextRecovery39951' in js
assert 'automatic reload suppressed after repeated loss' in js
assert "game.painter.build(game.room,game.state,W,H)" in js
assert 'this.trimTintCache(96)' in js
assert 'this.sourceCanvas.width=1;this.sourceCanvas.height=1' in (ROOT/'surfacefx.js').read_text(encoding='utf-8')
assert 'class BoundedThreadingHTTPServer' in server
assert '_COPY_CHUNK = 32 * 1024' in server
assert 'max_workers=4' in server
assert "suffix in {'.png','.jpg','.jpeg','.webp'}" in server
# Ensure runtime rebuild does not assign the native room canvas to currentStatic anymore.
ensure=re.search(r'ensureBackground\(force=false\)\{(.+?)\}\n  buildWaterMask',js,re.S)
assert ensure and 'this.currentStatic=this.painter.build' not in ensure.group(1)
print('TRANSITION MEMORY REGRESSION 3.995.2 PASS')
