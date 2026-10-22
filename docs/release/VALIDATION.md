> Historical package evidence. The mixed-input source and LED update are verified separately in [audio-verification.md](../audio-verification.md); these native package/soak results do not validate the new pipeline.

# Caption update — The Allium 1.1.0-rc.2

This release removes the entire caption band when hidden, retains saved cues, moves Show captions into Caption desk, and gives truthful feedback for submissions while hidden. Frontend unit tests: 20 passed; Python service tests: 21 passed; website browser regressions: 10 passed; production integration tests: 7 passed (58 total). Checks include keyboard activation, hide/show in all modes, hidden settings export/restore, operator locking, 320px accessibility and 1920×1080 layout. Production build passed.

The audio pipeline is unchanged. The thirty-minute run below belongs to rc.1 and was not repeated for this caption UI update. rc.2 native packaging smoke results are included in Verification. The previous rc.1 archive is retained for rollback. Physical mixer, Windows, HDMI and audience validation remain pending.

# Release candidate validation — The Allium 1.1.0-rc.1

Software verified on 13 October 2026, macOS 27.0.1 ARM64, Python 3.14.3, Chrome 154. No physical Soundcraft Ui24R was connected. Windows executable and native validation remain pending.

| Check | Result |
| --- | --- |
| Frontend unit tests | 20 passed |
| Python DSP/service tests | 21 passed |
| Website browser regressions | 10 passed |
| Production integration tests | 6 passed |
| TypeScript/Vite production build | Passed |
| npm dependency advisories | 0 reported |
| Native runtime dependencies | 84 native files checked; no developer-path references |
| Package startup/shutdown/restart | Validated; final smoke result supplied with archive |
| Expanded desktop/mobile help | Final package result in Verification/ui-qa.json |
| Actual Ui24R 32-channel capture / Windows ASIO | NOT TESTED |
| HDMI/projector, physical latency and audience comfort | NOT TESTED |

## Thirty-minute synthetic endurance run

The frozen native service processed synthetic 32-channel PCM at 48 kHz, with grouped drums and five mapped instruments. Headless Chrome displayed a 1920×1080 audience viewport plus operator preview. Sampled every ten seconds, with bounded instrumentation. These are software measurements, not a physical projection result.

| Measurement | Result |
| --- | --- |
| Duration | 1802.18 seconds |
| Rendering average | 59.15 FPS |
| Largest recorded frame interval | 33.5 ms |
| Feature packets | 53,980 (~30 Hz) |
| Dropped capture blocks / input overflows | 25 / 0 |
| Monitor reconnects / runtime errors | 0 / 0 |
| Largest sampled packet age | 42 ms |
| Final ten-second processing-age p95 | 2.63 ms |
| Service RSS range | 27.8–45.4 MiB |
| Display heap range | 7.5–35.7 MB |

All sampled audience states remained Live with fresh input. Memory did not show sustained growth. A temporary rendering slowdown around minute seventeen reduced adaptive detail to 0.35; frame cadence recovered near 60 FPS afterward. Reduced detail remains until the display is reopened. Bounded capture queues discarded occasional obsolete blocks to preserve freshness. Service processing age excludes driver buffers, the FFT window, transport, musical smoothing and display hardware latency.

An earlier monitor-only attempt was aborted because its extra diagnostic socket lacked reconnection. The revised monitor pings, reconnects, checks audience state and prevents host sleep. The full run above used the frozen service. Final UI refinements and device-query shutdown hardening were subsequently checked by production browser/service tests and native package smoke; the long run validates the same audio analysis and rendering pipeline, rather than claiming every final packaging change had a separate thirty-minute run.

## Release status and remaining gates

macOS ARM64: unsigned internal candidate built and tested on this host. Removing developer runtimes from PATH and inspecting native links supports self-contained launch; a separate clean machine and older macOS versions remain unverified. Windows x64: build scripts ready, artifact/native tests pending. Intel Mac requires a separate build.

Before a concert, use Panduan-Operator.html and On-Site-Checklist.csv to verify the real Ui24R, actual USB assignments, CoreAudio/ASIO stability, unplug/replug, real musical thresholds and onset/pitch behavior, a thirty-minute hardware rehearsal, HDMI/fullscreen, reading distance, motion comfort and total input-to-visible latency. No recording, source separation, automatic lyrics or exact polyphonic transcription is provided. No mixer routing/gain changes are made.

Raw measurements are included as Verification/soak.json. Stop the current release before replacing it; keep a previous archive and compatible exported settings for rollback.
