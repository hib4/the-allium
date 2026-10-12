"""Run on the target OS after npm ci/build and installing requirements-dev.txt."""
import subprocess
import sys
import platform
import shutil
import json
import hashlib
import importlib.metadata
from pathlib import Path
root = Path(__file__).resolve().parents[1]
name = f'TheAllium-1.1.0-rc.2-{platform.system()}-{platform.machine()}'
out = root / 'artifacts'
subprocess.run([sys.executable, '-m', 'PyInstaller', '--noconfirm', '--clean', '--onedir', '--name', 'allium', '--paths', str(root), '--distpath', str(out / 'bundles'), '--workpath', str(out / 'build'), '--specpath', str(out / 'build'), '--add-data', str(root / 'dist') + ':dist', '--collect-all', 'sounddevice', '--collect-all', '_sounddevice_data', str(root / 'release/entry.py')], check=True)
package = out / name
package.mkdir(parents=True, exist_ok=True)
shutil.copytree(out / 'bundles/allium', package / 'app', dirs_exist_ok=True)
if platform.system() == 'Darwin':
    for unused in (package / 'app').glob('**/portaudio-binaries/*.dll'):
        unused.unlink()

shutil.copytree(root / 'docs/release', package / 'Panduan', dirs_exist_ok=True)
if (root / 'docs/operator-audit.md').is_file():
    shutil.copy(root / 'docs/operator-audit.md', package / 'Panduan/operator-audit.md')
if platform.system() == 'Windows':
    (package / 'Start The Allium.cmd').write_text('@echo off\ncd /d "%~dp0"\n"app\\allium.exe"\nif errorlevel 1 pause\n')
    (package / 'Stop The Allium.cmd').write_text('@echo off\ncd /d "%~dp0"\n"app\\allium.exe" --stop\npause\n')
else:
    for action, argument in [('Start', ''), ('Stop', '--stop')]:
        path = package / f'{action} The Allium.command'
        path.write_text('#!/bin/sh\ncd "$(dirname "$0")"\n./app/allium '+argument+'\n')
        path.chmod(0o755)
licenses = subprocess.check_output([sys.executable, '-m', 'pip', 'list', '--format=json'], text=True)
(package / 'build-environment.json').write_text(licenses)
(package / 'release.json').write_text(json.dumps({'version':'1.1.0-rc.2', 'platform':platform.platform(), 'architecture':platform.machine(), 'unsigned':True, 'hardwareTested':False}, indent=2))
for f in root.glob('node_modules/*/LICENSE*'):
    target = package / 'Licenses' / f.parent.name
    target.mkdir(parents=True, exist_ok=True)
    shutil.copy(f, target)
for f in root.glob('.venv/lib/python*/site-packages/*.dist-info/licenses/*'):
    if f.is_file():
        target = package / 'Licenses' / f.parent.parent.name
        target.mkdir(parents=True, exist_ok=True)
        shutil.copy(f, target)
for distribution in importlib.metadata.distributions():
    for file in distribution.files or []:
        if any(word in str(file).lower() for word in ('license', 'copying', 'notice')):
            source = Path(distribution.locate_file(file))
            if source.is_file():
                dest = package / 'Licenses' / distribution.metadata['Name'] / Path(file).name
                dest.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy(source, dest)
# Frontend license notices, including scoped packages.
for f in (root / 'node_modules').glob('**/LICENSE*'):
    if f.is_file():
        dest = package / 'Licenses' / 'frontend' / f.relative_to(root / 'node_modules')
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy(f, dest)
verification = root / 'artifacts/verification'
for result in ('soak.json', 'ui-qa.json', 'package-smoke.txt', 'software-tests.md'):
    source = verification / result
    if source.is_file():
        dest = package / 'Verification'
        dest.mkdir(exist_ok=True)
        shutil.copy(source, dest)
for source in (Path(sys.base_prefix) / 'LICENSE.txt', Path(sys.base_prefix) / 'lib/python3.14/LICENSE.txt'):
    if source.is_file():
        shutil.copy(source, package / 'Licenses/Python-LICENSE.txt')
archive = shutil.make_archive(str(out / name), 'zip', out, name)
digest = hashlib.sha256(Path(archive).read_bytes()).hexdigest()
Path(archive + '.sha256').write_text(digest + '  ' + Path(archive).name + '\n')
print(archive)

