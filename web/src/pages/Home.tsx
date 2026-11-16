import { Link } from "react-router-dom";
import { useMe } from "../App";
import { NotReady } from "../components/NotReady";
import { ReminderControl } from "../components/Reminders";
import type { Me } from "../types";
import { SECTIONS } from "./Landing";

export function reviewThread(today: string): string {
  return `review-${today.replace(/-/g, "")}`;
}

function weekday(day: string): string {
  return new Date(`${day}T12:00:00`).toLocaleDateString(undefined, { weekday: "narrow" });
}

/** The daily streak: consecutive days with at least one answer, plus the last 7 days as dots. */
function StreakCard({ me }: { me: Me }) {
  const s = me.streak;
  if (!s || me.ai?.ready === false || me.tracks.length === 0) return null;
  const line = s.doneToday
    ? "You've learned today. See you tomorrow."
    : s.current > 0
      ? "Answer one question today to keep it going."
      : "Answer one question today to start your streak.";
  return (
    <section className={`card streak${s.doneToday ? " done" : ""}`} aria-label="Your learning streak">
      <div className="streak-top">
        <span className={`flame${s.current > 0 ? "" : " off"}`} aria-hidden="true">
          🔥
        </span>
        <span className="grow">
          <b>{s.current > 0 ? `${s.current}-day streak` : "Start a streak"}</b>
          <small>{line}</small>
        </span>
        {s.best > 1 && <span className="best">Best {s.best}</span>}
      </div>
      <ol className="week" aria-label="The last 7 days">
        {s.week.map((d) => (
          <li key={d.day} className={d.on ? "on" : ""} aria-label={`${d.day}: ${d.on ? "learned" : "no lesson"}`}>
            <i aria-hidden="true">{d.on ? "✓" : ""}</i>
            <span aria-hidden="true">{weekday(d.day)}</span>
          </li>
        ))}
      </ol>
      <ReminderControl compact />
    </section>
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
      <NotReady />
      <StreakCard me={me} />

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

      {me.usage.used >= 0.75 && (
        <p className="fine center">You've used {Math.round(me.usage.used * 100)}% of today's learning allowance. It resets tomorrow.</p>
      )}
    </div>
  );
}
