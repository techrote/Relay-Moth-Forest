#!/usr/bin/env python3
"""Exercise the real editor save handler against an isolated temporary project.
Never mutate the user's map or erase their existing editor_backups directory.
"""
from __future__ import annotations
from pathlib import Path
import http.client, importlib.util, json, tempfile, threading
R=Path(__file__).resolve().parents[2]
spec=importlib.util.spec_from_file_location('rmf_server_414',R/'relay_moth_server.py')
mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)
original=(R/'relay_moth_maps.json').read_bytes()
with tempfile.TemporaryDirectory(prefix='relay-editor-save-test-') as directory:
    mod.ROOT=Path(directory)
    target=mod.ROOT/'relay_moth_maps.json'; target.write_bytes(original)
    backups=mod.ROOT/'editor_backups';backups.mkdir()
    sentinel=backups/'preexisting-backup.json';sentinel.write_bytes(b'previous user backup')
    httpd=mod.BoundedThreadingHTTPServer(('127.0.0.1',0),mod.Handler,max_workers=2)
    thread=threading.Thread(target=httpd.serve_forever,daemon=True);thread.start()
    try:
        port=httpd.server_address[1]
        payload=json.dumps(json.loads(original.decode('utf-8')),indent=2).encode('utf-8')+b'\n'
        c=http.client.HTTPConnection('127.0.0.1',port,timeout=5)
        c.request('POST','/__editor/save_maps',body=payload,headers={'Content-Type':'application/json','Content-Length':str(len(payload))})
        r=c.getresponse();body=r.read();c.close()
        assert r.status==200,(r.status,body)
        data=json.loads(body);assert data.get('ok') is True and data.get('file')=='relay_moth_maps.json'
        assert json.loads(target.read_text())['schema'].startswith('relay-moth-maps/')
        assert any(backups.glob('relay_moth_maps-*.json'))
        assert sentinel.read_bytes()==b'previous user backup'
        c=http.client.HTTPConnection('127.0.0.1',port,timeout=5)
        c.request('POST','/__editor/save_maps',body=b'{}',headers={'Content-Type':'application/json'})
        bad=c.getresponse();bad.read();c.close();assert bad.status==400
        assert sentinel.read_bytes()==b'previous user backup'
        print('EDITOR SAVE ENDPOINT REGRESSION PASS (isolated temporary project; existing backups preserved)')
    finally:
        httpd.shutdown();httpd.server_close();thread.join(timeout=2)
assert (R/'relay_moth_maps.json').read_bytes()==original,'test changed project maps'
