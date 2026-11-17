import { useEffect, useRef, useState } from "react";
import { getItem, setItem } from "../storage";

// A calm 8-bit lane runner to keep hands busy while a lesson is read aloud. Cotsi's own art.
// Slow and steady on purpose: no game over, no speed-up, nothing to beat in a hurry, so most of
// the attention stays on the lesson. It pauses whenever Cotsi is waiting for an answer.

const W = 90; // logical pixels; scaled up with crisp edges
const H = 120;
const LANES = [15, 45, 75];
const PLAYER_Y = 100;
const SPEED = 24; // pixels per second
const BEST_KEY = "cotsi:runner-best";

const PALETTE: Record<string, string> = {
  p: "#8b7bff", // body
  d: "#5b4bd6", // shade
  w: "#f4f2fb", // visor
  k: "#1c1830", // eye
  y: "#ffd166", // spark
  o: "#f59e0b", // spark edge
  r: "#3a3352", // rock
  s: "#5a5274", // rock light
};

// Cotsi the robot, two running frames.
const BOT = [
  ["..pppppp..", ".pppppppp.", ".pwwwwwwp.", ".pwkwwkwp.", ".pwwwwwwp.", ".pppppppp.", "ppddppddpp", "p.pppppp.p", "..pp..pp..", "..dd...d.."],
  ["..pppppp..", ".pppppppp.", ".pwwwwwwp.", ".pwkwwkwp.", ".pwwwwwwp.", ".pppppppp.", "ppddppddpp", "p.pppppp.p", "..pp..pp..", "..d...dd.."],
];
const SPARK = ["..y..", ".yoy.", "yoyoy", ".yoy.", "..y.."];
const ROCK = ["..ssss..", ".srrrrs.", "srrrrrrs", "rrrsrrrr", "rrrrrrrr", ".rrrrrr."];

type Thing = { lane: number; y: number; kind: "spark" | "rock"; hit?: boolean };

function draw(ctx: CanvasRenderingContext2D, rows: string[], x: number, y: number) {
  for (let j = 0; j < rows.length; j++) {
    for (let i = 0; i < rows[j].length; i++) {
      const c = PALETTE[rows[j][i]];
      if (!c) continue;
      ctx.fillStyle = c;
      ctx.fillRect(Math.round(x) + i, Math.round(y) + j, 1, 1);
    }
  }
}

function readBest(): number {
  return Number(getItem("local", BEST_KEY)) || 0;
}

export function LaneRunner({ running, waitingNote }: { running: boolean; waitingNote: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const game = useRef({ lane: 1, x: LANES[1], things: [] as Thing[], t: 0, nextSpawn: 0.6, sparks: 0, bonk: 0, frame: 0 });
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(readBest);
  const runningRef = useRef(running);
  runningRef.current = running;

  const move = (dir: -1 | 1) => {
    if (!runningRef.current) return;
    const g = game.current;
    g.lane = Math.max(0, Math.min(2, g.lane + dir));
  };

  // Arrow keys / A and D, ignored while typing an answer.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "TEXTAREA" || t.tagName === "INPUT" || t.isContentEditable)) return;
      if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") move(-1);
      else if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") move(1);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const ctx = canvas.current?.getContext("2d");
    if (!ctx) return;
    let raf = 0;
    let last = performance.now();
    const step = (now: number) => {
      // The first frame's timestamp can be a little earlier than `last`, so never step backwards.
      const dt = Math.max(0, Math.min(0.05, (now - last) / 1000));
      last = now;
      const g = game.current;
      if (runningRef.current) {
        g.t += dt;
        g.frame += dt;
        g.x += (LANES[g.lane] - g.x) * Math.min(1, dt * 14);
        g.bonk = Math.max(0, g.bonk - dt);
        for (const th of g.things) th.y += SPEED * dt;
        // Spawn a row: at most two things, always leaving a free lane.
        g.nextSpawn -= dt;
        if (g.nextSpawn <= 0) {
          g.nextSpawn = 1.3 + Math.random() * 0.9;
          const lanes = [0, 1, 2].sort(() => Math.random() - 0.5);
          g.things.push({ lane: lanes[0], y: -8, kind: Math.random() < 0.6 ? "spark" : "rock" });
          if (Math.random() < 0.35) g.things.push({ lane: lanes[1], y: -8, kind: "spark" });
        }
        for (const th of g.things) {
          if (th.hit || th.lane !== g.lane || Math.abs(th.y + 3 - (PLAYER_Y + 5)) > 6) continue;
          th.hit = true;
          if (th.kind === "spark") {
            g.sparks++;
            setScore(g.sparks);
            if (g.sparks > readBest()) {
              setItem("local", BEST_KEY, String(g.sparks));
              setBest(g.sparks);
            }
          } else {
            g.bonk = 1; // a gentle wobble, nothing is lost
          }
        }
        g.things = g.things.filter((th) => th.y < H + 8 && !(th.hit && th.kind === "spark"));
      }

      // Night road.
      ctx.fillStyle = "#0d0b16";
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "#151226";
      ctx.fillRect(2, 0, W - 4, H);
      ctx.fillStyle = "#2a2440";
      const dash = (g.t * SPEED) % 12;
      for (const x of [30, 60]) for (let y = -12 + dash; y < H; y += 12) ctx.fillRect(x, Math.round(y), 1, 6);
      ctx.fillStyle = "#3b3260";
      ctx.fillRect(0, 0, 2, H);
      ctx.fillRect(W - 2, 0, 2, H);

      for (const th of g.things) {
        if (th.kind === "spark") draw(ctx, SPARK, LANES[th.lane] - 2, th.y);
        else draw(ctx, ROCK, LANES[th.lane] - 4, th.y);
      }
      const wobble = g.bonk > 0 ? Math.round(Math.sin(g.bonk * 30)) : 0;
      if (!(g.bonk > 0 && Math.floor(g.bonk * 10) % 2)) draw(ctx, BOT[Math.floor(g.frame * 6) % 2], g.x - 5 + wobble, PLAYER_Y);
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Tap the left or right half, or swipe.
  const touch = useRef<number | null>(null);
  return (
    <div className="runner">
      <div className="runner-head">
        <span>✨ {score}</span>
        <small>Best {best}</small>
      </div>
      <div className="runner-stage">
        <canvas
          ref={canvas}
          width={W}
          height={H}
          aria-label="Lane runner game. Use the left and right arrow keys, or tap the left or right side."
          role="img"
          onPointerDown={(e) => {
            touch.current = e.clientX;
          }}
          onPointerUp={(e) => {
            const start = touch.current;
            touch.current = null;
            const rect = e.currentTarget.getBoundingClientRect();
            if (start !== null && Math.abs(e.clientX - start) > 24) move(e.clientX < start ? -1 : 1);
            else move(e.clientX - rect.left < rect.width / 2 ? -1 : 1);
          }}
        />
        {!running && (
          <div className="runner-wait">
            <b>Paused</b>
            <small>{waitingNote}</small>
          </div>
        )}
      </div>
      <p className="runner-help">← → or tap a side · collect ✨, dodge rocks</p>
    </div>
  );
}
