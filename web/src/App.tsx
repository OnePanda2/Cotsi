import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from "react";
import { Link, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { api, ApiError } from "./api";
import { useAuth } from "./auth";
import { config } from "./config";
import { Brand, Sidebar } from "./components/Sidebar";
import { Home } from "./pages/Home";
import { Job } from "./pages/Job";
import { Landing } from "./pages/Landing";
import { NewLesson } from "./pages/NewLesson";
import { Privacy } from "./pages/Privacy";
import { Settings } from "./pages/Settings";
import { TrackPage } from "./pages/TrackPage";
import { getItem, removeItem, setItem } from "./storage";
import type { Me } from "./types";

type MeState = { me: Me | null; reload: () => Promise<void> };
const MeContext = createContext<MeState>({ me: null, reload: async () => {} });
export const useMe = () => useContext(MeContext);

const NEXT_KEY = "cotsi:next";

/** The learner's time zone, so streak days and reminder times follow their own clock. */
export function timeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Kolkata";
  } catch {
    return "Asia/Kolkata";
  }
}
/** Remember where a signed-out visitor wanted to go, so sign-in lands them there. */
export function rememberNext(path: string) {
  setItem("session", NEXT_KEY, path);
}

function Footer() {
  return (
    <footer className="foot">
      <p>
        Built by Siddhesh Thapa · <Link to="/privacy">Privacy</Link>
      </p>
      <p>Cotsi teaches with AI. It can be wrong, so check anything important.</p>
    </footer>
  );
}

function Shell({ children }: { children: ReactNode }) {
  const { signedIn } = useAuth();
  const { me } = useMe();
  const [open, setOpen] = useState(false);
  const location = useLocation();

  useEffect(() => setOpen(false), [location.pathname, location.search]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!signedIn) {
    return (
      <div className="page">
        <header className="top">
          <Brand />
        </header>
        <main>{children}</main>
        <Footer />
      </div>
    );
  }

  return (
    <div className={`app${open ? " menu-open" : ""}`}>
      <Sidebar me={me} onClose={() => setOpen(false)} />
      <div className="scrim" onClick={() => setOpen(false)} aria-hidden="true" />
      <div className="page">
        <header className="top">
          <button className="menu-btn" aria-label="Open menu" aria-expanded={open} onClick={() => setOpen(true)}>
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
              <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
          <Brand />
        </header>
        <main>{children}</main>
        <Footer />
      </div>
    </div>
  );
}

function SignedIn({ children }: { children: ReactNode }) {
  const { ready, signedIn } = useAuth();
  const location = useLocation();
  if (!ready) return <p className="muted center">Loading…</p>;
  if (!signedIn) {
    rememberNext(location.pathname + location.search);
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}

export function App() {
  const { ready, signedIn, signOut } = useAuth();
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const reload = useCallback(async () => {
    try {
      setMe(await api<Me>("GET", `/me?tz=${encodeURIComponent(timeZone())}`));
      setError("");
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) await signOut();
      else setError(err instanceof ApiError ? err.message : "Couldn't load your account.");
    }
  }, [signOut]);

  useEffect(() => {
    if (!ready) return;
    if (!signedIn) {
      setMe(null);
      return;
    }
    void reload().then(() => {
      const next = getItem("session", NEXT_KEY);
      if (next) {
        removeItem("session", NEXT_KEY);
        navigate(next, { replace: true });
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, signedIn]);

  if (!config.configured) {
    return (
      <Shell>
        <div className="notice error">Cotsi isn't connected yet. Add the Supabase settings in web/src/config.ts (see SETUP.md).</div>
      </Shell>
    );
  }

  return (
    <MeContext.Provider value={{ me, reload }}>
      <Shell>
        {error && <div className="notice error">{error}</div>}
        <Routes>
          <Route path="/" element={!ready ? <p className="muted center">Loading…</p> : signedIn ? <Home /> : <Landing />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/new/:kind" element={<SignedIn><NewLesson /></SignedIn>} />
          <Route path="/t/:id" element={<SignedIn><TrackPage /></SignedIn>} />
          <Route path="/job" element={<SignedIn><Job /></SignedIn>} />
          <Route path="/settings" element={<SignedIn><Settings /></SignedIn>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Shell>
    </MeContext.Provider>
  );
}
