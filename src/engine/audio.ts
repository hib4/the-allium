import { instruments, type Instrument, type MusicEvent } from "./types";
import { DemoSource, type MusicSource, type MusicalFrame } from "./source";
import type { Session } from "./session";

export interface InputSettings {
  channels: number[];
  sensitivity: number;
  noiseDb: number;
  pitch: boolean;
}
export interface AudioConfig {
  device: { name: string; hostApi: string } | null;
  instruments: Record<Instrument, InputSettings>;
}
export interface AudioDevice {
  id: number;
  name: string;
  hostApi: string;
  channels: number;
  sampleRate: number;
}
export interface Meter {
  rms: number;
  peak: number;
  db: number;
  clip: boolean;
}
export interface Feature {
  intensity: number;
  bands: number[];
  spectrum: number[];
  pitch: number | null;
  confidence: number;
  centroid: number;
}
export interface AudioPacket {
  v: 1;
  type: "features";
  streamId: string;
  sequence: number;
  timestamp: number;
  revision: number;
  config: AudioConfig;
  status: string;
  error: string;
  fresh: boolean;
  sampleRate: number;
  meters: Meter[];
  instruments: Record<Instrument, Feature>;
  events: {
    instrument: Instrument;
    timestamp: number;
    intensity: number;
    articulation: "kick" | "snare" | "hat" | null;
  }[];
  health: { overflows: number; dropped: number; processingMs: number };
}
export const emptyConfig = (): AudioConfig => ({
  device: null,
  instruments: Object.fromEntries(
    instruments.map((i) => [
      i,
      {
        channels: [] as number[],
        sensitivity: 1,
        noiseDb: -60,
        pitch: ["guitar", "vocals", "bass"].includes(i),
      },
    ]),
  ) as AudioConfig["instruments"],
});
const finite = (x: unknown, min: number, max: number): x is number =>
  typeof x === "number" && Number.isFinite(x) && x >= min && x <= max;
