import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiError, stream } from "../api";
import { useMe } from "../App";
import { Rich } from "../components/Rich";
import type { JobDraft, JobPrefs, RoleRec, ScanResult, Track } from "../types";

const SIGNALS = [
  { id: "hiring", label: "Hiring demand", hint: "Roles and skills showing up in job postings" },
  { id: "money", label: "Where money is going", hint: "Funding and investment that will turn into hiring" },
  { id: "launches", label: "New tools, platforms and rules", hint: "Launches that become job requirements" },
  { id: "momentum", label: "Community momentum", hint: "Fast-growing tools without enough skilled people" },
];
const MAX_PDF_BYTES = 4 * 1024 * 1024;

type ScanState = { status: "waiting" | "running" | "done" | "failed"; note?: string; result?: ScanResult };

function readBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(new Error("read failed"));
    reader.readAsDataURL(file);
  });
}

function Upload({ onDone }: { onDone: (d: JobDraft) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState("");
  const [paste, setPaste] = useState(false);
  const [prefs, setPrefs] = useState<JobPrefs>({ hoursPerWeek: 5, horizonMonths: 3, location: "", workMode: "either", note: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    if (!paste && !file) return setError("Choose your CV file first.");
    if (!paste && file && file.size > MAX_PDF_BYTES) return setError("That file is over 4 MB. Please upload a smaller PDF, or paste the text.");
    if (paste && text.trim().length < 200) return setError("Paste your full CV text (at least a few lines).");
    setBusy(true);
    try {
      const body = paste ? { text, prefs } : { pdfBase64: await readBase64(file!), prefs };
      const { draft } = await api<{ draft: JobDraft }>("POST", "/job/profile", body);
      onDone(draft);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't read that file. Please try again.");
      setBusy(false);
    }
  };

  return (
    <form className="panel form" onSubmit={submit}>
      <h1>
        Upload your CV. <em>Cotsi does the rest.</em>
      </h1>
      <p className="lede small">It finds the roles rising in your field, then builds a syllabus of only what you're missing.</p>

      {!paste ? (
        <label className="drop">
          <input type="file" accept="application/pdf,.pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          <span className="icon" aria-hidden="true">
            📄
          </span>
          <b>{file ? file.name : "Choose your CV (PDF, up to 4 MB)"}</b>
          <small>{file ? "Tap to choose a different file" : "The file isn't kept. Only a profile of your skills is saved."}</small>
        </label>
      ) : (
        <label>
          Paste your CV text
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={8} maxLength={30000} placeholder="Paste the full text of your CV here" />
        </label>
      )}
      <button type="button" className="link" onClick={() => setPaste(!paste)}>
        {paste ? "Upload a PDF instead" : "No PDF? Paste the text instead"}
      </button>

      <div className="grid2">
        <label>
          Hours you can study per week
          <select value={prefs.hoursPerWeek} onChange={(e) => setPrefs({ ...prefs, hoursPerWeek: Number(e.target.value) })}>
            {[2, 5, 10, 20, 30].map((h) => (
              <option key={h} value={h}>
                About {h} hours
              </option>
            ))}
          </select>
        </label>
        <label>
          Be job-ready in
          <select value={prefs.horizonMonths} onChange={(e) => setPrefs({ ...prefs, horizonMonths: Number(e.target.value) as 3 | 6 })}>
            <option value={3}>3 months</option>
            <option value={6}>6 months</option>
          </select>
        </label>
        <label>
          Country you want to work in
          <input type="text" value={prefs.location} onChange={(e) => setPrefs({ ...prefs, location: e.target.value })} placeholder="e.g. India" maxLength={80} />
        </label>
        <label>
          Kind of work
          <select value={prefs.workMode} onChange={(e) => setPrefs({ ...prefs, workMode: e.target.value as JobPrefs["workMode"] })}>
            <option value="either">Remote or on-site</option>
            <option value="remote">Remote only</option>
            <option value="on-site">On-site only</option>
          </select>
        </label>
      </div>
      <label>
        <span>
          Anything Cotsi should know? <small>(optional)</small>
        </span>
        <input type="text" value={prefs.note} onChange={(e) => setPrefs({ ...prefs, note: e.target.value })} placeholder="e.g. I want to move into data work" maxLength={300} />
      </label>

      {error && <div className="notice error">{error}</div>}
      <button className="btn" disabled={busy}>
        {busy ? "Reading your CV…" : "Find my best roles"}
      </button>
      <p className="fine">Takes two to three minutes. Forecasts are estimates, not guarantees.</p>
    </form>
  );
}

function ProfileCard({ draft }: { draft: JobDraft }) {
  const p = draft.profile!;
  return (
    <section className="card profile">
      <p className="kicker">What Cotsi read from your CV</p>
      <h2>{p.headline || p.current_role}</h2>
      <p>{p.summary}</p>
      <div className="chips">
        {p.skills.slice(0, 12).map((s) => (
          <span key={s.name} className={`chip ${s.level}`}>
            {s.name}
          </span>
        ))}
      </div>
    </section>
  );
}

function RoleCard({ role, rank, onChoose, busy }: { role: RoleRec; rank: number; onChoose: () => void; busy: boolean }) {
  return (
    <article className={`card role ${rank === 1 ? "best" : ""}`}>
      <header>
        <span className="rank">{rank === 1 ? "Best match" : `Option ${rank}`}</span>
        <span className="fit" title="How well this fits you today">
          {role.fit_score}% fit
        </span>
      </header>
      <h2>{role.title}</h2>
      <p>{role.one_liner}</p>
      <p className="why">
        <b>Why it's rising:</b> {role.why_rising}
      </p>
      <div className="chips">
        {role.signals.map((s) => (
          <span key={s} className="chip">
            {SIGNALS.find((x) => x.id === s)?.label ?? s}
          </span>
        ))}
        <span className={`chip conf-${role.confidence}`}>{role.confidence} confidence</span>
      </div>
      <div className="cols">
        <div>
          <h3>You already have</h3>
          <ul>
            {role.have.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </div>
        <div>
          <h3>You'll learn</h3>
          <ul>
            {role.gaps.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </div>
      </div>
      <p className="fine">
        About {role.weeks_to_ready} weeks to interview-ready at your pace. {role.pay_note}
      </p>
      {role.evidence.length > 0 && (
        <p className="fine">
          Evidence:{" "}
          {role.evidence.map((e, i) => (
            <span key={e.url}>
              {i > 0 && " · "}
              <a href={e.url} target="_blank" rel="noopener noreferrer">
                {e.title}
              </a>
            </span>
          ))}
        </p>
      )}
      <button className="btn" onClick={onChoose} disabled={busy}>
        Start this path →
      </button>
    </article>
  );
}

export function Job() {
  const { reload } = useMe();
  const navigate = useNavigate();
  const [draft, setDraft] = useState<JobDraft | null | undefined>(undefined);
  const [scans, setScans] = useState<Record<string, ScanState>>({});
  const [ranking, setRanking] = useState(false);
  const [error, setError] = useState("");
  const [choosing, setChoosing] = useState(false);
  const running = useRef(false);

  useEffect(() => {
    api<{ draft: JobDraft | null; scans: Record<string, ScanResult> }>("GET", "/job")
      .then((d) => {
        const initial: Record<string, ScanState> = {};
        for (const s of SIGNALS) initial[s.id] = d.scans[s.id] ? { status: "done", result: d.scans[s.id] } : { status: "waiting" };
        setScans(initial);
        setDraft(d.draft);
      })
      .catch((err) => {
        setError(err instanceof ApiError ? err.message : "Couldn't load.");
        setDraft(null);
      });
  }, []);

  const runScan = useCallback(async (id: string) => {
    setScans((s) => ({ ...s, [id]: { status: "running", note: "Starting…" } }));
    try {
      let result: ScanResult | undefined;
      await stream("/job/scan", { signal: id }, (e) => {
        if (e.t === "status") setScans((s) => ({ ...s, [id]: { status: "running", note: e.d } }));
        if (e.t === "done") result = e as unknown as ScanResult;
      });
      setScans((s) => ({ ...s, [id]: { status: "done", result } }));
    } catch (err) {
      setScans((s) => ({ ...s, [id]: { status: "failed", note: err instanceof ApiError ? err.message : "Failed" } }));
    }
  }, []);

  const rank = useCallback(async () => {
    setRanking(true);
    setError("");
    try {
      const { draft: d } = await api<{ draft: JobDraft }>("POST", "/job/recommend");
      setDraft(d);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't rank the roles. Please try again.");
    } finally {
      setRanking(false);
    }
  }, []);

  // Once there's a profile, run the four scans two at a time, then rank.
  useEffect(() => {
    if (!draft?.profile || draft.recs || running.current) return;
    const waiting = SIGNALS.map((s) => s.id).filter((id) => scans[id]?.status === "waiting");
    if (!waiting.length) return;
    running.current = true;
    (async () => {
      const queue = [...waiting];
      const worker = async () => {
        for (let id = queue.shift(); id; id = queue.shift()) await runScan(id);
      };
      await Promise.all([worker(), worker()]);
      running.current = false;
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft?.profile, draft?.recs]);

  const states = SIGNALS.map((s) => scans[s.id]?.status);
  const settled = states.every((s) => s === "done" || s === "failed");
  const doneCount = states.filter((s) => s === "done").length;
  useEffect(() => {
    if (draft?.profile && !draft.recs && settled && doneCount >= 2 && !ranking && !error) void rank();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settled, doneCount, draft?.profile, draft?.recs]);

  const choose = async (index: number) => {
    setChoosing(true);
    try {
      const { track } = await api<{ track: Track }>("POST", "/job/choose", { index });
      void reload();
      navigate(`/t/${track.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't start that path.");
      setChoosing(false);
    }
  };

  const startOver = () => {
    if (!confirm("Start again with a new CV? Your current results will be replaced. (One analysis per day.)")) return;
    setDraft(null);
    setError("");
    setScans(Object.fromEntries(SIGNALS.map((s) => [s.id, { status: "waiting" as const }])));
  };

  if (draft === undefined) return <p className="muted center">Loading…</p>;
  if (!draft?.profile) {
    return (
      <>
        {error && <div className="notice error">{error}</div>}
        <Upload
          onDone={(d) => {
            setScans(Object.fromEntries(SIGNALS.map((s) => [s.id, { status: "waiting" as const }])));
            setDraft(d);
          }}
        />
      </>
    );
  }

  return (
    <div className="job">
      <ProfileCard draft={draft} />

      {!draft.recs && (
        <section className="scan">
          <h1>
            Scanning the market <em>for you</em>
          </h1>
          <ul className="list">
            {SIGNALS.map((s) => {
              const st = scans[s.id] ?? { status: "waiting" };
              return (
                <li key={s.id} className={`card row scanrow ${st.status}`}>
                  <span className="state" aria-hidden="true">
                    {st.status === "done" ? "✓" : st.status === "failed" ? "!" : st.status === "running" ? <span className="spin" /> : "·"}
                  </span>
                  <span className="grow">
                    <b>{s.label}</b>
                    <small>{st.status === "running" ? st.note : st.status === "failed" ? st.note : s.hint}</small>
                  </span>
                  {st.status === "failed" && (
                    <button className="link" onClick={() => void runScan(s.id)}>
                      Retry
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
          {ranking && (
            <p className="typing center">
              <span className="spin" /> Ranking the best roles for you…
            </p>
          )}
          {error && (
            <div className="notice error">
              {error}{" "}
              {settled && doneCount >= 2 && (
                <button className="link" onClick={() => void rank()}>
                  Try again
                </button>
              )}
            </div>
          )}
          {settled && doneCount < 2 && <div className="notice error">Too few scans finished. Retry the failed ones above.</div>}
        </section>
      )}

      {draft.recs && (
        <section className="recs">
          <h1>
            Your three best <em>next roles</em>
          </h1>
          <p className="fine">{draft.recs.caveat}</p>
          {error && <div className="notice error">{error}</div>}
          {draft.recs.roles.map((r, i) => (
            <RoleCard key={r.title} role={r} rank={i + 1} busy={choosing} onChoose={() => void choose(i)} />
          ))}
          {draft.recs.watchlist.length > 0 && (
            <div className="card">
              <p className="kicker">On the radar</p>
              <ul>
                {draft.recs.watchlist.map((w) => (
                  <li key={w.title}>
                    <b>{w.title}:</b> {w.note}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <details className="card">
            <summary>See the raw market scans</summary>
            {SIGNALS.map((s) =>
              scans[s.id]?.result ? (
                <div key={s.id}>
                  <h3>{s.label}</h3>
                  <Rich text={scans[s.id].result!.text} />
                </div>
              ) : null,
            )}
          </details>
          <button className="link" onClick={startOver}>
            Start again with a different CV
          </button>
        </section>
      )}
    </div>
  );
}
