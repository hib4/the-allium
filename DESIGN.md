---
name: The Allium
description: A living panoramic visual score for inclusive music.
colors:
  bg: "#05091c"
  surface: "#0a1030"
  navy: "#0a1f66"
  sky: "#6eb4ff"
  blue: "#4f8bff"
  teal: "#00b3a7"
  pink: "#ffc6e8"
  magenta: "#ff3ebb"
  violet: "#8b5cf6"
  lilac: "#e3d1ff"
  yellow: "#ffd84d"
  white: "#fff"
  muted: "#aab4d4"
  border: "#353f65"
  piano: "#C4A5FF"
  saxophone: "#FFAA66"
typography:
  display:
    fontFamily: "Atkinson Hyperlegible Next, sans-serif"
    fontSize: "clamp(64px, 6.5vw, 96px)"
    fontWeight: 500
    lineHeight: 0.99
    letterSpacing: "-0.04em"
  headline:
    fontFamily: "Atkinson Hyperlegible Next, sans-serif"
    fontSize: "44px"
    fontWeight: 500
    lineHeight: 1.06
    letterSpacing: "-0.035em"
  body:
    fontFamily: "Atkinson Hyperlegible Next, sans-serif"
    fontSize: "18px"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "Atkinson Hyperlegible Next, sans-serif"
    fontSize: "12px"
    fontWeight: 600
    letterSpacing: "0.12em"
rounded:
  square: "0"
  compact: "6px"
spacing:
  space-1: "4px"
  space-2: "8px"
  space-3: "12px"
  space-4: "16px"
  space-6: "24px"
  space-8: "32px"
  space-12: "48px"
  space-16: "64px"
  space-24: "96px"
components:
  button-primary:
    backgroundColor: "{colors.lilac}"
    textColor: "{colors.bg}"
    rounded: "{rounded.square}"
    padding: "12px 22px"
  button-primary-hover:
    backgroundColor: "{colors.pink}"
    textColor: "{colors.bg}"
  button-control:
    textColor: "{colors.white}"
    rounded: "{rounded.compact}"
    padding: "9px 16px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.white}"
    rounded: "{rounded.compact}"
    padding: "12px"
  caption-band:
    backgroundColor: "{colors.bg}"
    textColor: "{colors.white}"
    padding: "24px 5%"
---
# Design System: The Allium

## Overview

**Creative North Star: "Luminous Allium: living panoramic visual score"**

One continuous field carries distinct musical voices through theatrical editorial typography and solid captions. The user-pinned direction and approved code-first Luminous Allium implementation are the visual authority; no supplied visual comp replaces them. UI copy and the development workflow remain English.

The score is warm, artistic and inclusive: luminous braided trails, layered currents and allium-flower chord blooms retain musical structure through quiet and intense passages. The established UI, font, palette and route layouts continue to frame this concert choreography. Temporary text identity reserves the original logo placement until the supplied full, compact and high-contrast marks are available.

**Key Characteristics:**

- Continuous panoramic score with identifiable instrument shapes.
- Editorial hierarchy and a stable opaque caption band.
- Flat, bordered controls with truthful synthetic-demo state.
- Local fonts and device-aware motion.

## Colors

The navy field supports bright musical voices, softened editorial accents and legible neutral controls. Frontmatter records the source values; instrument assignments come from `src/engine/types.ts`.

### Primary

- Lilac fills primary actions; pink marks their hover state, emphasized headline words and active navigation.
- Magenta identifies vocals; sky identifies guitar; yellow identifies drums; teal identifies bass; the separate piano lavender identifies piano; amber identifies saxophone through looping curves that follow pitch and intensity.

### Neutral

- Background is the darkest field and opaque caption surface. Surface separates inclusion copy, inputs and selected lesson controls.
- White carries primary text; muted carries supporting copy; border divides sections and channel rows.
- Navy, blue and violet remain declared palette primitives, without an invented additional UI role.
- High Contrast on the independent companion overrides muted to `#e3e8ff`, border to `#8895c0`, and canvas instrument strokes/fills to white.

**The Instrument Identity Rule.** Color reinforces shape, position, texture and motion; it never supplies the only instrument cue.

## Typography

One locally bundled family, **Atkinson Hyperlegible Next**, uses a sans-serif fallback. `src/main.tsx` imports local Fontsource weights 400, 500, 600 and 700; the license is in `public/fonts/LICENSE.txt`. Performance requires no public font service.

