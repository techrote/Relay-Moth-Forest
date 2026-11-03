#!/usr/bin/env python3
"""Exercise the real editor save handler against an isolated temporary project.
Never mutate the user's map or erase their existing editor_backups directory.
"""
from __future__ import annotations
from pathlib import Path
import concurrent.futures, datetime, http.client, importlib.util, json, tempfile, threading
from unittest import mock
R=Path(__file__).resolve().parents[2]
spec=importlib.util.spec_from_file_location('rmf_server_414',R/'relay_moth_server.py')
mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)
original=(R/'relay_moth_maps.json').read_bytes()
with tempfile.TemporaryDirectory(prefix='relay-editor-save-test-') as directory:
    mod.ROOT=Path(directory)
    target=mod.ROOT/'relay_moth_maps.json'; target.write_bytes(original)
    backups=mod.ROOT/'editor_backups';backups.mkdir()
    sentinel=backups/'preexisting-backup.json';sentinel.write_bytes(b'previous user backup')
    httpd=mod.BoundedThreadingHTTPServer(('127.0.0.1',0),mod.Handler,max_workers=4)
    thread=threading.Thread(target=httpd.serve_forever,daemon=True);thread.start()
    try:
        port=httpd.server_address[1]
        def post(payload):
            if isinstance(payload,dict):
                payload=json.dumps(payload,indent=2,ensure_ascii=False).encode('utf-8')+b'\n'
            c=http.client.HTTPConnection('127.0.0.1',port,timeout=10)
            try:
                c.request('POST','/__editor/save_maps',body=payload,headers={'Content-Type':'application/json'})
                r=c.getresponse();return r.status,json.loads(r.read())
            finally:
                c.close()

        def candidate(revision):
            data=json.loads(original)
            data['_save_regression_revision']=revision
            return data

        class FixedDatetime(datetime.datetime):
            @classmethod
            def now(cls,*args,**kwargs):
                return cls(2026,11,3,12,0,0)

        # Two saves with an identical clock value must both preserve their exact
        # predecessor, including the original unformatted input bytes.
        with mock.patch.object(mod.datetime,'datetime',FixedDatetime):
            status,first=post(candidate(1))
            assert status==200 and first.get('ok') is True,(status,first)
            assert first.get('file')=='relay_moth_maps.json'
            first_bytes=target.read_bytes()
            status,second=post(candidate(2))
            assert status==200 and second.get('ok') is True,(status,second)
            assert first['backup']!=second['backup'],'rapid saves overwrote one backup'
            assert (backups/first['backup']).read_bytes()==original
            assert (backups/second['backup']).read_bytes()==first_bytes

            # Several tabs can save concurrently. Every acknowledged revision
            # must appear exactly once in the backup chain plus final map.
            barrier=threading.Barrier(4)
            def simultaneous(revision):
                barrier.wait(timeout=5)
                return post(candidate(revision))
            with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
                results=list(pool.map(simultaneous,range(3,7)))
            for status,data in results:
                assert status==200 and data.get('ok') is True,(status,data)
            names=[first['backup'],second['backup']]+[data['backup'] for _,data in results]
            assert len(set(names))==6,'each transaction needs a distinct backup'
            revisions=[json.loads((backups/name).read_bytes()).get('_save_regression_revision',0) for name in names]
            revisions.append(json.loads(target.read_bytes())['_save_regression_revision'])
            assert sorted(revisions)==list(range(7)),revisions

        # A failed backup must stop before touching the map and remove the
        # incomplete backup instead of presenting it as a recovery snapshot.
        before_failure=target.read_bytes()
        before_backups=set(backups.iterdir())
        with mock.patch.object(mod.os,'fsync',side_effect=OSError('simulated backup failure')):
            status,data=post(candidate(7))
        assert status==400 and data.get('ok') is False,(status,data)
        assert target.read_bytes()==before_failure,'failed backup changed the map'
        assert set(backups.iterdir())==before_backups,'failed backup left an incomplete snapshot'

        # A failed replacement cannot alter the old map or leave a temporary
        # file behind; the saved backup remains readable and retry is possible.
        with mock.patch.object(Path,'replace',side_effect=OSError('simulated replacement failure')):
            status,data=post(candidate(7))
        assert status==400 and data.get('ok') is False,(status,data)
        assert target.read_bytes()==before_failure,'failed save changed the map'
        assert not list(mod.ROOT.glob('*.tmp')),'failed save leaked a temporary file'
        status,data=post(candidate(7))
        assert status==200 and data.get('ok') is True,(status,data)
        assert json.loads(target.read_bytes())['_save_regression_revision']==7

        before_invalid=target.read_bytes()
        status,data=post(b'{}')
        assert status==400 and data.get('ok') is False,(status,data)
        assert target.read_bytes()==before_invalid
        assert sentinel.read_bytes()==b'previous user backup'
        print('EDITOR SAVE ENDPOINT REGRESSION PASS (isolated project; rapid/concurrent backup chain, backup/replace failure and retry)')
    finally:
        httpd.shutdown();httpd.server_close();thread.join(timeout=2)
assert (R/'relay_moth_maps.json').read_bytes()==original,'test changed project maps'
