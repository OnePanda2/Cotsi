import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api, ApiError } from "../api";
import { useMe } from "../App";
import { Thread } from "../components/Thread";
import type { Track } from "../types";
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

function JobPath({ track, thread, setThread }: { track: Track; thread: string; setThread: (t: string) => void }) {
  const role = track.job!.role;
  const roadmap = track.state.roadmap;
  const done = new Set(track.job?.milestonesDone ?? []);
  const tab = thread === "hunt" ? "hunt" : thread === "edge" ? "edge" : "learn";
  const pct = roadmap ? Math.round((done.size / roadmap.milestones.length) * 100) : 0;
  const next = roadmap?.milestones.find((m) => !done.has(m.n));
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

      {tab === "learn" && roadmap && thread === "plan" && (
        <section className="roadmap">
          <p className="fine">
            🎯 {roadmap.outcome} · 🏆 {roadmap.capstone}
          </p>
          <div className="bar big" aria-label={`${pct}% complete`}>
            <i style={{ width: `${pct}%` }} />
          </div>
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
      )}

      {tab === "learn" && /^m\d+$/.test(thread) && (
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
  const setThread = (t: string) => setParams(t === "plan" || t === "main" ? {} : { thread: t });

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
          {isJob && <JobPath track={track} thread={thread} setThread={setThread} />}
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
            onTrack={onTrack}
            quickReplies={thread === "plan" ? undefined : QUICK}
          />
        ))}
    </div>
  );
}
