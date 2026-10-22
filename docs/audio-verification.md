# Mixed audio and panoramic display verification

Software checks performed on 22 October 2026 in the development workspace. No venue USB interface or LED processor was used. The subsequent built-in-microphone check below used actual local hardware. Tests use isolated configurations and explicitly synthetic PCM; capture tests use input-driver test doubles. Historical packaged-release measurements in `docs/release/VALIDATION.md` apply to earlier code.

## Results

| Check | Result |
| --- | --- |
| `npm test` | 28 passed |
| `npm run test:audio` | 46 passed |
| `npm run test:browser` | 17 passed |
| `npm run test:integration` | 11 passed |
| TypeScript / Vite production build | Passed, including integration build |
| `git diff --check` | Passed |

**102 automated tests passed.** Python and browser integration required localhost socket access. The existing website regressions passed against the running development setup. The production audio integration suite uses its own isolated fixture service on port 8766; it does not modify the real microphone configuration.

## Coverage and evidence

- Capture test doubles cover one-channel 44.1 kHz, two-channel 48 kHz, and channels 11–12 on a 32-input 96 kHz interface. Tests verify exact device selection, float32 input-only capture, selected channel extraction, default-rate negotiation, explicit-rate failure, unavailable/ambiguous devices, and interfaces requiring full capture width. Output streams are never created.
- DSP tests cover band energy and centroid at 44.1/48/96 kHz, opposite-phase stereo without cancellation, RMS/peak and clipping, silence, gated noise, energy steps/dynamics, bounded transients, invalid PCM and configuration validation. They do not establish musical perception or real-driver behavior.
- Service tests cover real localhost WebSocket delivery, version 2 configuration/packet flow, pings, atomic persistence/revision conflicts, concurrent format-preflight conflicts, bounded queues, legacy backup preservation, discovery single-flight behavior, disconnect/reconnect and stalled-stream watchdog behavior.
- Production integration tests run isolated synthetic PCM through Python analysis, WebSocket validation, operator meters, and the separate Live renderer. They cover source configuration, layers, caption synchronization, standby/resume without changing capture stream identity, stale WebSocket recovery, healthy silence versus missing hardware, and offline Demo without simulated Live fallback.
- Both WebGL and forced Canvas are exercised at **4416 × 896**, including reduced motion, bounded short frame-timing sampling, no document overflow, exact stage dimensions, proportional containment on a 1920 × 1080 viewport, calibration and preview. WebGL context loss during Live switches to Canvas while remaining Live. Short headless timing samples are not a sustained venue frame-rate guarantee.
- Existing browser regressions preserve routes, six-instrument Demo/tutorial/companion behavior, keyboard controls, local synchronization and ownership transfer, offline assets, captions, rendering fallback and mobile reflow. The mixed operator at 320 px passed the automated axe scan; this does not establish complete accessibility conformance.

Reviewed screenshots under `.impeccable/review/` include `mixed-live-4416.png`, `mixed-calibration-4416.png`, `mixed-webgl-reduced-4416.png`, `mixed-canvas-reduced-4416.png`, and desktop/mobile mixed operator views. The final bounded visual review confirmed full-width currents/lines, distributed allium blooms, undistorted calibration circles, proportional preview, and preserved caption presentation. Quiet-line glow and bloom decay were corrected in that review.

## Actual MacBook Pro Microphone verification

On 22 October 2026, the local Vite process (`npm run dev`, port 5173) and Python service (`npm run audio`, port 8765) were used together at **http://localhost:5173**. The explicitly selected hardware was **MacBook Pro Microphone / Core Audio / mono input 1 / Auto**, negotiated to **48,000 Hz**, with sensitivity **1** and noise threshold **−60 dBFS**. No fixture was enabled, no default-device fallback was used, and no microphone PCM was saved.

The operator confirmed completing **speech, claps, and music through an external speaker** during the announced one-minute window. That real-input window delivered 1,748 feature packets, 1,725 fresh packets, 78 transient events, RMS values from 0.00437 to 0.17653, peak 0.42181, and intensity up to 0.702. One interruption recovered automatically; that run is not reported as uninterrupted stability. Feature changes and events are measurements of the combined signal, not automatic identification of the individual test sounds.

