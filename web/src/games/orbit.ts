import { burst, clamp, drawGlow, drawParticles, drawRock, drawStars, type Game, type GameDef, makeStars, type Particle, rand, rockShape, stepParticles, TAU } from "./common";

// Orbit: a little moon circles a glowing planet. Hop between three rings to catch stars and
// keep clear of meteors. Calm and slow: the moon never stops, and a meteor only ends the run.

type Item = { ring: number; angle: number; kind: "star" | "meteor"; age: number; life: number; shape: number[]; spin: number };

const SPEED = 0.75; // radians per second
const RINGS = [0.48, 0.7, 0.92];

function make(ev: { point(): void; miss(): void }): Game {
  const stars = makeStars(90);
  let t = 0;
  let angle = -Math.PI / 2;
  let ring = 1;
  let radius = RINGS[1];
  let items: Item[] = [];
  let nextSpawn = 0.8;
  let particles: Particle[] = [];
  let flash = 0;
  const trail: { x: number; y: number }[] = [];

  const geo = (w: number, h: number) => {
    const max = Math.min(w, h) * 0.46;
    return { cx: w / 2, cy: h / 2, max, planet: max * 0.24 };
  };

  return {
    key(dir) {
      if (dir === "left" || dir === "down") ring = clamp(ring - 1, 0, 2);
      if (dir === "right" || dir === "up") ring = clamp(ring + 1, 0, 2);
    },
    pointer(type, x, _y, w) {
      if (type === "down") this.key!(x < w / 2 ? "left" : "right");
    },
    step(dt, w, h) {
      t += dt;
      angle += SPEED * dt;
      radius += (RINGS[ring] - radius) * Math.min(1, dt * 9);
      flash = Math.max(0, flash - dt);
      nextSpawn -= dt;
      if (nextSpawn <= 0) {
        nextSpawn = rand(1.1, 1.8);
        const ahead = angle + rand(1.6, 3.6);
        const kind = Math.random() < 0.62 ? "star" : "meteor";
        items.push({ ring: Math.floor(rand(0, 3)), angle: ahead, kind, age: 0, life: kind === "star" ? 8 : 9, shape: rockShape(), spin: rand(-1, 1) });
      }
      const { max } = geo(w, h);
      for (const it of items) {
        it.age += dt;
        if (it.age < 0.5) continue; // still fading in: can't be hit yet
        const sameRing = Math.abs(radius - RINGS[it.ring]) < 0.06;
        let d = (((angle - it.angle) % TAU) + TAU) % TAU;
        if (d > Math.PI) d -= TAU;
        const arc = Math.abs(d) * RINGS[it.ring] * max;
        if (sameRing && arc < max * 0.075) {
          it.age = it.life; // remove
          const { cx, cy } = geo(w, h);
          const px = cx + Math.cos(it.angle) * RINGS[it.ring] * max;
          const py = cy + Math.sin(it.angle) * RINGS[it.ring] * max;
          if (it.kind === "star") {
            burst(particles, px, py, "rgba(255,214,120,1)", 16, 110);
            ev.point();
          } else {
            burst(particles, px, py, "rgba(255,120,90,1)", 22, 140);
            flash = 0.5;
            ev.miss();
          }
        }
      }
      items = items.filter((it) => it.age < it.life);
      particles = stepParticles(particles, dt);
    },
    draw(ctx, w, h) {
      const { cx, cy, max, planet } = geo(w, h);
      // Deep space.
      const bg = ctx.createRadialGradient(cx, cy, planet * 0.5, cx, cy, Math.max(w, h) * 0.8);
      bg.addColorStop(0, "#1b1440");
      bg.addColorStop(0.55, "#0c0a1f");
      bg.addColorStop(1, "#05040c");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);
      drawStars(ctx, stars, w, h, t);

      // Rings.
      RINGS.forEach((r, i) => {
        ctx.beginPath();
        ctx.arc(cx, cy, r * max, 0, TAU);
        ctx.strokeStyle = i === ring ? "rgba(167,150,255,0.55)" : "rgba(167,150,255,0.16)";
        ctx.lineWidth = i === ring ? 2 : 1;
        ctx.stroke();
      });

      // The planet, with a soft atmosphere.
      drawGlow(ctx, cx, cy, "rgba(124,106,247,0.9)", planet * 2.6, 0.55);
      const pg = ctx.createRadialGradient(cx - planet * 0.35, cy - planet * 0.4, planet * 0.1, cx, cy, planet);
      pg.addColorStop(0, "#c9b8ff");
      pg.addColorStop(0.45, "#7c6af7");
      pg.addColorStop(1, "#2c1f72");
      ctx.fillStyle = pg;
      ctx.beginPath();
      ctx.arc(cx, cy, planet, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.12)";
      ctx.beginPath();
      ctx.ellipse(cx, cy, planet * 1.5, planet * 0.35, -0.35, 0, TAU);
      ctx.stroke();

      // Stars and meteors waiting on the rings.
      for (const it of items) {
        const fade = Math.min(1, it.age / 0.5) * Math.min(1, (it.life - it.age) / 0.6);
        const x = cx + Math.cos(it.angle) * RINGS[it.ring] * max;
        const y = cy + Math.sin(it.angle) * RINGS[it.ring] * max;
        if (it.kind === "star") {
          drawGlow(ctx, x, y, "rgba(255,214,120,1)", max * 0.11, fade);
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(t * 0.8);
          ctx.globalAlpha = fade;
          ctx.fillStyle = "#fff4cf";
          ctx.beginPath();
          for (let k = 0; k < 10; k++) {
            const rr = (k % 2 ? 0.4 : 1) * max * 0.035;
            const a = (k / 10) * TAU;
            ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
          }
          ctx.closePath();
          ctx.fill();
          ctx.restore();
          ctx.globalAlpha = 1;
        } else {
          ctx.globalAlpha = fade;
          drawGlow(ctx, x, y, "rgba(255,110,80,0.9)", max * 0.09, 0.5 * fade);
          drawRock(ctx, x, y, max * 0.045, it.shape, t * it.spin, "rgba(255,150,110,0.8)");
          ctx.globalAlpha = 1;
        }
      }

      // The moon and its trail.
      const mx = cx + Math.cos(angle) * radius * max;
      const my = cy + Math.sin(angle) * radius * max;
      trail.push({ x: mx, y: my });
      if (trail.length > 18) trail.shift();
      trail.forEach((p, i) => drawGlow(ctx, p.x, p.y, "rgba(140,230,255,1)", max * 0.03 * (i / trail.length), (i / trail.length) * 0.4));
      drawGlow(ctx, mx, my, "rgba(140,230,255,1)", max * 0.13, 0.9);
      ctx.fillStyle = "#f2fdff";
      ctx.beginPath();
      ctx.arc(mx, my, max * 0.03, 0, TAU);
      ctx.fill();

      drawParticles(ctx, particles);
      if (flash > 0) {
        ctx.fillStyle = `rgba(255,90,70,${flash * 0.25})`;
        ctx.fillRect(0, 0, w, h);
      }
    },
  };
}

export const ORBIT: GameDef = {
  id: "orbit",
  name: "Orbit",
  icon: "🪐",
  unit: "stars",
  help: "Tap left or right (or ← →) to hop rings · catch ⭐, dodge meteors",
  make,
};
