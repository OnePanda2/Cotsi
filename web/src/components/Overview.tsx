import { useEffect } from "react";
import type { Outline, Track } from "../types";

// Topics and books: the overview of core ideas (or chapters). Every page is open, in any order.

export const partThread = (k: number) => `p${k}`;

export function partOf(thread: string): number | null {
  const m = thread.match(/^p(\d+)$/);
  return m ? Number(m[1]) : null;
}

/** "Idea", "Chapter", or "Part" when a book's chapter list is only approximate. */
export function partWord(o: Outline): string {
  return o.kind === "ideas" ? "Idea" : o.approx ? "Part" : "Chapter";
}

/** The first page not read yet, or the first page. */
export function nextPart(track: Track): number {
  const o = track.state.outline;
  if (!o) return 1;
  const done = new Set(track.state.partsDone ?? []);
  for (let k = 1; k <= o.parts.length; k++) if (!done.has(k)) return k;
  return 1;
}

export function OverviewPanel({
  track,
  open,
  current,
  onPick,
  onClose,
}: {
  track: Track;
  open: boolean;
  current: string;
  onPick: (thread: string) => void;
  onClose: () => void;
}) {
  // Wide screens keep the panel on the right; the page makes room for it.
  useEffect(() => {
    document.body.classList.add("has-syllabus");
    return () => document.body.classList.remove("has-syllabus");
  }, []);
  const o = track.state.outline!;
  const done = new Set(track.state.partsDone ?? []);
  const word = o.kind === "ideas" ? "core ideas" : o.approx ? "parts" : "chapters";
  return (
    <>
      <div className={`syl-scrim${open ? " on" : ""}`} onClick={onClose} aria-hidden="true" />
      <aside className={`syllabus overview${open ? " open" : ""}`} aria-label="Overview">
        <div className="syl-head">
          <span>
            <b>Overview</b>
            <small>
              {done.size} of {o.parts.length} {word} · open any, in any order
            </small>
          </span>
          <button className="syl-close" aria-label="Close overview" onClick={onClose}>
            ✕
          </button>
        </div>
        {o.anchor && <p className="ov-anchor">🎯 {o.anchor}</p>}
        <section className="syl-milestone">
          {o.approx && <p className="fine ov-note">Grouped by the book's main parts, not its exact chapters.</p>}
          <ol>
            {o.parts.map((p, i) => {
              const k = i + 1;
              const thread = partThread(k);
              return (
                <li key={k} className={`${done.has(k) ? "done" : "open"}${current === thread ? " on" : ""}`}>
                  <button onClick={() => onPick(thread)}>
                    <span className="syl-icon" aria-hidden="true">
                      {done.has(k) ? "✓" : k}
                    </span>
                    <span className="syl-title">
                      {p.title}
                      {p.gist && <small className="ov-gist">{p.gist}</small>}
                    </span>
                    <span className="sr-only">{done.has(k) ? "read" : "not read yet"}</span>
                  </button>
                </li>
              );
            })}
          </ol>
        </section>
        <section className="syl-milestone">
          <h3>Put it into practice</h3>
          <ol>
            <li className={`${track.state.projectDone ? "done" : "open"}${current === "build" ? " on" : ""}`}>
              <button onClick={() => onPick("build")}>
                <span className="syl-icon" aria-hidden="true">
                  {track.state.projectDone ? "✓" : "🛠"}
                </span>
                <span className="syl-title">
                  Hands-on project
                  <small className="ov-gist">{o.project || "Build something small with what you learned. Cotsi helps you set up and guides every step."}</small>
                </span>
              </button>
            </li>
            {o.legacy && (
              <li className={current === "main" ? "on" : ""}>
                <button onClick={() => onPick("main")}>
                  <span className="syl-icon" aria-hidden="true">
                    📜
                  </span>
                  <span className="syl-title">Your first lesson (all ideas on one page)</span>
                </button>
              </li>
            )}
          </ol>
        </section>
      </aside>
    </>
  );
}

/** Above a page: which idea or chapter it is. */
export function PartHeader({ track, k }: { track: Track; k: number }) {
  const o = track.state.outline!;
  const p = o.parts[k - 1];
  if (!p) return null;
  return (
    <div className="topic-head">
      <p className="kicker">
        {partWord(o)} {k} of {o.parts.length}
        {track.state.partsDone?.includes(k) ? " · ✓ read" : ""}
      </p>
      <h2>{p.title}</h2>
      {p.gist && <p className="fine">{p.gist}</p>}
    </div>
  );
}

/** Below a page, once it's taught: the way on. */
export function PartNext({ track, thread, go }: { track: Track; thread: string; go: (thread: string) => void }) {
  const o = track.state.outline!;
  const k = partOf(thread);
  const done = new Set(track.state.partsDone ?? []);
  if (!k || !done.has(k)) return null;
  const next = k < o.parts.length ? k + 1 : null;
  const unread = o.parts.findIndex((_, i) => !done.has(i + 1)) + 1;
  if (next) {
    return (
      <button className="notice calm next-step" onClick={() => go(partThread(next))}>
        Next: <b>{partWord(o)} {next} · {o.parts[next - 1].title}</b> →
      </button>
    );
  }
  if (unread > 0) {
    return (
      <button className="notice calm next-step" onClick={() => go(partThread(unread))}>
        You skipped one: <b>{partWord(o)} {unread} · {o.parts[unread - 1].title}</b> →
      </button>
    );
  }
  return (
    <div className="part-end">
      <p className="notice calm">🎉 You've covered every {o.kind === "ideas" ? "idea" : "chapter"}. A quick review in a day or two helps it stick.</p>
      {!track.state.projectDone && (
        <button className="btn" onClick={() => go("build")}>
          🛠 Try the hands-on project
        </button>
      )}
    </div>
  );
}
