import { burst, drawGlow, drawParticles, drawStars, type Game, type GameDef, makeStars, type Particle, rand, stepParticles, TAU } from "./common";

// Bubble Garden: glowing bubbles drift up through a slow aurora. Pop the colour the garden asks
// for; popping a different colour ends the run. Tap or click.

const COLOURS = [
  { name: "pink", fill: "rgba(255,140,200,1)", core: "#ffd3ec" },
  { name: "teal", fill: "rgba(90,230,220,1)", core: "#d3fffb" },
  { name: "gold", fill: "rgba(255,206,110,1)", core: "#fff2cf" },
];

type Bubble = { x: number; y: number; r: number; c: number; v: number; phase: number; popped?: number };

function make(ev: { point(): void; miss(): void }): Game {
  const stars = makeStars(40);
  let t = 0;
  let bubbles: Bubble[] = [];
  let nextSpawn = 0.3;
  let target = 0;
  let sinceChange = 0;
  let announce = 2;
  let particles: Particle[] = [];
  let shake = 0;

  const pickTarget = () => {
    let next = target;
    while (next === target) next = Math.floor(rand(0, COLOURS.length));
    target = next;
    sinceChange = 0;
    announce = 1.6;
  };

  return {
    pointer(type, px, py, w, h) {
      if (type !== "down") return;
      const size = Math.min(w, h);
      // Topmost (last drawn) bubble under the tap.
      for (let i = bubbles.length - 1; i >= 0; i--) {
        const b = bubbles[i];
        if (b.popped !== undefined) continue;
        if (Math.hypot(px - b.x * w, py - b.y * h) > b.r * size * 1.15) continue;
        b.popped = 0;
        burst(particles, b.x * w, b.y * h, COLOURS[b.c].fill, 16, 120);
        if (b.c === target) {
          ev.point();
          if (++sinceChange >= 6) pickTarget();
        } else {
          shake = 0.4;
          ev.miss();
        }
        return;
      }
    },
    step(dt) {
      t += dt;
      shake = Math.max(0, shake - dt);
      announce = Math.max(0, announce - dt);
      nextSpawn -= dt;
      if (nextSpawn <= 0) {
        nextSpawn = rand(0.75, 1.15);
        // At least two in five are the colour asked for.
        const c = Math.random() < 0.42 ? target : Math.floor(rand(0, COLOURS.length));
        bubbles.push({ x: rand(0.12, 0.88), y: 1.08, r: rand(0.055, 0.085), c, v: rand(0.07, 0.11), phase: rand(0, TAU) });
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

      // Bubbles: glassy spheres with a coloured glow and a soft highlight.
      for (const b of bubbles) {
        const col = COLOURS[b.c];
        const x = (b.x + Math.sin(t * 1.1 + b.phase) * 0.025) * w;
        const y = b.y * h;
        const grow = b.popped !== undefined ? 1 + b.popped * 2 : 1;
        const alpha = b.popped !== undefined ? 1 - b.popped / 0.25 : 1;
        const r = b.r * size * grow;
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

      // Which colour to pop.
      const col = COLOURS[target];
      const label = `Pop the ${col.name} bubbles`;
      ctx.font = `600 ${Math.round(Math.max(12, size * 0.045))}px Inter, system-ui, sans-serif`;
      const tw = ctx.measureText(label).width;
      const bx = w / 2 - tw / 2 - 26;
      const by = h * 0.05;
      const pad = size * 0.03;
      ctx.fillStyle = `rgba(10,12,30,${0.55 + announce * 0.2})`;
      ctx.beginPath();
      ctx.roundRect(bx, by, tw + 44, size * 0.045 + pad * 1.6, 999);
      ctx.fill();
      drawGlow(ctx, bx + 16, by + (size * 0.045 + pad * 1.6) / 2, col.fill, 18, 1);
      ctx.fillStyle = "#f4f2fb";
      ctx.textBaseline = "middle";
      ctx.fillText(label, bx + 32, by + (size * 0.045 + pad * 1.6) / 2);
    },
  };
}

export const BUBBLES: GameDef = {
  id: "bubbles",
  name: "Bubble Garden",
  icon: "🫧",
  unit: "bubbles",
  help: "Tap or click the colour it asks for · another colour ends the run",
  make,
};
