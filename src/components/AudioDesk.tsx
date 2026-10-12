import { useEffect, useState, useSyncExternalStore } from "react";
import {
  audio,
  emptyConfig,
  validConfig,
  type AudioConfig,
  type AudioDevice,
} from "../engine/audio";
import { concert, validState } from "../engine/session";
import { instruments, colors, type Instrument } from "../engine/types";
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
  return channel <= 2
    ? `USB ${channel} · Master ${channel === 1 ? "L" : "R"}`
    : channel <= 10
      ? `USB ${channel} · AUX ${channel - 2}`
      : `USB ${channel} · Input ${channel - 10}`;
}
export function AudioDesk() {
  const { state, status } = useSession(concert);
  const connection = useAudio();
  const [config, setConfig] = useState<AudioConfig>(emptyConfig);
  const [revision, setRevision] = useState(1);
  const [dirty, setDirty] = useState(false);
  const [devices, setDevices] = useState<AudioDevice[]>([]);
  const [notice, setNotice] = useState("");
  const [deviceNotice, setDeviceNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const packet = connection.packet;
  useEffect(() => {
    if (packet && !dirty) {
      setConfig(structuredClone(packet.config));
      setRevision(packet.revision);
    }
  }, [packet?.revision, packet?.streamId, dirty]);
  async function refresh() {
    setRefreshing(true);
    try {
      const response = await fetch("/api/devices", {
        signal: AbortSignal.timeout(5000),
      });
      const value = await response.json();
      setDevices(Array.isArray(value.devices) ? value.devices : []);
      setDeviceNotice(
        value.error ??
          (value.fixture
            ? "Synthetic PCM soundcheck. These signals are not from the mixer."
            : "Devices refreshed. Choose the 32-input Ui24R device."),
      );
    } catch {
      setDeviceNotice(
        "Audio service unavailable. Demo still works. Start the service, then refresh devices.",
      );
    } finally {
      setRefreshing(false);
    }
  }
  useEffect(() => {
    void refresh();
  }, []);
  const edit = (
    i: Instrument,
    patch: Partial<AudioConfig["instruments"][Instrument]>,
  ) => {
    setConfig((c) => ({
      ...c,
      instruments: { ...c.instruments, [i]: { ...c.instruments[i], ...patch } },
    }));
    setDirty(true);
  };
  async function apply() {
    setBusy(true);
    try {
      const response = await fetch("/api/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config, revision }),
        signal: AbortSignal.timeout(5000),
      });
      const value = await response.json();
      if (!response.ok || !validConfig(value.config))
        throw new Error(value.error ?? "Invalid service response.");
      setConfig(value.config);
      setRevision(value.revision);
      setDirty(false);
      setNotice(
        "Input settings saved. Only the visuals use these assignments.",
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
      if (
        value.version !== 1 ||
        !validConfig(value.audio) ||
        !validState(value.visual)
      )
        throw new Error("Invalid Allium settings file.");
      download("allium-before-restore.json", {
        version: 1,
        audio: packet?.config ?? config,
        visual: state,
      });
      setConfig({ ...value.audio, device: null });
      setRevision(packet?.revision ?? revision);
      setDirty(true);
      concert.update({
        ...value.visual,
        mode: "standby",
        playing: false,
        manual: null,
      });
      setNotice(
        "Backup downloaded. Restored assignments are unsaved. Select and confirm the capture device, then apply settings.",
      );
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "Cannot restore settings.",
      );
    }
  }
  const overlaps = Array.from({ length: 32 }, (_, index) => index + 1).filter(
    (c) =>
      instruments.filter((i) => config.instruments[i].channels.includes(c))
        .length > 1,
  );
  const selectedDevice = config.device ? JSON.stringify(config.device) : "";
  const selectable = devices.filter((d) => d.channels >= 32);
  if (
    config.device &&
    !selectable.some(
      (d) =>
        d.name === config.device?.name && d.hostApi === config.device?.hostApi,
    )
  )
    selectable.unshift({
      ...config.device,
      id: -1,
      channels: 32,
      sampleRate: 48000,
    });
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
          ? "Waiting for the local audio service. Open Start The Allium; Demo remains available."
          : !packet
            ? "Loading input settings…"
            : packet.status === "unconfigured"
              ? "No capture device selected. Choose the Ui24R and apply input settings."
              : packet.status === "unavailable"
                ? "Capture device unavailable. Check USB-B, permissions and driver, then refresh devices."
                : !instruments.some(
                      (i) => packet.config.instruments[i].channels.length,
                    )
                  ? "Input service ready. No instruments assigned yet; use the USB meters to identify channels."
                  : connection.available &&
                      packet.meters.every((m) => m.peak < 0.0001)
                    ? "Input connected; waiting for an audible signal. Check the USB meters during soundcheck."
                    : "Input settings loaded. Confirm each instrument separately before presenting."}
      </p>
      <div className="audio-device">
        <label>
          Capture device
          <select
            aria-label="Capture device"
            value={selectedDevice}
            disabled={status.locked || busy || !packet}
            onChange={(e) => {
              setConfig((c) => ({
                ...c,
                device: e.target.value ? JSON.parse(e.target.value) : null,
              }));
              setDirty(true);
            }}
          >
            <option value="">No device selected</option>
            {selectable.map((d) => (
              <option
                key={`${d.name}-${d.hostApi}`}
                value={JSON.stringify({ name: d.name, hostApi: d.hostApi })}
              >
                {d.name} · {d.hostApi}
                {d.id === -1 ? " · unavailable" : ""}
              </option>
            ))}
          </select>
        </label>
        <button disabled={refreshing} onClick={() => void refresh()}>
          {refreshing ? "Refreshing…" : "Refresh devices"}
        </button>
      </div>
      <p className="panel-note">
        48 kHz · 32 USB inputs. USB 1–2: master; 3–10: AUX; 11–32: mixer inputs
        1–22. Instrument assignments must be confirmed at soundcheck.
      </p>
      <p className="panel-note" role="status">
        {deviceNotice}
      </p>
      {instruments.map((i) => (
        <details className="audio-mapping" key={i}>
          <summary style={{ color: colors[i] }}>
            {i}
            <span>
              {config.instruments[i].channels.length
                ? config.instruments[i].channels
                    .map((c) => `USB ${c}`)
                    .join(", ")
                : "Unmapped"}
            </span>
          </summary>
          <fieldset disabled={status.locked || busy || !packet}>
            <legend>{i} input assignments</legend>
            <div className="usb-selection">
              {Array.from({ length: 32 }, (_, n) => n + 1).map((c) => (
                <label key={c}>
                  <input
                    type="checkbox"
                    checked={config.instruments[i].channels.includes(c)}
                    onChange={(e) =>
                      edit(i, {
                        channels: e.target.checked
                          ? [...config.instruments[i].channels, c].sort(
                              (a, b) => a - b,
                            )
                          : config.instruments[i].channels.filter(
                              (n) => n !== c,
                            ),
                      })
                    }
                  />
                  {usbLabel(c)}
                </label>
              ))}
            </div>
            <div className="audio-adjustments">
              <label>
                Sensitivity
                <input
                  aria-label={`${i} sensitivity`}
                  type="number"
                  min="0.1"
                  max="10"
                  step="0.1"
                  value={config.instruments[i].sensitivity}
                  onChange={(e) =>
                    edit(i, { sensitivity: Number(e.target.value) })
                  }
                />
              </label>
              <label>
                Noise threshold (dBFS)
                <input
                  aria-label={`${i} noise threshold`}
                  type="number"
                  min="-90"
                  max="-10"
                  step="1"
                  value={config.instruments[i].noiseDb}
                  onChange={(e) => edit(i, { noiseDb: Number(e.target.value) })}
                />
              </label>
            </div>
            {["vocals", "guitar", "bass"].includes(i) && (
              <label className="pitch-setting">
                <input
                  type="checkbox"
                  checked={config.instruments[i].pitch}
                  onChange={(e) => edit(i, { pitch: e.target.checked })}
                />
                Estimate monophonic pitch
              </label>
            )}
          </fieldset>
        </details>
      ))}
      {overlaps.length > 0 && (
        <p className="panel-note">
          Shared assignments: {overlaps.map((c) => `USB ${c}`).join(", ")}. Each
          assigned instrument responds to the same signal.
        </p>
      )}
      <div className="audio-save">
        <button
          className="button"
          disabled={
            status.locked ||
            busy ||
            !dirty ||
            !connection.connected ||
            !validConfig(config)
          }
          onClick={() => void apply()}
        >
          {busy ? "Saving…" : "Apply input settings"}
        </button>
        <button
          disabled={!dirty || busy}
          onClick={() => {
            if (packet) {
              setConfig(structuredClone(packet.config));
              setRevision(packet.revision);
            } else setConfig(emptyConfig());
            setDirty(false);
          }}
        >
          Discard edits
        </button>
      </div>
      <p className="form-notice" role="status">
        {dirty ? "Unsaved assignments. Apply to update the live score. " : ""}
        {notice}
      </p>
      <details className="usb-meter-panel">
        <summary>Settings backup and troubleshooting</summary>
        <div className="audio-save">
          <button
            disabled={status.locked || !packet}
            onClick={() =>
              download("allium-settings.json", {
                version: 1,
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
              disabled={status.locked || busy || !packet}
              onChange={(e) => {
                void restore(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </label>
          <button
            onClick={() =>
              download("allium-diagnostics.json", {
                version: "1.1.0-rc.2",
                date: new Date().toISOString(),
                connected: connection.connected,
                error: connection.error,
                inputStatus: packet?.status,
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
          Service offline: open Start The Allium. Device unavailable: check
          USB-B and the mixer, install the Windows Soundcraft driver, then
          refresh devices. Choose the 32-input CoreAudio or ASIO device.
        </p>
        <p className="panel-note">
          No visualization: inspect USB meters, assign active channels, apply
          settings, then Start Live. Silent or disconnected Live input stays in
          standby; Demo requires your selection. Stop visualization affects the
          screen; use Stop The Allium to close the capture service.
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
      <details className="usb-meter-panel">
        <summary>
          All USB input meters{" "}
          {packet?.status === "fixture" ? "· synthetic soundcheck" : ""}
        </summary>
        <div className="usb-meters">
          {Array.from({ length: 32 }, (_, n) => n + 1).map((c) => {
            const m = connection.available ? packet?.meters[c - 1] : undefined;
            return (
              <div key={c}>
                <span>{usbLabel(c)}</span>
                <meter
                  min="-90"
                  max="0"
                  value={Math.max(-90, m?.db ?? -90)}
                  aria-label={`${usbLabel(c)} level dBFS`}
                />
                <span>{m ? `${m.db.toFixed(0)} dBFS` : "—"}</span>
                <strong>{m?.clip ? "CLIP" : ""}</strong>
              </div>
            );
          })}
        </div>
      </details>
      <p className="panel-note">
        {packet
          ? `Input: ${packet.status}. Overflows: ${packet.health.overflows}. Dropped blocks: ${packet.health.dropped}. Processing age: ${packet.health.processingMs.toFixed(0)} ms.`
          : "Live meters become available when the service receives audio."}
      </p>
    </section>
  );
}
