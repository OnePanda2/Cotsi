import { burst, clamp, drawGlow, drawParticles, drawRock, drawStars, type Game, type GameDef, makeStars, type Particle, rand, rockShape, stepParticles, TAU } from "./common";

// Comet Glide: steer a glowing comet through a soft nebula, gathering drifting stardust and
// gliding around slow asteroids. Follow your finger or the mouse, or use ← →.

type Mote = { x: number; y: number; phase: number; hue: string };
type Rock = { x: number; y: number; r: number; v: number; spin: number; shape: number[] };

function make(ev: { point(): void; miss(): void }): Game {
  const far = makeStars(70);
  const near = makeStars(30);
  let t = 0;
  let x = 0.5; // 0..1 across the width
  let target = 0.5;
  let motes: Mote[] = [];
  let rocks: Rock[] = [];
  let nextStream = 0.5;
  let nextRock = 2.5;
  let particles: Particle[] = [];
  let flash = 0;
  const tail: { x: number; y: number; life: number }[] = [];
  const HUES = ["rgba(130,240,255,1)", "rgba(255,214,120,1)", "rgba(255,160,230,1)"];

  return {
    key(dir) {
      if (dir === "left") target = clamp(target - 0.2, 0.08, 0.92);
      if (dir === "right") target = clamp(target + 0.2, 0.08, 0.92);
    },
    pointer(type, px, _py, w) {
      if (type === "down" || type === "move") target = clamp(px / w, 0.08, 0.92);
    },
    step(dt, w, h) {
      t += dt;
      x += (target - x) * Math.min(1, dt * 5);
      flash = Math.max(0, flash - dt);
      const fall = h * 0.2; // pixels per second: unhurried
      nextStream -= dt;
      if (nextStream <= 0) {
        nextStream = rand(1.8, 2.8);
        const sx = rand(0.15, 0.85);
        const hue = HUES[Math.floor(rand(0, HUES.length))];
        for (let i = 0; i < 5; i++) motes.push({ x: sx, y: -0.04 - i * 0.07, phase: rand(0, TAU), hue });
      }
      nextRock -= dt;
      if (nextRock <= 0) {
        nextRock = rand(2.6, 4.2);
        rocks.push({ x: rand(0.12, 0.88), y: -0.08, r: rand(0.035, 0.055), v: rand(0.8, 1.1), spin: rand(-1, 1), shape: rockShape() });
      }
      const cx = x * w;
      const cy = h * 0.8;
      const size = Math.min(w, h);
      for (const m of motes) {
        m.y += (fall * dt) / h;
        const mx = (m.x + Math.sin(t * 1.4 + m.phase) * 0.04) * w;
        const my = m.y * h;
        if (Math.hypot(mx - cx, my - cy) < size * 0.06) {
          m.y = 2; // taken
          burst(particles, mx, my, m.hue, 8, 70);
          ev.point();
        }
      }
      for (const r of rocks) {
        r.y += (fall * r.v * dt) / h;
        if (Math.hypot(r.x * w - cx, r.y * h - cy) < size * (r.r + 0.03)) {
          burst(particles, r.x * w, r.y * h, "rgba(255,130,100,1)", 18, 130);
          r.y = 2;
          flash = 0.5;
          ev.miss();
        }
      }
      motes = motes.filter((m) => m.y < 1.1);
      rocks = rocks.filter((r) => r.y < 1.15);
      for (const p of tail) p.life += dt;
      tail.push({ x: cx + rand(-2, 2), y: cy + size * 0.02, life: 0 });
      while (tail.length && tail[0].life > 0.9) tail.shift();
      for (const p of tail) p.y += fall * 1.4 * dt;
      particles = stepParticles(particles, dt);
    },
    draw(ctx, w, h) {
      const size = Math.min(w, h);
      const bg = ctx.createLinearGradient(0, 0, 0, h);
      bg.addColorStop(0, "#0b0a24");
      bg.addColorStop(0.6, "#1a0f3a");
      bg.addColorStop(1, "#2a1238");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);
      // Drifting nebula clouds.
      drawGlow(ctx, w * (0.3 + 0.08 * Math.sin(t * 0.13)), h * 0.3, "rgba(120,80,255,0.55)", size * 0.7, 0.35);
      drawGlow(ctx, w * (0.75 + 0.06 * Math.cos(t * 0.11)), h * 0.6, "rgba(255,90,180,0.5)", size * 0.6, 0.25);
      drawGlow(ctx, w * 0.5, h * 0.95, "rgba(60,200,255,0.45)", size * 0.5, 0.2);
      drawStars(ctx, far, w, h, t, t * 0.01);
      drawStars(ctx, near, w, h, t, t * 0.04);

      for (const m of motes) {
        const mx = (m.x + Math.sin(t * 1.4 + m.phase) * 0.04) * w;
        drawGlow(ctx, mx, m.y * h, m.hue, size * 0.05, 0.9);
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(mx, m.y * h, size * 0.008, 0, TAU);
        ctx.fill();
      }
      for (const r of rocks) {
        drawGlow(ctx, r.x * w, r.y * h, "rgba(255,120,90,0.8)", size * r.r * 2.2, 0.25);
        drawRock(ctx, r.x * w, r.y * h, size * r.r, r.shape, t * r.spin, "rgba(255,170,140,0.7)");
      }

      // The comet: a bright head with a long, fading tail.
      for (const p of tail) {
        const k = 1 - p.life / 0.9;
        drawGlow(ctx, p.x, p.y, "rgba(140,220,255,1)", size * 0.05 * k + 2, k * 0.5);
      }
      const cx = x * w;
      const cy = h * 0.8;
      drawGlow(ctx, cx, cy, "rgba(150,230,255,1)", size * 0.16, 0.85);
      drawGlow(ctx, cx, cy, "rgba(255,255,255,1)", size * 0.05, 1);

      drawParticles(ctx, particles);
      if (flash > 0) {
        ctx.fillStyle = `rgba(255,90,70,${flash * 0.22})`;
        ctx.fillRect(0, 0, w, h);
      }
    },
  };
}

export const COMET: GameDef = {
  id: "comet",
  name: "Comet Glide",
  icon: "☄️",
  unit: "stardust",
  help: "Drag or move the mouse (or ← →) to steer · gather stardust, glide past asteroids",
  make,
};
