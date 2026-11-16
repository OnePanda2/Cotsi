import { useState } from "react";
import { Link } from "react-router-dom";
import { api, ApiError } from "../api";
import { useMe } from "../App";
import { TERMS_VERSION } from "../pages/Terms";

/** Shown once (and again when the terms change) before a learner can use Cotsi. */
export function AcceptTerms() {
  const { reload } = useMe();
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const accept = async () => {
    setBusy(true);
    setNote("");
    try {
      await api("PUT", "/terms", { version: TERMS_VERSION, adult: true });
      await reload();
    } catch (err) {
      setNote(err instanceof ApiError ? err.message : "Couldn't save that. Please try again.");
      setBusy(false);
    }
  };
  return (
    <div className="panel accept">
      <h1>Before you start</h1>
      <p className="lede small">A few honest things about Cotsi:</p>
      <ul className="accept-points">
        <li>
          <span aria-hidden="true">🧠</span>
          <span>Cotsi teaches <b>understanding</b>: ideas, tech, history, logic. Physical skills like guitar or bricklaying need real practice; Cotsi can only explain the theory.</span>
        </li>
        <li>
          <span aria-hidden="true">🤖</span>
          <span>Lessons are written by <b>AI and can be wrong</b>. Check anything important.</span>
        </li>
        <li>
          <span aria-hidden="true">🩺</span>
          <span>Health, money and legal topics are <b>education, not advice</b>.</span>
        </li>
        <li>
          <span aria-hidden="true">💼</span>
          <span>Job forecasts are <b>estimates, not guarantees</b>. Never pay anyone for a job offer.</span>
        </li>
        <li>
          <span aria-hidden="true">📄</span>
          <span>Upload only your own CV and information.</span>
        </li>
      </ul>
      <label className="check accept-check">
        <input type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} />
        <span>
          I'm 18 or older, and I agree to the{" "}
          <Link to="/terms" target="_blank" rel="noopener">
            Terms of Use
          </Link>{" "}
          and the{" "}
          <Link to="/privacy" target="_blank" rel="noopener">
            Privacy policy
          </Link>
          .
        </span>
      </label>
      <button className="btn" disabled={!ok || busy} onClick={() => void accept()}>
        {busy ? "Saving…" : "Start learning"}
      </button>
      {note && (
        <p className="fine" role="status">
          {note}
        </p>
      )}
    </div>
  );
}
