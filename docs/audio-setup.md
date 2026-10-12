# Live audio at Glitz Inclusive

The pipeline is **Ui24R USB-B → input-only Python capture → per-channel analysis → local WebSocket → the existing Allium score → projection**. The service never opens an audio output, changes mixer patching, or records audio. Mute, solo, sensitivity, and mapping affect visuals only.

## Install once, before going offline

Use Node.js 22.12+ and Python 3.11+ (tested here with Python 3.14). Install the website dependencies with `npm ci` if a lockfile is present, otherwise `npm install`.

macOS:

```sh
python3 -m venv .venv
.venv/bin/python -m pip install -r audio_service/requirements.txt
npm run build
```

Windows PowerShell:

```powershell
py -3 -m venv .venv
.venv\Scripts\python.exe -m pip install -r audio_service/requirements.txt
npm run build
```

On Windows, install Soundcraft's official multichannel USB driver before soundcheck. The launcher enables `SD_ENABLE_ASIO` before importing sounddevice. Use the pip installation above; an unrelated Conda/custom PortAudio DLL may lack ASIO. See [sounddevice ASIO support](https://python-sounddevice.readthedocs.io/en/latest/installation.html#asio-support).

No public internet is needed after installing dependencies and building. Fonts and visual assets are bundled. Offline operation requires the local HTTP service to keep running; opening `index.html` using `file:` is unsupported.

## Hardware-free rehearsal

For the existing browser-only Demo:

```sh
npm run dev
```

Open `http://localhost:5173/control`, keep **Demo** selected, and press **Play demo**. It works without Python or the mixer. The homepage, tutorial, and mobile companion retain their independent demos.

To exercise capture-style PCM analysis and WebSocket delivery without hardware:

```sh
npm run audio -- --fixture --config audio_service/fixture-config.json
```

Open `http://127.0.0.1:8765/control`. Expand an instrument, select USB positions, apply settings, and select **Live**. This is explicitly labelled **synthetic soundcheck**. All 32 fixture channels contain illustrative signals; no fixture channel is a venue instrument assignment. Use a separate fixture configuration so rehearsals do not overwrite confirmed venue settings.

During frontend development, run `npm run audio` and `npm run dev` in separate terminals. Vite proxies `/api` and `/ws` to port 8765. Use only the Vite origin for both tabs. Demo remains functional if the service is stopped.

## Connect the Ui24R

1. With the venue engineer, connect the mixer's **USB-B DAW interface** to the capture computer using a suitable USB data cable. The USB-A recording sockets and the mixer's Wi-Fi control connection are different interfaces.
2. Start the service with `npm run audio`. Device enumeration is available with `npm run audio -- --list-devices`.
3. Open `http://127.0.0.1:8765/control`. Refresh devices and select the Ui24R **32-input CoreAudio device on macOS**, or its **ASIO device on Windows**. Apply input settings. The service validates 32 inputs at **48 kHz** and opens only an input stream.
4. On macOS, grant audio-input permission to the terminal/Python host if requested. Do not change the system audio output or the venue mixer routing to make visualization work.
5. Confirm each source at soundcheck using the individual USB meters, then assign the observed channels to instruments. Initially, all instrument assignments are empty.