export function validConfig(value: unknown): value is AudioConfig {
  if (!value || typeof value !== "object") return false;
  const c = value as AudioConfig;
  return (
    (c.device === null ||
      (!!c.device &&
        typeof c.device.name === "string" &&
        typeof c.device.hostApi === "string")) &&
    !!c.instruments &&
    instruments.every((i) => {
      const s = c.instruments[i];
      return (
        !!s &&
        Array.isArray(s.channels) &&
        s.channels.length <= 32 &&
        new Set(s.channels).size === s.channels.length &&
        s.channels.every((n) => Number.isInteger(n) && n >= 1 && n <= 32) &&
        finite(s.sensitivity, 0.1, 10) &&
        finite(s.noiseDb, -90, -10) &&
        typeof s.pitch === "boolean"
      );
    })
  );
}
export function validPacket(value: unknown): value is AudioPacket {
  if (!value || typeof value !== "object") return false;
  const p = value as AudioPacket;
  return (
    p.v === 1 &&
    p.type === "features" &&
    typeof p.streamId === "string" &&
    p.streamId.length < 100 &&
    finite(p.sequence, 0, Number.MAX_SAFE_INTEGER) &&
    Number.isInteger(p.sequence) &&
    finite(p.timestamp, 0, Number.MAX_SAFE_INTEGER) &&
    finite(p.revision, 1, Number.MAX_SAFE_INTEGER) &&
    validConfig(p.config) &&
    typeof p.status === "string" &&
    typeof p.error === "string" &&
    typeof p.fresh === "boolean" &&
    p.sampleRate === 48000 &&
    Array.isArray(p.meters) &&
    p.meters.length === 32 &&
    p.meters.every(
      (m) =>
        !!m &&
        finite(m.rms, 0, 100) &&
        finite(m.peak, 0, 100) &&
        finite(m.db, -120, 100) &&
        typeof m.clip === "boolean",
    ) &&
    !!p.instruments &&
    instruments.every((i) => {
      const f = p.instruments[i];
      return (
        !!f &&
        finite(f.intensity, 0, 1) &&
        Array.isArray(f.bands) &&
        f.bands.length === 3 &&
        f.bands.every((n) => finite(n, 0, 1)) &&
        Array.isArray(f.spectrum) &&
        f.spectrum.length === 32 &&
        f.spectrum.every((n) => finite(n, 0, 1)) &&
        (f.pitch === null || finite(f.pitch, 0, 127)) &&
        finite(f.confidence, 0, 1) &&
        finite(f.centroid, 0, 24000)
      );
    }) &&
    Array.isArray(p.events) &&
    p.events.length <= 40 &&
    p.events.every(
      (e) =>
        !!e &&
        instruments.includes(e.instrument) &&
        finite(e.timestamp, 0, p.timestamp + 100) &&
        finite(e.intensity, 0, 1) &&
        [null, "kick", "snare", "hat"].includes(e.articulation),
    ) &&
    !!p.health &&
    finite(p.health.overflows, 0, Number.MAX_SAFE_INTEGER) &&
    finite(p.health.dropped, 0, Number.MAX_SAFE_INTEGER) &&
    finite(p.health.processingMs, 0, Number.MAX_SAFE_INTEGER)
  );
}
export interface TimedPacket {
  time: number;
  packet: AudioPacket;
  events: MusicEvent[];
}
export class AudioConnection {
  private listeners = new Set<() => void>();
  private socket?: WebSocket;
  private timer?: ReturnType<typeof setInterval>;
  private reconnect?: ReturnType<typeof setTimeout>;
  private users = 0;
  private backoff = 250;
  private offset: number | null = null;
  private sequence = -1;
  private stream = "";
  private received = 0;
  private published = 0;
  readonly history: TimedPacket[] = [];
  private snapshot = {
    connected: false,
    available: false,
    packet: null as AudioPacket | null,
    error: "",
  };
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  getSnapshot = () => this.snapshot;
  private publish(
    connected: boolean,
    available: boolean,
    packet = this.snapshot.packet,
    error = this.snapshot.error,
  ) {
    this.snapshot = { connected, available, packet, error };
    this.listeners.forEach((fn) => fn());
  }
  retain() {
    if (++this.users === 1) {
      this.open();
      this.timer = setInterval(() => {
        if (Date.now() - this.received > 500 && this.snapshot.available)
          this.publish(this.snapshot.connected, false);
        if (this.socket?.readyState === WebSocket.OPEN) {
          if (Date.now() - this.received > 3000) this.socket.close();
          else
            this.socket.send(
              JSON.stringify({ type: "ping", clientTime: Date.now() }),
            );
        }
      }, 250);
    }
    return () => {
      if (--this.users === 0) {
        clearInterval(this.timer);
        clearTimeout(this.reconnect);
        this.socket?.close();
        this.socket = undefined;
        this.history.length = 0;
        this.sequence = -1;
        this.offset = null;
        this.publish(false, false);
      }
    };
  }
  private open() {
    if (!this.users) return;
    const ws = new WebSocket(
      `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/ws`,
    );
    this.socket = ws;
    ws.onopen = () => {
      this.received = Date.now();
      this.publish(true, false, null, "");
      ws.send(JSON.stringify({ type: "ping", clientTime: Date.now() }));
    };
    ws.onmessage = (event) => {
      if (typeof event.data !== "string" || event.data.length > 100000) return;
      try {
        const value = JSON.parse(event.data);
        if (
          value?.v === 1 &&
          value.type === "pong" &&
          finite(value.clientTime, Date.now() - 5000, Date.now()) &&
          finite(value.timestamp, 0, Number.MAX_SAFE_INTEGER)
        ) {
          this.offset = (Date.now() + value.clientTime) / 2 - value.timestamp;
        } else if (validPacket(value)) this.accept(value, Date.now());
      } catch {
        /* Malformed data cannot affect the score. */
      }
    };
    ws.onclose = () => {
      if (this.socket !== ws) return;
      this.publish(
        false,
        false,
        this.snapshot.packet,
        "Audio service disconnected. Start the local service to reconnect.",
      );
      this.history.length = 0;
      this.offset = null;
      this.sequence = -1;
      if (this.users) {
        this.reconnect = setTimeout(() => this.open(), this.backoff);
        this.backoff = Math.min(5000, this.backoff * 2);
      }
    };
    ws.onerror = () => ws.close();
  }
  accept(packet: AudioPacket, received: number) {
    if (packet.streamId !== this.stream) {
      this.stream = packet.streamId;
      this.sequence = -1;
      this.history.length = 0;
    }
    if (packet.sequence <= this.sequence) return;
    this.sequence = packet.sequence;
    this.received = received;
    this.backoff = 250;
    const aligned =
      packet.timestamp +
      (this.offset ??
        received -
          packet.timestamp -
          Math.min(100, packet.health.processingMs));
    const time = Math.min(received, aligned);
    if (received - time > 500) {
      this.publish(true, false, packet, "Audio frames are delayed.");
      return;
    }
    if (this.history.at(-1)?.packet.revision !== packet.revision)
      this.history.length = 0;
    const previous = this.history[this.history.length - 1];
    const sampleTime = Math.max(time, previous?.time ?? 0);
    this.history.push({
      time: sampleTime,
      packet,
      events: packet.events.map((e) => ({
        instrument: e.instrument,
        timestamp: sampleTime - Math.max(0, packet.timestamp - e.timestamp),
        intensity: e.intensity,
        onset: true,
        pitch: packet.instruments[e.instrument].pitch ?? undefined,
        confidence: packet.instruments[e.instrument].confidence,
        articulation: e.articulation ?? undefined,
      })),
    });
    if (this.history.length > 250)
      this.history.splice(0, this.history.length - 250);
    const available =
      packet.fresh && ["connected", "fixture"].includes(packet.status);
    if (
      received - this.published >= 100 ||
      available !== this.snapshot.available ||
      packet.revision !== this.snapshot.packet?.revision
    ) {
      this.published = received;
      this.publish(true, available, packet, packet.error);
    }
  }
}
export const audio = new AudioConnection();

