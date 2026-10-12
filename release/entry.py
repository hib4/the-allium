"""Frozen operator launcher. No development runtime required."""
import sys
import os
import json
import time
import webbrowser
import urllib.request
import urllib.error
import logging
from logging.handlers import RotatingFileHandler
from pathlib import Path

ROOT = Path(getattr(sys, '_MEIPASS', Path(__file__).resolve().parents[1]))
DATA = Path(os.environ.get('APPDATA', Path.home() / 'Library' / 'Application Support')) / 'The Allium'
BASE = 'http://127.0.0.1:8765'

def health():
    with urllib.request.urlopen(BASE + '/api/health', timeout=2) as r:
        try:
            result = json.load(r)
        except (ValueError, TypeError) as error:
            raise RuntimeError('Port 8765 is occupied by another application. Stop it and retry.') from error
    if not isinstance(result, dict) or result.get('application') != 'The Allium':
        raise RuntimeError('Port 8765 is occupied by another application.')
    return result

def main():
    DATA.mkdir(parents=True, exist_ok=True)
    log = RotatingFileHandler(DATA / 'service.log', maxBytes=1_000_000, backupCount=3)
    logging.basicConfig(level=logging.INFO, handlers=[log, logging.StreamHandler()])
    if '--stop' in sys.argv:
        try:
            info = health()
            req = urllib.request.Request(BASE + '/api/shutdown', data=b'', headers={'X-Allium-Token': info['shutdownToken']})
            urllib.request.urlopen(req, timeout=3).close()
            print('The Allium stopped. Close presentation tabs.')
        except urllib.error.URLError:
            print('The Allium is not running, or another application occupies port 8765.')
        return
    try:
        info = health()
    except urllib.error.URLError as e:
        if isinstance(e, urllib.error.HTTPError):
            raise RuntimeError('Port 8765 is occupied. Stop the other service and retry.') from e
    else:
        print('The Allium already running:', info['version'])
        if '--no-browser' not in ORIGINAL:
            webbrowser.open(BASE + '/control')
        return
    from audio_service.server import main as server_main
    fixture = '--fixture' in sys.argv
    sys.argv = ['allium', '--dist', str(ROOT / 'dist'), '--config', str(DATA / ('fixture.json' if fixture else 'settings.json'))] + (['--fixture'] if fixture else [])
    if '--no-browser' not in ORIGINAL:
        import threading
        def open_when_ready():
            for _ in range(300):
                try:
                    health()
                    webbrowser.open(BASE + '/control')
                    return
                except Exception:
                    time.sleep(.2)
        threading.Thread(target=open_when_ready, daemon=True).start()
    server_main()

ORIGINAL = sys.argv[:]
if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        logging.exception('Launch failed')
        print('Cannot start The Allium:', error, '\nSee Panduan Operator and service.log.')
        sys.exit(1)
