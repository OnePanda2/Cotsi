import { useEffect } from "react";
import type { Track } from "../types";
import { type StepStatus, stepStatuses } from "../syllabus";

export type Variant = "learn" | "revise" | "know";
const LETTER: Record<Variant, string> = { learn: "l", revise: "r", know: "q" };
const VIA: Record<Variant, string> = { learn: "You learned it", revise: "You revised it and passed the test", know: "You passed the test" };

/** The thread a topic uses for a way of working through it, e.g. "m2t3l". */
export function topicThread(n: number, k: number, v: Variant): string {
  return `m${n}t${k}${LETTER[v]}`;
}

/** Parses a topic thread id back into its milestone, topic and way. */
export function parseTopicThread(thread: string): { n: number; k: number; v: Variant } | null {
  const m = thread.match(/^m(\d+)t(\d+)([lrq])$/);
  if (!m) return null;
  const v: Variant = m[3] === "l" ? "learn" : m[3] === "r" ? "revise" : "know";
  return { n: Number(m[1]), k: Number(m[2]), v };
}

export function statusesOf(track: Track): StepStatus[] {
  return stepStatuses(track.state.roadmap?.milestones ?? [], track.job ?? {});
}

function icon(s: StepStatus): string {
  if (s.done) return "✓";
  if (s.locked) return "🔒";
  if (s.mustLearn) return "↺";
  return "▶";
}

/** The whole syllabus, most basic first. Only the next step and finished steps can be opened. */
export function SyllabusPanel({
  track,
  open,
  current,
  onPick,
  onClose,
}: {
  track: Track;
  open: boolean;
  current: string;
  onPick: (key: string) => void;
  onClose: () => void;
}) {
  // On wide screens the panel sits on the right; the page makes room for it while it's shown.
  useEffect(() => {
    document.body.classList.add("has-syllabus");
    return () => document.body.classList.remove("has-syllabus");
  }, []);
  const statuses = statusesOf(track);
  const milestones = track.state.roadmap?.milestones ?? [];
  const done = statuses.filter((s) => s.done).length;
  return (
    <>
      <div className={`syl-scrim${open ? " on" : ""}`} onClick={onClose} aria-hidden="true" />
      <aside className={`syllabus${open ? " open" : ""}`} aria-label="Your syllabus">
        <div className="syl-head">
          <span>
            <b>Your syllabus</b>
            <small>
              {done} of {statuses.length} steps · basics first
            </small>
          </span>
          <button className="syl-close" aria-label="Close syllabus" onClick={onClose}>
            ✕
          </button>
        </div>
        {milestones.map((m) => (
          <section key={m.n} className="syl-milestone">
            <h3>
              <span className="syl-n">{m.n}</span>
              {m.title}
            </h3>
            <ol>
              {statuses
                .filter((s) => s.n === m.n)
                .map((s) => (
                  <li key={s.key} className={`${s.done ? "done" : s.locked ? "locked" : "open"}${s.mustLearn ? " again" : ""}${current === s.key ? " on" : ""}`}>
                    <button disabled={s.locked} onClick={() => onPick(s.key)} title={s.locked ? "Opens when the steps before it are done" : undefined}>
                      <span className="syl-icon" aria-hidden="true">
                        {icon(s)}
                      </span>
                      <span className="syl-title">
                        {s.kind === "build" ? (s.capstone ? "🏆 Capstone project" : "🛠 Hands-on: build it") : s.title}
                      </span>
                      <span className="sr-only">{s.done ? "done" : s.locked ? "locked" : "open"}</span>
                    </button>
                  </li>
                ))}
            </ol>
          </section>
        ))}
      </aside>
    </>
  );
}

