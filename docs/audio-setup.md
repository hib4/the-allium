# Venue mixed audio and LED setup

The pipeline is **venue USB audio mix → input-only Python capture → mixed feature analysis → local WebSocket → Live visual layers → LED display**. It does not record audio, open an audio output, control the mixer, separate sources, or identify instruments. Demo remains a separate synthetic instrument score. Live never falls back to simulated audio.

## Run the current source build

On the MacBook Pro M4, use Python 3.11+ and the project's Node runtime:

```sh
python3 -m venv .venv
.venv/bin/python -m pip install -r audio_service/requirements.txt
npm ci
npm run build
npm run audio
```

Open `http://127.0.0.1:8765/control`. The service serves the production build and WebSocket on the same origin. Keep the terminal running. On Windows use `.venv\Scripts\python.exe` and the interface manufacturer's supported input driver; actual Windows behavior remains unverified.

During development, run `npm run audio` and `npm run dev` in separate terminals. Use `http://localhost:5173` for both operator and display; Vite proxies `/api` and `/ws`. A remotely hosted frontend alone cannot access this local service.

Portable packages must be rebuilt from this source before using these changes. Existing archives under `artifacts/` contain earlier code and are not updated by `npm run build`. See [release tooling](../release/README.md).

## Local development with the MacBook Pro Microphone

Use the built-in microphone for this testing iteration; no venue interface is required. Run `npm run audio` and `npm run dev` in separate terminals, then open **http://localhost:5173/control**. Reuse these servers if already running. Python is not hot-reloaded: restart `npm run audio` after Python changes. Vite reloads frontend changes automatically.

1. Grant input permission to the app or terminal hosting Python under **System Settings → Privacy & Security → Microphone**. This is Python capture; browser microphone permission does not grant Python access. macOS System Settings activity alone does not prove application capture works.
2. Refresh devices and explicitly choose **MacBook Pro Microphone · Core Audio**. Choose **Mono → Input 1 → Auto**, then Apply. The device observed locally reports one input and a 48 kHz default; trust the actual device report on other machines.
3. Confirm **Selected input**, **Actual capture**, **Frames: fresh**, and a recent **Capture age**. The raw meter shows RMS and peak in dBFS before the noise threshold and sensitivity. Nonzero raw input below the visual gate is labelled **below the noise threshold**; genuine zero input is labelled silence. Neither establishes a permission error by itself.
4. Choose **Live** and open the display from the same `localhost:5173` origin/profile. Speak normally, leave a quiet gap, clap a few separated times, then play music through an external speaker. Expect changing energy/lines during speech and music, localized transient activity on sufficiently strong claps, and quiet visual response when input falls below the threshold. Continuous room sound can keep a microphone above a −60 dBFS gate; adjust the threshold from observed raw levels instead of assuming a silent room.
5. Test Standby → Live while watching capture continuity, then restart the audio service and confirm automatic WebSocket/input recovery. Do not disable system privacy protections to automate permission tests. Denied permissions and interruptions must produce useful status without switching to Demo or another microphone.
6. For venue use later, explicitly choose the USB device and its mix channels; the same capture and analysis pipeline applies. No device is selected automatically.

Optional repeatable diagnostics (reads derived features through the running Vite proxy; no PCM recording or device selection):

```sh
node scripts/microphone-check.mjs --seconds 10 --label quiet --output /tmp/allium-mic-quiet.json
node scripts/microphone-check.mjs --seconds 10 --label speech --output /tmp/allium-mic-speech.json
node scripts/microphone-check.mjs --seconds 10 --label claps --output /tmp/allium-mic-claps.json
node scripts/microphone-check.mjs --seconds 20 --label external-speaker-music --output /tmp/allium-mic-music.json
```

Provide the named sound during each window and record which stimuli actually occurred. Labels do not automatically classify or verify speech, claps, or music. The command fails if the selected device is different, fixture frames are received, or capture is not fresh/connected at the end. A successful command proves fresh capture, including valid silence; it does not certify a particular sound or sustained stability. Inspect `errors`, `stale`, stream changes, overflows and dropped blocks separately. `ALLIUM_URL` can select another local origin.

