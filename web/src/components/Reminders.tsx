import { useState } from "react";
import { api, ApiError } from "../api";
import { timeZone, useMe } from "../App";
import { config } from "../config";

function keyBytes(b64url: string): Uint8Array<ArrayBuffer> {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((b64url.length + 3) % 4);
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

/** "yes", or "ios-home" when an iPhone must add Cotsi to the Home Screen first, or "no". */
export function pushSupport(): "yes" | "ios-home" | "no" {
  if (typeof window === "undefined" || typeof navigator === "undefined") return "no";
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const standalone =
    window.matchMedia?.("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  if (ios && !standalone) return "ios-home";
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window ? "yes" : "no";
}

async function turnOn(hour: number): Promise<void> {
  if (config.demo) throw new ApiError("Reminders are switched off in this preview. They work on the live site.", 0);
  const reg = await navigator.serviceWorker.register("/sw.js");
  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new ApiError("Notifications are blocked for Cotsi. Allow them in your browser's site settings, then try again.", 0);
  }
  const { key } = await api<{ key: string }>("GET", "/push/key");
  await navigator.serviceWorker.ready;
  const old = await reg.pushManager.getSubscription();
  if (old) await old.unsubscribe();
  const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key) });
  await api("PUT", "/push", { subscription: sub.toJSON(), hour, tz: timeZone() });
}

async function turnOff(): Promise<void> {
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    await (await reg?.pushManager.getSubscription())?.unsubscribe();
  } catch {
    // the browser may have dropped it already
  }
  await api("DELETE", "/push");
}

export function hourLabel(h: number): string {
  if (h === 0) return "12 am";
  if (h === 12) return "12 pm";
  return h < 12 ? `${h} am` : `${h - 12} pm`;
}

const HOURS = Array.from({ length: 18 }, (_, i) => i + 6); // 6 am to 11 pm

/** Turn the daily reminder on or off. `compact` is the one-line version for the streak card. */
export function ReminderControl({ compact = false }: { compact?: boolean }) {
  const { me, reload } = useMe();
  const [hour, setHour] = useState(me?.reminder?.hour ?? 20);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  if (!me) return null;
  const on = me.reminder?.on === true;
  const support = pushSupport();

  const run = async (action: () => Promise<void>, done: string) => {
    setBusy(true);
    setNote("");
    try {
      await action();
      await reload();
      setNote(done);
    } catch (err) {
      setNote(err instanceof ApiError ? err.message : "Couldn't change reminders on this device. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  if (support === "ios-home" && !on) {
    return (
      <p className="fine reminder-hint">
        🔔 For a daily reminder on iPhone: open Cotsi in Safari, tap Share → <b>Add to Home Screen</b>, then open Cotsi from your Home Screen.
      </p>
    );
  }
  if (support === "no" && !on) {
    return compact ? null : <p className="fine">This browser can't show reminders. Chrome on Android or a computer can.</p>;
  }

  if (on && compact) return null;

  return (
    <div className={`reminder ${compact ? "compact" : ""}`}>
      {on ? (
        <p className="fine">
          🔔 A reminder comes at <b>{hourLabel(me.reminder?.hour ?? 20)}</b> on days you haven't learned yet. One a day, at most.
        </p>
      ) : (
        !compact && <p className="fine">Get one nudge a day, only on days you haven't learned yet.</p>
      )}
      <div className="reminder-row">
        <label className="sr-only" htmlFor={compact ? "rem-hour-c" : "rem-hour"}>
          Reminder time
        </label>
        <select id={compact ? "rem-hour-c" : "rem-hour"} value={hour} onChange={(e) => setHour(Number(e.target.value))} disabled={busy}>
          {HOURS.map((h) => (
            <option key={h} value={h}>
              {hourLabel(h)}
            </option>
          ))}
        </select>
        <button className={compact ? "btn small" : "btn"} disabled={busy} onClick={() => void run(() => turnOn(hour), "Reminders are on.")}>
          {on ? "Change time" : "🔔 Remind me daily"}
        </button>
        {on && (
          <button className="link danger" disabled={busy} onClick={() => void run(turnOff, "Reminders are off.")}>
            Turn off
          </button>
        )}
      </div>
      {note && (
        <p className="fine" role="status">
          {note}
        </p>
      )}
    </div>
  );
}
