export const instruments = [
  "vocals",
  "guitar",
  "drums",
  "bass",
  "piano",
] as const;
export type Instrument = (typeof instruments)[number];
export const scenes = [
  "Ensemble",
  "Vocal Focus",
  "Guitar Focus",
  "Percussion Focus",
  "Calm Mode",
] as const;
export type Scene = (typeof scenes)[number];
export const sections = [
  "Quiet Section",
  "Chorus",
  "Guitar Solo",
  "Vocal Section",
  "Drum Breakdown",
] as const;
export type Section = (typeof sections)[number];
export interface MusicEvent {
  instrument: Instrument;
  timestamp: number;
  pitch?: number;
  intensity: number;
  onset?: boolean;
  beat?: number;
  confidence?: number;
  articulation?: "kick" | "snare" | "hat";
}
export const MAX_CAPTION_LENGTH = 180;
export interface CaptionCue {
  id: string;
  category: "lyrics" | "speech" | "sound";
  speaker: string;
  text: string;
  start: number;
  end?: number;
}
export interface ChannelState {
  mute: boolean;
  solo: boolean;
}
export interface SessionState {
  playing: boolean;
  anchor: number;
  position: number;
  section: Section;
  sectionStart: number;
  scene: Scene;
  intensity: number;
  particles: number;
  motion: number;
  captions: boolean;
  reduced: boolean;
  channels: Record<Instrument, ChannelState>;
  manual: CaptionCue | null;
  captionMode: "demo" | "manual";
}
export const colors: Record<Instrument, string> = {
  vocals: "#FF3EBB",
  guitar: "#6EB4FF",
  drums: "#FFD84D",
  bass: "#00B3A7",
  piano: "#C4A5FF",
};
export const descriptions: Record<Instrument, string> = {
  vocals: "Follow the ribbon to follow the melody.",
  guitar: "Watch the path rise and fall with each phrase.",
  drums: "Rhythm appears as pulses. Each impact has its own weight.",
  bass: "Broad, grounded waves carry the low musical energy.",
  piano: "Individual notes gather into harmonic constellations.",
};
export function visibleChannel(state: SessionState, instrument: Instrument) {
  const anySolo = instruments.some((i) => state.channels[i].solo);
  return (
    !state.channels[instrument].mute &&
    (!anySolo || state.channels[instrument].solo)
  );
}
export function validEvent(v: unknown): v is MusicEvent {
  if (!v || typeof v !== "object") return false;
  const e = v as MusicEvent;
  return (
    instruments.includes(e.instrument) &&
    Number.isFinite(e.timestamp) &&
    e.timestamp >= 0 &&
    Number.isFinite(e.intensity) &&
    e.intensity >= 0 &&
    e.intensity <= 1 &&
    (e.pitch === undefined ||
      (Number.isFinite(e.pitch) && e.pitch >= 0 && e.pitch <= 127)) &&
    (e.confidence === undefined ||
      (Number.isFinite(e.confidence) && e.confidence >= 0 && e.confidence <= 1))
  );
}
