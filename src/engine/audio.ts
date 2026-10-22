import { instruments } from "./types";
import { DemoSource, type MusicSource, type MusicalFrame } from "./source";
import type { Session } from "./session";

export interface AudioConfig {
  version: 2;
  device: { name: string; hostApi: string } | null;
  channels: number[];
  sampleRate: "auto" | number;
  sensitivity: number;
  noiseDb: number;
}
export interface AudioDevice {
  id: number;
  name: string;
  hostApi: string;
  channels: number;
  sampleRate: number;
  checkedConfigurations: { channels: number; sampleRate: number }[];
}
export interface Meter {
  rms: number;
  peak: number;
  db: number;
  clip: boolean;
}
export interface MixFeature {
  rms: number;
  peak: number;
  active: boolean;
  intensity: number;
  bands: number[];
  spectrum: number[];
  centroid: number;
  flux: number;
  shortEnergy: number;
  longEnergy: number;
  dynamics: number;
}
export interface MixEvent {
  timestamp: number;
  intensity: number;
}
export interface AudioPacket {
  v: 2;
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
  actual: {
    sampleRate: number;
    captureChannels: number;
    channels: number[];
  } | null;
  meters: Meter[];
  mix: MixFeature;
  events: MixEvent[];
  health: {
    overflows: number;
    dropped: number;
    processingMs: number;
    captureAgeMs?: number | null;
  };
}
export const emptyConfig = (): AudioConfig => ({
  version: 2,
  device: null,
  channels: [],
  sampleRate: "auto",
  sensitivity: 1,
  noiseDb: -60,
});
export function migrateConfig(value: unknown): AudioConfig | null {
  if (validConfig(value)) return structuredClone(value);
  if (
    value &&
    typeof value === "object" &&
    "instruments" in value &&
    "device" in value
  )
    return emptyConfig();
  return null;
}
const finite = (x: unknown, min: number, max: number): x is number =>
  typeof x === "number" && Number.isFinite(x) && x >= min && x <= max;
