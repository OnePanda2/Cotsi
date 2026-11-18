import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { api } from "../api";
import { getItem, setItem } from "../storage";
import { BUBBLES } from "./bubbles";
import { COMET } from "./comet";
import type { Game, GameDef, GameId } from "./common";
import { ORBIT } from "./orbit";
import { RUNNER } from "./runner";

// The side game beside a lesson in listening mode. It plays while Cotsi reads and waits while it's
// the learner's turn. A run is the points scored before a miss; the best run is the high score,
// and each game has its own weekly and all-time leaderboard.

export const GAMES: GameDef[] = [ORBIT, COMET, BUBBLES, RUNNER];
const GAME_KEY = "cotsi:game-id";

type BoardRow = { rank: number; name: string; score: number; me: boolean };
type Board = {
  game: GameId;
  week: { starts: string; rows: BoardRow[] };
  all: { rows: BoardRow[] };
  me: { name: string; shown: boolean; best: number; weekBest: number; weekRank: number | null; allRank: number | null };
};

const bestKey = (id: GameId) => (id === "runner" ? "cotsi:runner-best" : `cotsi:best:${id}`);
const readBest = (id: GameId) => Number(getItem("local", bestKey(id))) || 0;

/** Saves a finished run. Never interrupts the lesson if it fails. */
async function saveRun(game: GameId, score: number, ms: number): Promise<{ best: number } | null> {
  if (score < 1) return null;
  try {
    return await api<{ best: number }>("POST", "/game/run", { game, score, ms: Math.round(ms) });
  } catch {
    return null;
  }
}

