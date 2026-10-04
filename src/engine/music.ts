import {
  instruments,
  type CaptionCue,
  type Instrument,
  type MusicEvent,
  type Section,
} from "./types";
export const BPM = 96;
const stepMs = 60000 / BPM / 4;
const melody = [60, 62, 65, 67, 65, 64, 62, 60, 60, 65, 69, 67, 65, 62, 64, 60];
const bassline = [36, 36, 41, 41, 45, 45, 43, 43];
export const arrangements: Record<Section, Record<Instrument, number>> = {
  "Quiet Section": {
    vocals: 0.3,
    guitar: 0.22,
    drums: 0.24,
    bass: 0.4,
    piano: 0.45,
  },
  Chorus: { vocals: 0.95, guitar: 0.8, drums: 0.95, bass: 0.82, piano: 0.75 },
  "Guitar Solo": {
    vocals: 0.12,
    guitar: 1,
    drums: 0.68,
    bass: 0.65,
    piano: 0.25,
  },
  "Vocal Section": {
    vocals: 0.9,
    guitar: 0.25,
    drums: 0.26,
    bass: 0.4,
    piano: 0.48,
  },
  "Drum Breakdown": {
    vocals: 0.08,
    guitar: 0.12,
    drums: 1,
    bass: 0.7,
    piano: 0.14,
  },
};
export function eventsBetween(
  from: number,
  to: number,
  section: Section,
  origin = 0,
): MusicEvent[] {
  const output: MusicEvent[] = [];
  const start = Math.max(0, Math.floor((from - origin) / stepMs) + 1);
  const end = Math.floor((to - origin) / stepMs);
  for (let n = Math.max(start, end - 128); n <= end; n++) {
    const timestamp = origin + n * stepMs;
    const bar = Math.floor(n / 16);
    const s = n % 16;
    const a = arrangements[section];
    const breathe = 0.9 + 0.1 * Math.sin(bar * 0.8);
    const emit = (
      instrument: Instrument,
      pitch?: number,
      strength = 1,
      articulation?: MusicEvent["articulation"],
    ) =>
      output.push({
        instrument,
        timestamp,
        pitch,
        intensity: Math.min(1, a[instrument] * strength * breathe),
        onset: true,
        beat: n / 4,
        confidence: 1,
        articulation,
      });
    if (
      s === 0 ||
      s === 8 ||
      (section === "Chorus" && s === 10) ||
      (section === "Drum Breakdown" && s % 3 === 0)
    )
      emit("drums", 36, 1, "kick");
    if (s === 4 || s === 12 || (section === "Drum Breakdown" && s >= 12))
      emit("drums", 38, 0.8, "snare");
    if (s % (section === "Quiet Section" ? 4 : 2) === 0)
      emit("drums", 42, 0.35, "hat");
    if (s % 4 === 0)
      emit("bass", bassline[(bar * 2 + Math.floor(s / 8)) % bassline.length]);
    if (s % (section === "Guitar Solo" ? 1 : 4) === 0)
      emit(
        "guitar",
        melody[(n + bar * 3) % 16] + 12,
        0.75 + 0.25 * Math.sin(n * 2) ** 2,
      );
    if (s % 2 === 0 && s < 14)
      emit(
        "vocals",
        melody[(Math.floor(n / 2) + bar) % 16] + 5,
        0.72 + 0.28 * Math.sin((s / 16) * Math.PI),
      );
    if (s === 0 || s === 10)
      for (const interval of [0, 4, 7])
        emit("piano", 60 + (bar % 4) * 2 + interval, 0.8);
  }
  return output;
}
export function continuous(
  time: number,
  section: Section,
  origin = 0,
): Record<Instrument, { pitch: number; intensity: number }> {
  // Levels and pitch use the exact same note events as the demo scheduler.
  const local = Math.max(0, time - origin);
  const step = Math.floor(local / stepMs);
  const recent = eventsBetween(
    origin + Math.max(-1, (step - 16) * stepMs - 0.01),
    time,
    section,
    origin,
  );
  const frame = Object.fromEntries(
    instruments.map((i) => [
      i,
      { pitch: i === "bass" ? 36 : i === "guitar" ? 72 : 65, intensity: 0 },
    ]),
  ) as Record<Instrument, { pitch: number; intensity: number }>;
  for (const event of recent) {
    const age = Math.max(0, time - event.timestamp);
    const sustain =
      event.instrument === "bass"
        ? 2200
        : event.instrument === "vocals"
          ? 1100
          : event.instrument === "guitar"
            ? 1400
            : event.instrument === "piano"
              ? 2200
              : 240;
    frame[event.instrument] = {
      pitch: event.pitch ?? frame[event.instrument].pitch,
      intensity: event.intensity * Math.exp(-age / sustain),
    };
  }
  return frame;
}
export function demoCaption(time: number, section: Section): CaptionCue | null {
  const t = time % 24000;
  if (section === "Drum Breakdown")
    return {
      id: "drums",
      category: "sound",
      speaker: "",
      text: "[Drums build into a rolling rhythm]",
      start: 0,
    };
  if (section === "Guitar Solo")
    return {
      id: "solo",
      category: "sound",
      speaker: "",
      text: "[Guitar carries the melody]",
      start: 0,
    };
  if (t < 4000)
    return {
      id: "intro",
      category: "speech",
      speaker: "Maya",
      text: "This space belongs to all of us.",
      start: 0,
    };
  if (t < 10000)
    return {
      id: "a",
      category: "lyrics",
      speaker: "Maya — vocals",
      text: "We’re brighter together.",
      start: 4000,
    };
  if (t < 16000)
    return {
      id: "b",
      category: "lyrics",
      speaker: "Maya — vocals",
      text: "Every rhythm, every voice.",
      start: 10000,
    };
  if (t < 22000)
    return {
      id: "c",
      category: "lyrics",
      speaker: "Maya — vocals",
      text: "There is a place for you here.",
      start: 16000,
    };
  return null;
}