Display type is editorial through scale, tight tracking and balanced wrapping. The hero uses the frontmatter display role; its responsive overrides are 76px at widths up to 1100px, 70px up to 760px, and 59px up to 390px. Tutorial and companion titles begin at 64px, then 48px and 42px at the smaller breakpoints. Operator title begins at 42px, then 36px and 32px. Body copy is usually 16–18px; smaller status and form labels are 9–15px. Headline and body tokens describe recurring roles, not every route title.

Audience captions use weight 500 and line height 1.3: default `clamp(22px, 2.2vw, 38px)`, performance `clamp(24px, 4vh, 44px)`, panoramic performance `clamp(26px, 5.5vh, 52px)`. Speaker labels are uppercase lilac with tracked lettering. Caption content is bounded to 90ch and wraps long unbroken text. The performance content wrapper establishes its own caption-sized font so this bound scales with the audience text.

## Layout

Website headers and footers use 5% side margins; editorial sections use 7–8% gutters. The score spans its surface instead of occupying a collection of cards. Shared spacing follows the frontmatter scale; route-specific dimensions remain in `src/styles.css`.

- **`/`:** full-width score behind left-aligned editorial copy, a separated instrument index, then a two-column inclusion section. The hero is at least 740px tall on desktop; narrow layouts stack the inclusion section and allow instrument choices to wrap.
- **`/experience`:** artwork, solid captions, then rehearsal transport, scenes, accessibility controls and legend. The default canvas height is `clamp(280px, 33vw, 550px)`; narrow layouts use 320px, then 280px.
- **`/experience?performance=1`:** fills 100dvh without website header, footer or rehearsal controls. A compact identity/status overlay remains above a flexible canvas and a nonshrinking caption band. At aspect ratios of at least 4:1, captions reserve at least 24vh for the 5:1 LED surface. Escape and a keyboard-focusable exit action leave performance view.
- **`/tutorial`:** horizontal instrument chapters lead into a single visual theatre. Desktop explanation occupies 48% over a protective dark gradient; at 760px and below, explanation stacks above a 250px score and lesson tabs scroll horizontally.
- **`/control`:** four-column status strip, then a two-column desk (1.65fr and at least 290px) with horizontal channel rows, scenes and caption editing beside preview/settings. At 760px and below the desk stacks and status becomes two columns; at 390px the secondary settings and caption fields also stack. Rows stay compact rather than turning into cards.
- **`/follow`:** editorial introduction and QR invitation beside a personal stage up to 520px wide. At 760px and below it becomes one column, hides the QR block and uses a 240px score. The instrument selector is a three-column grid; settings sit below the score and captions.

The 1100px breakpoint tightens gaps and channel columns; 1700px increases the homepage hero to 820px and caps operator/tutorial pages at 1800px. At 390px and below, header navigation becomes a two-column grid with 44px targets.

Operator and audience display tabs share state only within the same browser profile and origin. One operator owns controls; others show read-only state. The mobile companion is an independent visual-only demo with device-local preferences; its QR invitation must not suggest a synchronized venue relay.

## Elevation & Depth

No UI shadow vocabulary is implemented. UI depth comes from the dark field, tonal surfaces and section rules. Concert depth comes from luminous feathered strands, layered currents and bounded lights. PixiJS WebGL uses textured meshes and a batched light field; Canvas 2D renders the same shared geometry with a bounded 24-pass Gaussian feather for soft strokes. These musical light treatments do not introduce a new UI shadow token. Dark gradients protect hero and desktop lesson copy; captions use an opaque background. Layer tokens place artwork at 0, content at 1, captions at 2 and controls at 3; the focused performance exit sits at 5.

## Shapes

Primary actions, scene buttons, lesson tabs and channel actions have square corners. Compact buttons and fields use the 6px radius. Rounded tracks and circular status dots are functional exceptions.

- **Vocals:** braided, luminous pitch-history trails around the upper-middle field; fine strands and soft envelopes reveal the melodic contour.
- **Guitar:** a sharper pitch-history contour across the middle with angular detail and localized branching filaments on stronger attacks.
- **Drums:** localized pressure rings and radial ticks; kick, snare and hi-hat retain distinct scale and articulation. Kick pressure deforms nearby melodic paths and bass currents instead of flashing the whole field.
- **Bass:** broad, layered currents near the bottom; slower phase, pitch and intensity give the ensemble a grounded flow.
- **Piano:** chord-triggered allium-flower blooms with petal contours, diamond/stem note constellations and connecting traces. Chorus chords open larger blooms; quieter passages retain a restrained flower form.

