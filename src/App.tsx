import { useEffect, useState, type CSSProperties } from "react";
import {
  BrowserRouter,
  Link,
  NavLink,
  Route,
  Routes,
  useLocation,
  useSearchParams,
} from "react-router-dom";
import QRCode from "qrcode";
import { concert } from "./engine/session";
import {
  colors,
  descriptions,
  instruments,
  MAX_CAPTION_LENGTH,
  visibleChannel,
  type Instrument,
  type CaptionCue,
} from "./engine/types";
import { continuous } from "./engine/music";
import {
  Captions,
  InstrumentGlyph,
  Legend,
  Score,
  useLocalDemo,
  useSession,
  useTime,
} from "./components/Score";
import {
  Arrow,
  DemoControls,
  PlayIcon,
  ScenePicker,
  Slider,
  Toggle,
} from "./components/Controls";
const instrumentStyle = (i: Instrument) =>
  ({ "--instrument": colors[i] }) as CSSProperties;
function Identity({ compact = false }: { compact?: boolean }) {
  return (
    <Link
      to="/"
      className={`identity ${compact ? "identity-compact" : ""}`}
      aria-label="The Allium home"
    >
      <span>the</span>allium
      <span className="identity-dot" aria-hidden="true" />
    </Link>
  );
}
function Header() {
  return (
    <header className="site-header">
      <Identity />
      <nav aria-label="Main navigation">
        <NavLink to="/experience">Experience</NavLink>
        <NavLink to="/tutorial">Visual language</NavLink>
        <NavLink to="/follow">Follow along</NavLink>
        <NavLink to="/control" className="operator-link">
          Operator <Arrow diagonal />
        </NavLink>
      </nav>
    </header>
  );
}
function Footer() {
  return (
    <footer className="footer">
      <Identity compact />
      <span>Different ways to feel. One place to belong.</span>
      <span>Glitz Inclusive · Jakarta</span>
    </footer>
  );
}
function PageTitle() {
  const { pathname } = useLocation();
  useEffect(() => {
    const titles: Record<string, string> = {
      "/": "Music you can see",
      "/experience": "Visual concert",
      "/tutorial": "The visual language",
      "/control": "Operator desk",
      "/follow": "Follow along",
    };
    document.title = `The Allium — ${titles[pathname] ?? "Page not found"}`;
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}
function Home() {
  const session = useLocalDemo();
  const [selected, setSelected] = useState<Instrument | "all">("all");
  const { state } = useSession(session);
  return (
    <>
      <Header />
      <main id="main">
        <section className="home-hero">
          <Score
            session={session}
            instrument={selected === "all" ? undefined : selected}
            className="hero-score"
          />
          <div className="hero-copy">
            <h1>
              Music you
              <br />
              can <em>see.</em>
              <br />
              <span>Feel. Belong to.</span>
            </h1>
            <p>
              An inclusive live music experience.
              <br />
              Rhythm, melody, and expression,
              <br />
              in a language we can share.
            </p>
            <Link className="button primary enter-button" to="/experience">
              Enter the experience <Arrow />
            </Link>
          </div>
          <div className="hero-venue">
            <span>THE ALLIUM</span>
            <span>
              Glitz Inclusive
              <br />
              Jakarta, Indonesia
            </span>
          </div>
          <div className="hero-bottom">
            <span className="demo-label">
              <span className="status-dot" />
              Visual-only demo
            </span>
            <button
              className="text-button"
              onClick={() => session.play(!state.playing)}
            >
              <PlayIcon playing={state.playing} />
              {state.playing ? "Pause the score" : "Play the score"}
            </button>
          </div>
        </section>
        <section className="instrument-index">
          <div className="section-heading">
            <h2>
              Every instrument.
              <br />
              Its own expression.
            </h2>
            <p>
              Follow a line. Find a rhythm.
              <br />
              Choose an instrument to see its voice in the score above.
            </p>
          </div>
          <Legend selected={selected} onSelect={setSelected} />
          <p className="selected-description" aria-live="polite">
            {selected === "all"
              ? "Together, distinct musical voices become one living visual score."
              : descriptions[selected]}
          </p>
        </section>
        <section className="home-inclusion">
          <div className="inclusion-statement">
            <h2>
              A shared stage.
              <br />A place for <em>everybody.</em>
            </h2>
            <p>
              Designed with Deaf and hard-of-hearing audiences in mind. Musical
              shapes and live captions make space for different ways of
              experiencing a performance.
            </p>
          </div>
          <div className="inclusion-links">
            <Link to="/tutorial">
              <span>
                <strong>Learn the visual language</strong>
                <small>Meet the ribbons, paths, waves, and pulses.</small>
              </span>
              <Arrow diagonal />
            </Link>
            <Link to="/follow">
              <span>
                <strong>Make it your own</strong>
                <small>Follow an instrument on your phone.</small>
              </span>
              <Arrow diagonal />
            </Link>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
function Experience() {
  const [params, setParams] = useSearchParams();
  const performance = params.get("performance") === "1";
  const { state, status } = useSession(concert);
  const [error, setError] = useState("");
  useEffect(() => {
    concert.setRole("display");
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") setParams({});
    };
    window.addEventListener("keydown", key);
    return () => {
      concert.setRole("viewer");
      window.removeEventListener("keydown", key);
    };
  }, [setParams]);
  const enter = async () => {
    setParams({ performance: "1" });
    try {
      await document.documentElement.requestFullscreen?.();
    } catch {
      setError("Fullscreen unavailable. Performance view is still active.");
    }
  };
  return (
    <div className={`experience ${performance ? "performance" : ""}`}>
      {!performance && <Header />}
      <main id="main" className="experience-main">
        <div className="stage">
          <div className="stage-top">
            <Identity compact />
            <span className="stage-status">
              <span className="status-dot" />
              {state.playing ? "DEMO PLAYING" : "DEMO PAUSED"}{" "}
              <span>· {state.scene}</span>
            </span>
          </div>
          <Score session={concert} labels={!performance} />
          <Captions session={concert} />
        </div>
        {!performance && (
          <div className="rehearsal">
            <div className="rehearsal-heading">
              <div>
                <h1>See the music.</h1>
                <p>
                  A synthetic score. No microphone or live audio is connected.
                </p>
              </div>
              <button className="button" onClick={enter}>
                Performance view <Arrow diagonal />
              </button>
            </div>
            <div className="rehearsal-controls">
              <DemoControls session={concert} />
              <ScenePicker session={concert} />
              <div className="rehearsal-settings">
                <Toggle
                  label="Captions"
                  checked={state.captions}
                  onChange={(captions) => concert.update({ captions })}
                />
                <Toggle
                  label="Reduced motion"
                  checked={state.reduced}
                  onChange={(reduced) => concert.update({ reduced })}
                />
                <Link to="/control" className="text-link">
                  Open operator desk <Arrow diagonal />
                </Link>
              </div>
            </div>
            <Legend />
            <p className="connection-note">
              {status.supported
                ? status.operators
                  ? "Operator connected in another tab."
                  : "Open the operator desk in another tab to control this display."
                : "Tab synchronization is unavailable in this browser. These controls work locally."}
            </p>
          </div>
        )}
        {error && (
          <p role="status" className="fullscreen-error">
            {error}
          </p>
        )}
      </main>
      {performance && (
        <button
          className="exit-performance"
          onClick={() => {
            setParams({});
            if (document.fullscreenElement) void document.exitFullscreen();
          }}
        >
          Exit performance view
        </button>
      )}
    </div>
  );
}
const lessons: Record<
  Instrument,
  { title: string; detail: string; mapping: string }
> = {
  vocals: {
    title: "Follow the melody.",
    detail:
      "The ribbon rises with the voice. It falls as the pitch lowers. A wider ribbon means a stronger vocal phrase.",
    mapping: "Pitch → height · Intensity → ribbon width",
  },
  guitar: {
    title: "Trace every phrase.",
    detail:
      "A sharper, angular path follows the guitar. Look for the bends and turns that give each phrase its shape.",
    mapping: "Pitch → path · Expression → sharper turns",
  },
  drums: {
    title: "Find your rhythm.",
    detail:
      "A kick sends out a large, heavy ring. Snares create sharper bursts. Hi-hats make smaller, lighter pulses.",
    mapping: "Beat → pulse · Drum type → size and shape",
  },
  bass: {
    title: "Feel the foundation.",
    detail:
      "Low notes become broad waves near the ground. Their weight and movement hold the other instruments together.",
    mapping: "Low pitch → grounded position · Intensity → wave width",
  },
  piano: {
    title: "Watch harmony appear.",
    detail:
      "Each diamond is a note. Notes played together appear as a group, making chords visible at a glance.",
    mapping: "Note → diamond · Chord → a group of notes",
  },
};
function Tutorial() {
  const session = useLocalDemo();
  const [lesson, setLesson] = useState<Instrument | "all">("vocals");
  const { state } = useSession(session);
  const item = lesson === "all" ? null : lessons[lesson];
  return (
    <>
      <Header />
      <main id="main" className="tutorial-page">
        <div className="tutorial-heading">
          <h1>
            A language
            <br />
            you can <em>feel.</em>
          </h1>
          <p>
            You don’t need to read music.
            <br />
            Just find a shape, and follow it.
          </p>
        </div>
        <div className="lesson-tabs" role="group" aria-label="Tutorial chapter">
          {instruments.map((i, index) => (
            <button
              key={i}
              aria-pressed={lesson === i}
              onClick={() => setLesson(i)}
              style={instrumentStyle(i)}
            >
              <span className="lesson-number">{index + 1}</span>
              <InstrumentGlyph instrument={i} />
              {i}
            </button>
          ))}
          <button
            aria-pressed={lesson === "all"}
            onClick={() => setLesson("all")}
          >
            Together
          </button>
        </div>
        <section className="lesson-theatre">
          <Score
            session={session}
            profile="tutorial"
            instrument={lesson === "all" ? undefined : lesson}
          />
          <div className="lesson-caption" aria-live="polite">
            <span
              className="lesson-name"
              style={{ color: lesson === "all" ? "#E3D1FF" : colors[lesson] }}
            >
              {lesson === "all" ? "ENSEMBLE" : lesson.toUpperCase()}
            </span>
            <h2>{item?.title ?? "Different voices. One score."}</h2>
            <p>
              {item?.detail ??
                "The instruments share the same space. Each keeps its own shape, so you can follow one voice or take in the whole performance."}
            </p>
            <span className="lesson-mapping">
              {item?.mapping ??
                "Shape + movement + position = instrument identity"}
            </span>
          </div>
        </section>
        <div className="tutorial-controls">
          <button
            className="button"
            onClick={() => session.play(!state.playing)}
          >
            <PlayIcon playing={state.playing} />
            {state.playing ? "Pause example" : "Play example"}
          </button>
          <button
            className="text-button"
            onClick={() => {
              session.update({
                position: 0,
                anchor: Date.now(),
                sectionStart: 0,
              });
              session.play(true);
            }}
          >
            Replay example
          </button>
          <Toggle
            label="Reduced motion"
            checked={state.reduced}
            onChange={(reduced) => session.update({ reduced })}
          />
          <Link to="/experience" className="text-link">
            Enter the experience <Arrow />
          </Link>
        </div>
        <p className="tutorial-footnote">
          Colors help you find a voice. Shapes help you recognize it. Captions
          carry the words.
        </p>
      </main>
      <Footer />
    </>
  );
}
function CaptionEditor() {
  const { state, status } = useSession(concert);
  const [speaker, setSpeaker] = useState("Maya — vocals");
  const [text, setText] = useState("");
  const [category, setCategory] = useState<CaptionCue["category"]>("lyrics");
  const [notice, setNotice] = useState("");
  return (
    <section className="caption-editor">
      <div className="panel-heading">
        <h2>Caption desk</h2>
        <span>
          {state.captionMode === "demo" ? "SAMPLE CUES" : "MANUAL CUES"}
        </span>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!text.trim()) return;
          concert.cue({ speaker: speaker.trim(), text: text.trim(), category });
          setNotice("Caption sent to the display.");
        }}
      >
        <div className="caption-fields">
          <label>
            Speaker
            <input
              value={speaker}
              maxLength={80}
              onChange={(e) => setSpeaker(e.target.value)}
              disabled={status.locked}
            />
          </label>
          <label>
            Content type
            <select
              value={category}
              onChange={(e) =>
                setCategory(e.target.value as CaptionCue["category"])
              }
              disabled={status.locked}
            >
              <option value="lyrics">Lyrics</option>
              <option value="speech">Spoken introduction</option>
              <option value="sound">Non-speech information</option>
            </select>
          </label>
        </div>
        <label>
          Caption text
          <textarea
            value={text}
            maxLength={MAX_CAPTION_LENGTH}
            aria-label="Caption text"
            aria-describedby="caption-length-guide"
            rows={2}
            placeholder="Words for the audience…"
            onChange={(e) => setText(e.target.value)}
            disabled={status.locked}
          />
        </label>
        <p id="caption-length-guide" className="panel-note">
          {text.length}/{MAX_CAPTION_LENGTH} characters. Send longer passages as
          consecutive cues.
        </p>
        <div className="caption-actions">
          <button
            className="button primary"
            disabled={!text.trim() || status.locked}
            type="submit"
          >
            Send caption <Arrow />
          </button>
          <button
            className="button"
            type="button"
            disabled={status.locked}
            onClick={() => {
              concert.update({ manual: null, captionMode: "manual" });
              setNotice("Caption cleared.");
            }}
          >
            Clear
          </button>
          <button
            className="text-button"
            type="button"
            disabled={status.locked}
            onClick={() => {
              concert.update({ captionMode: "demo", manual: null });
              setNotice("Sample captions restored.");
            }}
          >
            Restore demo cues
          </button>
        </div>
        <span className="form-notice" role="status">
          {notice}
        </span>
      </form>
    </section>
  );
}
function Control() {
  const { state, status } = useSession(concert);
  const time = useTime(concert, 100);
  const levels = continuous(time, state.section, state.sectionStart);
  useEffect(() => {
    concert.setRole("operator");
    return () => concert.setRole("viewer");
  }, []);
  return (
    <>
      <Header />
      <main id="main" className="control-page">
        <div className="control-title">
          <div>
            <h1>Operator desk</h1>
            <p>The score, in your hands.</p>
          </div>
          <a
            className="button"
            href="/experience?performance=1"
            target="_blank"
            rel="noopener noreferrer"
          >
            Open display <Arrow diagonal />
          </a>
        </div>
        <div className="status-strip">
          <div>
            <span>CONNECTION</span>
            <strong>
              <span className={`status-dot ${status.displays ? "" : "idle"}`} />
              {!status.supported
                ? "Local only"
                : status.displays
                  ? `${status.displays} display connected`
                  : "Waiting for display"}
            </strong>
          </div>
          <div>
            <span>SCENE</span>
            <strong>{state.scene}</strong>
          </div>
          <div>
            <span>CAPTIONS</span>
            <strong>
              {state.captions
                ? state.captionMode === "demo"
                  ? "Sample cues ready"
                  : "Manual cues ready"
                : "Off"}
            </strong>
          </div>
          <div>
            <span>SOURCE</span>
            <strong>Demo · {state.playing ? "playing" : "paused"}</strong>
          </div>
        </div>
        {status.locked && (
          <p className="operator-warning" role="status">
            Another operator tab holds control. Close that tab to take over.
          </p>
        )}
        <div className="control-layout">
          <div className="control-left">
            <section className="channel-desk">
              <div className="panel-heading">
                <h2>Instrument channels</h2>
                <span>SYNTHETIC INPUT</span>
              </div>
              <div className="channel-column-labels" aria-hidden="true">
                <span>CHANNEL</span>
                <span>INPUT LEVEL</span>
                <span>STATE</span>
                <span>VISUAL</span>
              </div>
              {instruments.map((i) => (
                <div className="channel-row" key={i} style={instrumentStyle(i)}>
                  <div className="channel-name">
                    <InstrumentGlyph instrument={i} />
                    <strong>{i}</strong>
                  </div>
                  <div className="level-cell">
                    <meter
                      min="0"
                      max="1"
                      value={state.playing ? levels[i].intensity : 0}
                      aria-label={`${i} synthetic input level`}
                    />
                    <span>
                      {state.playing
                        ? Math.round(levels[i].intensity * 100)
                        : 0}
                      %
                    </span>
                  </div>
                  <span className="channel-state">
                    {state.playing && levels[i].intensity > 0.1
                      ? "Active"
                      : "Inactive"}
                  </span>
                  <div className="channel-actions">
                    <button
                      aria-label={`Mute ${i} visualization`}
                      aria-pressed={state.channels[i].mute}
                      disabled={status.locked}
                      onClick={() =>
                        concert.update({
                          channels: {
                            ...state.channels,
                            [i]: {
                              ...state.channels[i],
                              mute: !state.channels[i].mute,
                            },
                          },
                        })
                      }
                    >
                      Mute
                    </button>
                    <button
                      aria-label={`Solo ${i} visualization`}
                      aria-pressed={state.channels[i].solo}
                      disabled={status.locked}
                      onClick={() =>
                        concert.update({
                          channels: {
                            ...state.channels,
                            [i]: {
                              ...state.channels[i],
                              solo: !state.channels[i].solo,
                            },
                          },
                        })
                      }
                    >
                      Solo
                    </button>
                  </div>
                </div>
              ))}
              <p className="panel-note">
                Mute and solo affect visuals only. Multiple solos can play
                together.
              </p>
            </section>
            <section className="scene-desk">
              <h2>Scene direction</h2>
              <ScenePicker session={concert} />
            </section>
            <CaptionEditor />
          </div>
          <aside className="control-right">
            <section className="preview-desk">
              <h2>Display preview</h2>
              <div className="operator-preview">
                <Score session={concert} profile="preview" />
                <Captions session={concert} compact />
              </div>
              <p className="panel-note">
                {instruments.filter((i) => visibleChannel(state, i)).length}{" "}
                visible channels · {state.section}
              </p>
            </section>
            <section className="visual-settings">
              <h2>Visual settings</h2>
              <Slider
                label="Overall intensity"
                value={state.intensity}
                onChange={(intensity) => concert.update({ intensity })}
                disabled={status.locked}
              />
              <Slider
                label="Particle density"
                value={state.particles}
                onChange={(particles) => concert.update({ particles })}
                disabled={status.locked}
              />
              <Slider
                label="Motion intensity"
                value={state.motion}
                onChange={(motion) => concert.update({ motion })}
                disabled={status.locked}
              />
              <Toggle
                label="Captions"
                checked={state.captions}
                onChange={(captions) => concert.update({ captions })}
                disabled={status.locked}
              />
              <Toggle
                label="Reduced motion"
                checked={state.reduced}
                onChange={(reduced) => concert.update({ reduced })}
                disabled={status.locked}
              />
            </section>
            <section className="demo-desk">
              <h2>Demo transport</h2>
              <DemoControls session={concert} />
              <p className="panel-note">
                Visual-only synthetic music. Live audio transport is not
                connected.
              </p>
            </section>
          </aside>
        </div>
      </main>
      <Footer />
    </>
  );
}
function Follow() {
  const session = useLocalDemo();
  const { state } = useSession(session);
  const [selected, setSelected] = useState<Instrument | "all">("all");
  const [contrast, setContrast] = useState(false);
  const [qr, setQr] = useState("");
  useEffect(() => {
    try {
      const saved = JSON.parse(
        localStorage.getItem("allium.follow.preferences") || "null",
      );
      if (saved) {
        session.update({
          intensity:
            typeof saved.intensity === "number" ? saved.intensity : 0.65,
          reduced:
            typeof saved.reduced === "boolean" ? saved.reduced : state.reduced,
          captions: saved.captions !== false,
        });
        setContrast(saved.contrast === true);
        if (instruments.includes(saved.selected) || saved.selected === "all")
          setSelected(saved.selected);
      }
    } catch {}
    void QRCode.toDataURL(`${location.origin}/follow`, {
      width: 180,
      margin: 1,
      color: { dark: "#05091C", light: "#FFFFFF" },
    })
      .then(setQr)
      .catch(() => {});
  }, [session]);
  useEffect(() => {
    try {
      localStorage.setItem(
        "allium.follow.preferences",
        JSON.stringify({
          selected,
          contrast,
          intensity: state.intensity,
          reduced: state.reduced,
          captions: state.captions,
        }),
      );
    } catch {}
  }, [selected, contrast, state.intensity, state.reduced, state.captions]);
  return (
    <>
      <Header />
      <main
        id="main"
        className={`follow-page ${contrast ? "high-contrast" : ""}`}
      >
        <div className="follow-intro">
          <h1>
            Find your
            <br />
            <em>own rhythm.</em>
          </h1>
          <p>
            A personal way to follow the music.
            <br />
            Choose the voice you want to see.
          </p>
          <div className="follow-qr">
            {qr && (
              <img
                src={qr}
                alt="QR code to open Follow along on your phone"
                width="100"
                height="100"
              />
            )}
            <span>
              Open on your phone
              <br />
              <small>
                {["localhost", "127.0.0.1"].includes(location.hostname)
                  ? "Use the network URL for phone access"
                  : "Scan to follow along"}
              </small>
            </span>
          </div>
        </div>
        <div className="personal-stage">
          <div className="personal-status">
            <span className="demo-label">
              <span className="status-dot" />
              Independent demo
            </span>
            <button
              className="text-button"
              onClick={() => session.play(!state.playing)}
            >
              <PlayIcon playing={state.playing} />
              {state.playing ? "Pause" : "Play"}
            </button>
          </div>
          <Score
            session={session}
            instrument={selected === "all" ? undefined : selected}
            highContrast={contrast}
            profile="companion"
          />
          <Captions session={session} />
          <Legend selected={selected} onSelect={setSelected} />
          <p className="follow-description" aria-live="polite">
            {selected === "all"
              ? "All the voices, sharing one space."
              : descriptions[selected]}
          </p>
          <div className="personal-settings">
            <Slider
              label="Visual intensity"
              value={state.intensity}
              onChange={(intensity) => session.update({ intensity })}
            />
            <Toggle
              label="Reduced motion"
              checked={state.reduced}
              onChange={(reduced) => session.update({ reduced })}
            />
            <Toggle
              label="Captions"
              checked={state.captions}
              onChange={(captions) => session.update({ captions })}
            />
            <Toggle
              label="High contrast"
              checked={contrast}
              onChange={setContrast}
            />
          </div>
          <p className="panel-note">
            This optional companion runs its own visual demo. Your settings stay
            on this device and don’t change the concert display.
          </p>
        </div>
      </main>
      <Footer />
    </>
  );
}
function NotFound() {
  return (
    <>
      <Header />
      <main id="main" className="not-found">
        <h1>A quiet corner.</h1>
        <p>This page isn’t part of the score.</p>
        <Link className="button primary" to="/">
          Back to The Allium <Arrow />
        </Link>
      </main>
    </>
  );
}
export default function App() {
  return (
    <BrowserRouter>
      <PageTitle />
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/experience" element={<Experience />} />
        <Route path="/tutorial" element={<Tutorial />} />
        <Route path="/control" element={<Control />} />
        <Route path="/follow" element={<Follow />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  );
}
