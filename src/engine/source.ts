import { continuous, eventsBetween } from "./music";
import {
  instruments,
  validEvent,
  type Instrument,
  type MusicEvent,
  type Section,
} from "./types";
export type MusicalFrame = Record<
  Instrument,
  { pitch: number; intensity: number }
>;
export interface MusicSource {
  events(
    from: number,
    to: number,
    section: Section,
    origin: number,
  ): MusicEvent[];
  frame(time: number, section: Section, origin?: number): MusicalFrame;
}
export class DemoSource implements MusicSource {
  events(from: number, to: number, section: Section, origin: number) {
    return eventsBetween(from, to, section, origin);
  }
  frame(time: number, section: Section, origin = 0) {
    return continuous(time, section, origin);
  }
}
/** Future audio/WebSocket adapters push normalized events here, never into React. */
export class EventSource implements MusicSource {
  private queue: MusicEvent[] = [];
  private current: MusicalFrame = Object.fromEntries(
    instruments.map((i) => [
      i,
      { pitch: i === "bass" ? 39 : i === "guitar" ? 72 : 65, intensity: 0 },
    ]),
  ) as MusicalFrame;
  push(value: unknown) {
    if (!validEvent(value)) return false;
    this.queue.push(value);
    this.queue.sort((a, b) => a.timestamp - b.timestamp);
    if (this.queue.length > 512) this.queue.splice(0, this.queue.length - 512);
    return true;
  }
  events(from: number, to: number) {
    const ready = this.queue.filter((e) => e.timestamp <= to);
    this.queue = this.queue.filter((e) => e.timestamp > to);
    for (const e of ready)
      this.current[e.instrument] = {
        pitch: e.pitch ?? this.current[e.instrument].pitch,
        intensity: e.intensity,
      };
    return ready.filter((e) => e.timestamp > from);
  }
  frame() {
    return this.current;
  }
}
