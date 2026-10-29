# Mixed-audio Live choreography

Live uses the existing Python feature packets and `ConcertSource`. It never calls the instrument Demo source, guesses instruments, or generates activity when Live input is absent. The Python capture configuration and version 2 WebSocket protocol are unchanged.

## Living musical ecosystem

The supplied ecosystem reference expands the earlier tutorial vocabulary into three coordinated layers. The previous requirement for uniformly downward contours is superseded; clear multilayer separation remains essential. All geometry is generated in the existing choreography, with no new assets or dependencies.

### Primary ribbons

Magenta and sky-blue bundles share one measured feature history. Both now use smooth organic geometry with asymmetric folds, variable centered fans, occasional crossings and convergences. There are nine magenta and six blue contours at normal quality. Strand spread varies across each route and expands with energy and mids; related strands have small differences in curvature and thickness. Three soft diffusion passes surround each body, with a restrained leading halo, brighter core and tapered ends over the outer 6.5% of the route. Quieter teal low currents support the leading structures.

A fixed 64-sample ring stores energy, three frequency bands, centroid and flux at up to 20 Hz, with Catmull–Rom interpolation to avoid sample corners. Older activity appears on the left, current activity on the right. Eight pooled copies of real previous spine geometry provide fading trails behind the ribbons. There is no framebuffer accumulation or independently simulated musical part.

### Smaller event-driven allium blooms

Blooms now appear as short musical events instead of persistent background structures. Three possible attachment regions span the panorama (two on narrow artwork), but there is at most **one primary bloom and one subtler secondary bloom**. Between events all flowers, their connecting stems and Piano accents disappear completely; ribbons carry quiet passages. Flower-associated filaments return to ribbon attachments when no flower is active.

The primary retains the **30% reduced maximum radius**, bounded by artwork edges. Within that ceiling, measured energy and onset strength now create a much clearer range of sizes. The secondary is 65% of that size and approximately 50% of its brightness. The dimensional style remains: curved pedicels, six-lobed florets, faint rear detail, lavender body and pale foreground highlights. Halo width, center spread and tip-light density stay bounded; event luminosity follows measured energy. No new assets, settings, renderer interfaces or audio protocol changes are needed.

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

New Operator/display sessions start with **Show captions off**. Enable it explicitly when captions are needed; restoring settings and synchronization retain the selected value. Independent local Demo views keep their caption defaults.

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

## Concert-scale composition — 24 October 2026

Both **Current** and **Living Composition** now share a fuller scenic treatment. The three measured ribbon systems remain: magenta, sky and the quieter teal current. Individual strands fold, cross and reconverge within wider bundles; four translucent folded sheets add luminous mass without adding more primary systems. Six quieter distant contours and stronger previous-geometry trails create depth. Pale localized highlights reveal ribbon surfaces above the colored diffusion. These continuous highlights do not count as musical events.

Scenic fullness combines the existing smoothed intensity (65%) and two-second energy follower (35%). Only active, unrestricted-motion input uses the slower component for spatial development; Reduced Motion and inactive input use the existing energy follower instead. This prevents slow-memory movement after silence and keeps constant Reduced Motion geometry stationary. Current remains the default direct response, while Living retains its additional focal convergence and build/release choreography.

Fine filaments use fixed candidate locations with smooth alpha revelation instead of appearing abruptly when a count crosses an integer. A sparse field of at most 48 ribbon-related dust candidates spreads detail across the panorama; visibility follows measured energy and spectral detail. The existing Particles and Fine filaments controls govern it. Dust and travelling highlights stop immediately on inactive input and are absent in Reduced Motion. Calm Mode reduces detail and omits the translucent sheets. Stronger bloom luminosity and head halos preserve the reduced scale ceiling, simplified florets, onset thresholds, cooldowns, two-event limit and fixed expiry. Both modes can release supporting filaments from fading flowers toward nearby ribbons.

All geometry is shared by WebGL and Canvas. Existing limits remain 256 paths, 160 points per path and 180 lights (60 in previews). Optional sheets, distant contours, travelling highlights and dust drop out at lower quality; primary strands, bloom identity and operator layer controls remain. Audio capture, analysis, feature transport, Demo, captions and session interfaces are unchanged.

### Local verification

