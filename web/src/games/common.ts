// Shared pieces for Cotsi's side games: the interface each game implements, and a few drawing
// helpers (soft glows, a starry sky, particles). Everything is drawn on a 2D canvas.

export type GameId = "orbit" | "comet" | "bubbles" | "runner";

/** What a game tells the panel: a point scored, or a miss that ends the run. */
export type GameEvents = { point(): void; miss(): void };

export interface Game {
  /** Advances the game. Only called while the game is running. */
  step(dt: number, w: number, h: number): void;
  draw(ctx: CanvasRenderingContext2D, w: number, h: number): void;
  key?(dir: "left" | "right" | "up" | "down"): void;
  pointer?(type: "down" | "move" | "up", x: number, y: number, w: number, h: number): void;
}

export type GameDef = {
  id: GameId;
  name: string;
  icon: string;
  /** What one point is called, e.g. "stars". */
  unit: string;
  help: string;
  make(ev: GameEvents): Game;
};

export const rand = (a: number, b: number) => a + Math.random() * (b - a);
export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
export const TAU = Math.PI * 2;

const glowCache = new Map<string, HTMLCanvasElement>();

/** A soft round glow, drawn once and reused (much faster than canvas shadows). */
export function glow(color: string, radius: number): HTMLCanvasElement {
  const r = Math.max(2, Math.round(radius));
  const key = `${color}|${r}`;
  let c = glowCache.get(key);
  if (!c) {
    c = document.createElement("canvas");
    c.width = c.height = r * 2;
    const g = c.getContext("2d")!;
    const grad = g.createRadialGradient(r, r, 0, r, r, r);
    grad.addColorStop(0, color);
    grad.addColorStop(0.35, color.replace(/[\d.]+\)$/, "0.45)"));
    grad.addColorStop(1, color.replace(/[\d.]+\)$/, "0)"));
    g.fillStyle = grad;
    g.fillRect(0, 0, r * 2, r * 2);
    glowCache.set(key, c);
  }
  return c;
}

export function drawGlow(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, radius: number, alpha = 1) {
  const g = glow(color, radius);
  ctx.globalAlpha = alpha;
  ctx.drawImage(g, x - g.width / 2, y - g.height / 2);
  ctx.globalAlpha = 1;
}

export type Star = { x: number; y: number; r: number; tw: number };

export function makeStars(n: number): Star[] {
  return Array.from({ length: n }, () => ({ x: Math.random(), y: Math.random(), r: rand(0.4, 1.4), tw: rand(0, TAU) }));
}

/** Twinkling stars across the canvas (positions are 0..1 so they fit any size). */
export function drawStars(ctx: CanvasRenderingContext2D, stars: Star[], w: number, h: number, t: number, drift = 0) {
  for (const s of stars) {
    const y = ((s.y + drift * s.r * 0.6) % 1) * h;
    ctx.globalAlpha = 0.35 + 0.35 * Math.sin(t * 1.3 + s.tw);
    ctx.fillStyle = "#e9e6ff";
    ctx.beginPath();
    ctx.arc(s.x * w, y, s.r, 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

export type Particle = { x: number; y: number; vx: number; vy: number; life: number; max: number; color: string; size: number };

export function burst(list: Particle[], x: number, y: number, color: string, n = 14, speed = 90) {
  for (let i = 0; i < n; i++) {
    const a = rand(0, TAU);
    const v = rand(speed * 0.4, speed);
    list.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0, max: rand(0.4, 0.8), color, size: rand(1.5, 3.5) });
  }
}

export function stepParticles(list: Particle[], dt: number): Particle[] {
  for (const p of list) {
    p.life += dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= 0.96;
    p.vy *= 0.96;
  }
  return list.filter((p) => p.life < p.max);
}

export function drawParticles(ctx: CanvasRenderingContext2D, list: Particle[]) {
  for (const p of list) {
    const k = 1 - p.life / p.max;
    drawGlow(ctx, p.x, p.y, p.color, p.size * 4, k);
  }
}

/** A rocky shape: a ring of points with a little randomness, made once per rock. */
export function rockShape(n = 9): number[] {
  return Array.from({ length: n }, () => rand(0.72, 1));
}

export function drawRock(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, shape: number[], angle: number, rim: string) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.beginPath();
  shape.forEach((k, i) => {
    const a = (i / shape.length) * TAU;
    const px = Math.cos(a) * r * k;
    const py = Math.sin(a) * r * k;
    if (i) ctx.lineTo(px, py);
    else ctx.moveTo(px, py);
  });
  ctx.closePath();
  const g = ctx.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.1, 0, 0, r);
  g.addColorStop(0, "#6b6283");
  g.addColorStop(1, "#211c33");
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = rim;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();
}
