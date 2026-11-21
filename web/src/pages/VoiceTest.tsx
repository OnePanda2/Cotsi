import { useEffect, useRef, useState } from "react";
import { api, apiAudio, ApiError } from "../api";

// A hidden page for choosing Cotsi's Hindi and Marathi voice: the same paragraph from each provider.

type Provider = "openai" | "sarvam" | "google";
type Lang = "hi" | "mr";
type Gender = "female" | "male";

const PROVIDERS: { id: Provider; name: string; note: string }[] = [
  { id: "openai", name: "OpenAI", note: "What Cotsi uses now" },
  { id: "sarvam", name: "Sarvam", note: "Indian company, built for Indian languages" },
  { id: "google", name: "Google", note: "Free for the first million characters a month" },
];
const LANGS: { id: Lang; name: string }[] = [
  { id: "hi", name: "हिंदी · Hindi" },
  { id: "mr", name: "मराठी · Marathi" },
];

type Status = { state: "idle" | "loading" | "playing" | "error"; message?: string };

export function VoiceTest() {
  const [info, setInfo] = useState<{ providers: Record<Provider, boolean>; samples: Record<Lang, string> } | null>(null);
  const [error, setError] = useState("");
  const [status, setStatus] = useState<Record<string, Status>>({});
  const [voices, setVoices] = useState<Record<string, string>>({});
  const urls = useRef(new Map<string, string>());
  const audio = useRef<HTMLAudioElement | null>(null);
  const playing = useRef<string | null>(null);

  useEffect(() => {
    api<{ providers: Record<Provider, boolean>; samples: Record<Lang, string> }>("GET", "/tts/compare")
      .then(setInfo)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Couldn't load the voice test."));
    return () => {
      audio.current?.pause();
      for (const u of urls.current.values()) URL.revokeObjectURL(u);
    };
  }, []);

  const set = (key: string, s: Status) => setStatus((all) => ({ ...all, [key]: s }));

  const stop = () => {
    audio.current?.pause();
    if (playing.current) set(playing.current, { state: "idle" });
    playing.current = null;
  };

  const play = async (p: Provider, lang: Lang, g: Gender) => {
    const key = `${p}:${lang}:${g}`;
    if (playing.current === key) return stop();
    stop();
    set(key, { state: "loading" });
    try {
      let url = urls.current.get(key);
      if (!url) {
        const blob = await apiAudio("GET", `/tts/compare/clip?provider=${p}&lang=${lang}&gender=${g}`, undefined, undefined, (h) => {
          const v = h.get("x-voice");
          if (v) setVoices((all) => ({ ...all, [key]: v }));
        });
        url = URL.createObjectURL(blob);
        urls.current.set(key, url);
      }
      if (!audio.current) audio.current = new Audio();
      const a = audio.current;
      a.src = url;
      a.onended = () => {
        if (playing.current === key) {
          playing.current = null;
          set(key, { state: "idle" });
        }
      };
      playing.current = key;
      set(key, { state: "playing" });
      await a.play();
    } catch (err) {
      // Tapping another sample stops this one; that isn't an error.
      if ((err as Error)?.name === "AbortError") {
        if (playing.current !== key) set(key, { state: "idle" });
        return;
      }
      if (playing.current === key) playing.current = null;
      set(key, { state: "error", message: err instanceof ApiError ? err.message : "Couldn't play this one." });
    }
  };

  if (error) return <div className="panel"><div className="notice error">{error}</div></div>;
  if (!info) return <p className="muted center">Loading…</p>;

  return (
    <div className="panel voice-test">
      <h1>Hindi and Marathi voices</h1>
      <p className="lede small">The same paragraph, read by each provider. Listen to all of them and pick the one that sounds most natural.</p>
      {LANGS.map((l) => (
        <section key={l.id} className="vt-lang">
          <h2>{l.name}</h2>
          <p className="vt-sample" lang={l.id}>
            {info.samples[l.id]}
          </p>
          <div className="vt-grid">
            {PROVIDERS.map((p) => (
              <div key={p.id} className={`vt-row${info.providers[p.id] ? "" : " off"}`}>
                <div className="vt-name">
                  <b>{p.name}</b>
                  <small>{info.providers[p.id] ? p.note : "Not set up yet: its key isn't in Supabase"}</small>
                </div>
                {(["female", "male"] as Gender[]).map((g) => {
                  const key = `${p.id}:${l.id}:${g}`;
                  const s = status[key] ?? { state: "idle" };
                  return (
                    <div key={g} className="vt-cell">
                      <button
                        type="button"
                        className={`btn small${s.state === "playing" ? "" : " ghost"}`}
                        disabled={!info.providers[p.id] || s.state === "loading"}
                        onClick={() => void play(p.id, l.id, g)}
                      >
                        {s.state === "loading" ? "Loading…" : s.state === "playing" ? "■ Stop" : `▶ ${g === "female" ? "Female" : "Male"}`}
                      </button>
                      {voices[key] && <small className="vt-voice">{voices[key]}</small>}
                      {s.state === "error" && <small className="vt-error">{s.message}</small>}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </section>
      ))}
      <p className="fine">Each sample is made once and saved, so listening again costs nothing.</p>
    </div>
  );
}