Device discovery lists reported inputs without checking every unrelated driver. Selecting an input refreshes capabilities for that explicit device; capture preflight checks only the selected device. While that input is actively capturing, refresh returns cached/proven formats without probing alternative rates, which can interrupt CoreAudio capture. This avoids letting an unrelated Continuity/virtual input's format checks delay the requested microphone.

## Select the venue mix

1. Connect the USB audio interface and confirm the venue's combined mix is routed to its computer inputs with the audio engineer. System Settings activity confirms that macOS sees a signal; it does not prove Python has input permission or that the chosen USB channels contain that signal.
2. In **System Settings → Privacy & Security → Microphone**, allow the app or terminal hosting Python. Restart that host if macOS requires it. Keep the venue audio output unchanged.
3. Click **Refresh devices** and choose the input device. Every input device is eligible, including one-channel and two-channel devices. The UI shows input capacity and default rate for all devices, and configurations checked using PortAudio for the selected device. These are checked formats, not an exhaustive driver capability list.
4. Choose **Mono** and its input, or **Stereo** and the distinct left/right inputs. Channel labels are one-based device positions. For a mix delivered on inputs 11–12, select those positions; no instrument mapping is needed. The service tries the smallest capture width that reaches the selected inputs, then larger reported widths for interfaces that require them. Only the selected channels are analyzed.
5. Leave **Sample rate** on **Auto** to prefer the device default, followed by 48, 44.1 and 96 kHz when needed. An explicit checked rate does not silently change on failure. The exact channel-width/rate combination is validated on Apply and again when capture opens. Reported capacity does not prove the selected format will open on real hardware.
6. Click **Apply input settings**. Confirm **Actual capture**, selected-input meters and connection status. Adjust **Sensitivity** (0.1–10) and **Noise threshold** (−90 to −10 dBFS), then Apply. Raise the threshold above background noise; sensitivity affects visual response, not mixer gain. CLIP holds for one second; clipping requires correction at the audio source.
7. Select **Start Live**. A healthy silent input reports silence and produces no reactive activity. Service-connected, input-connected, input-silent and input-unavailable are distinct states.

Live layers are **Low currents**, **Mid flowing lines**, **High filaments**, and **Transient blooms**. Each strength slider reaches zero to hide that layer. They respond to measured frequency energy and changes in the mix. They are not labels for bass, vocals or other detected instruments. Overall intensity, particle density, motion, Calm Mode and Reduced motion retain separate controls.

## Stage display profiles

1. Connect the LED processor as an extended display. Have the venue technician confirm the OS output and processor mapping produce the intended **4416 × 896** or **2424 × 896** active canvas without overscan or scaling distortion.
2. Choose the matching option under **Display profile**: **Venue LED · 4416 × 896** uses **69:14**, and **Venue LED · 2424 × 896** uses **303:112**. Each target describes the full stage, including captions when enabled. The operator preview shares that ratio. On other screen shapes the venue composition is contained proportionally; **Responsive** fills an arbitrary viewport instead.
3. Click **Open display**, move that browser window to the LED output and enter fullscreen. Operator and audience tabs must use exactly the same origin and browser profile. Escape and the keyboard-focusable exit action remain available.
4. Enable **Display calibration** to inspect the inset edge, all corner markers, centerlines and circular geometry. The overlay shows target dimensions and browser viewport dimensions; it cannot measure LED processor mapping. Disable calibration before presenting. It does not change capture or caption settings.
5. Confirm visual distribution, captions, reduced motion, contrast, viewing distance and comfort on the actual LED hardware. Captions retain the existing manual/sample controls and opaque band. Hiding captions retains the cue and lets the score fill the available area.

**Standby** / **Stop visualization** suppress reactive output while capture and meters continue. **Start Live** resumes using fresh frames, without restarting the service or replaying old transients. Demo can run while capture stays connected. To stop capture entirely, terminate the service or use the packaged Stop launcher.

