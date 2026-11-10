import { Link } from "react-router-dom";
import { useMe } from "../App";
import type { TrackSummary } from "../types";
import { SECTIONS } from "./Landing";

const ICON: Record<string, string> = { topic: "💡", book: "📖", job: "🚀" };

export function reviewThread(today: string): string {
  return `review-${today.replace(/-/g, "")}`;
}

function TrackRow({ t }: { t: TrackSummary }) {
  const pct = t.total ? Math.round((t.done / t.total) * 100) : 0;
  return (
    <li>
      <Link className="card row" to={`/t/${t.id}`}>
        <span className="icon" aria-hidden="true">
          {ICON[t.kind]}
        </span>
        <span className="grow">
          <b>{t.title}</b>
          <small>
            {t.total
              ? `${t.done} of ${t.total} ${t.kind === "job" ? "milestones" : "ideas"} done`
              : t.kind === "job"
                ? "Syllabus not built yet"
                : "Just started"}
          </small>
          {t.total > 0 && (
            <span className="bar" aria-hidden="true">
              <i style={{ width: `${pct}%` }} />
            </span>
          )}
        </span>
        <span className="arrow" aria-hidden="true">
          →
        </span>
      </Link>
    </li>
  );
}

export function Home() {
  const { me } = useMe();
  if (!me) return <p className="muted center">Loading…</p>;
  const first = me.user.name.split(" ")[0];
  const due = me.tracks.filter((t) => t.nextReviewAt && t.nextReviewAt <= me.today && t.kind !== "job");
  return (
    <div className="home">
      <h1>{first ? `Hi ${first}. ` : ""}What do you want to <em>learn</em>?</h1>

      <section className="sections">
        {SECTIONS.map((s) => (
          <Link className="card section" key={s.kind} to={s.to}>
            <span className="icon" aria-hidden="true">
              {s.icon}
            </span>
            <h2>{s.title}</h2>
            <p>{s.text}</p>
            <span className="go">{s.cta} →</span>
          </Link>
        ))}
      </section>

      {due.length > 0 && (
        <section>
          <h2 className="label">Reviews due · 5 minutes each</h2>
          <ul className="list">
            {due.map((t) => (
              <li key={t.id}>
                <Link className="card row due" to={`/t/${t.id}?thread=${reviewThread(me.today)}`}>
                  <span className="icon" aria-hidden="true">
                    🔁
                  </span>
                  <span className="grow">
                    <b>{t.title}</b>
                    <small>A quick quiz now makes it stick for much longer.</small>
                  </span>
                  <span className="arrow" aria-hidden="true">
                    →
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {me.tracks.length > 0 && (
        <section>
          <h2 className="label">Continue</h2>
          <ul className="list">
            {me.tracks.map((t) => (
              <TrackRow key={t.id} t={t} />
            ))}
          </ul>
        </section>
      )}

      {me.usage.used >= 0.75 && (
        <p className="fine center">You've used {Math.round(me.usage.used * 100)}% of today's free learning. It resets tomorrow.</p>
      )}
    </div>
  );
}
