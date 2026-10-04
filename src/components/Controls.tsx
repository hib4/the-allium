import { useId } from "react";
import { scenes, sections, type Scene } from "../engine/types";
import type { Session } from "../engine/session";
import { useSession } from "./Score";
export function Arrow({ diagonal = false }: { diagonal?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden="true"
    >
      <path d={diagonal ? "M6 18L18 6M6 6h12v12" : "M4 12h16M13 5l7 7-7 7"} />
    </svg>
  );
}
export function PlayIcon({ playing }: { playing: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden="true"
    >
      {playing ? <path d="M8 5v14M16 5v14" /> : <path d="M8 5l11 7-11 7z" />}
    </svg>
  );
}
export function Toggle({
  label,
  checked,
  onChange,
  disabled = false,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className="toggle">
      <span>{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
      />
      <span className="toggle-track" aria-hidden="true" />
    </label>
  );
}
export function Slider({
  label,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <label className="slider" htmlFor={id}>
      <span>
        {label}
        <output aria-hidden="true">{Math.round(value * 100)}%</output>
      </span>
      <input
        id={id}
        aria-label={label}
        type="range"
        min="0"
        max="100"
        step="1"
        value={Math.round(value * 100)}
        onChange={(e) => onChange(Number(e.target.value) / 100)}
        disabled={disabled}
      />
    </label>
  );
}
export function ScenePicker({ session }: { session: Session }) {
  const { state, status } = useSession(session);
  return (
    <div className="scene-picker" role="group" aria-label="Visual scene">
      {scenes.map((scene) => (
        <button
          key={scene}
          aria-pressed={state.scene === scene}
          disabled={status.locked}
          onClick={() => session.update({ scene: scene as Scene })}
        >
          {scene}
        </button>
      ))}
    </div>
  );
}
export function DemoControls({ session }: { session: Session }) {
  const { state, status } = useSession(session);
  return (
    <div className="demo-controls">
      <button
        className="button primary play-button"
        disabled={status.locked}
        onClick={() => session.play(!state.playing)}
      >
        <PlayIcon playing={state.playing} />
        {state.playing ? "Pause" : "Play demo"}
      </button>
      <label className="section-select">
        Musical section
        <select
          value={state.section}
          disabled={status.locked}
          onChange={(e) =>
            session.section(e.target.value as typeof state.section)
          }
        >
          {sections.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </label>
    </div>
  );
}
