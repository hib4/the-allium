import type { MixFeature, MixEvent } from "./audio";

export type CompositionState = "calm" | "developing" | "intense" | "releasing";
const clamp = (n: number) => Math.max(0, Math.min(1, n));
/** Musical memory only: never emits musical events or reads an audio source. */
export class LivingComposition {
  readonly value = {
    state: "calm" as CompositionState,
    fast: 0,
    slow: 0,
    spectral: 0,
    density: 0,
    memory: 0,
    gather: 0,
    expansion: 0,
    depth: 0,
    luminosity: 0,
    focus: 0.18,
    targetFocus: 0.18,
  };
  private onsets: number[] = [];
  private lastOnset = -Infinity;
  private lastFocus = -Infinity;
  private lastActivity = -Infinity;
  private candidate: CompositionState = "calm";
  private candidateSince = 0;
  private spectralArmed = true;
  private focusIndex = 0;
  reset() {
    Object.assign(this.value, {
      state: "calm",
      fast: 0,
      slow: 0,
      spectral: 0,
      density: 0,
      memory: 0,
      gather: 0,
      expansion: 0,
      depth: 0,
      luminosity: 0,
      focus: 0.18,
      targetFocus: 0.18,
    });
    this.onsets.length = 0;
    this.lastOnset = this.lastFocus = this.lastActivity = -Infinity;
    this.candidate = "calm";
    this.candidateSince = 0;
    this.spectralArmed = true;
    this.focusIndex = 0;
  }
  update(
    time: number,
    dt: number,
    feature: MixFeature | null | undefined,
    events: readonly MixEvent[],
    reduced: boolean,
    motion: number,
    calm: boolean,
  ) {
    const v = this.value,
      active = !!feature?.active;
    const follow = (n: number, target: number, tau: number) =>
      n + (target - n) * (1 - Math.exp(-dt / tau));
    const energy = active ? clamp(feature!.intensity) : 0;
    v.fast = follow(v.fast, energy, 2000);
    v.slow = follow(v.slow, energy, 8000);
    v.spectral = follow(v.spectral, active ? clamp(feature!.flux) : 0, 2000);
    if (active) this.lastActivity = time;
    const newEvents = active
      ? events.filter((e) => e.timestamp > this.lastOnset)
      : [];
    for (const e of newEvents) {
      this.onsets.push(e.timestamp);
      this.lastOnset = e.timestamp;
    }
    this.onsets = this.onsets.filter((t) => time - t < 4000).slice(-16);
    v.density = this.onsets.length / 4;
    v.memory = v.slow * (1 - clamp((time - this.lastActivity) / 8000)) ** 2;
    const spectralEdge = active && this.spectralArmed && feature!.flux >= 0.35;
    if (!active || feature!.flux < 0.2) this.spectralArmed = true;
    if (spectralEdge) this.spectralArmed = false;
    if (
      active &&
      !reduced &&
      motion > 0 &&
      !calm &&
      time - this.lastFocus >= 2000 &&
      (newEvents.length > 0 || spectralEdge)
    ) {
      this.focusIndex = (this.focusIndex + 1) % 4;
      v.targetFocus = [0.18, 0.51, 0.82, 0.51][this.focusIndex];
      this.lastFocus = time;
    }
    // An inactive input may fade light, but never moves a spatial focus.
    if (active && !reduced && motion > 0 && !calm)
      v.focus = follow(v.focus, v.targetFocus, 1500 / Math.max(0.05, motion));
    const intense =
      energy > (v.state === "intense" ? 0.55 : 0.65) &&
      (v.density >= 2 || v.spectral > 0.35);
    const next: CompositionState = !active
      ? time - this.lastActivity >= 8000 ? "calm" : "releasing"
      : energy < 0.15
        ? "calm"
        : v.slow > 0.15 && v.fast < v.slow * 0.7
          ? "releasing"
          : intense
            ? "intense"
            : "developing";
    if (next !== this.candidate) {
      this.candidate = next;
      this.candidateSince = time;
    }
    if (!active || time - this.candidateSince >= 600) v.state = next;
    const target = {
      calm: [0.12, 0.1, 0.2, 0.05],
      developing: [0.65, 0.45, 0.55, 0.3],
      intense: [0.8, 0.95, 0.9, 0.6],
      releasing: [0.05, 0.2, 0.25, 0.05],
    }[v.state];
    v.gather = follow(v.gather, target[0], 1200);
    v.expansion = follow(v.expansion, target[1], 1200);
    v.depth = follow(v.depth, target[2], 1200);
    v.luminosity = follow(v.luminosity, target[3], 1200);
    return v;
  }
}