Normalized musical events and continuous input frames feed one shared choreography model. Pitch shifts contours vertically; intensity changes strand width, bloom size and pressure strength. Eight seconds of sampled melodic history carries the phrase through the field. Section changes blend outgoing and incoming melodic envelopes over two seconds without clearing old history or existing blooms. Scene focus changes interpolated channel weights; mute hides a channel and solo limits the visible subset, with mute taking precedence.

## Components

Primary actions use lilac fill and dark text; hover shifts to pink. Compact controls use transparent backgrounds and borders; pressed states add tonal fill and a light border. Inputs use a dark surface, border, 12px padding and visible labels. Navigation uses pink plus an underline for active routes. Instrument glyphs repeat the canvas vocabulary in legends, lessons and channel names.

**The Caption Band Rule.** Keep audience text outside the canvas in a stable opaque band, with polite atomic announcements and explicit sample-content labels. Manual cues are limited to 180 characters, support Unicode text and remain until cleared or replaced; longer passages use consecutive cues. The character counter follows the implementation’s JavaScript string-length and textarea limit. Hiding captions retains the cue and shows the captions-off state.

Controls normally have targets of at least 44px; primary actions are at least 48px. Keyboard focus is a yellow 2px outline with 4px offset, including the hidden-input toggle’s visible track. A skip link, semantic controls, pressed states and DOM captions complement the decorative, aria-hidden canvas. Automated checks do not establish complete WCAG conformance: audience viewing distance and the real LED hardware remain rehearsal checks.

UI transitions use 180ms with `cubic-bezier(0.16, 1, 0.3, 1)`. Choreography uses exponential time constants of 220ms for pitch, 280ms for intensity, 650ms for energy and 400ms for focus weights. History is sampled at 30Hz with 180ms pitch smoothing. The separate two-second section envelope preserves phrase continuity; these continuous musical responses do not become fixed-duration UI animations.

Calm Mode scales phase motion to 18%, decorative particle density to 15% and visual strength to 62%, with smaller blooms and lighter melodic detail. Reduced Motion removes travelling history, particle drift, bloom unrolling and rotation, pressure expansion and nearby-path deformation, and guitar attack filaments. It preserves instrument shapes and musical pitch/intensity response. The operating-system preference also disables CSS animation/transitions.

One requestAnimationFrame loop per score owns sizing and adaptive detail; React stays outside the frame loop. The default PixiJS WebGL backend and animated Canvas 2D fallback consume the same geometry. WebGL initialization failure or context loss switches to a fresh Canvas without resetting the concert session or captions. If both backends fail, a static SVG score, explanatory DOM fallback, captions and controls remain available. A forced Canvas rehearsal uses `renderer=canvas` in the display query.

Resources are bounded: 240 history samples per instrument at 30Hz (eight seconds), 12 pressure events, 24 chord groups, eight guitar attacks, 256 paths with at most 160 points each, and 1,200 lights (180 for the companion or a score narrower than 600px). The preview has a 240-decorative-particle budget before shared light limits. Sustained slow frames reduce density, secondary strands and bloom petals; device pixel density is capped at 1.5 and drops to 1 at lower adaptive quality. Keep musical identity, caption independence and these resource bounds when extending the score.

## Do's and Don'ts

- Do preserve the continuous field and each instrument’s shape, position and texture in grayscale.
- Do keep captions as readable DOM text in their own solid band.
- Do label demo content and keep local-font, offline performance behavior.
- Do replace temporary identity only with the original supplied logo assets.

- Don’t replace the score with equalizer boxes, a card grid or unrelated decoration.
- Don’t use color alone to identify instruments.
- Don’t introduce rapid full-screen flashes or motion that bypasses Reduced Motion.
- Don’t imply live transcription, cross-device synchronization or an invented original logo.


## Mixed-input Live extension

Live is one measured musical ecosystem, never a set of detected instruments. The three coordinated visual layers are primary ribbon bundles, reactive allium blooms, and secondary filaments. The existing navy, magenta, sky-blue, teal and lavender palette remains authoritative. Demo, tutorial and companion instrument languages are unchanged.

