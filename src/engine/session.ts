import {
  instruments,
  MAX_CAPTION_LENGTH,
  scenes,
  sections,
  type SessionState,
  type CaptionCue,
} from "./types";
export interface Transport {
  send(message: unknown): void;
  subscribe(listener: (message: unknown) => void): () => void;
  close(): void;
}
export class BrowserTransport implements Transport {
  private channel = new BroadcastChannel("allium.session.v1");
  send(message: unknown) {
    this.channel.postMessage(message);
  }
  subscribe(listener: (message: unknown) => void) {
    const cb = (event: MessageEvent) => listener(event.data);
    this.channel.addEventListener("message", cb);
    return () => this.channel.removeEventListener("message", cb);
  }
  close() {
    this.channel.close();
  }
}
const initial = (): SessionState => ({
  playing: false,
  anchor: Date.now(),
  position: 0,
  section: "Quiet Section",
  sectionStart: 0,
  scene: "Ensemble",
  intensity: 0.65,
  particles: 0.6,
  motion: 0.65,
  captions: true,
  reduced:
    typeof matchMedia !== "undefined" &&
    matchMedia("(prefers-reduced-motion: reduce)").matches,
  channels: Object.fromEntries(
    instruments.map((i) => [i, { mute: false, solo: false }]),
  ) as SessionState["channels"],
  manual: null,
  captionMode: "demo",
});
export function validState(v: unknown): v is SessionState {
  if (!v || typeof v !== "object") return false;
  const s = v as SessionState;
  return (
    typeof s.playing === "boolean" &&
    Number.isFinite(s.anchor) &&
    Number.isFinite(s.position) &&
    s.position >= 0 &&
    Number.isFinite(s.sectionStart) &&
    s.sectionStart >= 0 &&
    scenes.includes(s.scene) &&
    sections.includes(s.section) &&
    ["intensity", "particles", "motion"].every(
      (k) =>
        Number.isFinite(s[k as "intensity"]) &&
        s[k as "intensity"] >= 0 &&
        s[k as "intensity"] <= 1,
    ) &&
    typeof s.captions === "boolean" &&
    typeof s.reduced === "boolean" &&
    !!s.channels &&
    instruments.every(
      (i) =>
        typeof s.channels[i]?.mute === "boolean" &&
        typeof s.channels[i]?.solo === "boolean",
    ) &&
    ["demo", "manual"].includes(s.captionMode) &&
    (s.manual === null ||
      (typeof s.manual?.text === "string" &&
        s.manual.text.length <= MAX_CAPTION_LENGTH &&
        typeof s.manual.speaker === "string" &&
        s.manual.speaker.length <= 80 &&
        ["lyrics", "speech", "sound"].includes(s.manual.category)))
  );
}
export class Session {
  state = initial();
  readonly id = Math.random().toString(36).slice(2);
  private listeners = new Set<() => void>();
  private transport?: Transport;
  private unsubscribe?: () => void;
  private timer?: ReturnType<typeof setInterval>;
  private revision = 0;
  private lastSource = "";
  private roles = new Map<
    string,
    { role: string; seen: number; claimed: number }
  >();
  private role = "viewer";
  private claimed = Date.now();
  status = { supported: true, displays: 0, operators: 0, locked: false };
  private snapshot = { state: this.state, status: this.status };
  constructor(shared = true, transport?: Transport) {
    if (!shared) return;
    try {
      this.transport = transport ?? new BrowserTransport();
      this.unsubscribe = this.transport.subscribe((m) => this.receive(m));
      this.send("hello");
      this.timer = setInterval(() => {
        this.send("heartbeat");
        this.refreshStatus();
      }, 1000);
    } catch {
      this.status = { ...this.status, supported: false };
      this.publish();
    }
  }
  time = () =>
    this.state.position +
    (this.state.playing ? Math.max(0, Date.now() - this.state.anchor) : 0);
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  getSnapshot = () => this.snapshot;
  private publish() {
    this.snapshot = { state: this.state, status: this.status };
    this.listeners.forEach((fn) => fn());
  }
  setRole(role: string) {
    this.role = role;
    this.claimed = Date.now();
    this.send("heartbeat");
    this.refreshStatus();
  }
  private send(kind: string, extra: object = {}) {
    this.transport?.send({
      v: 1,
      kind,
      source: this.id,
      role: this.role,
      claimed: this.claimed,
      ...extra,
    });
  }
  private refreshStatus() {
    const now = Date.now();
    for (const [key, peer] of this.roles)
      if (now - peer.seen > 3500) this.roles.delete(key);
    const operators = [...this.roles.entries()].filter(
      ([, p]) => p.role === "operator",
    );
    const candidates = [
      ...operators,
      ...(this.role === "operator"
        ? [
            [
              this.id,
              { role: this.role, seen: now, claimed: this.claimed },
            ] as const,
          ]
        : []),
    ].sort((a, b) => a[1].claimed - b[1].claimed || a[0].localeCompare(b[0]));
    this.status = {
      supported: this.status.supported,
      displays: [...this.roles.values()].filter((p) => p.role === "display")
        .length,
      operators: operators.length,
      locked: this.role === "operator" && candidates[0]?.[0] !== this.id,
    };
    this.publish();
  }
  private receive(value: unknown) {
    if (!value || typeof value !== "object") return;
    const m = value as Record<string, unknown>;
    if (
      m.v !== 1 ||
      typeof m.source !== "string" ||
      m.source === this.id ||
      typeof m.role !== "string" ||
      typeof m.claimed !== "number"
    )
      return;
    this.roles.set(m.source, {
      role: m.role,
      seen: Date.now(),
      claimed: m.claimed,
    });
    this.refreshStatus();
    if (m.kind === "hello")
      this.send("snapshot", {
        state: this.state,
        revision: this.revision,
        lastSource: this.lastSource,
      });
    if (
      (m.kind === "state" || m.kind === "snapshot") &&
      typeof m.revision === "number" &&
      validState(m.state)
    ) {
      const source = typeof m.lastSource === "string" ? m.lastSource : m.source;
      if (
        m.revision > this.revision ||
        (m.revision === this.revision && source > this.lastSource)
      ) {
        this.state = m.state;
        this.revision = m.revision;
        this.lastSource = source;
        this.publish();
      }
    }
  }
  update(patch: Partial<SessionState>) {
    if (this.status.locked) return;
    const state = { ...this.state, ...patch };
    if (!validState(state)) return;
    this.state = state;
    this.revision = Math.max(Date.now(), this.revision + 1);
    this.lastSource = this.id;
    this.publish();
    this.send("state", {
      state: this.state,
      revision: this.revision,
      lastSource: this.id,
    });
  }
  play(playing: boolean) {
    this.update({ position: this.time(), anchor: Date.now(), playing });
  }
  section(section: SessionState["section"]) {
    this.update({ section, sectionStart: this.time() });
  }
  cue(cue: Omit<CaptionCue, "id" | "start">) {
    this.update({
      manual: { ...cue, id: String(Date.now()), start: this.time() },
      captionMode: "manual",
    });
  }
  dispose() {
    clearInterval(this.timer);
    this.unsubscribe?.();
    this.send("bye");
    this.transport?.close();
    this.listeners.clear();
  }
}
export const concert = new Session();
