import { useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { api, ApiError } from "../api";
import { useMe } from "../App";
import logoUrl from "../assets/cotsi-logo.svg";
import type { Me } from "../types";

const ICON: Record<string, string> = { topic: "💡", book: "📖", job: "🚀" };

/** The Cotsi logo and name. Always goes to the home page. */
export function Brand({ onClick }: { onClick?: () => void }) {
  return (
    <Link className="brand" to="/" aria-label="Cotsi home" onClick={onClick}>
      <img className="mark" src={logoUrl} alt="" aria-hidden="true" width="34" height="34" />
      <span className="lockup" aria-hidden="true">
        <span className="name">Cotsi</span>
        <span className="sub">
          <b>Co</b>mplex-<b>t</b>o-<b>Si</b>mple
        </span>
      </span>
    </Link>
  );
}

function progress(t: Me["tracks"][number]): string {
  if (!t.total) return t.kind === "job" ? "Syllabus not built yet" : "Just started";
  return `${t.done} of ${t.total} ${t.kind === "job" ? "milestones" : "ideas"}`;
}

/** The side panel: home, settings and every lesson, like a chat app's history. */
export function Sidebar({ me, onHide }: { me: Me | null; onHide: () => void }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { reload } = useMe();
  const [busy, setBusy] = useState("");
  const active = pathname.startsWith("/t/") ? pathname.slice(3) : "";
  const tracks = me?.tracks ?? [];

  const remove = async (t: Me["tracks"][number]) => {
    if (!confirm(`Delete "${t.title}" and its progress? This can't be undone.`)) return;
    setBusy(t.id);
    try {
      await api("DELETE", `/tracks/${t.id}`);
      if (t.id === active) navigate("/");
      await reload();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Couldn't delete that lesson. Please try again.");
    } finally {
      setBusy("");
    }
  };
  return (
    <aside className="side" aria-label="Menu">
      <div className="side-head">
        <Brand />
        <button className="side-close" aria-label="Hide menu" title="Hide menu" onClick={onHide}>
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
            <rect x="3.5" y="4.5" width="17" height="15" rx="3" fill="none" stroke="currentColor" strokeWidth="1.8" />
            <path d="M9.5 4.5v15M15.5 9.5 13 12l2.5 2.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
      <nav className="side-nav">
        <NavLink to="/" end>
          <span aria-hidden="true">🏠</span> Home
        </NavLink>
        <NavLink to="/settings">
          <span aria-hidden="true">⚙️</span> Settings
        </NavLink>
      </nav>
      <h2 className="label side-label">Your lessons</h2>
      {tracks.length ? (
        <ul className="side-list">
          {tracks.map((t) => (
            <li key={t.id} className={busy === t.id ? "busy" : ""}>
              <Link className={t.id === active ? "on" : ""} to={`/t/${t.id}`} aria-current={t.id === active ? "page" : undefined}>
                <span className="side-icon" aria-hidden="true">
                  {ICON[t.kind]}
                </span>
                <span className="side-text">
                  <b>{t.title}</b>
                  <small>{progress(t)}</small>
                </span>
              </Link>
              <button className="side-del" aria-label={`Delete ${t.title}`} title="Delete" disabled={busy === t.id} onClick={() => void remove(t)}>
                <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                  <path
                    d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="fine side-empty">Your lessons will show up here.</p>
      )}
      {me && <p className="side-user">{me.user.name || me.user.email}</p>}
    </aside>
  );
}
