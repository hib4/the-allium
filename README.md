# The Allium

A living visual score for an inclusive music and art event at Glitz Inclusive, Jakarta. React + TypeScript + Vite, using bounded PixiJS WebGL choreography, an animated Canvas 2D fallback, and semantic HTML captions. The first version is a **visual-only synthetic demo**, not microphone analysis or live transcription.

## Run

Node.js 22.12+ recommended (verified with Node 24).

```sh
npm ci
npm run dev
```

Open http://localhost:5173. To use the optional phone companion, open the network address printed by Vite on both the computer and phone, on the same local network. Its QR code uses the URL you opened. A QR code containing `localhost` cannot be opened from another device.

```sh
npm run build
npm run preview -- --port 4173
```

Build once before the performance. Keep the computer's local production server running; fonts, application code, and visual assets are bundled in `dist/`, with no public-internet runtime dependency. The local venue network is needed only to serve the independent companion to phones. The operator and LED tabs must use **the same origin and browser profile**; `localhost` and a network IP are different origins.

For hosting elsewhere, serve `dist/` and rewrite unknown application paths to `index.html`. Do not open `index.html` directly with a `file:` URL. No deployment, server relay, or cross-device session synchronization is included.

## Routes

| Route                       | Purpose                                                           |
| --------------------------- | ----------------------------------------------------------------- |
| `/`                         | Introduction and instrument exploration                           |
| `/experience`               | Rehearsal display, scenes, demo transport, accessibility controls |
| `/experience?performance=1` | Panoramic audience display without website chrome                 |
| `/tutorial`                 | Animated instrument chapters and ensemble demonstration           |
| `/control`                  | Operator desk, channels, captions, scenes and visual controls     |
| `/follow`                   | Independent mobile demo with device-local preferences             |

## Operator quick start

1. Open `/control`. Select **Open display** to open the audience output in another tab.
2. Place the display tab on the LED output. Use browser fullscreen for a display opened directly in performance view, or **Performance view** from rehearsal to request fullscreen.
3. Select **Play demo**. Change musical section to explore Quiet, Chorus, Guitar Solo, Vocal Section and Drum Breakdown.
4. Use scene buttons to direct attention independently of the musical arrangement. Calm Mode lowers density and movement; Reduced Motion additionally removes travel and animated expansion.
5. Mute hides a channel's visuals. Solo shows the selected subset; multiple solos coexist, and mute takes precedence. Input meters always represent synthetic input, independent of visualization mute.
6. At the caption desk, choose content type, enter a speaker and text, and send. Manual cues are limited to 180 characters to protect readable display space, including Unicode text. Send longer passages as consecutive cues. Manual cues remain until cleared or replaced. **Clear** leaves the caption area ready; **Restore demo cues** resumes the timed sample text. The captions switch hides the caption content without clearing the cue.
7. Press Escape to leave performance view. A keyboard-focusable exit action is also available in that view.

Only one operator tab owns controls. Additional operator tabs are read-only until the first closes or misses heartbeats for about four seconds. Playback remains independent of operator heartbeat and continues when the operator tab is backgrounded. Modern browsers synchronize tabs using BroadcastChannel; browsers without that API retain local controls and display a clear limitation. Reloading every concert tab starts a new paused session. A late-joining tab restores the active session from peers.

## Musical architecture

- `src/engine/types.ts` defines normalized events, instrument vocabulary, scene state, captions and validation.
- `music.ts` provides deterministic 96 BPM musical patterns and sample captions. Kick, snare and hi-hat have separate articulations. Section arrangements have distinct density and instrument emphasis.
- `source.ts` defines `MusicSource`, a synthetic `DemoSource`, and a bounded `EventSource` for future live data. Push validated events into `EventSource`; pass that source into `ScoreRenderer` instead of the default demo source. A live adapter must supply continuous event levels, including silence, and update UI source/status reporting before enabling live mode.
- `session.ts` separates the `Transport` interface from state. The included BrowserTransport uses versioned messages, state revisions, timeline anchors, snapshots, and peer heartbeats. A future WebSocket transport can implement the same interface; server authentication, clock synchronization, session IDs and venue routing belong to that future implementation.
- `choreography.ts` builds the shared visual score: eight seconds of melodic history, braided vocal trails, guitar attack filaments, bass currents, piano chord blooms, and drum pressure fields that displace nearby paths. Sections crossfade their melodic envelopes over two seconds without clearing phrase history.
- `renderer.ts` owns one requestAnimationFrame loop, viewport sizing, adaptive detail, and backend lifecycle. `webgl.ts` renders pooled PixiJS meshes and batched lights; `backends.ts` renders the same geometry with Canvas 2D. WebGL failure or context loss switches to a fresh Canvas without resetting the session or captions. If both backends fail, the static score and readable captions remain. React does not update on every frame.
- Caption content remains DOM text, independent of the visual canvas. The operator preview and audience display use the same state and rendering system.

Event timestamps are milliseconds on the session timeline; pitch is a MIDI note number; intensity and confidence range from 0 to 1. Resources are bounded: 240 pitch-history samples per instrument at 30 Hz (eight seconds), 12 pressure events, 24 chord groups, eight guitar attacks, 256 paths with up to 160 points each, and 1,200 lights (180 on the companion). External queues retain at most 512 events. Pixel density is capped at 1.5; sustained slow frames reduce particle density, secondary strands, bloom detail and then pixel density. Reduced Motion removes travelling history, drifting particles, bloom unrolling, pressure expansion and guitar attack filaments while retaining note shapes and intensity feedback.

## Identity and accessibility

The original Allium logo was not provided. `Identity` in `src/App.tsx` reserves its placement using a temporary text treatment. Replace this treatment with the supplied full, compact and high-contrast marks when available; keep their breathing room. No replacement logo has been generated.

Design tokens and responsive layouts live in `src/styles.css`; the direction and tokens are recorded in `DESIGN.md`. Atkinson Hyperlegible Next is bundled locally with its license in `public/fonts/LICENSE.txt`.

Instrument identity uses shape, position, texture and motion as well as color. Reduced motion defaults to the operating-system preference and has visible controls. Phone preferences are saved on that device. Drum effects are localized rings and bursts; there are no full-screen flashes. Caption labels identify all synthetic sample content. UI copy is English; manual captions support Unicode text.

## Verify

```sh
npm test
npm run test:browser
npm run build
```

Browser tests use installed Google Chrome (`channel: 'chrome'`). Install Chrome from its official source if unavailable, or change the Playwright configuration to use its managed Chromium and install that browser. `node scripts/qa.mjs` captures all routes at 1440px and 320px, runs axe checks, captures a 3840×768 chorus in color/grayscale, and profiles twenty seconds of active panoramic rendering. Results and screenshots are saved under `.impeccable/review/`. `node scripts/concert-qa.mjs` additionally records actual concert motion, captures every section and focus mode, checks reduced motion/grayscale, and profiles both backends at 3840×768. To rehearse the animated fallback directly, append `renderer=canvas` to the display URL (for example `/experience?performance=1&renderer=canvas`).

Automated accessibility checks do not establish complete WCAG conformance. Before an actual event, validate instrument recognition with Deaf and hard-of-hearing audience members, check caption size at audience viewing distance, and rehearse on the actual LED controller/browser/hardware. Inspect quiet and intense scenes, reduced motion, grayscale, connection recovery and safe visual intensity in that environment.
