# Mixed-audio Live choreography

Live uses the existing Python feature packets and `ConcertSource`. It never calls the instrument Demo source, guesses instruments, or generates activity when Live input is absent. The Python capture configuration and version 2 WebSocket protocol are unchanged.

## Living musical ecosystem

The supplied ecosystem reference expands the earlier tutorial vocabulary into three coordinated layers. The previous requirement for uniformly downward contours is superseded; clear multilayer separation remains essential. All geometry is generated in the existing choreography, with no new assets or dependencies.

### Primary ribbons

Magenta and sky-blue bundles share one measured feature history. Both now use smooth organic geometry with asymmetric folds, variable centered fans, occasional crossings and convergences. There are nine magenta and six blue contours at normal quality. Strand spread varies across each route and expands with energy and mids; related strands have small differences in curvature and thickness. Three soft diffusion passes surround each body, with a restrained leading halo, brighter core and tapered ends over the outer 6.5% of the route. Quieter teal low currents support the leading structures.

A fixed 64-sample ring stores energy, three frequency bands, centroid and flux at up to 20 Hz, with Catmull–Rom interpolation to avoid sample corners. Older activity appears on the left, current activity on the right. Eight pooled copies of real previous spine geometry provide fading trails behind the ribbons. There is no framebuffer accumulation or independently simulated musical part.

### Smaller event-driven allium blooms

Blooms now appear as short musical events instead of persistent background structures. Three possible attachment regions span the panorama (two on narrow artwork), but there is at most **one primary bloom and one subtler secondary bloom**. Between events all flowers, their connecting stems and Piano accents disappear completely; ribbons carry quiet passages. Flower-associated filaments return to ribbon attachments when no flower is active.

The primary retains the **30% reduced maximum radius**, bounded by artwork edges. Within that ceiling, measured energy and onset strength now create a much clearer range of sizes. The secondary is 65% of that size and approximately 50% of its brightness. The dimensional style remains: curved pedicels, six-lobed florets, faint rear detail, lavender body and pale foreground highlights. Halo width and intensity, center glow and tip-light density are reduced. No new assets, settings, renderer interfaces or audio protocol changes are needed.

At full quality the primary contains **54 florets** (6 rear / 18 body / 30 foreground), and the secondary contains **30** (0 / 12 / 18). Medium quality uses 3/12/24 and 0/9/15; low quality uses 0/9/18 and 0/6/12. Three florets share each pooled variable-width path; zero-width joins keep disconnected contours from drawing diagonal connections. Both WebGL and Canvas consume this same geometry.

Accepted onsets of at least **0.45** normalized intensity can activate an event. Musical growth triggers only when its existing normalized value crosses **0.45**, and rearms below **0.20**. Constant energy or dynamics cannot hold a flower open or repeatedly trigger one. An onset and growth edge within 250 ms are coalesced into one musical event rather than duplicating flowers.

Each event opens over **180–320 ms**, with stronger onsets opening faster, then fades smoothly to complete disappearance by **2.8 seconds**. Brightness has an additional 90 ms follower and a bounded rise/fall rate to prevent abrupt steps. Accepted subsequent onsets can pulse the primary, with at least **400 ms** between pulses: a **120 ms** attack and **450 ms** decay add at most **12%** radial expansion within the existing size ceiling, plus a restrained local glow lift. New onsets may reinforce strength without changing the event’s start, role or expiry. A secondary never automatically enlarges into a primary. Each attachment region rests for **450 ms** after its event ends. Roles remain bounded even during dense repeated onsets; subsequent musical events can use an available region.

Normalized mixed intensity drives bloom mass and luminosity through a dedicated **120 ms attack / 650 ms release** follower. Band balance and spectral flux follow over **500 ms**: lows add radial mass, mids reveal rear/body structure, highs sharpen floret tips and existing edge lights, and flux gently changes stem curvature, petal orientation and head proportions. Stable floret positions and unchanged quality budgets prevent topology flicker. The mapping applies to both Current and Living Composition; both unfold flowers from ribbon attachments.

Reduced Motion keeps fixed flower geometry and anchors with smoothly fading opacity, including when energy or spectral balance changes. Missing input and Standby stop activation, freeze further unfolding and release existing events within 600 ms (or their original expiry, whichever is sooner). Returning to Live clears old events. Complete flower silhouettes remain bounded by available space; ribbon geometry, audio capture and feature delivery remain unchanged.

### Secondary filaments

Fine threads follow ribbon tangents and branch around flower tips. High-frequency energy and spectral change reveal branches, small light traces and shimmer. Local onset ripples coordinate with line highlights. Filaments support the composition rather than becoming a full-screen particle field.

