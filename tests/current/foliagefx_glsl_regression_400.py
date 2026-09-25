#!/usr/bin/env python3
from pathlib import Path
import json,subprocess,sys
ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'tests/support'))
from gles import GLES,GpuUnavailable
try:gl=GLES()
except GpuUnavailable as e:
    print('GLSL VALIDATION SKIP:',e);raise SystemExit(0)
try:
    sources=json.loads(subprocess.check_output(['node',str(ROOT/'tests/support/capture_shaders.js')],text=True))
    print(gl.version)
    for name in ['foliage', 'foliageContact', 'foliageDebug']:
        s=sources[name];gl.program(s['vertex'],s['fragment'],name);print(name,'compile + link PASS')
finally:gl.close()
print('PRODUCTION GLSL ES 3.00 VALIDATION PASS')
