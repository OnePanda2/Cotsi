import { Link, NavLink, useLocation } from "react-router-dom";
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
export function Sidebar({ me, onClose }: { me: Me | null; onClose: () => void }) {
  const { pathname } = useLocation();
  const active = pathname.startsWith("/t/") ? pathname.slice(3) : "";
  const tracks = me?.tracks ?? [];
  return (
    <aside className="side" aria-label="Menu">
      <div className="side-head">
        <Brand onClick={onClose} />
        <button className="side-close" aria-label="Close menu" onClick={onClose}>
          ✕
        </button>
      </div>
      <nav className="side-nav">
        <NavLink to="/" end onClick={onClose}>
          <span aria-hidden="true">🏠</span> Home
        </NavLink>
        <NavLink to="/settings" onClick={onClose}>
          <span aria-hidden="true">⚙️</span> Settings
        </NavLink>
      </nav>
      <h2 className="label side-label">Your lessons</h2>
      {tracks.length ? (
        <ul className="side-list">
          {tracks.map((t) => (
            <li key={t.id}>
              <Link className={t.id === active ? "on" : ""} to={`/t/${t.id}`} onClick={onClose} aria-current={t.id === active ? "page" : undefined}>
                <span className="side-icon" aria-hidden="true">
                  {ICON[t.kind]}
                </span>
                <span className="side-text">
                  <b>{t.title}</b>
                  <small>{progress(t)}</small>
                </span>
              </Link>
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