| Measured feature | Visible response |
| --- | --- |
| RMS-derived intensity | Overall luminosity, ribbon thickness, scale and visual activation |
| Low energy | Broad folds, underlying currents and heavier ribbon mass |
| Mid energy | Curvature complexity, fan spread and internal strand texture |
| High energy and spectrum | Fine branching, delicate highlights and sparse light traces |
| Centroid and positive spectral flux | Smooth shape evolution, local deformation and texture |
| Short/long energy and dynamics | Rising musical growth can trigger a finite bloom without needing an onset |
| Onsets | Local traveling highlights, deformation, ripples and bloom activation |

Continuous features retain 180 ms attack and 800 ms release. Accents remain at least 300 ms apart, limited to six, and expire after 2.8 seconds. Accents never change the brightness of the entire screen. Deterministic procedural phase and pulse travel advance only with actual active input. Quiet valid input retains readable ribbons; silence, stale input and Standby stop new activity and settle into a faint static field. Background gaps longer than one second clear transient history to prevent replay.

Reduced Motion freezes travel, unfolding, rotation and particle drift, removes trails and onset displacement, and retains stationary fading highlights and pressure contours. Calm Mode retains its reductions in strength, motion and branch count.

## Controls and rendering

Existing controls retain their meanings: **Low currents** controls broad structures; **Mid flowing lines** controls ribbon bundles and their onset highlights; **High filaments** controls branches and moving particles; **Transient blooms** controls flowers, diamond/stem clusters and pressure accents. Turning blooms off leaves line pulses available through the currents/lines controls. Turning every layer off clears all geometry and lights. Sensitivity and the noise threshold remain capture/analysis settings.

Both backends receive the same pooled geometry. Optional `Stroke.widths` multipliers and `variableWidth` enable tapered Live ribbons; ordinary Demo strokes keep constant widths. WebGL uses point normals; Canvas draws continuous tapered strips with reused point normals. This avoids bright seams at segment joins while preserving the existing feathering on constant-width Demo strokes. Existing Gaussian feathering and additive lights are retained. Geometry remains bounded to 256 paths with 160 points each; Live lights are capped at 180, or 60 in operator previews. Adaptive quality removes secondary trails, branches and flower detail before the primary forms. The full nine/six contour counts remain at quality 0.5 and above, including Reduced Motion. Below 0.5, six magenta and five blue contours preserve the defining bundles.

## Local checks

Start the existing services in separate terminals:

```sh
npm run audio
npm run dev
```

Open `http://localhost:5173/control`, explicitly select **MacBook Pro Microphone**, mono input **1**, sample rate **Auto**, then apply the settings and start Live. Select the venue display profile and open the performance display from the operator interface. Compare quiet gaps, normal speech, separated claps and music played through an external speaker. Watch the raw input meters and clipping indicators while adjusting sensitivity. Confirm the shapes react to the sound, Standby settles, and Live resumes without restarting capture. Check Reduced Motion, Calm Mode and individual layer strengths. After isolated claps, confirm each flower fully disappears within 2.8 seconds. During steady sound without new onsets or growth edges, confirm flowers stay absent after their event expires. Rhythmic music may create subsequent finite events, with one primary and at most one smaller, dimmer secondary.

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

Software verification performed on 23 October 2026:

| Check | Result |
| --- | --- |
| Unit tests | 54 passed |
| Python capture/analysis/service tests | 46 passed |
| Existing browser regressions | 17 passed |
| Production Live integration | 11 passed |
| TypeScript / Vite build | Passed |

Reference-specific tests measure contour readability and verify the event-driven bloom behavior: 30% primary scale reduction, secondary size/brightness hierarchy, reduced floret counts, complete silhouettes, invisible pooled joins, unchanged ribbon geometry, no flowers under constant input after expiry, growth rearming, weak-trigger rejection, fixed roles/lifetimes under repeated onsets, region rest periods, coalesced triggers, silence/Standby release and stationary Reduced Motion events. Palette, Piano accents and layer controls remain covered, and Live never requests instrument frames or events.

The 128 tests cover feature-source validation and recovery, event lifetime and locality, bounded history/trails/geometry, individual layers, high contrast, stationary reduced-motion accents, Standby decay, Demo behavior, captions and operator synchronization. Existing stage-status tests verify its hidden presentation while retaining state assertions.

The rendering fixtures are synthetic features supplied only inside the test harness; the integration service uses explicit synthetic PCM. This iteration does not constitute a new speech/clap/music microphone trial or physical USB/LED verification. Previous real microphone findings remain documented in `docs/audio-verification.md`. Native release archives have not been rebuilt.

Final headless Chrome measurements of the smaller event-driven bloom refinement on 23 October 2026, at 4416 × 896, device scale factor 1, with energetic feature fixtures and periodic onsets:

| Backend | Duration | Mean FPS | p95 frame interval | Quality | Page errors |
| --- | --- | --- | --- | --- | --- |
| webgl | 120 s | 60.00 | 16.70 ms | 1.00 throughout | 0 |
| canvas | 120 s | 60.00 | 16.70 ms | 1.00 throughout | 0 |