/** One step of the syllabus: choose how to work through a topic, or open the hands-on build. */
export function StepCard({ track, step, go }: { track: Track; step: StepStatus; go: (thread: string) => void }) {
  const m = track.state.roadmap?.milestones.find((x) => x.n === step.n);
  const count = m?.topics?.length ?? 0;
  if (step.kind === "build") {
    const started = Boolean(track.job?.milestonesDone?.includes(step.n));
    return (
      <section className="card step-card">
        <p className="kicker">
          Milestone {step.n} · {step.capstone ? "🏆 Capstone" : "🛠 Hands-on"}
        </p>
        <h2>{m?.title}</h2>
        {step.capstone ? (
          <p className="fine">You build this one yourself. Cotsi gives you the brief, the tools and a setup guide, then helps only when you're stuck.</p>
        ) : (
          <p className="fine">Cotsi guides you click by click, and explains what you're building and why.</p>
        )}
        {m?.done_means?.length ? (
          <ul className="done-means">
            {m.done_means.map((d) => (
              <li key={d}>{d}</li>
            ))}
          </ul>
        ) : null}
        {step.locked ? (
          <p className="notice calm">🔒 Opens when this milestone's topics are done.</p>
        ) : (
          <button className="btn" onClick={() => go(`m${step.n}`)}>
            {step.done || started ? "Open it again" : step.capstone ? "Start the capstone" : "Start the build"}
          </button>
        )}
      </section>
    );
  }
  const done = track.job?.topics?.[step.key];
  const started = track.job?.started?.[step.key];
  const k = step.kind === "topic" ? step.k : 0;
  return (
    <section className="card step-card">
      <p className="kicker">
        Milestone {step.n} · Topic {k} of {count}
      </p>
      <h2>{step.title}</h2>
      {done ? (
        <>
          <p className="fine">✓ {VIA[done.via]}.</p>
          <button className="btn ghost" onClick={() => go(topicThread(step.n, k, done.via))}>
            Open the lesson again
          </button>
        </>
      ) : step.locked ? (
        <p className="notice calm">🔒 Opens when the steps before it are done.</p>
      ) : step.mustLearn ? (
        <>
          <p className="notice calm">You didn't pass the test on this one yet. Learn it properly, and then the next topic opens.</p>
          <button className="btn" onClick={() => go(topicThread(step.n, k, "learn"))}>
            📘 Learn it
          </button>
        </>
      ) : (
        <>
          {started && (
            <button className="btn" onClick={() => go(topicThread(step.n, k, started))}>
              Continue where you left off
            </button>
          )}
          <div className="ways">
            <button className="way" onClick={() => go(topicThread(step.n, k, "learn"))}>
              <b>📘 Learn</b>
              <small>A full lesson, step by step, from the basics.</small>
            </button>
            <button className="way" onClick={() => go(topicThread(step.n, k, "revise"))}>
              <b>🔁 Revise</b>
              <small>A quick run-through, then a 4-question test.</small>
            </button>
            <button className="way" onClick={() => go(topicThread(step.n, k, "know"))}>
              <b>✅ I already know this</b>
              <small>Straight to the test. 3 of 4 right to pass.</small>
            </button>
          </div>
          <p className="fine">If you don't pass the test, you'll learn the topic before moving on.</p>
        </>
      )}
    </section>
  );
}

/** Shown above a topic lesson: where it sits, and the way on once it's done. */
export function TopicHeader({
  track,
  n,
  k,
  v,
  onNext,
  go,
}: {
  track: Track;
  n: number;
  k: number;
  v: Variant;
  onNext: (key: string) => void;
  go: (thread: string) => void;
}) {
  const statuses = statusesOf(track);
  const key = `${n}.${k}`;
  const me = statuses.find((s) => s.key === key);
  const next = statuses.find((s) => s.open);
  const label = { learn: "📘 Learn", revise: "🔁 Revise and test", know: "✅ Test" }[v];
  return (
    <div className="topic-head">
      <p className="kicker">
        Milestone {n} · Topic {k} · {label}
      </p>
      <h2>{me?.title}</h2>
      {v !== "learn" && !me?.done && (
        <button className="link" onClick={() => go(topicThread(n, k, "learn"))}>
          Not sure after all? Switch to 📘 Learn
        </button>
      )}
      {me?.done && next && (
        <button className="notice calm next-step" onClick={() => onNext(next.key)}>
          ✓ Topic done. Next: <b>{next.kind === "build" ? (next.capstone ? "the capstone" : "the hands-on build") : next.title}</b> →
        </button>
      )}
    </div>
  );
}