With `npm run dev` and `npm run audio` running, open `/control`, choose Live and keep the working input selected. Open the stage display with the venue profile (4416 × 896). Compare **Current** and **Living Composition** using the same track, including quieter passages, a build, strong transients and a release. Check ribbon separation and crossings, localized pale highlights, event-driven flowers, a fuller high-energy field and quieter detail at low energy. Pause playback to verify that silence stops new musical events and spatial travel. Check the individual layer controls, Particles, Calm Mode and Reduced Motion; Demo and captions should retain their previous behavior.

For a repeatable software comparison using the previously confirmed real-music features:

```sh
ALLIUM_URL=http://127.0.0.1:5173 npm run visuals:compare -- \
  --input artifacts/verification/living-composition/measured-features.json \
  --seconds 120 --output artifacts/verification/concert-after
npm test
npm run test:audio
npm run test:browser
npm run test:integration
```

The recording is an ignored local artifact, contains derived features only, and is never substituted into application Live input. The comparison harness is isolated from audio configuration. Physical LED brightness, viewing-distance readability and audience motion comfort require an on-site check; replay is not new microphone or USB hardware verification.

Software checks for the concert-scale refinement: **69 unit tests, 46 Python audio tests, 17 browser regressions and 12 production Live integration tests passed (144 total)**. The integration command also completed the TypeScript/Vite production build. New tests cover wider depth geometry in both modes, progressive energy response, continuous detail revelation without zero-time jumps, particle/quality controls, and sustained peaks without exhausting path/light budgets or losing floral geometry. Existing silence, recovery, Reduced Motion, event lifetime, caption, Demo and synchronization checks continue to pass. Earlier tests that required every strand to remain separated were updated to allow intentional local crossings while requiring most strands to remain distinguishable; stale-event comparisons now sample the same musical timestamp.

## Original Live choreography

Choose **Live choreography → Original** in `/control` to use the Home page's original visual language with measured mixed audio. Current remains the default; Living Composition remains available. Selection synchronizes to operator previews and performance displays and survives settings export/restore. Switching does not restart capture. Older settings retain Current.

Original reuses the Home page geometry: pink braided ribbons, angular sky-blue paths, yellow pressure rings, broad teal currents, lavender flower/diamond constellations and amber loops. These are visual families responding to one measured mix, not detected instruments. The Home page and Demo retain their existing instrument simulation.

Low energy emphasizes currents and pressure strength; mids emphasize ribbons, blue paths and loops; highs reveal fine detail and light particles. Smoothed spectral centroid shifts contour height and flux adds bounded local deformation; neither is a recognized note. Accepted measured onsets (raw strength at least 0.30, at least 300 ms apart) create pressure events, blue attack details and finite lavender blooms. Rings and attack detail expire after 2.4 seconds and blooms after six seconds, retaining the original geometry's lifetimes. Sustained energy alone never creates flowers or a persistent bud.

**Low currents** controls teal forms; **Mid flowing lines** controls pink/blue/amber forms; **High filaments** controls attack filaments and fine light particles; **Transient blooms** controls lavender events and yellow rings, including their local path deformation. All layers off clears the artwork. Calm Mode reduces motion and detail. Reduced Motion fixes primary contours and uses stationary fading event geometry, retaining intensity response through brightness. High Contrast renders white geometry. Missing/inactive input and Standby freeze procedural travel and release events within 600 ms; returning input clears stale gestures. Quiet passages retain faint structural lines.

The existing WebGL and Canvas backends share the same geometry. Paths remain capped at 256 with 160 points each; Original uses Live's 180-light cap (60 in operator previews). Blooms are bounded by artwork edges. Adaptive quality reduces strand/flower detail before removing primary shape families. No audio service or protocol changes, assets or dependencies are added.

The existing `visuals:compare` / `visuals:fixture` harness now includes Original alongside Current and Living Composition. Use a saved measured-feature timeline for matched musical comparisons; fixture results remain synthetic software checks. Native release archives and physical LED/audio rehearsal are separate from frontend verification.

### Original verification — 24 October 2026

The production build passed, together with 78 unit tests, 46 audio-service tests, 17 browser regressions and 12 production integration tests. A subsequent targeted browser check also passed Original selection synchronization and settings export/restore. Regression coverage includes stationary Reduced Motion ring/bloom geometry, independent high filaments, measured-only input, layer controls, event expiry, inactive-input release, switching, finite geometry and Live resource limits.