Startup/refresh investigation found that capability discovery was checking unrelated devices and checking alternative formats while the microphone was active. Capture preflight now checks only the selected device. Device refresh uses cached/proven formats for an actively capturing input instead of probing alternative formats. Startup reports Connecting rather than remaining misleadingly Unconfigured during driver work. Permission/open failures and true stalls still report errors and retry the explicit input; silence is not labelled permission denial.

The final run after those changes:

| Real-hardware check | Observation |
| --- | --- |
| Capture window | 30 seconds through Vite `/ws` |
| Fresh packets | 900 / 900; zero stale |
| Capture streams | One continuous stream |
| Device refresh | Five refreshes during the window |
| Capture errors / overflows / dropped blocks | 0 / 0 / 0 |
| Maximum service processing age | 18.46 ms; not end-to-end latency |
| RMS range | 0.00589–0.27529 |
| Peak / maximum visual intensity | 1.27609 / 1.0 |
| Transient events | 49 |
| Browser | WebGL, changing Live canvas, no page errors |
| Standby → Live | Display state changed correctly; capture stream identity stayed unchanged |
| Diagnostics | Actual mono 48 kHz; fresh frames and approximately 1 ms capture age in the final browser sample |

The peak above 1.0 indicates a full-scale excursion; clipping indicators are appropriate. Speaker level/microphone gain should be checked before judging loud-transient quality. Ambient sound remained above the −60 dBFS gate throughout the final run, so this was not a physical digital-silence test or a completed room-noise calibration. Automated tests cover true silence and below-gate raw-meter behavior. The short final run demonstrates recovery from the observed probing problem, not concert-length endurance. A later one-second readiness check again received 30/30 fresh packets with no errors; cumulative dropped-block count had reached 25 during continued development activity, so the zero-drop result above applies specifically to its 30-second window. Bounded dropping preserves freshness but still needs a longer load rehearsal.

Raw derived diagnostics and reviewed screenshots are retained locally under `artifacts/verification/`: `microphone-user-soundcheck.json`, `microphone-final-stability.json`, `microphone-browser.json`, `microphone-control.png`, and `microphone-live.png`. These generated artifacts are ignored by Git. No raw audio is included.

Exact repeat steps are in [the microphone setup section](audio-setup.md#local-development-with-the-macbook-pro-microphone). The opt-in `scripts/microphone-check.mjs` reads derived features, refuses fixture/wrong-device frames, and reports statistics without changing input settings. Its labels are supplied by the operator; a successful exit means fresh connected capture at the end, not a verified stimulus classification or sustained-stability certification.

## Remaining physical and release verification

The following are **NOT TESTED** by these software checks:

- The actual venue USB device on the MacBook Pro M4: channel routing, advertised versus usable formats, macOS permission prompts, device removal/reconnection and extended driver stability.
- Actual 4416 × 896 output timing, LED processor mapping/overscan, fullscreen on the venue output, visual contrast and caption reading distance.
- End-to-end music-to-visible latency, a full-length hardware rehearsal, reduced-motion comfort and audience assessment with Deaf/hard-of-hearing participants.
- Updated frozen native packages, clean-machine startup/shutdown, Intel Mac and Windows native/ASIO operation. Existing archives are not rebuilt by the frontend production build. Earlier thirty-minute synthetic package results do not validate the new mixed pipeline.

Physical denial/revocation of macOS microphone permission was not forced during this session; permission/open failures are covered by test doubles. A native driver that blocks inside discovery, stream open or abort can require a service/host restart despite the capture watchdog. Device lists are driver reports; the format preflight is not a substitute for opening and rehearsing the actual device.

Follow [current setup instructions](audio-setup.md), [Panduan Operator](release/Panduan-Operator.html), and [the on-site checklist](release/On-Site-Checklist.csv). Preserve original legacy exports for rollback: version 2 intentionally requires explicit mix selection rather than reusing instrument assignments.
