import { useEffect, useState } from "react";
import { api, ApiError } from "../api";
import { useMe } from "../App";
import { useAuth } from "../auth";
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
      <StylePicker prefs={prefs} onChange={setPrefs} />
      <label className="check">
        <input type="checkbox" checked={prefs.visuals !== false} onChange={(e) => setPrefs({ ...prefs, visuals: e.target.checked })} />
        Show interactive visuals in lessons
      </label>
      <button className="btn" onClick={save}>
        Save
      </button>
      {note && <p className="fine" role="status">{note}</p>}
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