A matched replay of the existing measured BlackHole feature timeline captured five musical timestamps per mode/backend and compared all three Live choreographies. Each timing run lasted **20 seconds** at **4416 × 896**, device scale factor 1. Original averaged **60.00 FPS** at full quality on WebGL and Canvas, with p95 frame intervals of **16.7 ms** and **16.8 ms**, respectively. Current measured **16.7 ms** on both, so Original stayed within the 10% p95 regression target. No page errors were reported. The report and timeline captures are in ignored `artifacts/verification/original/`.

A fresh final capture pass after the Reduced Motion and independent-filament fixes inspected Home plus both backends at venue, preview and narrow sizes, including Reduced Motion and High Contrast, with no page errors. These captures are in ignored `artifacts/verification/original-final/`. Visual review found the six original families recognizable and the two rendering backends consistent. This verifies software behavior and local rendering; it is not a new microphone, mixer, physical LED or audience-comfort trial. Release archives were not rebuilt.

## Combined Live choreography

Choose **Live choreography → Combined** in `/control` for **Original's visuals with Current-style brightness and body**. All six Original families retain their composition: pink braided ribbons, angular sky-blue paths, yellow pressure rings, teal currents, lavender blooms/diamond constellations and amber loops. Current remains the default; Original and Living Composition remain available. Selection synchronizes to operator previews/display tabs and survives settings export/restore without restarting capture.

Combined uses the same measured-audio controller and geometry as Original. Contour coordinates, positions, motion, bloom sizes, feature mapping and event lifetimes match Original; rings and attack detail expire after 2.4 seconds and blooms after six seconds. Current's ribbon systems, dimensional flowers and shorter bloom timing are not added. No Demo source or second audio simulation runs.

The difference is light treatment. Combined uses the shared Original/Combined 120 ms attack / 800 ms release response and Current's perceptual luminosity curve (exponent 0.28) to increase luminosity, stroke body and existing soft glow in stronger passages, with a more restrained quiet response. Bright cores and diffusion retain Original's relative hierarchy. Glow/light centers stay in place; only brightness, stroke widths and halo sizes change.

Original's four layer controls, Calm Mode, High Contrast, Reduced Motion, silence/Standby release within 600 ms and stale-gesture clearing remain shared. All layers off clears the artwork. Reduced Motion retains stationary point geometry while the light treatment responds to sound. The same 256-path, 160-point and 180-light limits apply (60 lights in previews), with no new geometry, assets or dependencies.

The comparison harness includes all four options by default. To compare Current, Original and Combined against the same measured feature timeline:

```sh
ALLIUM_URL=http://127.0.0.1:5173 npm run visuals:compare -- \
  --input artifacts/verification/living-composition/measured-features.json \
  --variants current,original,combined --seconds 20 --output artifacts/verification/combined-original
```

`--variants` accepts unique comma-separated values from `current,living,original,combined`; it only selects developer comparison cases. Regression reports compare every selected non-Current variant with Current regardless of order. Runs without Current still capture/measure the selected options, report no baseline and omit regression ratios; single-option runs are supported.

### Original and Combined sensitivity

Both modes lift accepted intensity and frequency-band levels with `1 - (1 - x)^1.5` before smoothing. This increases quiet/moderate response smoothly and keeps the maximum at one. Visual attack is 120 ms (previously 180 ms), with the 800 ms release retained. Accepted onsets use a raw threshold of 0.30 instead of 0.45, then apply the same curve to event strength so soft attacks reveal blue details, yellow rings and lavender blooms. The 300 ms onset spacing, 2.4-second ring/attack and six-second bloom expiry remain unchanged. Original and Combined still share identical point geometry and motion for the same input; Combined retains its stronger light treatment.

This tuning applies only to Original and Combined. Current, Living Composition, Demo, capture sensitivity, the noise threshold and the service's activity gate are unchanged. Inactive/missing input cannot create events, and Standby retains its existing release.

### Final Combined and sensitivity verification — 24 October 2026