## Settings and recovery

Audio settings persist in `audio_service/local-config.json`; `--config PATH` selects another file. Native packages use the user's application-data folder. Saves are atomic and revision conflicts require Discard edits before retrying. Export settings saves audio and visual preferences, including layers and the display profile. Restore downloads a backup first, enters Standby, resets calibration, and requires explicit device/channel selection. Temporary captions follow the existing restore behavior.

Legacy instrument-mapping settings are preserved as `.legacy.json` when loaded from disk and migrated to an unconfigured mix. Browser restores accept earlier exports but never infer mix channels from instrument assignments. Keep the original export for rollback. Visual state synchronizes among open tabs; closing all tabs starts a new paused Demo session, so use Export/Restore to retain visual configuration across sessions.

| Symptom | Action |
| --- | --- |
| Service offline | Start the local service. WebSocket retries back off from 250 ms to 5 seconds. |
| Input unavailable | Check device power, USB, input permission, selected channels/rate, and manufacturer driver. Reconnect the same device; capture retries every two seconds. No default-microphone substitution occurs. |
| Connected but silent | Confirm the venue send and selected channel positions. Inspect the input meters and noise threshold. |
| Meter moves but no Live response | Apply pending settings, choose Live, check layer strengths, intensity, Calm Mode and reduced-motion settings. |
| Stream stalls | The one-second capture watchdog aborts/reopens the input stream. A driver that blocks during discovery/open/abort may still require restarting the host process. |
| Service reconnects but no frames | Reload both tabs and restart the service from the same build; feature packets/configuration now use version 2. |
| Repeated overflows/drops | Check USB and host load, connect power, close heavy apps, reduce visual detail, and rehearse again. Dropped blocks discard obsolete work rather than growing latency. |
| Display unsynchronized | Use the same origin/profile; close the other operator tab holding control. |

Freshness expires after 500 ms. Missing/stale input clears measured activity and transient events; it never starts Demo. Audio stream identity and configuration revision reset feature history on reconnection/reconfiguration. Export diagnostics includes device reports, requested/actual format, service state, processing age and overflow/drop counters; it contains no PCM recording.

## Analysis and software checks

Capture uses float32 input, 512-sample blocks and a 2048-sample Hann FFT at the negotiated rate. Rates therefore change window/hop duration (approximately 46/12 ms at 44.1 kHz, 43/11 ms at 48 kHz). Analysis combines stereo power without phase cancellation and measures RMS/peak, absolute low (20–250 Hz), mid (250–4000 Hz) and high (4000 Hz–Nyquist) energy, spectral centroid/distribution, positive flux, bounded onsets, and 120 ms / 2 s energy envelopes. No pitch or instrument labels are inferred for Live.

WebSocket feature delivery targets 30 Hz; operator snapshots are throttled separately from the animation loop. Continuous layer response smooths over about 180 ms; absence decays over about 100 ms. Blooms are localized and rate-limited. Existing adaptive quality, pixel-density limits and WebGL → Canvas → static fallback remain. Processing age excludes driver buffering, FFT windowing, visual smoothing, LED processing and screen latency.

```sh
npm test
npm run test:audio
npm run test:browser
npm run test:integration
npm run build
```

For an explicit synthetic PCM soundcheck:

```sh
npm run audio -- --fixture --config /tmp/allium-mixed-fixture.json
```

Select the clearly labelled synthetic device and channels, Apply, then Start Live. This is software test input, never a fallback. Keep fixture settings separate from the venue file. Integration tests create an isolated fixture configuration on port 8766. The updated soak script also requires an explicitly enabled fixture service.

**Physical acceptance remains required:** actual USB device formats and routing on the M4, macOS permission behavior, unplug/replug, sustained driver stability, a full-length hardware rehearsal, input-to-visible latency, LED fullscreen/scaling, caption reading distance and audience motion comfort. Test doubles, browser screenshots and synthetic PCM establish software behavior only. See [verification results](audio-verification.md).
