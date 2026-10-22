# Portable release tooling

Build natively on each supported OS/architecture. Use Python 3.11+ and Node 22.12+ on the maintainer machine; the operator needs neither.

1. `npm ci` and `npm run build`.
2. Create `.venv` and install `audio_service/requirements-dev.txt`.
3. Run `release/build.py` with that environment's Python.
4. Verify the resulting ZIP and checksum under `artifacts/`.

`release/entry.py` bundles the frontend and input-only service, uses a fixed loopback origin, stores user settings separately, and supplies health-checked launch/reuse and token-protected stop. `--fixture --no-browser` is exclusively for synthetic validation and writes a separate fixture configuration. Normal launch never enables it.

Native validation: unpack to a folder containing spaces, launch without Node/Python on PATH, check `/api/health` and `/api/devices`, exercise Demo and missing inputs, try duplicate launch, test stop/restart and forced termination recovery. Run `npm run test:soak` against the packaged synthetic fixture for 30 minutes; results go to `artifacts/verification/soak.json`. Only a maintainer needs the test tools.

Windows support is build tooling only until a native artifact is built and validated. The build collects sounddevice's ASIO DLLs and sets SD_ENABLE_ASIO before importing sounddevice. Confirm actual driver discovery, selected mono/stereo capture and recovery with the venue USB hardware; merely bundling ASIO is not a driver test.

Unsigned internal candidate: checksums identify the supplied archive but are not a publisher signature. macOS deployment compatibility follows the bundled Python/library build; only the development host OS is currently tested. Validate older OS versions explicitly before use. Mac Intel needs a native x64 build.

No release upload or CI execution is automatic. Preserve prior releases and exported settings for rollback.

`audio_service/requirements-lock.txt` records runtime versions from the actual macOS candidate. Its versions are tied to the tested build environment; check wheel/Python compatibility before using them on another platform. Package archives include `release.json`, build inventory, dependency notices and available verification reports. Final operator checklist is supplied as printable HTML and editable CSV.

Mixed-input source update: rebuild native artifacts to include version 2 audio settings/packets and the 4416 × 896 profile. Earlier packaged validation reports do not validate these changes. Follow docs/audio-setup.md for the current configuration.
