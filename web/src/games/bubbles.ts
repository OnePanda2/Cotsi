import { burst, drawGlow, drawParticles, drawStars, type Game, type GameDef, makeStars, type Particle, rand, stepParticles, TAU } from "./common";

// Bubble Garden: glowing bubbles drift up through a slow aurora. Pop the glowing ones; leave the
// dark spiky ones alone (popping one ends the run). Nothing to read, so the ears stay on the lesson.

const COLOURS = [
  { fill: "rgba(255,140,200,1)", core: "#ffd3ec" },
  { fill: "rgba(90,230,220,1)", core: "#d3fffb" },
  { fill: "rgba(255,206,110,1)", core: "#fff2cf" },
];

type Bubble = { x: number; y: number; r: number; c: number; v: number; phase: number; spiky: boolean; spin: number; popped?: number };

function make(ev: { point(): void; miss(): void }): Game {
  const stars = makeStars(40);
  let t = 0;
  let bubbles: Bubble[] = [];
  let nextSpawn = 0.3;
  let particles: Particle[] = [];
  let shake = 0;

  const drawSpiky = (ctx: CanvasRenderingContext2D, x: number, y: number, r: number, spin: number, alpha: number) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(spin);
    ctx.globalAlpha = alpha;
    drawGlow(ctx, 0, 0, "rgba(255,70,90,0.8)", r * 2.2, 0.35 * alpha);
    ctx.beginPath();
    const points = 12;
    for (let i = 0; i < points * 2; i++) {
      const a = (i / (points * 2)) * TAU;
      const rr = i % 2 ? r * 0.72 : r * 1.12;
      if (i) ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
      else ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    ctx.closePath();
    const g = ctx.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.1, 0, 0, r * 1.1);
    g.addColorStop(0, "#5a3a6e");
    g.addColorStop(1, "#1a0f24");
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = "rgba(255,110,130,0.75)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
    ctx.globalAlpha = 1;
  };

  return {
    pointer(type, px, py, w, h) {
      if (type !== "down") return;
      const size = Math.min(w, h);
      // The topmost (last drawn) bubble under the tap.
      for (let i = bubbles.length - 1; i >= 0; i--) {
        const b = bubbles[i];
        if (b.popped !== undefined) continue;
        const bx = (b.x + Math.sin(t * 1.1 + b.phase) * 0.025) * w;
        if (Math.hypot(px - bx, py - b.y * h) > b.r * size * 1.15) continue;
        b.popped = 0;
        if (b.spiky) {
          burst(particles, bx, b.y * h, "rgba(255,90,110,1)", 18, 130);
          shake = 0.4;
          ev.miss();
        } else {
          burst(particles, bx, b.y * h, COLOURS[b.c].fill, 16, 120);
          ev.point();
        }
        return;
      }
    },
    step(dt) {
      t += dt;
      shake = Math.max(0, shake - dt);
      nextSpawn -= dt;
      if (nextSpawn <= 0) {
        nextSpawn = rand(0.75, 1.15);
        const spiky = Math.random() < 0.25;
        bubbles.push({
          x: rand(0.12, 0.88),
          y: 1.08,
          r: spiky ? rand(0.05, 0.065) : rand(0.055, 0.085),
          c: Math.floor(rand(0, COLOURS.length)),
          v: rand(0.07, 0.11),
          phase: rand(0, TAU),
          spiky,
          spin: rand(-0.6, 0.6),
        });
      }
      for (const b of bubbles) {
        if (b.popped !== undefined) b.popped += dt;
        else b.y -= b.v * dt;
      }
      bubbles = bubbles.filter((b) => b.y > -0.12 && (b.popped === undefined || b.popped < 0.25));
      particles = stepParticles(particles, dt);
    },
    draw(ctx, w, h) {
      const size = Math.min(w, h);
      const ox = shake > 0 ? Math.sin(shake * 60) * 4 * shake : 0;
      ctx.save();
      ctx.translate(ox, 0);
      const bg = ctx.createLinearGradient(0, 0, 0, h);
      bg.addColorStop(0, "#071a24");
      bg.addColorStop(0.5, "#0d1630");
      bg.addColorStop(1, "#1a1036");
      ctx.fillStyle = bg;
      ctx.fillRect(-10, 0, w + 20, h);
      drawStars(ctx, stars, w, h, t);

      // Aurora ribbons, slowly waving.
      const ribbons = [
        { y: 0.22, color: "rgba(80,255,190,", amp: 0.05, speed: 0.35 },
        { y: 0.34, color: "rgba(140,120,255,", amp: 0.06, speed: 0.27 },
      ];
      for (const r of ribbons) {
        const grad = ctx.createLinearGradient(0, (r.y - 0.12) * h, 0, (r.y + 0.12) * h);
        grad.addColorStop(0, `${r.color}0)`);
        grad.addColorStop(0.5, `${r.color}0.22)`);
        grad.addColorStop(1, `${r.color}0)`);
        ctx.fillStyle = grad;
        ctx.beginPath();
        for (let i = 0; i <= 24; i++) {
          const xx = (i / 24) * w;
          const yy = (r.y + Math.sin(i * 0.5 + t * r.speed * 3) * r.amp) * h;
          if (i) ctx.lineTo(xx, yy - 0.1 * h);
          else ctx.moveTo(xx, yy - 0.1 * h);
        }
        for (let i = 24; i >= 0; i--) {
          const xx = (i / 24) * w;
          const yy = (r.y + Math.sin(i * 0.5 + t * r.speed * 3 + 1) * r.amp) * h;
          ctx.lineTo(xx, yy + 0.1 * h);
        }
        ctx.closePath();
        ctx.fill();
      }

      for (const b of bubbles) {
        const x = (b.x + Math.sin(t * 1.1 + b.phase) * 0.025) * w;
        const y = b.y * h;
        const grow = b.popped !== undefined ? 1 + b.popped * 2 : 1;
        const alpha = b.popped !== undefined ? 1 - b.popped / 0.25 : 1;
        const r = b.r * size * grow;
        if (b.spiky) {
          drawSpiky(ctx, x, y, r, t * b.spin, alpha);
          continue;
        }
        // Glassy spheres with a coloured glow and a soft highlight.
        const col = COLOURS[b.c];
        drawGlow(ctx, x, y, col.fill, r * 2.4, 0.45 * alpha);
        const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.05, x, y, r);
        g.addColorStop(0, col.core);
        g.addColorStop(0.55, col.fill.replace(/[\d.]+\)$/, "0.35)"));
        g.addColorStop(1, col.fill.replace(/[\d.]+\)$/, "0.75)"));
        ctx.globalAlpha = alpha;
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = "rgba(255,255,255,0.35)";
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      drawParticles(ctx, particles);
      ctx.restore();
    },
  };
}

export const BUBBLES: GameDef = {
  id: "bubbles",
  name: "Bubble Garden",
  icon: "🫧",
  unit: "bubbles",
  help: "Tap or click the glowing bubbles · leave the dark spiky ones alone",
  make,
};