Magenta and blue ribbon bundles share the measured feature history, with asymmetric broad folds, convergences and crossings across the panorama. Both use organic curves; blue retains local transient bends rather than a permanently angular contour. Nine magenta and six blue strands remain distinct at normal quality. Their variable centered fan opens and contracts along the spine instead of forming a uniformly downward stack. Per-point widths taper over the outer 6.5% and vary through each strand. Three centered diffusion passes, a leading halo, luminous cores and pooled previous geometry provide depth without framebuffer accumulation. Teal currents stay behind the leading systems.

Three possible attachment regions (two on narrow artwork) host finite musical events, with at most one primary allium bloom and one subtler secondary. There are no persistent buds or flowers between events. The primary uses 70% of the previous bounded radius; the secondary uses 65% of that size and approximately half its brightness. The dimensional vocabulary remains, simplified to 54 primary florets (6 rear / 18 body / 30 foreground) and 30 secondary florets (0 / 12 / 18) at full quality. Medium quality uses 3/12/24 and 0/9/15; low quality uses 0/9/18 and 0/6/12. Fainter rear detail, curved pedicels and pale foreground florets retain depth while reduced halo spread and tip lights keep ribbons dominant.

Blooms trigger on accepted onsets of at least 0.45 intensity or a musical-growth rise across 0.45, rearming below 0.20. They open over 180–320 ms according to onset strength and fade completely by 2.8 seconds. Repeated onsets can reinforce strength but cannot reset expiry or promote the secondary. A region rests for 450 ms after its event ends; onset/growth triggers within 250 ms coalesce into one event. Sustained energy does not keep flowers alive. Stems and Piano accents share the event envelope and disappear with it; nearby filaments attach to ribbons when flowers are absent. Reduced Motion retains stationary fading events, while silence and Standby stop activation and release existing events within 600 ms. Returning to Live clears old events. Pooled paths retain zero-width joins and both rendering backends share the geometry.

RMS-derived intensity controls activation, luminosity, scale and thickness; low energy controls broad mass and bends, mids control curvature and strand spread, highs control fine filaments and highlights, and spectral change shapes local deformation. The fixed 64-sample history at up to 20 Hz uses smooth interpolation; its values are shared by both bundles. Onsets coordinate local traveling highlights, deformation and pressure ripples, never full-screen brightness flashes. Continuous features retain 180 ms attack and 800 ms release. Accents retain 300 ms minimum spacing, six-event limit and 2.8-second lifetime; up to eight pooled traces preserve real previous geometry.

Quiet active input retains readable ribbons, with flowers absent between events. Silence, missing input and Standby stop new activity and decay to a faint static field; resume clears old events. Reduced Motion freezes travel, unfolding geometry, particle drift and trails, retaining stationary fading accents and fixed flower shapes. Calm Mode and the existing layer controls retain their meanings. Adaptive quality removes secondary detail first, retaining nine/six strands down to quality 0.5 and six/five below it. The geometry budgets remain 256 paths, 160 points per path and 180 lights (60 in previews), shared by WebGL and Canvas.

The venue profile remains exactly 4416×896 (69:14), proportionally contained on other display shapes. Caption DOM, typography, calibration, fullscreen, operator synchronization and the audio capture/feature protocol remain unchanged. Physical LED brightness, viewing distance and venue audio acceptance require rehearsal verification.

### Optional Living Composition

Both Live modes use a concert-scale depth treatment: independently folded strands within each shared ribbon bundle, four translucent ribbon sheets, six quieter distant contours, localized pale highlights, and fading measured-geometry trails. These are related surfaces of one measured mix, not additional musical voices. Supporting threads reveal continuously as energy and spectral detail rise; a bounded field of ribbon-related light dust spans the panorama. Strong passages widen and illuminate the composition, while quiet active input retains restrained detail. Smaller finite blooms retain their event logic and gain clearer local luminosity. The existing path/light limits remain fixed; lower quality removes sheets, distant contours, travelling highlights and dust before primary shapes. Reduced Motion removes travelling highlights and dust, with no slow-memory spatial drift in silence.

Live offers Current (the default) and Living Composition (Experimental) through the established operator controls. The experiment coordinates existing magenta, sky and teal ribbon systems around a gently moving focal region, with local convergence, separation, shared depth and decaying musical memory. It retains the smaller finite allium events and releases their existing supporting filaments toward nearby ribbons. No additional instruments, particle budgets or persistent flowers are implied. Calm/developing/intense/releasing name measured visual response states, not inferred song sections. Reduced Motion removes experimental spatial travel. Captions, Demo, typography and palette are unchanged. See `docs/living-composition.md` for comparison and rollback.