/** Every renderer has its own cursor; frame lookup never drains shared data. */
export class ConcertSource implements MusicSource {
  private demo = new DemoSource();
  private floor = 0;
  private mode = "";
  private pitches: Record<Instrument, number> = {
    vocals: 65,
    guitar: 72,
    drums: 60,
    bass: 39,
    piano: 65,
  };
  constructor(
    private session: Session,
    private connection = audio,
  ) {}
  private check(time: number) {
    if (this.mode !== this.session.state.mode) {
      this.mode = this.session.state.mode;
      this.floor = time;
    }
  }
  frame(
    time: number,
    section: Parameters<DemoSource["frame"]>[1],
    origin = 0,
  ): MusicalFrame {
    this.check(time);
    if (this.session.state.mode === "demo")
      return this.demo.frame(time, section, origin);
    let entry: TimedPacket | undefined;
    for (let n = this.connection.history.length - 1; n >= 0; n--) {
      const p = this.connection.history[n];
      if (p.time <= time && p.time >= this.floor) {
        entry = p;
        break;
      }
    }
    const usable =
      this.session.state.mode === "live" &&
      entry?.packet.fresh &&
      time - entry.time <= 500 &&
      this.connection.getSnapshot().available;
    return Object.fromEntries(
      instruments.map((i) => {
        const f = usable && entry ? entry.packet.instruments[i] : undefined;
        if (f?.pitch !== null && f?.pitch !== undefined && f.confidence >= 0.75)
          this.pitches[i] = f.pitch;
        const register =
          f && f.centroid > 0
            ? Math.max(36, Math.min(88, 69 + 12 * Math.log2(f.centroid / 440)))
            : this.pitches[i];
        return [
          i,
          {
            pitch:
              f?.pitch != null && f.confidence >= 0.75
                ? this.pitches[i]
                : register,
            intensity: f?.intensity ?? 0,
            bands: f?.bands,
            spectrum: f?.spectrum,
            confidence: f?.confidence,
          },
        ];
      }),
    ) as MusicalFrame;
  }
  events(
    from: number,
    to: number,
    section: Parameters<DemoSource["frame"]>[1],
    origin: number,
  ) {
    this.check(to);
    if (this.session.state.mode === "demo")
      return this.demo.events(from, to, section, origin);
    if (
      this.session.state.mode !== "live" ||
      !this.connection.getSnapshot().available
    )
      return [];
    return this.connection.history
      .flatMap((p) => p.events)
      .filter(
        (e) =>
          e.timestamp > Math.max(from, this.floor, to - 250) &&
          e.timestamp <= to,
      );
  }
}
