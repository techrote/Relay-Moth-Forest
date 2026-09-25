#!/usr/bin/env python3
from __future__ import annotations
import argparse, contextlib, http.server, os, socket, threading, webbrowser, json, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent
_COPY_CHUNK = 32 * 1024

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self,*a,**k): super().__init__(*a,directory=str(ROOT),**k)
    def end_headers(self):
        suffix = Path(self.path.split('?',1)[0]).suffix.lower()
        # Allow recovery reloads to reuse the large immutable art assets. Source/config
        # files are revalidated so normal development still picks up changes.
        if suffix in {'.png','.jpg','.jpeg','.webp'}:
            self.send_header('Cache-Control','public, max-age=300')
        else:
            self.send_header('Cache-Control','no-cache, max-age=0')
        self.send_header('Cross-Origin-Opener-Policy','same-origin')
        self.send_header('Cross-Origin-Embedder-Policy','require-corp')
        super().end_headers()
    def copyfile(self, source, outputfile):
        # shutil.copyfileobj() is normally fine, but a fixed tiny reusable-per-request
        # readinto buffer makes localhost serving predictable even under memory pressure.
        buf = bytearray(_COPY_CHUNK)
        view = memoryview(buf)
        while True:
            n = source.readinto(buf)
            if not n:
                break
            outputfile.write(view[:n])
    def do_POST(self):
        path = self.path.split('?',1)[0]
        if path != '/__editor/save_maps':
            self.send_error(404, 'Unknown editor endpoint')
            return
        try:
            length = int(self.headers.get('Content-Length','0') or 0)
        except ValueError:
            length = 0
        if length <= 0 or length > 4 * 1024 * 1024:
            self.send_error(413, 'Invalid map payload size')
            return
        try:
            raw = self.rfile.read(length)
            data = json.loads(raw.decode('utf-8'))
            if not isinstance(data,dict) or not isinstance(data.get('rooms'),dict) or not str(data.get('schema','')).startswith('relay-moth-maps/'):
                raise ValueError('Expected relay-moth maps JSON with rooms object')
            target = ROOT / 'relay_moth_maps.json'
            backups = ROOT / 'editor_backups'
            backups.mkdir(exist_ok=True)
            stamp = datetime.datetime.now().strftime('%Y%m%d-%H%M%S')
            backup_name = f'relay_moth_maps-{stamp}.json'
            backup = backups / backup_name
            if target.exists():
                backup.write_bytes(target.read_bytes())
            tmp = ROOT / '.relay_moth_maps.editor.tmp'
            tmp.write_text(json.dumps(data,indent=2,ensure_ascii=False)+'\n',encoding='utf-8')
            tmp.replace(target)
            body = json.dumps({'ok':True,'file':'relay_moth_maps.json','backup':backup_name}).encode('utf-8')
            self.send_response(200)
            self.send_header('Content-Type','application/json; charset=utf-8')
            self.send_header('Content-Length',str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        except Exception as e:
            body = json.dumps({'ok':False,'error':str(e)}).encode('utf-8')
            self.send_response(400)
            self.send_header('Content-Type','application/json; charset=utf-8')
            self.send_header('Content-Length',str(len(body)))
            self.end_headers()
            self.wfile.write(body)
    def log_message(self, fmt, *args):
        if os.environ.get('RMF_VERBOSE'): super().log_message(fmt,*args)

class BoundedThreadingHTTPServer(http.server.ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True
    request_queue_size = 16
    def __init__(self, addr, handler, max_workers=4):
        self._slots = threading.BoundedSemaphore(max_workers)
        super().__init__(addr, handler)
    def process_request(self, request, client_address):
        self._slots.acquire()
        try:
            super().process_request(request, client_address)
        except BaseException:
            self._slots.release()
            raise
    def process_request_thread(self, request, client_address):
        try:
            super().process_request_thread(request, client_address)
        finally:
            self._slots.release()

def choose_port(preferred:int)->int:
    for p in range(preferred,preferred+20):
        with contextlib.closing(socket.socket()) as s:
            try:s.bind(('127.0.0.1',p));return p
            except OSError:pass
    raise RuntimeError('No local port available')

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument('--port',type=int,default=8765)
    ap.add_argument('--no-browser',action='store_true')
    ap.add_argument('--http-workers',type=int,default=4,help='maximum simultaneous localhost file transfers')
    args=ap.parse_args()
    port=choose_port(args.port)
    with BoundedThreadingHTTPServer(('127.0.0.1',port),Handler,max_workers=max(1,min(8,args.http_workers))) as httpd:
        url=f'http://127.0.0.1:{port}/index.html'
        print('Relay Moth Forest — Pretty Graphics Edition 4.14')
        print(url)
        print('Ctrl+C closes the local server.')
        if not args.no_browser:
            threading.Timer(.35,lambda:webbrowser.open(url)).start()
        try:httpd.serve_forever()
        except KeyboardInterrupt:pass
    return 0
if __name__=='__main__': raise SystemExit(main())
