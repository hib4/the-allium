> Mixed-input source update: existing archives predate this change and must be rebuilt. Use the current audio setup guide; historical package verification below is not new hardware evidence.

# The Allium 1.1.0-rc.2

Internal unsigned portable release candidate. No physical Ui24R or external-display validation is claimed. Windows executable and native validation pending; macOS ARM64 is built on the development host. Intel Mac requires its own native build.

Launch using Start The Allium; stop using Stop The Allium. Keep the Start terminal open. Normal release never starts synthetic PCM automatically. Browser Demo works without mixer. Driver and browser must be installed before offline use. Settings live outside this folder in the user's application-data directory.

Rollback: stop services, open a previous release folder, restore a compatible exported settings backup, select the device again, verify Demo then Live. Keep the previous archive and SHA-256. Do not overwrite a running release.

Windows maintainer build (Python 3.11+ x64, Node 22.12+):

    npm ci
    npm run build
    py -3 -m venv .venv
    .venv\Scripts\python.exe -m pip install -r audio_service/requirements-dev.txt
    .venv\Scripts\python.exe release/build.py

Mac maintainer build: install requirements-dev.txt in .venv and run npm run release:mac. Native package tests, Windows ASIO library presence, clean-machine launch/stop, selected mixed-input discovery and a 30-minute soak are gates before marking that platform validated. Test logs must state actual OS/architecture.

Package licenses and build-environment inventory are included. Node/Python development tools are not required by operators. Bundled Python libraries include PortAudio/sounddevice, aiohttp and NumPy. No audio recording, mixer control, automatic lyrics, source separation or accurate polyphonic pitch transcription.
