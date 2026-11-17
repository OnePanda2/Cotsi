import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api, ApiError } from "../api";
import { useMe } from "../App";
import { parseTopicThread, statusesOf, StepCard, SyllabusPanel, TopicHeader } from "../components/Syllabus";
import { Thread } from "../components/Thread";
import { DREAMS, dreamInfo } from "../dreams";
import { hasTopics, readinessPct } from "../syllabus";
import type { DreamKind, Track } from "../types";
import { reviewThread } from "./Home";

const QUICK = ["Skip", "Hint", "Simpler", "Deeper"];

function downloadCards(track: Track) {
  const clean = (s: string) => s.replace(/\|/g, "/").replace(/\s+/g, " ").trim();
  const lines = ["#separator:Pipe", "#html:false", `#deck:Cotsi::${clean(track.title)}`, ...(track.state.cards ?? []).map((c) => `${clean(c.q)}|${clean(c.a)}`)];
  const url = URL.createObjectURL(new Blob([lines.join("\n") + "\n"], { type: "text/plain" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `cotsi-${track.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40)}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

function MapBar({ track }: { track: Track }) {
  const trunk = track.state.map?.trunk ?? [];
  if (!trunk.length) return null;
  const done = new Set(track.state.progress?.done ?? []);
  const current = track.state.progress?.current;
  return (
    <details className="mapbar">
      <summary>
        <span className="steps" aria-hidden="true">
          {trunk.map((_, i) => (
            <i key={i} className={done.has(i + 1) ? "done" : current === i + 1 ? "now" : ""} />
          ))}
        </span>
        {done.size} of {trunk.length} core ideas
      </summary>
      <ol>
        {trunk.map((t, i) => (
          <li key={i} className={done.has(i + 1) ? "done" : current === i + 1 ? "now" : ""}>
            <b>{t.title}</b>
            {t.unlocks && <small> unlocks {t.unlocks}</small>}
          </li>
        ))}
      </ol>
      {track.state.map?.anchor && <p className="fine">🎯 {track.state.map.anchor}</p>}
    </details>
  );
}

const EXAMPLES: Record<DreamKind, string> = {
  laptop: "e.g. MacBook Air",
  bike: "e.g. Royal Enfield Classic",
  car: "e.g. Tata Nexon",
  home: "e.g. a 2BHK in Nashik",
  family: "e.g. paying for my sister's college",
  travel: "e.g. Goa with friends",
  savings: "e.g. an emergency fund",
  other: "What are you working towards?",
};

/** Asks once what getting the job will change for the learner. */
function DreamPicker({ onDone }: { onDone: () => void }) {
  const { reload } = useMe();
  const [kind, setKind] = useState<DreamKind | null>(null);
  const [text, setText] = useState("");
  const [note, setNote] = useState("");
  const save = async () => {
    try {
      await api("PUT", "/dream", { kind, text });
      await reload();
      onDone();
    } catch (err) {
      setNote(err instanceof ApiError ? err.message : "Couldn't save that.");
    }
  };
  return (
    <div className="dream-pick">
      <b>What will this job change for you?</b>
      <small>It shows on your progress bar and in reminders. Only you see it.</small>
      <div className="chips dream-chips">
        {DREAMS.map((d) => (
          <button key={d.kind} className={`chip${kind === d.kind ? " on" : ""}`} onClick={() => setKind(d.kind)} aria-pressed={kind === d.kind}>
            {d.emoji} {d.label}
          </button>
        ))}
      </div>
      {kind && (
        <div className="dream-row">
          <input
            type="text"
            value={text}
            maxLength={60}
            onChange={(e) => setText(e.target.value)}
            placeholder={EXAMPLES[kind]}
            aria-label="Name it (optional)"
          />
          <button className="btn small" onClick={() => void save()}>
            Save
          </button>
        </div>
      )}
      {note && <p className="fine">{note}</p>}
    </div>
  );
}

/** The progress bar towards being job-ready, tied to what the job means to the learner. */
function DreamProgress({ pct, count, unit }: { pct: number; count: string; unit: "topic" | "milestone" }) {
  const { me } = useMe();
  const [editing, setEditing] = useState(false);
  const dream = me?.dream ? dreamInfo(me.dream) : null;
  const line = !dream
    ? ""
    : pct === 0
      ? `${unit === "topic" ? "Your first topic" : "Milestone 1"} is your first step towards ${dream.phrase}.`
      : pct < 100
        ? `Every ${unit} brings ${dream.phrase} closer.`
        : `Syllabus done. Time to go after the job behind ${dream.phrase}.`;
  return (
    <div className="dream-progress">
      <div className="dream-head">
        <b>{pct}% job-ready</b>
        <small>{count}</small>
      </div>
      <div className="bar big" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Job-ready">
        <i style={{ width: `${Math.max(pct, 2)}%` }} />
      </div>
      {dream && !editing ? (
        <p className="dream-line">
          <span aria-hidden="true">{dream.emoji}</span> {line}{" "}
          <button className="link" onClick={() => setEditing(true)}>
            Change
          </button>
        </p>
      ) : (
        <DreamPicker onDone={() => setEditing(false)} />
      )}
    </div>
  );
}

type Nav = {
  thread: string;
  setThread: (t: string) => void;
  step: string | null;
  setStep: (key: string) => void;
};

/** Job syllabi split into topics: the step to do now, with the full syllabus beside it. */
function SyllabusPath({ track, nav }: { track: Track; nav: Nav }) {
  const { thread, setThread, step, setStep } = nav;
  const [open, setOpen] = useState(false);
  const roadmap = track.state.roadmap!;
  const statuses = statusesOf(track);
  const topic = parseTopicThread(thread);
  const build = thread.match(/^m(\d+)$/);
  const pick = (key: string) => {
    setOpen(false);
    setStep(key);
  };
  const shown = statuses.find((s) => s.key === step) ?? statuses.find((s) => s.open);
  const current = topic ? `${topic.n}.${topic.k}` : build ? `${build[1]}.build` : (shown?.key ?? "");
  const done = statuses.filter((s) => s.done).length;
  return (
    <>
      <SyllabusPanel track={track} open={open} current={current} onPick={pick} onClose={() => setOpen(false)} />
      <div className="syl-bar">
        {thread !== "plan" || step ? (
          <button className="link back" onClick={() => setThread("plan")}>
            ← Your next step
          </button>
        ) : (
          <span />
        )}
        <button className="btn ghost small syl-open" onClick={() => setOpen(true)}>
          📋 Full syllabus
        </button>
      </div>
      {thread === "plan" && (
        <section className="roadmap">
          <p className="fine">
            🎯 {roadmap.outcome} · 🏆 {roadmap.capstone}
          </p>
          <DreamProgress pct={readinessPct(roadmap.milestones, track.job ?? {})} count={`${done} of ${statuses.length} steps`} unit="topic" />
          {shown ? (
            <StepCard track={track} step={shown} go={setThread} />
          ) : (
            <section className="card step-card">
              <h2>🎉 Syllabus done</h2>
              <p className="fine">Every topic and build is finished. Head to "Find jobs" to look for openings.</p>
            </section>
          )}
          <details className="plan-chat">
            <summary>Ask about or adjust your plan</summary>
            <Thread trackId={track.id} thread="plan" placeholder="Ask a question or request a change…" />
          </details>
        </section>
      )}
      {topic && <TopicHeader track={track} n={topic.n} k={topic.k} v={topic.v} onNext={pick} go={setThread} />}
    </>
  );
}

/** Older job syllabi without topics: the plain list of milestones. */
function MilestoneList({ track, setThread }: { track: Track; setThread: (t: string) => void }) {
  const roadmap = track.state.roadmap!;
  const done = new Set(track.job?.milestonesDone ?? []);
  const next = roadmap.milestones.find((m) => !done.has(m.n));
  return (
    <section className="roadmap">
      <p className="fine">
        🎯 {roadmap.outcome} · 🏆 {roadmap.capstone}
      </p>
      <DreamProgress
        pct={readinessPct(roadmap.milestones, track.job ?? {})}
        count={`${done.size} of ${roadmap.milestones.length} milestones`}
        unit="milestone"
      />
      <ol className="milestones">
        {roadmap.milestones.map((m) => (
          <li key={m.n}>
            <button className={`card row ${done.has(m.n) ? "done" : next?.n === m.n ? "next" : ""}`} onClick={() => setThread(`m${m.n}`)}>
              <span className="num">{done.has(m.n) ? "✓" : m.n}</span>
              <span className="grow">
                <b>
                  {m.boss && "⚔️ "}
                  {m.title}
                </b>
                <small>
                  {m.hours ? `About ${m.hours} hours` : ""}
                  {next?.n === m.n ? " · up next" : ""}
                </small>
              </span>
              <span className="arrow" aria-hidden="true">
                →
              </span>
            </button>
          </li>
        ))}
      </ol>
      <details className="plan-chat">
        <summary>Ask about or adjust your plan</summary>
        <Thread trackId={track.id} thread="plan" placeholder="Ask a question or request a change…" />
      </details>
    </section>
  );
}

function JobPath({ track, nav }: { track: Track; nav: Nav }) {
  const { thread, setThread } = nav;
  const role = track.job!.role;
  const roadmap = track.state.roadmap;
  const tab = thread === "hunt" ? "hunt" : thread === "edge" ? "edge" : "learn";
  const pct = roadmap ? readinessPct(roadmap.milestones, track.job ?? {}) : 0;
  const syllabus = Boolean(roadmap && hasTopics(roadmap.milestones));
  return (
    <>
      <div className="tabs" role="tablist">
        {[
          ["learn", "1 · Learn"],
          ["hunt", "2 · Find jobs"],
          ["edge", "3 · Your edge"],
        ].map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? "on" : ""} onClick={() => setThread(id === "learn" ? "plan" : id)}>
            {label}
          </button>
        ))}
      </div>

      {tab === "learn" && syllabus && <SyllabusPath track={track} nav={nav} />}
      {tab === "learn" && !syllabus && roadmap && thread === "plan" && <MilestoneList track={track} setThread={setThread} />}
      {tab === "learn" && !syllabus && /^m\d+$/.test(thread) && (
        <button className="link back" onClick={() => setThread("plan")}>
          ← All milestones
        </button>
      )}

      {tab === "hunt" && pct < 70 && (
        <p className="notice calm">
          You're {pct}% through your syllabus. You can look at openings now, but you'll be a stronger applicant after about 70%.
        </p>
      )}
      <p className="sr-only">{role.title}</p>
    </>
  );
}

export function TrackPage() {
  const { id = "" } = useParams();
  const [params, setParams] = useSearchParams();
  const { me, reload } = useMe();
  const navigate = useNavigate();
  const [track, setTrack] = useState<Track | null>(null);

  const onTrack = useCallback(
    (t: Track) => {
      setTrack(t);
      void reload();
    },
    [reload],
  );

  const [error, setError] = useState("");
  useEffect(() => {
    setTrack(null);
    setError("");
    api<{ track: Track }>("GET", `/tracks/${id}`)
      .then((d) => setTrack(d.track))
      .catch((err) => setError(err instanceof ApiError ? err.message : "Couldn't load this lesson."));
  }, [id]);

  const isJob = track?.kind === "job";
  const thread = params.get("thread") ?? (isJob ? "plan" : "main");
  const step = params.get("step");
  const setThread = (t: string) => {
    setParams(t === "plan" || t === "main" ? {} : { thread: t });
    window.scrollTo({ top: 0 });
  };
  const setStep = (key: string) => {
    setParams({ step: key });
    window.scrollTo({ top: 0 });
  };

  const remove = async () => {
    if (!confirm(`Delete "${track?.title}" and its progress?`)) return;
    await api("DELETE", `/tracks/${id}`);
    await reload();
    navigate("/");
  };

  const due = track && !isJob && me && track.state.nextReviewAt && track.state.nextReviewAt <= me.today && !thread.startsWith("review-");
  const hasRoadmap = Boolean(track?.state.roadmap);
  const showPlanList = isJob && hasRoadmap && thread === "plan";

  return (
    <div className="track">
      <div className="track-head">
        <Link className="link back" to="/">
          ← Home
        </Link>
        {track && (
          <button className="link danger" onClick={remove}>
            Delete
          </button>
        )}
      </div>
      {track && (
        <>
          <h1>{track.title}</h1>
          {isJob && <p className="lede small">{track.job!.role.one_liner}</p>}
          {!isJob && <MapBar track={track} />}
          {isJob && <JobPath track={track} nav={{ thread, setThread, step, setStep }} />}
          {thread.startsWith("review-") && <p className="badge">🔁 Review</p>}
          {due && (
            <Link className="notice calm" to={`/t/${id}?thread=${reviewThread(me!.today)}`}>
              🔁 A review is due. Take the 5-minute quiz →
            </Link>
          )}
          {track.state.cards?.length && !isJob ? (
            <button className="link" onClick={() => downloadCards(track)}>
              ⬇ Download {track.state.cards.length} review {track.state.cards.length === 1 ? "card" : "cards"} for Anki
            </button>
          ) : null}
        </>
      )}

      {error && <div className="notice error">{error}</div>}
      {!track && !error && <p className="muted center">Loading…</p>}

      {track &&
        !showPlanList &&
        (thread === "hunt" || thread === "edge" ? (
          <Thread
            key={`${id}:${thread}`}
            trackId={id}
            thread={thread}
            onTrack={onTrack}
            startLabel={thread === "hunt" ? "Search for openings now" : "Find my unfair advantage"}
            startHint={
              thread === "hunt"
                ? "Cotsi searches the web for jobs that are open right now and match your profile. It takes about a minute."
                : "Cotsi researches this role and shows where you beat the typical applicant, with a five-week plan. It takes about a minute."
            }
            restartLabel={thread === "hunt" ? "↻ Search again for fresh openings" : "↻ Run this again"}
            placeholder="Ask a follow-up…"
          />
        ) : (
          <Thread
            key={`${id}:${thread}`}
            trackId={id}
            thread={thread}
            autoStart
            listen={me?.prefs.mode === "listen"}
            onTrack={onTrack}
            quickReplies={thread === "plan" || /^m\d+t\d+[rq]$/.test(thread) ? undefined : QUICK}
          />
        ))}
    </div>
  );
}
