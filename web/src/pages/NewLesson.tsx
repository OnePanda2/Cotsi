import { type FormEvent, useEffect, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { api, ApiError } from "../api";
import { useMe } from "../App";
import { NotReady, useAiReady } from "../components/NotReady";
import { ShowsPicker } from "../components/LearnMode";
import { VOICES_ON } from "../speech";
import type { Prefs, Track } from "../types";

const COPY = {
  topic: { title: "What do you want to understand?", placeholder: "e.g. how HTTPS works, options trading, recursion", label: "Topic", cta: "Start learning" },
  book: { title: "Which book?", placeholder: "e.g. Atomic Habits by James Clear", label: "Book title", cta: "Teach me this book" },
};

const DEPTHS = [
  { id: "quick", label: "Quick", hint: "One short overview" },
  { id: "standard", label: "Standard", hint: "One idea at a time" },
  { id: "deep", label: "Deep", hint: "Full breakdowns" },
];

export function StylePicker({ prefs, onChange }: { prefs: Prefs; onChange: (p: Prefs) => void }) {
  return (
    <fieldset className="style-picker">
      <legend>Who stars in your lessons?</legend>
      <ShowsPicker prefs={prefs} onChange={onChange} />
    </fieldset>
  );
}

export function NewLesson() {
  const { kind } = useParams();
  const { me, reload } = useMe();
  const aiReady = useAiReady();
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [depth, setDepth] = useState("standard");
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (me && !prefs) setPrefs(me.prefs);
  }, [me, prefs]);

  if (kind !== "topic" && kind !== "book") return <Navigate to="/" replace />;
  const copy = COPY[kind];

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (title.trim().length < 2 || busy) return;
    setBusy(true);
    setError("");
    try {
      if (prefs && me && JSON.stringify(prefs) !== JSON.stringify(me.prefs)) await api("PUT", "/prefs", prefs);
      const { track } = await api<{ track: Track }>("POST", "/tracks", { kind, title, depth });
      void reload();
      navigate(`/t/${track.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
      setBusy(false);
    }
  };

  return (
    <form className="panel form" onSubmit={submit}>
      <h1>{copy.title}</h1>
      <NotReady />
      <label>
        {copy.label}
        <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={copy.placeholder} maxLength={200} autoFocus required />
      </label>

      <fieldset>
        <legend>How deep?</legend>
        <div className="segmented">
          {DEPTHS.map((d) => (
            <button type="button" key={d.id} className={depth === d.id ? "on" : ""} onClick={() => setDepth(d.id)}>
              <b>{d.label}</b>
              <small>{d.hint}</small>
            </button>
          ))}
        </div>
      </fieldset>

      {prefs && kind === "topic" && prefs.mode !== "listen" && <StylePicker prefs={prefs} onChange={setPrefs} />}
      {prefs?.mode === "listen" && VOICES_ON && <p className="fine">🎧 Cotsi will read this lesson aloud. Change the voice in Settings.</p>}
      {kind === "book" && <p className="fine">Book lessons use the plain style. Cotsi tells you when it isn't sure about a book's details.</p>}

      {error && <div className="notice error">{error}</div>}
      <button className="btn" disabled={busy || !aiReady || title.trim().length < 2}>
        {busy ? "Starting…" : copy.cta}
      </button>
    </form>
  );
}
