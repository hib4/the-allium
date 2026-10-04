import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ScoreRenderer, type RenderOptions } from "../engine/renderer";
import { Session } from "../engine/session";
import { demoCaption } from "../engine/music";
import { instruments, colors, type Instrument } from "../engine/types";
export function useSession(session: Session) {
  return useSyncExternalStore(session.subscribe, session.getSnapshot);
}
export function useTime(session: Session, interval = 150) {
  const [time, setTime] = useState(session.time());
  useEffect(() => {
    const id = setInterval(() => setTime(session.time()), interval);
    return () => clearInterval(id);
  }, [session, interval]);
  return time;
}
export function Score({
  session,
  instrument,
  highContrast = false,
  className = "",
  labels = false,
  profile = "concert",
}: { session: Session; className?: string; labels?: boolean } & RenderOptions) {
  const host = useRef<HTMLDivElement>(null);
  const renderer = useRef<ScoreRenderer | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    const instance = new ScoreRenderer(host.current!, session, {
      instrument,
      highContrast,
      profile,
    });
    renderer.current = instance;
    const fail = () => setFailed(true);
    host.current!.addEventListener("scorefailure", fail);
    void instance.initialize().catch(() => {
      if (active) setFailed(true);
    });
    return () => {
      active = false;
      host.current?.removeEventListener("scorefailure", fail);
      instance.dispose();
    };
  }, [session]);
  useEffect(
    () => renderer.current?.options({ instrument, highContrast, profile }),
    [instrument, highContrast, profile],
  );
  return (
    <div className={`score ${className}`}>
      <div className="score-renderer" ref={host} aria-hidden="true" />
      {failed && (
        <div className="score-fallback">
          <svg viewBox="0 0 800 240" aria-hidden="true">
            <path
              d="M0 120 Q200 20 400 120 T800 120"
              fill="none"
              stroke="#FFC6E8"
              strokeWidth="6"
            />
            <path
              d="M0 170 L130 110 270 180 400 70 530 140 680 70 800 140"
              fill="none"
              stroke="#6EB4FF"
              strokeWidth="3"
            />
          </svg>
          <p>
            Animated score unavailable. Captions and controls remain available.
          </p>
        </div>
      )}
      <span className="sr-only">
        {instrument
          ? `${instrument} visual score`
          : "Visual score: ribbons for vocals, angular paths for guitar, rings for drums, grounded waves for bass, diamonds for piano."}
      </span>
      {labels && (
        <div className="score-labels" aria-hidden="true">
          <span className="vocal-label">VOCAL RIBBON</span>
          <span className="guitar-label">GUITAR PATH</span>
          <span className="bass-label">BASS WAVE</span>
        </div>
      )}
    </div>
  );
}
export function Captions({
  session,
  compact = false,
}: {
  session: Session;
  compact?: boolean;
}) {
  const { state } = useSession(session);
  const time = useTime(session, 200);
  const cue =
    state.captionMode === "manual"
      ? state.manual
      : demoCaption(time, state.section);
  return (
    <div
      className={`captions ${compact ? "compact" : ""} ${!state.captions ? "captions-off" : ""}`}
    >
      <div className="caption-content" aria-live="polite" aria-atomic="true">
        {state.captions && cue ? (
          <>
            <span className="caption-speaker">
              {cue.speaker || "SOUND"}
              <span>
                {state.captionMode === "demo" ? " · SAMPLE CAPTION" : ""}
              </span>
            </span>
            <p>{cue.category === "lyrics" ? `“${cue.text}”` : cue.text}</p>
          </>
        ) : (
          <>
            <span className="caption-speaker">
              {state.captions ? "CAPTIONS READY" : "CAPTIONS OFF"}
            </span>
            <p className="caption-rest">
              {state.captions
                ? "A little space between the words."
                : "Enable captions in the controls."}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
export function InstrumentGlyph({ instrument }: { instrument: Instrument }) {
  return (
    <svg
      className="instrument-glyph"
      viewBox="0 0 48 32"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      {instrument === "vocals" ? (
        <>
          <path d="M1 20C10 3 19 3 25 16S39 30 47 11" />
          <path d="M1 24C10 7 19 7 25 20S39 34 47 15" opacity=".45" />
        </>
      ) : instrument === "guitar" ? (
        <>
          <path d="M1 24L12 8 22 19 31 4 39 18 47 9" />
          <path d="M1 29L12 13 22 24 31 9 39 23 47 14" opacity=".45" />
        </>
      ) : instrument === "drums" ? (
        <>
          <circle cx="24" cy="16" r="9" />
          <circle cx="24" cy="16" r="14" opacity=".4" />
          <path d="M24 0v5M24 27v5M8 16H3M40 16h5" />
        </>
      ) : instrument === "bass" ? (
        <>
          <path d="M1 13Q13 3 24 13T47 13M1 20Q13 10 24 20T47 20M1 27Q13 17 24 27T47 27" />
        </>
      ) : (
        <>
          <path d="M8 8l5 5-5 5-5-5zM25 2l5 5-5 5-5-5zM40 13l5 5-5 5-5-5zM8 22v9M25 16v9M40 27v5" />
        </>
      )}
    </svg>
  );
}
export function Legend({
  selected,
  onSelect,
}: {
  selected?: Instrument | "all";
  onSelect?: (instrument: Instrument | "all") => void;
}) {
  return (
    <div className="legend">
      {onSelect && (
        <button
          aria-pressed={selected === "all"}
          onClick={() => onSelect("all")}
        >
          All instruments
        </button>
      )}
      {instruments.map((i) =>
        onSelect ? (
          <button
            key={i}
            style={{ "--instrument": colors[i] } as React.CSSProperties}
            aria-pressed={selected === i}
            onClick={() => onSelect(i)}
          >
            <InstrumentGlyph instrument={i} />
            <span>{i}</span>
          </button>
        ) : (
          <span key={i} style={{ color: colors[i] }}>
            <InstrumentGlyph instrument={i} />
            {i}
          </span>
        ),
      )}
    </div>
  );
}
export function useLocalDemo() {
  const [session] = useState(() => new Session(false));
  useEffect(() => {
    session.play(true);
    return () => session.play(false);
  }, [session]);
  return session;
}
