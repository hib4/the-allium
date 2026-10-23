# Mixed-audio Live choreography

Live uses the existing Python feature packets and `ConcertSource`. It never calls the instrument Demo source, guesses instruments, or generates activity when Live input is absent. The Python capture configuration and version 2 WebSocket protocol are unchanged.

## Visual language

The panorama has three offset allium focal regions; narrower artwork has two. Radii use the artwork height and an available-width cap, preserving flower proportions. Three spline systems braid around shared spines, with broad outer diffusion, narrower inner glow, bright tapered cores and four to eight finer strands. Layered curves cross and converge rather than occupying frequency lanes. Allium centers follow ribbon convergences and connect through curved stems. Local curls, floret crowns, attached offshoots and sparse lights provide smaller scales of detail. The established navy, teal, sky, lilac and pink palette remains in use. Captions occupy their existing separate DOM band.

| Measured feature | Visible response |
| --- | --- |
| RMS-derived `intensity` | Overall luminosity, ribbon width, flower radius and motion strength |
| Low energy | Broad current strength, width and bending |
| Mid energy | Braid separation, smooth strand visibility, connecting ribbons and internal curvature |
| High energy and spectrum | Branch reach, floret detail and sparse particles attached to structures |
| Centroid and positive spectral flux | Curvature, texture and gradual shape variation |
| Short/long energy and dynamics | Expansion during musical growth |
| Onsets | Coordinated traveling highlights, localized ribbon deformation, small ripples and flower accents |

A fixed 64-sample ring stores the measured energy, three frequency bands, centroid and flux at up to 20 Hz. Ribbon curvature and internal detail read this shared history; it does not represent inferred musical parts. Up to eight pooled copies of previous spine geometry supply fading trails, without framebuffer accumulation.

Continuous features use 180 ms attack and 800 ms release. Accents are spaced by at least 300 ms, limited to six, and expire after 2.8 seconds. No accent changes the brightness of the entire screen. Procedural variation is deterministic; its phase and pulse travel clock only advance while actual active input is available. Quiet valid input uses a perceptual brightness curve to keep cores readable; absent input retains only the faint static field. Silence and stale input stop new activity, decay existing energy and settle into a faint static field. Background gaps longer than one second clear transient history to prevent replay.

Reduced Motion freezes travel and rotation, removes onset deformation, particle drift and ribbon trails, and uses stationary highlights and fixed-size pressure contours with soft opacity changes. Musical brightness and shape remain available. Calm Mode retains the existing reductions in strength and motion with fewer secondary branches.

## Controls and rendering

Existing controls retain their meanings: **Low currents** controls broad structures; **Mid flowing lines** controls braided ribbons, curls and their onset highlights; **High filaments** controls branches and moving particles; **Transient blooms** controls flowers and pressure accents. Turning blooms off leaves line pulses available through the currents/lines controls. Turning every layer off clears all geometry and lights. Sensitivity and the noise threshold remain capture/analysis settings.

Both backends receive the same pooled geometry. Optional `Stroke.widths` multipliers and `variableWidth` enable tapered Live ribbons; ordinary Demo strokes keep constant widths. WebGL uses point normals; Canvas draws continuous tapered strips with reused point normals. This avoids bright seams at segment joins while preserving the existing feathering on constant-width Demo strokes. Existing Gaussian feathering and additive lights are retained. Geometry remains bounded to 256 paths with 160 points each; Live lights are capped at 180, or 60 in operator previews. Adaptive quality removes secondary trails, branches and flower detail before the primary forms.

## Local checks

Start the existing services in separate terminals:

```sh
npm run audio
npm run dev
```

Open `http://localhost:5173/control`, explicitly select **MacBook Pro Microphone**, mono input **1**, sample rate **Auto**, then apply the settings and start Live. Select the venue display profile and open the performance display from the operator interface. Compare quiet gaps, normal speech, separated claps and music played through an external speaker. Watch the raw input meters and clipping indicators while adjusting sensitivity. Confirm the shapes react to the sound, Standby settles, and Live resumes without restarting capture. Check Reduced Motion, Calm Mode and individual layer strengths.

Run software checks:

```sh
npm test
npm run test:audio
npm run test:browser
npm run test:integration
node scripts/visual-check.mjs
```

The last command requires the Vite development server and Chrome. It runs an isolated test page, never opens an audio socket or changes microphone settings, and supplies explicitly synthetic feature fixtures only to that page. It captures quiet/moderate/intense/high-frequency/silent compositions, Reduced Motion, high contrast, a narrow view and operator-preview dimensions, then measures each backend for 120 seconds at 4416 × 896 with device scale factor 1. `ALLIUM_VISUAL_SECONDS=5` selects a short smoke check; `ALLIUM_URL` changes the development origin. Artifacts are written to ignored `artifacts/verification/live-refinement/`.

Performance targets are 55 FPS for WebGL and 30 FPS for Canvas on the development MacBook. The report includes actual renderer, mean FPS, frame-time percentiles, adaptive quality and page errors. Frame timing is a local browser measurement, not a guarantee for the venue LED processor. Check caption contrast, comfortable movement, viewing distance and LED brightness at the venue.

## Verification of this refinement

Software verification performed on 22 October 2026:

| Check | Result |
| --- | --- |
| Unit tests | 41 passed |
| Python capture/analysis/service tests | 46 passed |
| Existing browser regressions | 17 passed |
| Production Live integration | 11 passed |
| TypeScript / Vite build | Passed |

The 115 tests cover source validation and recovery, event lifetime and locality, bounded history/trails/geometry, individual layers, high contrast, stationary reduced-motion accents, Standby decay, Demo behavior, captions and operator synchronization. The existing stage-status tests now verify its hidden presentation while retaining state assertions.

The rendering fixtures are synthetic features supplied only inside the test harness; the integration service uses explicit synthetic PCM. This iteration does not constitute a new speech/clap/music microphone trial or physical USB/LED verification. Previous real microphone findings remain documented in `docs/audio-verification.md`. Native release archives have not been rebuilt.

Final headless Chrome measurements at 4416 × 896, device scale factor 1, with energetic feature fixtures and periodic onsets:

| Backend | Duration | Mean FPS | p95 frame interval | Quality | Page errors |
| --- | --- | --- | --- | --- | --- |
| webgl | 120 s | 60.00 | 16.80 ms | 1.00 throughout | 0 |
| canvas | 120 s | 60.00 | 16.70 ms | 1.00 throughout | 0 |

Both runs retained full quality with no viewport overflow. The measured p99 interval was 16.80 ms for both backends. Final captures were reviewed in quiet and energetic states, with high contrast, reduced motion, preview and narrow layouts. These are short local rendering checks, not a long-duration performance guarantee or a physical LED test. The report and captures are under `artifacts/verification/live-refinement/`.

A separate five-second readiness observation used the actual selected **MacBook Pro Microphone**, mono channel 1 at 48 kHz, through the existing Vite/WebSocket path: 150/150 packets were fresh, one stream remained connected, and no capture errors were reported. RMS varied from 0.00997 to 0.07229 and peak reached 0.14630. This was unlabelled ambient input; no new speech, clap or music stimulus was confirmed. The service's cumulative dropped-buffer counter was 71 at the end; this check did not measure its starting value, so it does not establish a zero-drop capture interval. The derived-only report is `artifacts/verification/live-refinement/microphone-readiness.json`; no PCM was recorded or input settings changed.
