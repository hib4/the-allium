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

**Creative North Star: "Living panoramic visual score"**

One continuous field carries distinct musical voices through theatrical editorial typography and solid captions. The user-pinned direction and approved code-first implementation are the visual authority; no supplied visual comp replaces them. UI copy and the development workflow remain English.

The score is warm, artistic and inclusive, with sparse complete gestures in quiet passages and localized energy in intense passages. Temporary text identity reserves the original logo placement until the supplied full, compact and high-contrast marks are available.

**Key Characteristics:**

- Continuous panoramic score with identifiable instrument shapes.
- Editorial hierarchy and a stable opaque caption band.
- Flat, bordered controls with truthful synthetic-demo state.
- Local fonts and device-aware motion.

## Colors

The navy field supports bright musical voices, softened editorial accents and legible neutral controls. Frontmatter records the source values; instrument assignments come from `src/engine/types.ts`.

### Primary

- Lilac fills primary actions; pink marks their hover state, emphasized headline words and active navigation.
- Magenta with pink highlights identifies vocals; sky identifies guitar; yellow identifies drums; teal identifies bass; the separate piano lavender identifies piano.

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

No UI shadow vocabulary is implemented. Depth comes from the dark field, tonal surfaces, section rules and layered musical fills. Dark gradients protect hero and desktop lesson copy; captions use an opaque background. Layer tokens place artwork at 0, content at 1, captions at 2 and controls at 3; the focused performance exit sits at 5.

## Shapes

Primary actions, scene buttons, lesson tabs and channel actions have square corners. Compact buttons and fields use the 6px radius. Rounded tracks and circular status dots are functional exceptions.

- **Vocals:** smooth filled ribbons around the upper-middle field with multiple flowing lines and a pink leading highlight.
- **Guitar:** angular twin paths across the middle; bends and turns follow intensity and pitch.
- **Drums:** localized expanding rings and radial ticks; kick, snare and hi-hat differ in scale, line weight and articulation.
- **Bass:** broad layered bands and four grounded paths near the bottom.
- **Piano:** individual diamonds and stems, grouped into harmonic constellations above the middle.

Pitch shifts paths vertically; intensity changes thickness, amplitude and impact scale. Quiet or paused passages preserve sparse piano diamonds and a drum ring. Scene focus changes interpolated channel weights; mute hides a channel and solo limits the visible subset, with mute taking precedence.

## Components

Primary actions use lilac fill and dark text; hover shifts to pink. Compact controls use transparent backgrounds and borders; pressed states add tonal fill and a light border. Inputs use a dark surface, border, 12px padding and visible labels. Navigation uses pink plus an underline for active routes. Instrument glyphs repeat the canvas vocabulary in legends, lessons and channel names.

**The Caption Band Rule.** Keep audience text outside the canvas in a stable opaque band, with polite atomic announcements and explicit sample-content labels. Manual cues are limited to 180 characters, support Unicode text and remain until cleared or replaced; longer passages use consecutive cues. The character counter follows the implementation’s JavaScript string-length and textarea limit. Hiding captions retains the cue and shows the captions-off state.

Controls normally have targets of at least 44px; primary actions are at least 48px. Keyboard focus is a yellow 2px outline with 4px offset, including the hidden-input toggle’s visible track. A skip link, semantic controls, pressed states and DOM captions complement the decorative, aria-hidden canvas. Automated checks do not establish complete WCAG conformance: audience viewing distance and the real LED hardware remain rehearsal checks.

UI transitions use 180ms with `cubic-bezier(0.16, 1, 0.3, 1)`. The renderer smooths scene weights with a 400ms exponential time constant, pitch with 250ms and intensity with 180ms; these are continuous responses, not fixed-duration scene animations. Calm Mode reduces motion and particle density to 20% and lowers visual energy. Reduced Motion removes path travel, particle drift and impact expansion/rising movement while preserving musical identity and changing input; the operating-system preference also disables CSS animation/transitions.

The artwork uses one requestAnimationFrame loop per score with bounded history (128 impacts), at most 42 decorative particles before adaptation, and pixel density capped at 1.75. Keep this bounded renderer architecture when extending visual behavior.

## Do's and Don'ts

- Do preserve the continuous field and each instrument’s shape, position and texture in grayscale.
- Do keep captions as readable DOM text in their own solid band.
- Do label demo content and keep local-font, offline performance behavior.
- Do replace temporary identity only with the original supplied logo assets.

- Don’t replace the score with equalizer boxes, a card grid or unrelated decoration.
- Don’t use color alone to identify instruments.
- Don’t introduce rapid full-screen flashes or motion that bypasses Reduced Motion.
- Don’t imply live transcription, cross-device synchronization or an invented original logo.
