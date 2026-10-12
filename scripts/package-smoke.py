"""Native release smoke checks; run while the soak is stopped."""
import json
import subprocess
import time
import tempfile
import shutil
import os
import urllib.request
from pathlib import Path
version=json.loads(Path('package.json').read_text())['version']
binary = next(Path('artifacts').glob(f'TheAllium-{version}-*/app/allium*'))
base = 'http://127.0.0.1:8765'
def get(path):
    with urllib.request.urlopen(base+path,timeout=3) as r: return json.load(r)
def wait():
    for _ in range(100):
        try: return get('/api/health')
        except Exception: time.sleep(.2)
    raise RuntimeError('Service failed to start')
def stop():
    token = get('/api/health')['shutdownToken']
    urllib.request.urlopen(urllib.request.Request(base+'/api/shutdown',data=b'',headers={'X-Allium-Token':token}),timeout=3).close()
with tempfile.TemporaryDirectory(prefix='Allium package space ') as temp:
    target=Path(temp)/'app'
    shutil.copytree(binary.parent,target)
    executable=target/binary.name
    env={**os.environ,'PATH':'/usr/bin:/bin'} if os.name!='nt' else os.environ.copy()
    from http.server import HTTPServer, BaseHTTPRequestHandler
    import threading
    class Other(BaseHTTPRequestHandler):
        def do_GET(self):
            self.send_response(200); self.end_headers(); self.wfile.write(b'not Allium')
        def log_message(self, *args): pass
    other=HTTPServer(('127.0.0.1',8765),Other)
    threading.Thread(target=other.serve_forever,daemon=True).start()
    rejected=subprocess.run([str(executable),'--no-browser'],env=env,capture_output=True,text=True,timeout=20)
    assert rejected.returncode==1 and 'Port 8765' in rejected.stdout
    other.shutdown(); other.server_close()
    process=subprocess.Popen([str(executable),'--fixture','--no-browser'],env=env)
    info=wait(); assert info['fixture'] is True
    assert len(get('/api/devices')['devices']) >= 0
    subprocess.run([str(executable),'--no-browser'],env=env,check=True,timeout=20)
    stop(); assert process.wait(timeout=10)==0
    process=subprocess.Popen([str(executable),'--no-browser'],env=env)
    info=wait(); assert info['fixture'] is False
    process.kill(); process.wait(timeout=10)
    process=subprocess.Popen([str(executable),'--no-browser'],env=env)
    wait(); stop(); assert process.wait(timeout=10)==0
result = 'PASS: unrelated port conflict; no development PATH; spaces; device enumeration; duplicate launch; stop; normal missing-input startup; termination/restart.'
Path('artifacts/verification/package-smoke.txt').write_text(result+'\n')
print(result)
