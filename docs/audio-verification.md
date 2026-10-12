# Current release candidate results

See [RC validation](release/VALIDATION.md) for the latest 58 automated tests, native packaging checks and 30-minute endurance measurements. The original pipeline results below remain historical evidence.

# Audio pipeline verification

Verified on the development macOS ARM64 computer on 13 October 2026. The Soundcraft Ui24R was not connected; no physical capture or venue projection result is claimed.

| Check | Result |
| --- | --- |
| TypeScript / choreography / source tests (`npm test`) | 20 passed |
| DSP / Python service / input-only capture test doubles (`npm run test:audio`) | 19 passed |
| Existing website browser regressions (`npm run test:browser`) | 10 passed |
| Production PCM → WebSocket → website integration (`npm run test:integration`) | 4 passed |
| Production TypeScript/Vite build | Passed |
| Expanded 320px operator desk axe scan | No violations |
| Same-browser operator/display, manual Unicode captions, mode changes | Passed |
| Grouped USB mapping persistence, stale frames and automatic WebSocket reconnect | Passed |
| Demo with service unavailable, no public runtime requests | Passed |
| Physical input enumeration / real ASIO or CoreAudio stream | Not verified |

The integration suite runs against a separate local synthetic 32-channel PCM service. Its explicit illustrative test assignments do not initialize or modify venue mappings. Capture tests use a sounddevice test double to verify explicit selection, 32 inputs, float32, 48 kHz, input-only stream creation, and rejection of stereo devices; they do not prove driver compatibility.

The final six-second 1920×1080 WebGL run, with five mapped instruments and an operator preview, measured:

| Measurement | Result |
| --- | --- |
| Rendering cadence | 59.84 FPS |
| 95th-percentile frame interval | 16.8 ms |
| Feature packets in six seconds | 180 (30 Hz) |
| 95th-percentile service processing age | 2.26 ms |
| Dropped capture blocks / input overflows | 0 / 0 |
| Adaptive rendering quality | 1 (full) |

These short synthetic measurements are specific to this development host. Service processing age does not include audio-driver buffers, the analysis window, WebSocket delivery, musical smoothing, LED processing, or display latency. Full concert endurance and input-to-visible-response latency require the venue rehearsal.

An independent visual finish review approved the updated operator and 1920×1080 projection screenshots after fixing overly dim quiet Live inputs. Quiet-input evidence used one tenth standard sensitivity. The existing typography, palette, route layouts, caption band and instrument shape language were retained. The pre-existing design sidecar drift was left unchanged.

Follow [audio setup and physical checks](audio-setup.md) before performance. Confirm real 32-channel availability on both Windows and macOS, instrument assignments, bleed/noise thresholds, pitch/onset quality, device disconnect recovery, driver stability, visibility of piano detail, caption reading distance, motion comfort and full-system latency with the actual mixer, projection equipment and audience participants.
