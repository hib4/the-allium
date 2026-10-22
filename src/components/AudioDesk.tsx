import { useEffect, useState, useSyncExternalStore } from "react";
import {
  audio,
  emptyConfig,
  migrateConfig,
  validConfig,
  type AudioConfig,
  type AudioDevice,
} from "../engine/audio";
import { concert, validState, upgradeState } from "../engine/session";
import { upgradeInstrumentMap } from "../engine/types";
import { useSession } from "./Score";

export function useAudio() {
  return useSyncExternalStore(audio.subscribe, audio.getSnapshot);
}
export function sourceLabel(
  mode: "demo" | "live" | "standby",
  playing: boolean,
  available: boolean,
  fixture: boolean,
) {
  return mode === "demo"
    ? `Demo ${playing ? "playing" : "paused"}`
    : mode === "standby"
      ? "Standby"
      : available
        ? fixture
          ? "Live · synthetic soundcheck"
          : "Live audio"
        : "Standby · waiting for live audio";
}
export function usbLabel(channel: number) {
  return `Input ${channel}`;
}
export function AudioDesk() {
  const { state, status } = useSession(concert);
  const connection = useAudio();
  const packet = connection.packet;
  const [config, setConfig] = useState<AudioConfig>(emptyConfig);
  const [revision, setRevision] = useState(1);
  const [dirty, setDirty] = useState(false);
  const [devices, setDevices] = useState<AudioDevice[]>([]);
  const [notice, setNotice] = useState("");
  const [deviceNotice, setDeviceNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  useEffect(() => {
    if (packet && !dirty) {
      setConfig(structuredClone(packet.config));
      setRevision(packet.revision);
    }
  }, [packet?.revision, packet?.streamId, dirty]);
  function edit(patch: Partial<AudioConfig>) {
    setConfig((c) => ({ ...c, ...patch }));
    setDirty(true);
  }
  async function refresh(selected = config.device) {
    setRefreshing(true);
    try {
      const query = selected ? `?${new URLSearchParams(selected)}` : "";
      const response = await fetch(`/api/devices${query}`, {
        signal: AbortSignal.timeout(5000),
      });
      const value = await response.json();
      setDevices(Array.isArray(value.devices) ? value.devices : []);
      setDeviceNotice(
        value.error ??
          (value.fixture
            ? "Synthetic mixed PCM soundcheck. No venue hardware is being captured."
            : "Choose a microphone or the USB input carrying the venue mix. Channel numbers describe device input positions."),
      );
    } catch {
      setDeviceNotice(
        "Audio service unavailable. Start the local service, then refresh devices. Demo remains available.",
      );
    } finally {
      setRefreshing(false);
    }
  }
  useEffect(() => {
    void refresh();
  }, []);
  async function apply() {
    setBusy(true);
    try {
      const response = await fetch("/api/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config, revision }),
        signal: AbortSignal.timeout(8000),
      });
      const value = await response.json();
      if (!response.ok || !validConfig(value.config))
        throw new Error(value.error || "Invalid service response.");
      setConfig(value.config);
      setRevision(value.revision);
      setDirty(false);
      setNotice(
        "Input settings saved. Capture reconnects using the selected format.",
      );
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "Settings could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  }
  function download(name: string, value: unknown) {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function restore(file?: File) {
    if (!file) return;
    try {
      if (file.size > 65536) throw new Error("Settings file is too large.");
      const value = JSON.parse(await file.text());
      const audioConfig = migrateConfig(value.audio);
      if (value.visual)
        value.visual.channels = upgradeInstrumentMap(value.visual.channels, {
          mute: true,
          solo: false,
        });
      const visual = upgradeState(value.visual);
      if (
        ![1, 2].includes(value.version) ||
        !audioConfig ||
        !validState(visual)
      )
        throw new Error("Invalid Allium settings file.");
      download("allium-before-restore.json", {
        version: 2,
        audio: packet?.config ?? config,
        visual: state,
      });
      // Legacy source remains in the user's original file and downloaded backup.
      setConfig({ ...audioConfig, device: null, channels: [] });
      setRevision(packet?.revision ?? revision);
      setDirty(true);
      concert.update({
        ...visual,
        mode: "standby",
        playing: false,
        manual: null,
        calibration: false,
      });
      setNotice(
        "Backup downloaded. Visual preferences restored. Select the mixed-input device and channels, then apply settings.",
      );
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "Cannot restore settings.",
      );
    }
  }
  const device = devices.find(
    (d) =>
      d.name === config.device?.name && d.hostApi === config.device?.hostApi,
  );
  const capacity = device?.channels ?? Math.max(2, ...config.channels);
  const selectedDevice = config.device ? JSON.stringify(config.device) : "";
  const rates = [
    ...new Set([
      ...(device?.checkedConfigurations.map((c) => c.sampleRate) ?? []),
      ...(device ? [device.sampleRate] : []),
      ...(typeof config.sampleRate === "number" ? [config.sampleRate] : []),
    ]),
  ].sort((a, b) => a - b);
  const disabled = status.locked || busy || !packet;
  return (
    <section className="audio-desk">
      <div className="panel-heading">
        <h2>Audio source</h2>
        <span>
          {connection.connected ? "SERVICE CONNECTED" : "SERVICE OFFLINE"}
        </span>
      </div>
      <div
        className="audio-modes"
        role="group"
        aria-label="Audio operating mode"
      >
        {(["demo", "live", "standby"] as const).map((mode) => (
          <button
            key={mode}
            disabled={status.locked}
            aria-pressed={state.mode === mode}
            onClick={() => concert.update({ mode })}
          >
            {mode[0].toUpperCase() + mode.slice(1)}
          </button>
        ))}
      </div>
      <div className="audio-save">
        <button
          className="button"
          disabled={status.locked || dirty}
          onClick={() => concert.update({ mode: "live" })}
        >
          Start Live
        </button>
        <button
          disabled={status.locked}
          onClick={() => concert.update({ mode: "standby", playing: false })}
        >
          Stop visualization
        </button>
      </div>
      <p className="audio-status" role="status">
        {sourceLabel(
          state.mode,
          state.playing,
          connection.available,
          packet?.status === "fixture",
        )}
        . {connection.error}
      </p>
      <p className="panel-note" role="status">
        {!connection.connected
          ? "Start the local audio service to connect."
          : !packet
            ? "Loading input settings…"
            : packet.status === "unconfigured"
              ? "Select a microphone or USB input, then choose its mono channel or stereo pair."
              : packet.status === "unavailable"
                ? "Check input permission, device availability and the selected format. The service retries this device automatically."
                : !connection.available
                  ? "Waiting for fresh input frames…"
                  : packet.mix.active
                    ? "Mixed input active. Live layers follow measured energy, spectral changes and transients."
                    : packet.mix.rms > 0.000001
                      ? "Input connected · below the noise threshold. Raw meters still show incoming audio."
                      : "Input connected · silence. Check the selected channel and source level. Silence alone does not indicate denied permission."}
      </p>
      <div className="audio-device">
        <label>
          Capture device
          <select
            aria-label="Capture device"
            value={selectedDevice}
            disabled={disabled}
            onChange={(e) => {
              const selected = e.target.value
                ? JSON.parse(e.target.value)
                : null;
              edit({ device: selected, channels: [], sampleRate: "auto" });
              void refresh(selected);
            }}
          >
            <option value="">No device selected</option>
            {config.device && !device && (
              <option value={selectedDevice}>
                {config.device.name} · unavailable
              </option>
            )}
            {devices.map((d) => (
              <option
                key={`${d.name}-${d.hostApi}-${d.id}`}
                value={JSON.stringify({ name: d.name, hostApi: d.hostApi })}
              >
                {d.name} · {d.hostApi} · {d.channels} inputs
              </option>
            ))}
          </select>
        </label>
        <button disabled={refreshing} onClick={() => void refresh()}>
          {refreshing ? "Refreshing…" : "Refresh devices"}
        </button>
      </div>
      <p className="panel-note" role="status">
        {deviceNotice}
      </p>
      <fieldset className="mix-inputs" disabled={disabled}>
        <legend>Mixed input configuration</legend>
        <label>
          Signal format
          <select
            aria-label="Signal format"
            value={config.channels.length === 2 ? "stereo" : "mono"}
            onChange={(e) =>
              edit({
                channels:
                  e.target.value === "stereo"
                    ? capacity >= 2
                      ? [
                          config.channels[0] ?? 1,
                          (config.channels[0] ?? 1) === 1 ? 2 : 1,
                        ]
                      : []
                    : [config.channels[0] ?? 1],
              })
            }
          >
            <option value="mono">Mono</option>
            <option value="stereo" disabled={capacity < 2}>
              Stereo
            </option>
          </select>
        </label>
        {Array.from(
          { length: config.channels.length === 2 ? 2 : 1 },
          (_, index) => (
            <label key={index}>
              {config.channels.length === 2
                ? index
                  ? "Right input"
                  : "Left input"
                : "Mono input"}
              <select
                aria-label={
                  config.channels.length === 2
                    ? index
                      ? "Right input"
                      : "Left input"
                    : "Mono input"
                }
                value={config.channels[index] ?? ""}
                onChange={(e) => {
                  const channels = [...config.channels];
                  channels[index] = Number(e.target.value);
                  edit({ channels });
                }}
              >
                <option value="" disabled>
                  Select input
                </option>
                {Array.from({ length: capacity }, (_, n) => n + 1).map((n) => (
                  <option key={n} value={n}>
                    {usbLabel(n)}
                  </option>
                ))}
              </select>
            </label>
          ),
        )}
        <label>
          Sample rate
          <select
            aria-label="Sample rate"
            value={config.sampleRate}
            onChange={(e) =>
              edit({
                sampleRate:
                  e.target.value === "auto" ? "auto" : Number(e.target.value),
              })
            }
          >
            <option value="auto">Auto · prefer device default</option>
            {rates.map((r) => (
              <option key={r} value={r}>
                {r.toLocaleString()} Hz
              </option>
            ))}
          </select>
        </label>
        <label>
          Sensitivity
          <input
            aria-label="Audio sensitivity"
            type="number"
            min="0.1"
            max="10"
            step="0.1"
            value={config.sensitivity}
            onChange={(e) => edit({ sensitivity: Number(e.target.value) })}
          />
        </label>
        <label>
          Noise threshold (dBFS)
          <input
            aria-label="Noise threshold"
            type="number"
            min="-90"
            max="-10"
            value={config.noiseDb}
            onChange={(e) => edit({ noiseDb: Number(e.target.value) })}
          />
        </label>
      </fieldset>
      {device && (
        <p className="panel-note">
          Device reports {device.channels} inputs; default{" "}
          {device.sampleRate.toLocaleString()} Hz. Checked formats:{" "}
          {device.checkedConfigurations
            .map(
              (c) => `${c.channels} ch / ${c.sampleRate.toLocaleString()} Hz`,
            )
            .join(", ") || "none"}
          . The exact selection is checked on Apply.
        </p>
      )}
      <div className="audio-save">
        <button
          className="button"
          disabled={
            disabled || !dirty || !connection.connected || !validConfig(config)
          }
          onClick={() => void apply()}
        >
          {busy ? "Saving…" : "Apply input settings"}
        </button>
        <button
          disabled={!dirty || busy}
          onClick={() => {
            setConfig(packet ? structuredClone(packet.config) : emptyConfig());
            setRevision(packet?.revision ?? revision);
            setDirty(false);
          }}
        >
          Discard edits
        </button>
      </div>
      <p className="form-notice" role="status">
        {dirty ? "Unsaved input settings. " : ""}
        {notice}
      </p>
      <div className="usb-meters" aria-label="Selected input meters">
        {(packet?.config.channels ?? []).map((channel, i) => {
          const m = connection.available ? packet?.meters[i] : undefined;
          return (
            <div key={channel}>
              <span>
                {usbLabel(channel)}
                {packet?.config.channels.length === 2
                  ? i
                    ? " · R"
                    : " · L"
                  : " · Mono"}
              </span>
              <meter
                min="-90"
                max="0"
                value={Math.max(-90, m?.db ?? -90)}
                aria-label={`${usbLabel(channel)} level dBFS`}
              />
              <span
                className="raw-meter-values"
                aria-label={`${usbLabel(channel)} raw levels`}
              >
                {m ? (
                  <>
                    RMS {m.db.toFixed(1)} dBFS
                    <br />
                    Peak{" "}
                    {Math.max(
                      -120,
                      20 * Math.log10(Math.max(m.peak, 1e-6)),
                    ).toFixed(1)}{" "}
                    dBFS
                  </>
                ) : (
                  "—"
                )}
              </span>
              <strong>{m?.clip ? "CLIP" : ""}</strong>
            </div>
          );
        })}
      </div>
      <p className="panel-note">
        Raw meters show input before sensitivity and the noise threshold. A low
        signal can move these meters while Live layers stay quiet.
      </p>
      <p className="panel-note" aria-label="Capture diagnostics">
        Selected input:{" "}
        {packet?.config.device
          ? `${packet.config.device.name} · ${packet.config.device.hostApi}`
          : "none"}
        . Requested rate:{" "}
        {packet?.config.sampleRate === "auto"
          ? "Auto"
          : packet
            ? `${packet.config.sampleRate.toLocaleString()} Hz`
            : "—"}
        .{" "}
        {packet?.actual
          ? `Actual capture: ${packet.actual.sampleRate.toLocaleString()} Hz · ${packet.actual.captureChannels} inputs opened · analyzing ${packet.actual.channels.join(" / ")}.`
          : "No active capture format."}{" "}
        {packet
          ? `Overflows: ${packet.health.overflows}. Dropped blocks: ${packet.health.dropped}. Processing age: ${packet.health.processingMs.toFixed(0)} ms.`
          : ""}{" "}
        Frames: {connection.available ? "fresh" : "waiting / stale"}. Capture
        age:{" "}
        {packet?.health.captureAgeMs != null
          ? `${packet.health.captureAgeMs.toFixed(0)} ms`
          : "unavailable"}
        .
      </p>
      <details className="usb-meter-panel">
        <summary>Settings backup and troubleshooting</summary>
        <div className="audio-save">
          <button
            disabled={status.locked || !packet || dirty}
            onClick={() =>
              download("allium-settings.json", {
                version: 2,
                audio: config,
                visual: state,
              })
            }
          >
            Export settings
          </button>
          <label>
            Restore settings{" "}
            <input
              type="file"
              accept=".json,application/json"
              disabled={disabled}
              onChange={(e) => {
                void restore(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </label>
          <button
            onClick={() =>
              download("allium-diagnostics.json", {
                version: 2,
                date: new Date().toISOString(),
                connected: connection.connected,
                error: connection.error,
                status: packet?.status,
                actual: packet?.actual,
                health: packet?.health,
                config: packet?.config,
                devices,
                browser: navigator.userAgent,
              })
            }
          >
            Export diagnostics
          </button>
        </div>
        <p className="panel-note">
          On macOS, allow microphone access for the app or terminal running
          Python. Activity in System Settings does not establish access for this
          service. For local testing, explicitly select MacBook Pro Microphone,
          Mono, Input 1 and Auto. For venue use, select the USB mix and confirm
          its channels.
        </p>
        <p className="panel-note">
          Silence and missing input never start Demo. Standby stops reactive
          visuals while capture continues; Start Live resumes without restarting
          the service. When an input becomes available again, the service
          retries that selected device. Clipping must be corrected at the
          source.
        </p>
        <p className="panel-note">
          <a
            href="/guide/Panduan-Operator.html"
            target="_blank"
            rel="noopener noreferrer"
          >
            Panduan operator · Bahasa Indonesia
          </a>
        </p>
      </details>
    </section>
  );
}