The production build and **118 tests** passed: 89 unit, 17 browser and 12 production integration checks. New checks cover exact Original/Combined contour parity over changing sound, louder/thicker Combined light treatment and greater quiet-to-loud contrast, the faster quiet-input response, the 0.30 onset boundary and blue attack visibility, duplicate suppression, unchanged event expiry, silent-input gating, stationary Reduced Motion geometry, layer/budget limits, selection switching and comparison-report baseline behavior. Browser coverage verifies Combined synchronization and settings export/restore.

Final matched captures replay a **20-second excerpt of the existing measured BlackHole feature timeline** (600 feature samples, no PCM), with five musical timestamps per mode/backend plus Reduced Motion, High Contrast, preview and narrow views. Timing runs last **10 seconds per mode/backend** at 4416 × 896 and device scale factor 1. Current, Original and Combined averaged **60.00 FPS** at full quality on both backends. Original p95 intervals were 16.8 ms WebGL / 16.7 ms Canvas; Combined measured 16.7 ms on both; Current measured 16.7 ms WebGL / 16.8 ms Canvas. All comparisons stayed within the 10% p95 target, with no page errors. These are short local software measurements rather than a venue soak or new hardware trial.

Reports, excerpt and final captures are in ignored `artifacts/verification/sensitivity/`, with the final report at `final/comparison.json`. The prior Current-leading Combined was superseded; these final captures show Original's geometry with Combined's stronger light treatment and the shared increased sensitivity. Release archives were not rebuilt.

### Clearer piano blooms in Original and Combined

Piano visuals retain their existing flower radius, placement, silhouettes and six-second expiry, with a clearer lavender treatment. Petals use brighter opacity and thicker strokes, while diamond markers, stems and existing tip/core lights scale with artwork height for projection readability. Combined retains its additional light/body treatment; both modes still share point geometry. No path or light budgets are increased.

At the default Motion value, accepted events open over approximately 180–320 ms according to onset strength. Lower Motion slows opening. Reduced Motion and zero Motion show fully formed stationary geometry with a short 120 ms brightness attack, followed by the existing fade. Stationary diamond layout uses the event's register detail at birth so falling spectral activity cannot rearrange the constellation.

A bounded onset-strength brightness contribution keeps a brief accepted attack visible as ongoing energy falls. The Transient blooms control, Calm Mode reduction, six-second expiry and silence/Standby release within 600 ms still apply. Trigger sensitivity and spacing, flower counts, other visual families, Current, Living Composition and Demo remain unchanged.

The production build and **121 tests** passed (92 unit, 17 browser, 12 production integration). Added checks cover early bloom visibility after a soft attack, continued visibility during falling energy, proportional marker sizing, unchanged normalized flower scale, zero-Motion stationary geometry and expiry. Existing checks retain Original/Combined parity, Reduced Motion, layer controls and shared geometry limits.

Matched before/after isolated synthetic captures cover soft/strong attacks, venue, preview, narrow, Reduced Motion, zero Motion, High Contrast and Calm Mode on both backends: 32 captures per pass, with no page errors. At the tested short-attack venue frame, piano mean opacity increased about 1.8× and maximum stroke width about 2×. Faster opening makes the full existing flower scale readable sooner. These fixtures verify software appearance rather than instrument recognition or new microphone/venue behavior. Reports and captures are under ignored `artifacts/verification/piano-visibility/{before,after}/`. Release archives were not rebuilt.

A separate measured-feature comparison replayed the saved 20-second excerpt through Current, Original and Combined on both backends, with **five-second timing runs** at 4416 × 896. Original measured 60.00 FPS on both; Combined measured 59.20 FPS WebGL / 60.00 FPS Canvas. All retained full quality, p95 frame intervals of 16.7–16.8 ms, no page errors and no regression beyond the 10% p95 target relative to Current. This is a short rendering smoke check, not a venue soak. Reports and matched measured-feature captures are under `artifacts/verification/piano-visibility/measured/`.

## Small instrument guide for Original and Combined

Original and Combined display a small static instrument guide in the top-right of the artwork during Live and Standby. The five entries—Vocals, Guitar, Drums, Bass and Piano—pair existing shape glyphs and colors with readable white names. They explain the visual families of one measured mix, not detected instruments or active-channel meters. There is no additional heading, panel, setting or interaction.

