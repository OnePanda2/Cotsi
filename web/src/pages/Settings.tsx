import { useEffect, useState } from "react";
import { api, ApiError } from "../api";
import { useMe } from "../App";
import { useAuth } from "../auth";
import { ReminderControl } from "../components/Reminders";
import { VoicePicker, VoicesSoon } from "../components/Voice";
import { VOICES_ON } from "../speech";

/** Matches the API: first name and last initial, e.g. "Riya S." */
function boardName(full: string): string {
  const parts = full.split(/\s+/).filter(Boolean);
  if (!parts.length) return "Learner";
  return parts.length > 1 ? `${parts[0]} ${[...parts[parts.length - 1]][0].toUpperCase()}.` : parts[0];
}
import type { Prefs } from "../types";
import { StylePicker } from "./NewLesson";

export function Settings() {
  const { me, reload } = useMe();
  const { signOut } = useAuth();
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [note, setNote] = useState("");

  useEffect(() => {
    if (me && !prefs) setPrefs(me.prefs);
  }, [me, prefs]);

  if (!me || !prefs) return <p className="muted center">Loading…</p>;

  const save = async () => {
    try {
      await api("PUT", "/prefs", prefs);
      await reload();
      setNote("Saved.");
    } catch (err) {
      setNote(err instanceof ApiError ? err.message : "Couldn't save.");
    }
  };

  const wipe = async () => {
    if (!confirm("Delete your account and everything Cotsi has saved about you? This can't be undone.")) return;
    try {
      await api("DELETE", "/me");
      await signOut();
    } catch (err) {
      setNote(err instanceof ApiError ? err.message : "Couldn't delete your data.");
    }
  };

  return (
    <div className="panel form">
      <h1>Settings</h1>
      <p className="fine">Signed in as {me.user.email}</p>
      <fieldset>
        <legend>How you learn</legend>
        <div className="segmented">
          <button type="button" className={prefs.mode !== "listen" ? "on" : ""} onClick={() => setPrefs({ ...prefs, mode: "read" })}>
            <b>📖 Reading</b>
            <small>With characters</small>
          </button>
          <button type="button" className={prefs.mode === "listen" ? "on" : ""} onClick={() => setPrefs({ ...prefs, mode: "listen" })}>
            <b>🎧 Listening</b>
            <small>{VOICES_ON ? "Read aloud, plus a game" : "Plain lessons, plus a game"}</small>
          </button>
        </div>
      </fieldset>
      {prefs.mode === "listen" ? (
        <fieldset>
          <legend>Voice</legend>
          {VOICES_ON ? <VoicePicker voice={prefs.voice} rate={prefs.rate} onChange={(v) => setPrefs({ ...prefs, ...v })} /> : <VoicesSoon />}
        </fieldset>
      ) : null}
      {prefs.mode === "listen" ? (
        <label className="check">
          <input type="checkbox" checked={prefs.board !== false} onChange={(e) => setPrefs({ ...prefs, board: e.target.checked ? undefined : false })} />
          <span>
            Show me on the game leaderboard as <b>{boardName(me.user.name)}</b>
          </span>
        </label>
      ) : (
        <StylePicker prefs={prefs} onChange={setPrefs} />
      )}
      <label className="check">
        <input type="checkbox" checked={prefs.visuals !== false} onChange={(e) => setPrefs({ ...prefs, visuals: e.target.checked })} />
        Show interactive visuals in lessons
      </label>
      <button className="btn" onClick={save}>
        Save
      </button>
      {note && <p className="fine" role="status">{note}</p>}
      <hr />
      <h2 className="label">Daily reminder</h2>
      <ReminderControl />
      <hr />
      <button className="btn ghost" onClick={() => void signOut()}>
        Sign out
      </button>
      <button className="link danger" onClick={wipe}>
        Delete my account and all my data
      </button>
    </div>
  );
}
