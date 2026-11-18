import { burst, drawGlow, drawParticles, drawStars, type Game, type GameDef, makeStars, type Particle, rand, stepParticles, TAU } from "./common";

// Night Runner: a glowing orb rolls down a three-lane road toward a setting sun. Switch lanes
// to collect sparks and miss the crystals. Drawn in 3D perspective; unhurried and steady.

type Thing = { lane: number; z: number; kind: "spark" | "crystal"; hit?: boolean };

const SPEED = 0.3; // depth per second: about three seconds from the horizon to you

function make(ev: { point(): void; miss(): void }): Game {
  const stars = makeStars(60);
  let t = 0;
  let lane = 1;
  let x = 1;
  let things: Thing[] = [];
  let nextSpawn = 0.6;
  let particles: Particle[] = [];
  let flash = 0;

  // Perspective: depth 1 is the horizon, 0 is where you are.
  const view = (w: number, h: number) => ({ horizon: h * 0.36, base: h * 0.86, half: w * 0.46 });
  const scaleAt = (z: number) => (1 - z) / (1 + z * 3);
  const project = (laneX: number, z: number, w: number, h: number) => {
    const v = view(w, h);
    const s = scaleAt(z);
    return { x: w / 2 + (laneX - 1) * (v.half * 0.62) * s, y: v.horizon + (v.base - v.horizon) * s, s };
  };

  return {
    key(dir) {
      if (dir === "left") lane = Math.max(0, lane - 1);
      if (dir === "right") lane = Math.min(2, lane + 1);
    },
    pointer(type, px, _py, w) {
      if (type === "down") this.key!(px < w / 2 ? "left" : "right");
    },
    step(dt, w, h) {
      t += dt;
      x += (lane - x) * Math.min(1, dt * 12);
      flash = Math.max(0, flash - dt);
      for (const th of things) th.z -= SPEED * dt;
      nextSpawn -= dt;
      if (nextSpawn <= 0) {
        nextSpawn = rand(1.3, 2.1);
        const lanes = [0, 1, 2].sort(() => Math.random() - 0.5);
        things.push({ lane: lanes[0], z: 1, kind: Math.random() < 0.6 ? "spark" : "crystal" });
        if (Math.random() < 0.35) things.push({ lane: lanes[1], z: 1, kind: "spark" });
      }
      for (const th of things) {
        if (th.hit || th.z > 0.05 || th.z < -0.05 || Math.round(x) !== th.lane || Math.abs(x - th.lane) > 0.35) continue;
        th.hit = true;
        const p = project(th.lane, 0, w, h);
        if (th.kind === "spark") {
          burst(particles, p.x, p.y - 10, "rgba(255,214,120,1)", 14, 110);
          ev.point();
        } else {
          burst(particles, p.x, p.y - 10, "rgba(120,240,255,1)", 22, 150);
          flash = 0.5;
          ev.miss();
        }
      }
      things = things.filter((th) => th.z > -0.15 && !(th.hit && th.kind === "spark"));
      particles = stepParticles(particles, dt);
    },
    draw(ctx, w, h) {
      const v = view(w, h);
      // Dusk sky with a glowing, striped sun on the horizon.
      const sky = ctx.createLinearGradient(0, 0, 0, v.horizon);
      sky.addColorStop(0, "#0c0824");
      sky.addColorStop(0.65, "#3a1550");
      sky.addColorStop(1, "#a23a6e");
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, w, v.horizon + 1);
      drawStars(ctx, stars, w, v.horizon * 0.8, t);
      const sunR = Math.min(w, h) * 0.17;
      drawGlow(ctx, w / 2, v.horizon, "rgba(255,120,150,0.9)", sunR * 3.2, 0.55);
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, w, v.horizon);
      ctx.clip();
      const sun = ctx.createLinearGradient(0, v.horizon - sunR, 0, v.horizon);
      sun.addColorStop(0, "#ffd36e");
      sun.addColorStop(1, "#ff5e8a");
      ctx.fillStyle = sun;
      ctx.beginPath();
      ctx.arc(w / 2, v.horizon, sunR, Math.PI, 0);
      ctx.fill();
      ctx.fillStyle = "#3a1550";
      for (let i = 0; i < 4; i++) ctx.fillRect(w / 2 - sunR, v.horizon - sunR * (0.12 + i * 0.16), sunR * 2, sunR * 0.035 * (i + 1));
      ctx.restore();

      // The ground: a dark plain with a moving glowing grid.
      const ground = ctx.createLinearGradient(0, v.horizon, 0, h);
      ground.addColorStop(0, "#1a0b2e");
      ground.addColorStop(1, "#07050f");
      ctx.fillStyle = ground;
      ctx.fillRect(0, v.horizon, w, h - v.horizon);
      ctx.strokeStyle = "rgba(255,80,180,0.22)";
      ctx.lineWidth = 1;
      for (let i = 0; i < 14; i++) {
        const z = 1 - ((i / 14 + t * SPEED * 0.9) % 1);
        const y = v.horizon + (v.base - v.horizon) * scaleAt(z) * 1.16;
        if (y > h) continue;
        ctx.globalAlpha = 1 - z * 0.8;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      for (let i = -6; i <= 6; i++) {
        ctx.beginPath();
        ctx.moveTo(w / 2, v.horizon);
        ctx.lineTo(w / 2 + i * v.half * 0.5, h * 1.1);
        ctx.stroke();
      }

      // The road and its glowing lane lines.
      ctx.fillStyle = "rgba(20,12,40,0.85)";
      ctx.beginPath();
      ctx.moveTo(w / 2 - 2, v.horizon);
      ctx.lineTo(w / 2 + 2, v.horizon);
      ctx.lineTo(w / 2 + v.half * 1.05, h * 1.05);
      ctx.lineTo(w / 2 - v.half * 1.05, h * 1.05);
      ctx.closePath();
      ctx.fill();
      for (const edge of [-1.55, -0.5, 0.5, 1.55]) {
        ctx.strokeStyle = Math.abs(edge) > 1 ? "rgba(140,220,255,0.75)" : "rgba(167,150,255,0.35)";
        ctx.lineWidth = Math.abs(edge) > 1 ? 2 : 1;
        ctx.beginPath();
        ctx.moveTo(w / 2, v.horizon);
        ctx.lineTo(w / 2 + edge * (v.half * 0.62), v.base);
        ctx.lineTo(w / 2 + edge * (v.half * 0.62) * 1.2, h * 1.05);
        ctx.stroke();
      }

      // Sparks and crystals, far ones first.
      for (const th of [...things].sort((a, b) => b.z - a.z)) {
        if (th.z > 1) continue;
        const p = project(th.lane, Math.max(th.z, -0.1), w, h);
        const r = Math.max(2, Math.min(w, h) * 0.05 * p.s);
        const fade = Math.min(1, (1 - th.z) * 3);
        if (th.kind === "spark") {
          drawGlow(ctx, p.x, p.y - r, "rgba(255,214,120,1)", r * 4, fade);
          ctx.fillStyle = "#fff6d8";
          ctx.beginPath();
          ctx.arc(p.x, p.y - r, r * 0.45, 0, TAU);
          ctx.fill();
        } else {
          // Crystals glow blue with a red edge, so they read as "don't touch".
          drawGlow(ctx, p.x, p.y - r, "rgba(120,240,255,0.9)", r * 3.5, 0.55 * fade);
          drawGlow(ctx, p.x, p.y - r, "rgba(255,60,80,0.9)", r * 2.6, 0.35 * fade);
          ctx.globalAlpha = fade;
          const g = ctx.createLinearGradient(p.x, p.y - r * 2.4, p.x, p.y);
          g.addColorStop(0, "#d6fbff");
          g.addColorStop(1, "#3c7cff");
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y - r * 2.4);
          ctx.lineTo(p.x + r * 0.9, p.y - r * 0.9);
          ctx.lineTo(p.x, p.y);
          ctx.lineTo(p.x - r * 0.9, p.y - r * 0.9);
          ctx.closePath();
          ctx.fill();
          ctx.strokeStyle = "#ff4d63";
          ctx.lineWidth = Math.max(1.5, r * 0.16);
          ctx.lineJoin = "round";
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
      }

      // You: a glowing orb with a soft reflection.
      const me = project(x, 0, w, h);
      const r = Math.min(w, h) * 0.05;
      const bob = Math.sin(t * 8) * r * 0.08;
      drawGlow(ctx, me.x, me.y + r * 0.3, "rgba(167,150,255,0.8)", r * 3, 0.35);
      drawGlow(ctx, me.x, me.y - r + bob, "rgba(150,140,255,1)", r * 3.4, 0.9);
      const og = ctx.createRadialGradient(me.x - r * 0.3, me.y - r * 1.3 + bob, r * 0.1, me.x, me.y - r + bob, r);
      og.addColorStop(0, "#ffffff");
      og.addColorStop(0.5, "#b9adff");
      og.addColorStop(1, "#6a55f2");
      ctx.fillStyle = og;
      ctx.beginPath();
      ctx.arc(me.x, me.y - r + bob, r, 0, TAU);
      ctx.fill();

      drawParticles(ctx, particles);
      if (flash > 0) {
        ctx.fillStyle = `rgba(120,220,255,${flash * 0.2})`;
        ctx.fillRect(0, 0, w, h);
      }
    },
  };
}

export const RUNNER: GameDef = {
  id: "runner",
  name: "Night Runner",
  icon: "🌅",
  unit: "sparks",
  help: "Tap left or right (or ← →) to switch lanes · catch sparks, miss the crystals",
  make,
};