Soundcraft confirms the 48 kHz requirement, Windows ASIO setup, and that USB sends require no mixer patching in its [multitrack DAW guide](https://harman.helpjuice.com/en_US/ui24r-multitrack-recording-with-a-daw). Follow the **USB Send** guidance; USB Return routing is unnecessary for this input-only application.

| USB position shown in Allium | Mixer source reference |
| --- | --- |
| 1–2 | Master L/R |
| 3–10 | AUX 1–8 |
| 11–32 | Mixer inputs 1–22 |

These positions identify USB signals, not instruments. For example, USB 11 means mixer input 1; it does **not** mean guitar. Master and AUX channels contain mixed signals and cannot isolate instruments that share them. If the intended isolated signal is unavailable, consult the venue engineer rather than changing patching from this application.

## Assign instruments and present

- Expand vocals, guitar, drums, bass, or piano. Select one or several USB positions; grouping several drum microphones is supported. Power-domain aggregation prevents opposite-phase inputs from cancelling visual energy.
- Shared assignments are allowed and explicitly reported. Both visual instruments will then respond to the same signal.
- Adjust **Sensitivity** (0.1–10) and **Noise threshold** (−90 to −10 dBFS) while checking the raw USB meters. Raw meters do not change when visual sensitivity/mute/solo changes. Defaults are 1× sensitivity and −60 dBFS.
- Use **Apply input settings** to commit the whole configuration. Unsaved edits do not affect Live. Settings persist in `audio_service/local-config.json`; `--config PATH` selects another file. Conflicting edits receive a refresh/retry message; discard edits to load current settings.
- **Demo** uses synthetic musical events and its existing play/pause transport. **Live** uses mapped input signals; its clock runs independently of Demo pause. **Standby** keeps a quiet branded visual field. Live also fades to Standby after 500 ms without fresh input, with the requested Live mode retained for automatic recovery.
- Silence is a healthy live signal with zero activity. An unmapped instrument has zero activity. Neither silence nor missing hardware triggers simulated beats.
- Open the display using **Open display**, move it to the projection output, and enter browser fullscreen. Both tabs must use the same browser profile and exactly the same origin. `/experience?performance=1` supports 1920×1080 and the existing panoramic layout. Escape/focusable exit controls remain available.
- Only the existing operator-owner tab can change session controls; additional operator tabs are read-only. Manual captions remain available in all modes. Sample lyrics appear only in Demo. There is no automatic transcription.
- Scene focus, Calm Mode, Reduced Motion, mute and solo retain their existing behavior. Reduced Motion defaults to the operating-system preference. Color is reinforced by distinct instrument shapes.

## What the features mean

Analysis uses 512-sample hops (10.7 ms) and a rolling 2,048-sample Hann FFT (42.7 ms) at 48 kHz. WebSocket delivery targets 30 Hz; meters update about 10 Hz and the existing renderer runs independently using requestAnimationFrame, targeting 60 FPS with adaptive detail.

RMS and peaks measure amplitude. Spectral energy is divided into bass (20–250 Hz), mid (250–4,000 Hz), and treble (4,000–24,000 Hz). Thirty-two spectrum bins drive fine visual texture. Spectral-flux onset detection drives localized beat/attack effects; this is onset detection, not a guaranteed tempo/BPM tracker. Drum articulation is a heuristic from band balance, not reliable drum-source recognition.

Confidence-gated autocorrelation estimates monophonic pitch for vocals, guitar, and bass when enabled. Chords, distortion, bleed, or multiple singers can reduce accuracy. Low-confidence passages use spectral register instead of presenting a confident note estimate. Live piano blooms reflect attacks and spectral/register activity; they do not claim to identify exact notes or chords. Existing tutorial examples remain synthetic demonstrations of the visual language.

Live opacity uses a continuous perceptual curve so quiet mapped signals remain visible; amplitude still controls width, size, and pressure. Silence retains only a faint branded field.

Visual response preserves the existing 220–650 ms smoothing constants and bounded localized light treatments. Feature delivery latency and visual settling time are different measurements. Processing age shown on the dashboard excludes USB driver, LED processor, and display latency; measure the full system during rehearsal.

## Recovery and troubleshooting

- **Service offline:** start `npm run audio`; reconnect attempts back off from 250 ms to a maximum of 5 seconds. Demo still works. A stalled WebSocket is closed and retried after roughly 3 seconds without frames.
- **No device / unavailable:** check USB-B cable, driver, macOS permission, and whether a DAW holds the ASIO device. Refresh and choose the correct multichannel device. The service never falls back to a microphone or stereo input. It retries the selected device every two seconds after capture errors.
- **No instrument activity:** inspect raw meters, applied USB assignments, noise threshold, and sensitivity. Confirm the source with the venue engineer. Do not assume the stage channel list matches USB positions.
- **Clipping:** a USB sample at approximately full scale shows CLIP for one second so short peaks remain visible; visual sensitivity cannot repair clipped input. Report it to the audio engineer.
- **Overflows / dropped blocks:** close heavy applications, check USB connection, disable optional pitch estimation if needed, and test a suitable host/driver buffer configuration. Queues are bounded and obsolete blocks are dropped instead of replayed late.
- **Settings conflict:** discard local edits to fetch the current revision, then reapply. A corrupt settings file is reported and the service recovers with unmapped defaults.
- **Display not synchronized:** match the full origin and browser profile. `localhost` and `127.0.0.1` are different origins. Remote control/display computers are outside this version.
- **GPU failure:** Canvas fallback preserves the session and captions. Use `?performance=1&renderer=canvas` for rehearsal. If both animated backends fail, readable captions and the existing static fallback remain.

The production service binds only to `127.0.0.1`. It is intended for local venue use, not public hosting. Stop it with Ctrl+C. The optional `--port` flag changes its port; Vite's proxy must be updated accordingly if using a nondefault port in development.

## Verification and remaining hardware checks

```sh
npm test
npm run test:audio
npm run test:browser
npm run test:integration
```

The integration suite builds production assets and starts a separate synthetic service on port 8766 with an isolated temporary configuration. It covers grouped mapping, PCM-to-WebSocket delivery, same-browser display sync, manual captions, stale frames, reconnects, offline Demo, 1920×1080 projection, mobile reflow, and automated accessibility. Tests use installed Google Chrome.

**Still requires the physical Soundcraft Ui24R:** enumerate all 32 inputs on the actual macOS and Windows hosts; confirm the venue's instrument assignments; verify ASIO/CoreAudio buffer stability, device removal/reconnection, channel levels and bleed; calibrate pitch/onset response; measure USB-to-screen latency and sustained display frame rate; assess contrast, captions, reduced motion, and comfort on the real projection system with Deaf/hard-of-hearing participants. Automated tests do not establish full accessibility conformance or concert-hardware performance.

## Portable RC for venue operators

Prefer the native portable release instead of the developer installation above. See [Panduan Operator](release/Panduan-Operator.html) and [release build instructions](../release/README.md). This release adds Start/Stop launchers, application-data settings/logs, settings export/restore, diagnostic export, protected loopback shutdown and a separate synthetic endurance harness. Windows artifact/native validation remains pending. The developer pytest dependency is now in `requirements-dev.txt`; use that file when running Python tests.