function Leaderboard({ def, board, onClose }: { def: GameDef; board: Board | null; onClose: () => void }) {
  const [tab, setTab] = useState<"week" | "all">("week");
  const rows = board ? (tab === "week" ? board.week.rows : board.all.rows) : [];
  const rank = board ? (tab === "week" ? board.me.weekRank : board.me.allRank) : null;
  const mine = board ? (tab === "week" ? board.me.weekBest : board.me.best) : 0;
  return (
    <div className="board-scrim" onClick={onClose}>
      <div className="board" role="dialog" aria-modal="true" aria-label={`${def.name} leaderboard`} onClick={(e) => e.stopPropagation()}>
        <div className="board-head">
          <b>
            🏆 {def.icon} {def.name}
          </b>
          <button className="board-close" aria-label="Close leaderboard" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="tabs two" role="tablist">
          <button role="tab" aria-selected={tab === "week"} className={tab === "week" ? "on" : ""} onClick={() => setTab("week")}>
            This week
          </button>
          <button role="tab" aria-selected={tab === "all"} className={tab === "all" ? "on" : ""} onClick={() => setTab("all")}>
            All time
          </button>
        </div>
        {!board ? (
          <p className="fine">Loading…</p>
        ) : rows.length ? (
          <ol className="board-rows">
            {rows.map((r) => (
              <li key={r.rank} className={r.me ? "me" : ""}>
                <span className="board-rank">{r.rank <= 3 ? ["🥇", "🥈", "🥉"][r.rank - 1] : r.rank}</span>
                <span className="board-name">{r.me ? `${r.name} (you)` : r.name}</span>
                <span className="board-score">{r.score}</span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="fine">{tab === "week" ? "No runs yet this week. The first one takes the top spot." : "No runs yet."}</p>
        )}
        <p className="fine board-me">
          {!board
            ? ""
            : !board.me.shown
              ? "You're hidden from the leaderboard. "
              : rank && rank > rows.length
                ? `You're #${rank} with ${mine}. `
                : !mine
                  ? `Collect ${def.unit} to get on the board. `
                  : ""}
          {tab === "week" ? "The weekly board starts fresh every Monday." : `A score is your best run: ${def.unit} before a miss.`}{" "}
          {board && (
            <Link to="/settings" onClick={onClose}>
              {board.me.shown ? `Shown as ${board.me.name} · Change in Settings` : "Show me in Settings"}
            </Link>
          )}
        </p>
      </div>
    </div>
  );
}

export function GamePanel({ running, waitingNote, onHide }: { running: boolean; waitingNote: string; onHide: () => void }) {
  const [id, setId] = useState<GameId>(() => {
    const saved = getItem("local", GAME_KEY);
    return GAMES.some((g) => g.id === saved) ? (saved as GameId) : "orbit";
  });
  const def = GAMES.find((g) => g.id === id)!;
  const canvas = useRef<HTMLCanvasElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const game = useRef<Game | null>(null);
  const run = useRef({ score: 0, ms: 0, announced: false });
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(() => readBest(id));
  const bestRef = useRef(best);
  bestRef.current = best;
  const [flash, setFlash] = useState<{ text: string; good: boolean } | null>(null);
  const [board, setBoard] = useState<Board | null>(null);
  const [showBoard, setShowBoard] = useState(false);
  const runningRef = useRef(running);
  runningRef.current = running;
  const idRef = useRef(id);
  idRef.current = id;

  const say = useCallback((text: string, good = false) => {
    setFlash({ text, good });
    window.setTimeout(() => setFlash((f) => (f?.text === text ? null : f)), 1500);
  }, []);

  const loadBoard = useCallback(async (gid: GameId) => {
    try {
      const b = await api<Board>("GET", `/game/board?game=${gid}`);
      if (b.game !== idRef.current) return;
      setBoard(b);
      if (b.me.best > bestRef.current) setBest(b.me.best);
    } catch {
      // the game works without the board
    }
  }, []);

  /** A miss (or leaving) ends the run: save it and start the next one straight away. */
  const endRun = useCallback(
    (quiet = false) => {
      const r = run.current;
      const gid = idRef.current;
      if (r.score > 0) {
        if (!quiet) say(`Run over: ${r.score}`);
        void saveRun(gid, r.score, r.ms * 1000).then((res) => {
          if (res && res.best > bestRef.current && gid === idRef.current) setBest(res.best);
        });
      }
      run.current = { score: 0, ms: 0, announced: false };
      setScore(0);
    },
    [say],
  );

  // A fresh game whenever the learner picks a different one.
  useEffect(() => {
    setItem("local", GAME_KEY, id);
    setBest(readBest(id));
    setBoard(null);
    void loadBoard(id);
    game.current = def.make({
      point() {
        const r = run.current;
        r.score++;
        setScore(r.score);
        if (r.score > bestRef.current) {
          // Say it once per run, the moment the old best is passed.
          if (!r.announced && bestRef.current > 0) say("New best!", true);
          r.announced = true;
          bestRef.current = r.score;
          setItem("local", bestKey(idRef.current), String(r.score));
          setBest(r.score);
        }
      },
      miss() {
        endRun();
      },
    });
    return () => endRun(true);
  }, [id, def, endRun, loadBoard, say]);

  // Keep the canvas sharp at any size.
  useEffect(() => {
    const el = stage.current;
    const c = canvas.current;
    if (!el || !c) return;
    const fit = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const { width, height } = el.getBoundingClientRect();
      c.width = Math.max(1, Math.round(width * dpr));
      c.height = Math.max(1, Math.round(height * dpr));
      c.getContext("2d")?.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // The loop: move only while running, but always draw.
  useEffect(() => {
    const c = canvas.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    let raf = 0;
    let last = performance.now();
    const frame = (now: number) => {
      const dt = Math.max(0, Math.min(0.05, (now - last) / 1000));
      last = now;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = c.width / dpr;
      const h = c.height / dpr;
      const g = game.current;
      if (g && w > 2 && h > 2) {
        if (runningRef.current) {
          g.step(dt, w, h);
          run.current.ms += dt;
        }
        ctx.clearRect(0, 0, w, h);
        g.draw(ctx, w, h);
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Arrow keys, ignored while typing an answer.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "TEXTAREA" || t.tagName === "INPUT" || t.isContentEditable)) return;
      const map: Record<string, "left" | "right" | "up" | "down"> = {
        ArrowLeft: "left",
        ArrowRight: "right",
        ArrowUp: "up",
        ArrowDown: "down",
        a: "left",
        d: "right",
        w: "up",
        s: "down",
      };
      const dir = map[e.key] ?? map[e.key.toLowerCase()];
      if (!dir || !runningRef.current) return;
      game.current?.key?.(dir);
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const pointer = (type: "down" | "move" | "up") => (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!runningRef.current) return;
    const r = e.currentTarget.getBoundingClientRect();
    game.current?.pointer?.(type, e.clientX - r.left, e.clientY - r.top, r.width, r.height);
  };

  return (
    <section className="gp" aria-label="Side game">
      <div className="gp-head">
        <div className="gp-games" role="tablist" aria-label="Choose a game">
          {GAMES.map((g) => (
            <button key={g.id} role="tab" aria-selected={g.id === id} className={g.id === id ? "on" : ""} onClick={() => setId(g.id)} title={g.name}>
              <span aria-hidden="true">{g.icon}</span>
              <small>{g.name}</small>
            </button>
          ))}
        </div>
        <button type="button" className="gp-hide" onClick={onHide} aria-label="Hide game" title="Hide game">
          ✕
        </button>
      </div>
      <div className="gp-scores">
        <span>
          <small>This run</small>
          <b>{score}</b>
        </span>
        <span>
          <small>Best</small>
          <b>{best}</b>
        </span>
        <button
          type="button"
          className="runner-board-btn"
          onClick={() => {
            setShowBoard(true);
            void loadBoard(id);
          }}
        >
          🏆 Leaderboard
        </button>
      </div>
      <div className="gp-stage" ref={stage}>
        <canvas
          ref={canvas}
          aria-label={`${def.name}. ${def.help}`}
          role="img"
          onPointerDown={pointer("down")}
          onPointerMove={pointer("move")}
          onPointerUp={pointer("up")}
        />
        {flash && <div className={`gp-flash${flash.good ? " good" : ""}`}>{flash.text}</div>}
        {!running && (
          <div className="gp-wait">
            <b>Paused</b>
            <small>{waitingNote}</small>
          </div>
        )}
      </div>
      <div className="gp-foot">
        <p className="gp-help">{def.help}</p>
        <p className="gp-soon">✨ More games soon. Keep learning!</p>
      </div>
      {showBoard && createPortal(<Leaderboard def={def} board={board} onClose={() => setShowBoard(false)} />, document.body)}
    </section>
  );
}