The guide appears in the experience/performance score and operator preview, with 15 px text normally, 11 px in previews and 13 px on narrow screens. Entries wrap within the artwork; narrow performance layouts leave room for the identity. The guide is a labeled semantic list with decorative glyphs, introduces no keyboard stops and does not intercept pointer input. It is absent from Demo, Current, Living Composition and the static renderer-failure fallback. Caption placement and rendering/audio behavior remain unchanged.

Browser verification passed 17 page regressions and 13 production integration checks, with a targeted repeat covering the expanded guide-layout assertions. Checks cover exact labels, selected-mode visibility, Standby and Demo transitions, noninteractive styling, containment and identity separation at 4416 × 896, 1920 × 1080 and 320 × 800, captions on/off, the venue profile, regular mobile experience and mobile operator preview. Review captures are under `.impeccable/review/instrument-guide-*.png`. No session-schema or capture-setting changes are introduced.

## Additional 2424 × 896 display profile

Select **Display profile → Venue LED · 2424 × 896** in `/control`. The exact **303:112** target describes the full performance stage, including the caption band when enabled. The existing Responsive default and Venue LED · 4416 × 896 option retain their behavior and saved keys. The new profile uses the saved key `venue-2424`; synchronization and settings export/restore retain it.

At a matching 2424 × 896 viewport the stage fills that exact rectangle. Other viewport sizes contain the stage proportionally without stretching or cropping; the operator preview uses the same aspect ratio. Fixed-profile dimensions, selector names and calibration metadata share one definition. Calibration displays the selected target and ratio; Responsive displays the browser viewport instead of a fixed target. This changes presentation sizing only, without altering audio, choreography, captions or instrument-guide settings.

Verification passed the production build and **125 tests**: 93 unit, 17 browser and 15 production integration. New checks cover exact dimensions on WebGL and Canvas, caption on/off states in Original/Combined, circular calibration geometry, proportional containment at 1920 × 1080, desktop/mobile operator previews and guide containment, cross-tab synchronization, settings export/restore, rejection of unknown profile keys and legacy/default profile behavior. Captures are under `.impeccable/review/profile-2424-*.png`. These are browser/software checks; LED processor mapping and physical output verification remain venue checks. Release archives were not rebuilt.

## More responsive vocal/guitar rise and fall

Original and Combined use larger, quicker vertical movement for their pink and blue contours. At the default Motion value, the sound-driven vertical component gains **1.5× before boundary easing**, with a dedicated **90 ms smoother in both directions** and a separate **90 ms melodic-history smoother**. History uses actual elapsed sample time for these two measured families, avoiding additional lag when frame/sample intervals vary. Their original contour arrangement and left-to-right history direction remain shared between both modes.

The added response scales down with Motion and Calm Mode. Calm Mode reduces the extra travel and slows the new smoothing; zero Motion retains the previous tracking without the enhancement. Reduced Motion remains stationary. Vertical travel eases into the available headroom with a smooth saturating curve, keeping the primary path centers between 10% and 90% of artwork height instead of cutting the contour into a flat edge. Existing diffusion still surrounds those paths.

Brightness, stroke width, event triggers/lifetimes, geometry budgets and piano treatment remain unchanged. Bass, saxophone and other visual families retain their existing mapping and history smoothing, as do Demo, Current and Living Composition. Inactive input and Standby retain the existing history/travel freeze and event release. No new controls, settings, public APIs or audio capture changes are introduced.

The production build and **129 tests** passed (97 unit, 17 browser, 15 production integration). New checks cover small upward/downward steps, faster settling with greater travel, unchanged line opacity/width under spectral changes, calmer response, extreme-input primary-contour bounds at 4416 × 896, 2424 × 896, preview and narrow sizes, and Original/Combined geometry parity.

Matched isolated synthetic transition captures cover both backends and modes at both display sizes, preview/narrow views, Reduced Motion, Calm Mode and extreme spectral changes: **56 before and 56 after frames**, with no page errors. Report comparisons found no line-width/opacity differences, no other-family geometry/style differences and no Reduced Motion point differences. The reviewed downward transition reaches its new position sooner; extreme contours preserve smooth curvature within their safe headroom. Captures and reports are in ignored `artifacts/verification/vertical-motion/{before,after}/`. These are software checks of selected synthetic transitions, not new microphone, LED or venue-comfort verification. Release archives were not rebuilt.

