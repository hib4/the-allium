# Living Composition (experimental)

Living Composition is an optional choreography for the existing measured mixed-audio Live pipeline. Open `/control`, select Live, then choose **Live choreography → Living Composition (Experimental)**. Choose **Current** to return immediately; the microphone/interface stream keeps running. Operator preview and performance tabs receive the same session selection. Standby retains it. New sessions default to Current; explicit settings export/restore retains the selection, and older settings default to Current. Existing tabs need a refresh after updating the application.

Current and Living Composition share the [concert-scale ribbon and atmosphere treatment](live-visuals.md#concert-scale-composition--24-october-2026). The experiment changes the relationship between the existing ribbon systems, flowers and supporting detail. It does not add instruments or attempt source identification. Demo uses its existing renderer. Captions and audio settings are unchanged. Another Live option, [Original](live-visuals.md#original-live-choreography), reuses the Home page geometry and has its own event lifetimes. [Combined](live-visuals.md#combined-live-choreography) keeps Original's geometry and timing with Current-style brightness and body.

## Musical response

The controller reads the same feature sample already consumed by the mixed renderer. Normalized intensity comes from the existing audio analysis; the controller does not reinterpret raw microphone volume or apply another input sensitivity.

- Two- and eight-second energy followers provide short and longer context. A four-second window counts accepted onsets; spectral change follows a two-second envelope.
- Calm, developing, intense and releasing are **visual response states**, not song-section detection. Calm uses intensity below 0.15. Intense requires intensity above 0.65 and either two accepted onsets per second or sustained spectral change above 0.35; its exit intensity is 0.55. Releasing recognizes fast energy below 70% of slower energy when slower energy exceeds 0.15. Other active input develops the composition.
- State conditions must persist for 600 ms, with parameters blending over 1.2 seconds. Inactive input releases immediately and returns to calm after eight seconds. Eight-second musical memory fades smoothly and has a hard maximum lifetime; it cannot trigger a flower or onset.
- Accepted onsets and spectral edges can move the shared focus between left, center and right regions, with a two-second minimum interval. The path goes through the center rather than jumping from the far right to the far left. Focus movement eases with a 1.5-second time constant at full motion, slowed by the Motion control. No focus travel occurs without active input.
- Low-frequency energy retains broad structural influence; mids retain internal ribbon curvature and strand separation; highs retain fine texture. The shared focus draws ribbons into a local convergence while other regions breathe apart. Decaying energy history shapes a broad fold. Highlights, foreground emphasis and filament density follow the same compositional context.
- Flowers retain their smaller sizes, simplified geometry, maximum one primary plus one subtler secondary, and fixed 2.8-second expiry. Current and Living Composition use strength-sensitive 180–320 ms ribbon emergence, energy-dependent size and luminosity, bounded onset pulses and smoothed band/spectral detail. They unfold from the ribbon field; their last 900 ms redirect existing supporting filaments toward nearby ribbon tangents. No extra particle or ribbon budget is introduced.

Silence cannot start flowers, pulses, focal changes or procedural travel. Existing flowers fade within 600 ms on inactive input, and remembered light decays. Standby and re-entry clear stale musical gestures. Reduced Motion freezes experimental spatial choreography and filament transport; soft intensity changes remain. Calm Mode reduces motion and detail. Existing high contrast, layer controls, renderer quality adaptation and Canvas fallback still apply.

## Capture the same real music once

Run the frontend with `npm run dev` and the existing Python service with `npm run audio` if they are not already running. Select your actual input and channels in `/control` and apply the settings. For BlackHole, route music to the configured loopback input. For the microphone, use an external speaker. Check the raw meters before comparing. These commands do not select or reconfigure audio devices.

In a terminal, while playing the desired track:

```sh
ALLIUM_URL=http://127.0.0.1:5173 npm run visuals:record -- --seconds 120
```

This explicitly saves **derived features only**, not PCM, to `artifacts/verification/living-composition/measured-features.json`. It saves no device names, device IDs or stream IDs. Captures are limited to three minutes. They still describe musical activity, so share them intentionally. Start with quiet music, include a rise, rhythmically active and energetic passages, and end with a release or silence where possible. Capture does not control playback.

Then replay exactly the same feature timeline through all four Live choreographies:

```sh
ALLIUM_URL=http://127.0.0.1:5173 npm run visuals:compare -- \
  --input artifacts/verification/living-composition/measured-features.json \
  --seconds 120
```

The developer harness is separate from the app's Live routes. It never supplies replay data when Live input is missing, opens no audio stream, and makes no audio configuration writes. It rejects malformed timelines and files larger than 8 MiB. Replay preserves inactive samples and capture gaps; it returns no input after the timeline ends. The comparison writes matched screenshots and `comparison.json` under the same artifact directory. Use `--output PATH` to select another artifact directory, `--headful` to watch the real-time benchmark, and `ALLIUM_URL` for another Vite port. Chrome must be installed, as for the existing browser tests.

For a clearly labeled synthetic correctness/performance fixture:

```sh
npm run visuals:fixture -- --seconds 120 --output artifacts/verification/living-fixture
```

Fixture results cannot establish artistic correspondence to real music. The capture tool refuses fixture service input as a measured recording. None of these developer tools is bundled into the production UI.

## Compare and verify

Review matched timestamps for ribbon expressiveness, correspondence to real changes, readability from a distance, motion comfort, and balanced negative space. Prefer clearer local musical gestures over more objects. A screenshot can miss an ephemeral bloom; assess the unfolding and release over time as well as still frames.

The harness includes Current, Living Composition, Original and Combined, and renders deterministic matched captures at 4416 × 896 and checks Reduced Motion, high contrast, 900 × 182 preview, and 320 × 500 composition. It benchmarks each mode/backend separately against the same timeline at identical settings, reporting actual backend, frame intervals, quality and viewport dimensions. Target no more than 10% p95 frame-time regression relative to Current. A 120-second recording supplies a two-minute run for each mode/backend; shorter recordings produce shorter runs and are reported as such. Local headless browser timing is not a physical LED or venue performance guarantee.

Automated checks:

```sh
npm test
npm run test:audio
npm run test:browser
npm run test:integration
```

The integration command includes the production build and uses an isolated synthetic service on port 8766. It does not reconfigure the running venue/local audio service on port 8765.

## Verification results

The saved 120-second BlackHole capture contains 3,600 feature samples and 256 onsets; the operator confirmed music played during that window. The original experimental comparison completed 120-second runs per mode/backend near 60 FPS, p95 16.7 ms, at full quality. The subsequent bloom refinement applies to both modes and passed 141 tests plus the production build. Its matched 20-second before/after timing checks remained near 60 FPS, p95 16.7–16.8 ms, without a meaningful regression. See [the bloom verification results](live-visuals.md#stronger-musical-bloom-response--23-october-2026) for timings, commands, artifact locations and scope. These are software checks against measured features; physical LED, venue USB and audience comfort verification remain outstanding.