export function validConfig(value: unknown): value is AudioConfig {
  if (!value || typeof value !== "object") return false;
  const c = value as AudioConfig;
  return (
    c.version === 2 &&
    (c.device === null ||
      (!!c.device &&
        typeof c.device.name === "string" &&
        c.device.name.length > 0 &&
        c.device.name.length <= 200 &&
        typeof c.device.hostApi === "string" &&
        c.device.hostApi.length > 0 &&
        c.device.hostApi.length <= 200)) &&
    Array.isArray(c.channels) &&
    c.channels.length <= 2 &&
    (!c.device || c.channels.length > 0) &&
    new Set(c.channels).size === c.channels.length &&
    c.channels.every((n) => Number.isInteger(n) && n >= 1 && n <= 256) &&
    (c.sampleRate === "auto" ||
      (finite(c.sampleRate, 8000, 192000) && Number.isInteger(c.sampleRate))) &&
    finite(c.sensitivity, 0.1, 10) &&
    finite(c.noiseDb, -90, -10)
  );
}
export function validPacket(value: unknown): value is AudioPacket {
  if (!value || typeof value !== "object") return false;
  const p = value as AudioPacket;
  const f = p.mix;
  return (
    p.v === 2 &&
    p.type === "features" &&
    typeof p.streamId === "string" &&
    p.streamId.length < 100 &&
    finite(p.sequence, 0, Number.MAX_SAFE_INTEGER) &&
    Number.isInteger(p.sequence) &&
    finite(p.timestamp, 0, Number.MAX_SAFE_INTEGER) &&
    finite(p.revision, 1, Number.MAX_SAFE_INTEGER) &&
    Number.isInteger(p.revision) &&
    validConfig(p.config) &&
    [
      "unconfigured",
      "connecting",
      "connected",
      "unavailable",
      "fixture",
    ].includes(p.status) &&
    typeof p.error === "string" &&
    typeof p.fresh === "boolean" &&
    finite(p.sampleRate, 8000, 192000) &&
    (p.actual === null ||
      (!!p.actual &&
        p.actual.sampleRate === p.sampleRate &&
        Number.isInteger(p.actual.captureChannels) &&
        finite(p.actual.captureChannels, 1, 256) &&
        Array.isArray(p.actual.channels) &&
        p.actual.channels.length === p.config.channels.length &&
        p.actual.channels.every(
          (n, i) =>
            n === p.config.channels[i] && n <= p.actual!.captureChannels,
        ))) &&
    (!p.fresh || (!!p.actual && ["connected", "fixture"].includes(p.status))) &&
    Array.isArray(p.meters) &&
    p.meters.length === Math.max(1, p.config.channels.length) &&
    p.meters.every(
      (m) =>
        !!m &&
        finite(m.rms, 0, 100) &&
        finite(m.peak, 0, 100) &&
        finite(m.db, -120, 100) &&
        typeof m.clip === "boolean",
    ) &&
    !!f &&
    finite(f.rms, 0, 100) &&
    finite(f.peak, 0, 100) &&
    typeof f.active === "boolean" &&
    finite(f.intensity, 0, 1) &&
    Array.isArray(f.bands) &&
    f.bands.length === 3 &&
    f.bands.every((n) => finite(n, 0, 1)) &&
    Array.isArray(f.spectrum) &&
    f.spectrum.length === 32 &&
    f.spectrum.every((n) => finite(n, 0, 1)) &&
    finite(f.centroid, 0, p.sampleRate / 2) &&
    finite(f.flux, 0, 1) &&
    finite(f.shortEnergy, 0, 1) &&
    finite(f.longEnergy, 0, 1) &&
    finite(f.dynamics, -1, 1) &&
    Array.isArray(p.events) &&
    p.events.length <= 8 &&
    p.events.every(
      (e) =>
        !!e &&
        finite(e.timestamp, 0, p.timestamp + 100) &&
        finite(e.intensity, 0, 1),
    ) &&
    !!p.health &&
    (p.health.captureAgeMs === undefined ||
      p.health.captureAgeMs === null ||
      finite(p.health.captureAgeMs, 0, Number.MAX_SAFE_INTEGER)) &&
    [p.health.overflows, p.health.dropped, p.health.processingMs].every((n) =>
      finite(n, 0, Number.MAX_SAFE_INTEGER),
    )
  );
}
export interface TimedPacket {
  time: number;
  packet: AudioPacket;
  events: MixEvent[];
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
          value?.v === 2 &&
          value.type === "pong" &&
          finite(value.clientTime, Date.now() - 5000, Date.now()) &&
          finite(value.timestamp, 0, Number.MAX_SAFE_INTEGER)
        ) {
          this.offset = (Date.now() + value.clientTime) / 2 - value.timestamp;
        } else if (validPacket(value)) this.accept(value, Date.now());
        else if (value?.type === "features") {
          this.history.length = 0;
          this.publish(
            true,
            false,
            null,
            "Incompatible audio frames. Restart the service and reload both tabs from the same Allium version.",
          );
        }
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
      this.offset = null;
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
      events: packet.fresh
        ? packet.events.map((e) => ({
            timestamp: sampleTime - Math.max(0, packet.timestamp - e.timestamp),
            intensity: e.intensity,
          }))
        : [],
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

/** Every display has its own mode boundary; shared history is never drained. */
export class ConcertSource implements MusicSource {
  private demo = new DemoSource();
  private floor = 0;
  private mode = "";
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
    return Object.fromEntries(
      instruments.map((i) => [i, { pitch: 60, intensity: 0 }]),
    ) as MusicalFrame;
  }
  events(
    from: number,
    to: number,
    section: Parameters<DemoSource["frame"]>[1],
    origin: number,
  ) {
    this.check(to);
    return this.session.state.mode === "demo"
      ? this.demo.events(from, to, section, origin)
      : [];
  }
  mixed(time: number, from: number) {
    this.check(time);
    if (
      this.session.state.mode !== "live" ||
      !this.connection.getSnapshot().available
    )
      return null;
    const entry = [...this.connection.history]
      .reverse()
      .find((p) => p.time <= time && p.time >= this.floor);
    if (!entry?.packet.fresh || time - entry.time > 500) return null;
    return {
      feature: entry.packet.mix,
      events: this.connection.history
        .filter((p) => p.packet.fresh && p.time >= this.floor)
        .flatMap((p) => p.events)
        .filter(
          (e) =>
            e.timestamp > Math.max(from, this.floor, time - 250) &&
            e.timestamp <= time,
        ),
    };
  }
}