A separate short measured-feature renderer check replayed the saved 20-second excerpt with **five-second timing runs** at 4416 × 896. Current, Original and Combined each averaged 60.00 FPS at full quality on WebGL and Canvas. p95 frame intervals stayed between 16.7 and 16.8 ms, within the 10% target relative to Current, with no page errors. The report and matched measured captures are under `artifacts/verification/vertical-motion/measured/`. This is a local rendering smoke check rather than a venue soak.


## Ensemble response, distributed piano and larger stage identity

Original and Combined extend the quicker vocal/guitar response to bass and saxophone: 90 ms bidirectional tracking and melodic history at the default Motion value, with 1.5× vertical gain before smooth boundary easing. Bass stays in the lower 62–98% of the artwork; saxophone uses 10–90%. Motion and Calm Mode reduce the enhancement, and Reduced Motion retains stationary geometry.

Drum and piano activation uses a 90 ms attack. Accepted event strength gains 1.25×, capped at one; drum expansion gains 1.25× within the artwork bounds, and piano radius gains 1.15× within its existing edge limits. Piano opening now takes approximately 140–240 ms at default Motion. The raw 0.30 onset threshold, 300 ms spacing, six-second piano lifetime and 2.4-second pressure lifetime remain in place.

Piano blooms spread across three regions centered at 18%, 50% and 82% of artwork width for aspect ratios of at least 1.8, or two regions at 28% and 72% for narrower artwork. Placement avoids the previous region, favors the least occupied region among the last three retained groups and uses oldest usage to break ties. Small deterministic horizontal variation (±2% of width) and vertical placement between 34% and 54% prevent identical stacking. Birth positions remain stable; a fresh Live session or recovery resets placement history. Events still create one group per accepted attack, with at most four visible groups.

The Original/Combined stage logo is 32 px, rising proportionally to a maximum of 42 px in panoramic layouts. The guide uses the larger sizes described above and 20 × 15 px glyphs (18 × 13 px in previews). These changes apply during Live and Standby; the website header retains its existing sizing.

## Smaller guitar, clearer bass and five guide labels

Original and Combined now keep guitar paths spanning the **full artwork width**, while scaling vertical coordinates to **90% around the artwork center** and reducing stroke widths and associated light sizes to **90%**. Horizontal coordinates of paths and lights retain their original placement. This includes soft diffusion and attack details, including in High Contrast. Each frame starts from freshly generated geometry, so scaling never accumulates. Guitar alpha, response and event timing are retained.

Bass retains its teal color. Core opacity gains **1.8×**, core width **1.4×** and soft diffusion opacity **1.6×**, with opacity clamped to the renderer range. There are no additional paths or lights. The guide omits Saxophone; its amber visual family and other controls remain available. Current, Living Composition and Demo retain their existing treatment.

The guitar/bass/guide pass verified the production build and **136 tests**: 104 unit, 17 browser and 15 production integration checks. Added checks cover full-width guitar contours without repeated-frame shrinkage, High Contrast behavior, quiet teal bass visibility, layer controls and the five-label guide. Existing coverage retains ensemble responsiveness, distributed piano placement, enlarged identity/guide containment and Original/Combined parity.

Matched synthetic fixtures produced **48 before and 48 after captures** across both backends, quiet/moderate/strong input, preview/narrow layouts, Reduced Motion, High Contrast and Calm Mode. There were no page errors. The initial captures verified a centered 0.9 transform within 0.0002 px and exact width scaling. A subsequent correction restores full horizontal span while retaining the reduced vertical travel, stroke widths and light sizes; the full-width regression covers both modes and High Contrast. Current records and vocal, piano and saxophone geometry/style metrics remained identical. The guide was reviewed at desktop and narrow sizes. Captures and reports are under ignored `artifacts/verification/guitar-bass/{before,after}/`. The full-width correction adds 48 error-free captures under `artifacts/verification/guitar-bass/full-width/`, covering the same modes, backends and conditions.

A saved 20-second measured-feature excerpt also passed short **five-second timing runs** at 4416 × 896: Current, Original and Combined averaged 60.00 FPS at full quality on both WebGL and Canvas, with p95 intervals of 16.7–16.8 ms, within the 10% comparison target and no page errors. The report is `artifacts/verification/guitar-bass/measured/comparison.json`. These are local software checks; release archives were not rebuilt.
