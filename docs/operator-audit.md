# Operator page audit — 13 October 2026

Implementation integrity: **PASS**. The Operator page retains The Allium's typography, palette, instrument identities, separate display preview and purposeful audio controls. The scoped Impeccable detector returned no findings. Brand palette literals are intentional existing values, not verified theme defects.

| Dimension | Score | Evidence and limits |
| --- | --- | --- |
| Accessibility | 3/4 | Semantic inputs, 48px caption-toggle label, keyboard focus and ownership lock; automated axe checks pass. No physical screen-reader or audience-accessibility certification. |
| Performance | 3/4 | Bounded audio/history resources and rendering outside React; hiding removes the caption DOM. Caption timing remains bounded at 200ms. Previous endurance evidence is historical, not rerun for this UI change. |
| Responsive design | 3/4 | 320px and desktop checks; caption-hidden fullscreen fills 1920×1080 and preview retains its footprint. Physical touch/HDMI not tested. |
| Theming | 3/4 | Preserved navy/instrument palette, local typography and visible focus. Single established theme; no new theme-switching promise. |
| Implementation integrity | 3/4 | Coherent concert controls; two existing operator-copy inconsistencies remain below. |
| Total | **15/20 — Good** | No remaining blocking issue found in this scoped audit. |

## Findings

- **P1, fixed — captions could not be fully hidden.** `src/components/Score.tsx`, Captions: disabling the setting left a visible band and “CAPTIONS OFF” instructions. Hidden captions now render no container or live region, and fullscreen/preview visuals occupy the freed space. Cue content is retained.
- **P2, fixed — caption visibility was separated from caption authoring.** `src/App.tsx`, CaptionEditor/Control: moved the existing setting into Caption desk as “Show captions,” with explicit hidden-state guidance and operator status. Ownership locking remains enforced.
- **P2, fixed — submission feedback overstated visibility.** `src/App.tsx`, CaptionEditor: sending while hidden now says the cue is saved and requires Show captions, rather than claiming it is displayed.
- **P2, remaining — unsaved input settings have inconsistent Live entry controls.** `src/components/AudioDesk.tsx`: Start Live is disabled while edits are dirty; the Live mode button remains enabled. It uses the last applied configuration, which may surprise an operator. Recommendation: clarify that distinction or apply the same pending-edit rule to both entry controls. Suggested command: `$impeccable clarify`.
- **P2, remaining — sample-cue status can mislead in Live/Standby.** `src/App.tsx`, Control/CaptionEditor: sample mode can report “Sample cues ready” although demo cues are deliberately suppressed outside Demo. Restore demo cues is also offered outside Demo. Recommendation: report “Demo cues unavailable in Live” or constrain the restore action to Demo. Suggested command: `$impeccable clarify`.

Totals: P0 0; P1 1 fixed; P2 4 (2 fixed, 2 remaining); P3 0. Remaining findings have workarounds and are outside this caption-visibility change. No WCAG failure is inferred from these copy findings.

## Verification

Production tests cover hide/show in Demo, Live and Standby, cue preservation, submitting while hidden, keyboard activation, hidden preference export/restore, second-operator locking, removal of placeholder/live-region DOM, preview expansion and fullscreen sizing. Existing website regressions remain passing. Mobile axe scanning and overflow checks cover the caption editor. Screenshots of shown/hidden 1920×1080 and the mobile desk were inspected. No physical Ui24R, touch device, external display or assistive-technology user test was performed.

Preserve the current instrument-specific rendering, honest source status, semantic controls and manual-caption limits. Address the two remaining copy findings with `$impeccable clarify`, then use `$impeccable polish` for a final scoped pass. These commands can be requested individually or together; a subsequent audit can track improvement.
