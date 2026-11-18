import { type ReactNode, useState } from "react";
import { api, ApiError } from "../api";
import { useMe } from "../App";
import { reader, VOICES_ON } from "../speech";
import type { Prefs } from "../types";
import { VoicePicker, VoicesSoon } from "./Voice";

export const SHOW_IDEAS = ["Friends", "The Office", "Harry Potter", "Marvel's Avengers", "3 Idiots", "Taarak Mehta Ka Ooltah Chashmah"];

/** Pick the shows, movies or characters lessons use, or no characters at all. */
export function ShowsPicker({ prefs, onChange }: { prefs: Prefs; onChange: (p: Prefs) => void }) {
  const plain = prefs.style === "plain";
  const shows = prefs.shows ?? "";
  const listed = shows.split(",").map((s) => s.trim()).filter(Boolean);
  const toggle = (name: string) => {
    const next = listed.includes(name) ? listed.filter((s) => s !== name) : [...listed, name];
    onChange({ ...prefs, style: "characters", shows: next.join(", ") });
  };
  return (
    <div className="shows-pick">
      <div className="chips">
        {SHOW_IDEAS.map((s) => (
          <button type="button" key={s} className={`chip${!plain && listed.includes(s) ? " on" : ""}`} aria-pressed={!plain && listed.includes(s)} onClick={() => toggle(s)}>
            {s}
          </button>
        ))}
      </div>
      <input
        type="text"
        value={plain ? "" : shows}
        onChange={(e) => onChange({ ...prefs, style: "characters", shows: e.target.value })}
        placeholder="Or type your own, e.g. Panchayat, Naruto, Sherlock"
        maxLength={200}
        aria-label="Your favorite shows, movies or characters"
      />
      <label className="check">
        <input type="checkbox" checked={plain} onChange={(e) => onChange({ ...prefs, style: e.target.checked ? "plain" : "characters" })} />
        No characters, keep it plain
      </label>
    </div>
  );
}

/**
 * Asked once after sign-up (and once for people who joined before it existed):
 * reading lessons with characters, or listening to them read aloud.
 */
function ChooseMode() {
  const { me, reload } = useMe();
  const [prefs, setPrefs] = useState<Prefs>(me!.prefs);
  const [step, setStep] = useState<"mode" | "read" | "listen">("mode");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const save = async (next: Prefs) => {
    setBusy(true);
    setNote("");
    try {
      reader.stop();
      await api("PUT", "/prefs", next);
      await reload();
    } catch (err) {
      setNote(err instanceof ApiError ? err.message : "Couldn't save that. Please try again.");
      setBusy(false);
    }
  };
  const ready = step !== "read" || prefs.style === "plain" || Boolean(prefs.shows?.trim());

  return (
    <div className="panel welcome">
      {step === "mode" && (
        <>
          <h1>How do you like to learn?</h1>
          <p className="lede small">Pick what suits you. You can switch any time in Settings.</p>
          <div className="modes">
            <button className="mode-card" onClick={() => setStep("read")}>
              <span className="mode-icon" aria-hidden="true">
                📖
              </span>
              <b>Reading</b>
              <small>Read your lessons, with scenes starring characters from shows you love.</small>
            </button>
            <button className="mode-card" onClick={() => setStep("listen")}>
              <span className="mode-icon" aria-hidden="true">
                🎧
              </span>
              <b>Listening</b>
              <small>
                {VOICES_ON
                  ? "Cotsi reads lessons aloud in a voice you choose, and you can play a calm game while you listen."
                  : "Plain lessons with no characters and a calm game alongside. Natural read-aloud voices are coming soon."}
              </small>
            </button>
          </div>
        </>
      )}

      {step === "read" && (
        <>
          <button className="link back" onClick={() => setStep("mode")}>
            ← Back
          </button>
          <h1>Who should star in your lessons?</h1>
          <p className="lede small">Cotsi explains ideas through characters you already know. Pick one or more, or type your own.</p>
          <ShowsPicker prefs={prefs} onChange={setPrefs} />
        </>
      )}

      {step === "listen" && (
        <>
          <button
            className="link back"
            onClick={() => {
              reader.stop();
              setStep("mode");
            }}
          >
            ← Back
          </button>
          {VOICES_ON ? (
            <>
              <h1>Choose your voice</h1>
              <p className="lede small">Tap ▶ to hear each one.</p>
              <VoicePicker voice={prefs.voice} rate={prefs.rate} onChange={(v) => setPrefs({ ...prefs, ...v })} />
            </>
          ) : (
            <>
              <h1>Listening mode</h1>
              <p className="lede small">Plain lessons with no characters, and a calm game to play alongside.</p>
              <VoicesSoon />
            </>
          )}
        </>
      )}

      {step !== "mode" && (
        <>
          <p className="fine">You can change this any time in Settings.</p>
          {note && <div className="notice error">{note}</div>}
          <button className="btn" disabled={busy || !ready} onClick={() => void save({ ...prefs, mode: step })}>
            {busy ? "Saving…" : "Start learning"}
          </button>
        </>
      )}
    </div>
  );
}

/** Signed-in pages wait until the learner has said whether they read or listen. */
export function LearnModeGate({ children }: { children: ReactNode }) {
  const { me } = useMe();
  if (me && !me.prefs.mode) return <ChooseMode />;
  return <>{children}</>;
}