Both runs retained full quality and had no viewport overflow. The p99 and maximum frame intervals were 16.80 ms for both backends. Two bounded visual review rounds covered quiet and energetic states, Reduced Motion, high contrast, operator previews and narrow layouts. Captures represent specific phases of short-lived events, so an energetic frame may show a fading flower, an opening flower or the space between them. Tests separately verify the simultaneous primary/secondary geometry and exact lifetimes. These are short local browser measurements, not a long-duration guarantee or physical LED verification. The report and captures are under `artifacts/verification/live-refinement/`.

Bloom geometry is shared across backends. WebGL retains textured light sprites and Canvas its simpler circular tip-light treatment; soft head halos use the existing feathered strokes in both.

A historical five-second readiness observation on 22 October used the actual selected **MacBook Pro Microphone**, mono channel 1 at 48 kHz, through the existing Vite/WebSocket path: 150/150 packets were fresh, one stream remained connected, and no capture errors were reported. RMS varied from 0.00997 to 0.07229 and peak reached 0.14630. This was unlabelled ambient input; no new speech, clap or music stimulus was confirmed. The service's cumulative dropped-buffer counter was 71 at the end; this check did not measure its starting value, so it does not establish a zero-drop capture interval. The derived-only report is `artifacts/verification/live-refinement/microphone-readiness.json`; no PCM was recorded or input settings changed.

## Optional Living Composition experiment

The existing choreography remains the default. See [Living Composition](living-composition.md) for the optional synchronized selector, musical-memory behavior, and feature-only A/B comparison workflow. This experiment does not change the audio pipeline or Demo instrument languages.


## Stronger musical bloom response — 23 October 2026

This refinement changes bloom choreography in **both Current and Living Composition**. Audio capture, WebSocket packets, ribbons, Demo, captions and operator settings are unchanged. No additional instruments, sources, paths or particle budgets are introduced.

Verification: `npm test` **66 passed**, `npm run test:audio` **46 passed**, `npm run test:browser` **17 passed**, and `npm run test:integration` **12 passed**, including a successful production build. Added checks cover quiet/moderate/intense scale and brightness, onset-sensitive opening, cooldown-limited pulses without expiry extension, band-dependent structure, smoothed spectral deformation and fixed Reduced Motion geometry under changing input. Existing tests still cover weak triggers, event count/roles, silence, Standby, recovery, bounded geometry, layer controls, ribbon preservation and quality budgets. The quality comparison now samples the same musical timestamp at both quality levels.

The before/after rendering comparison replays the same saved **120-second measured BlackHole music feature timeline**, previously confirmed by the operator as actual music (3,600 samples, 256 onsets; no PCM). Five matched captures per mode/backend span the recording. Additional WebGL sequences around a measured onset inspect opening, reinforcement and fade in both Live modes; captures also cover Reduced Motion, high contrast, preview and narrow artwork. Visual inspection found intact ribbon composition and bounded, distinguishable flower emergence and decay. It does not establish audience comfort or distant physical-screen readability.

Each timing run measures **20 seconds per mode/backend**, at **4416 × 896**, device scale factor 1, identical intensity/motion settings. These are short headless Chrome checks, not a two-minute or venue soak test:

| Mode / renderer | Before p95 | After p95 | After FPS |
| --- | --- | --- | --- |
| Current / WebGL | 16.8 ms | 16.7 ms | 60.00 |
| Living / WebGL | 16.8 ms | 16.8 ms | 60.00 |
| Current / Canvas | 16.8 ms | 16.8 ms | 60.00 |
| Living / Canvas | 16.7 ms | 16.7 ms | 60.00 |

All runs retained full quality, with no browser errors and no meaningful p95 regression (target ≤10%). Reports and captures are in ignored `artifacts/verification/blooms-before/` and `artifacts/verification/blooms-after/`; `regression.json` compares each mode to its own pre-change baseline, and `event-sequence.json` records onset/opening/pulse/expiry states.

To reproduce the matched comparison with Vite running:

```sh
ALLIUM_URL=http://127.0.0.1:5173 npm run visuals:compare -- \
  --input artifacts/verification/living-composition/measured-features.json \
  --seconds 20 --output artifacts/verification/blooms-check
```

The recording is a local ignored artifact. To create another with your own input, follow [the feature-only recording steps](living-composition.md#capture-the-same-real-music-once). For a live visual check, run `npm run dev` and `npm run audio`, open `/control`, select Live, and retain your working input configuration. Try separated claps, speech, quiet music, stronger rhythmic music and silence. Check both choreography options: flowers should open on meaningful changes, pulse locally on later attacks, and fade rather than remain permanently open. Adjust the existing Transient blooms layer control as needed. No new capture trial was performed in this refinement; the software comparison reuses the confirmed music features. Physical 4416 × 896 LED readability, venue USB hardware and audience motion comfort remain to be verified on site.
