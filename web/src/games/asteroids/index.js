import {
  NEON, setupCanvas, createParticles, createShake, createFlash,
  createCountdown, drawHudText, drawHandLostBanner, drawLives, sfx,
} from "../../core/gameKit.js";

const W = 800;
const H = 550;
const TAU = Math.PI * 2;

const SIZES = { large: 42, medium: 24, small: 13 };
const POINTS = { large: 1, medium: 2, small: 3 };
const SPLIT = { large: "medium", medium: "small", small: null };
const SHIP_SMOOTHING = 0.14;
const SHIP_RADIUS = 12;
const SPAWN_INTERVAL_BASE = 2600; // ms between spawns at level 1
const LEVEL_EVERY = 20;           // seconds per level step
const FIRE_INTERVAL = 460;        // ms, auto-fire
const FIRE_INTERVAL_PINCH = 170;  // ms while pinching
const BULLET_SPEED = 8;
const BULLET_LIFE = 70;           // frames

function randRange(a, b) { return a + Math.random() * (b - a); }
function wrap(v, max) { return ((v % max) + max) % max; }

function makeAsteroid(size, x, y, level) {
  const angle = Math.random() * TAU;
  const speedMult = 1 + (level - 1) * 0.18;
  const speed = (size === "large" ? randRange(0.6, 1.2)
               : size === "medium" ? randRange(1.0, 2.0)
               : randRange(1.8, 3.2)) * speedMult;
  const verts = 8;
  const shape = Array.from({ length: verts }, (_, i) => {
    const a = (i / verts) * TAU;
    const r = SIZES[size] * randRange(0.7, 1.0);
    return { x: Math.cos(a) * r, y: Math.sin(a) * r };
  });
  return { x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
           rot: 0, rotSpeed: randRange(-0.02, 0.02), size, shape };
}

function spawnInitial(n = 4, level = 1) {
  return Array.from({ length: n }, () => {
    let x, y;
    do { x = Math.random() * W; y = Math.random() * H; }
    while (Math.hypot(x - W / 2, y - H / 2) < 180);
    return makeAsteroid("large", x, y, level);
  });
}

function spawnRandom(level) {
  const edge = Math.floor(Math.random() * 4);
  let x, y;
  if (edge === 0) { x = Math.random() * W; y = -50; }
  else if (edge === 1) { x = Math.random() * W; y = H + 50; }
  else if (edge === 2) { x = -50; y = Math.random() * H; }
  else { x = W + 50; y = Math.random() * H; }
  const size = Math.random() < 0.6 ? "large" : "medium";
  return makeAsteroid(size, x, y, level);
}

export default {
  async mount({ canvas, onHandUpdate, handState, onScore }) {
    const ctx = setupCanvas(canvas, W, H);

    const particles = createParticles();
    const shake = createShake();
    const flash = createFlash();
    const countdown = createCountdown((label) => (label === "GO" ? sfx.go() : sfx.tick()));

    const ship = {
      x: W / 2, y: H / 2,
      targetX: W / 2, targetY: H / 2,
    };

    const state = {
      ship,
      asteroids: spawnInitial(4, 1),
      bullets: [],
      score: 0,
      lives: 3,
      level: 1,
      elapsed: 0,       // seconds of actual play (pause-aware)
      lastTs: null,
      sinceSpawn: 0,    // ms accumulators
      sinceShot: 0,
      invincible: 0,
      dying: false,
      paused: false,
      pinch: false,
      handLost: !handState.isDetected,
    };

    const unsub = onHandUpdate((s) => {
      state.handLost = !s.isDetected;
      state.pinch = !!s.pinch;
      if (s.isDetected) {
        ship.targetX = (1 - s.x) * W;
        ship.targetY = s.y * H;
      }
    });

    function nearestAsteroid() {
      let best = null, bestD = Infinity;
      for (const a of state.asteroids) {
        const d = Math.hypot(a.x - ship.x, a.y - ship.y);
        if (d < bestD) { bestD = d; best = a; }
      }
      return best;
    }

    function fire() {
      const target = nearestAsteroid();
      if (!target) return;
      const a = Math.atan2(target.y - ship.y, target.x - ship.x);
      state.bullets.push({
        x: ship.x + Math.cos(a) * (SHIP_RADIUS + 4),
        y: ship.y + Math.sin(a) * (SHIP_RADIUS + 4),
        vx: Math.cos(a) * BULLET_SPEED,
        vy: Math.sin(a) * BULLET_SPEED,
        life: BULLET_LIFE,
      });
      sfx.shoot();
    }

    function breakAsteroid(idx) {
      const a = state.asteroids[idx];
      state.asteroids.splice(idx, 1);
      state.score += POINTS[a.size];
      const col = a.size === "large" ? NEON.muted : a.size === "medium" ? NEON.cyan : NEON.accent;
      particles.burst(a.x, a.y, {
        count: a.size === "large" ? 22 : 12,
        color: col, speed: 3.5, life: 40, size: 3,
      });
      shake.add(a.size === "large" ? 0.18 : 0.1);
      sfx.explode();
      const child = SPLIT[a.size];
      if (child) {
        state.asteroids.push(makeAsteroid(child, a.x, a.y, state.level));
        state.asteroids.push(makeAsteroid(child, a.x, a.y, state.level));
      }
    }

    function update(ts) {
      // Asteroids always drift (looks alive even while dying)
      for (const a of state.asteroids) {
        a.x = wrap(a.x + a.vx, W);
        a.y = wrap(a.y + a.vy, H);
        a.rot += a.rotSpeed;
      }

      particles.update();
      shake.update();
      flash.update();

      if (state.lastTs === null) state.lastTs = ts;
      const dt = Math.min(ts - state.lastTs, 100);
      state.lastTs = ts;

      if (!countdown.done || state.dying) return;

      state.elapsed += dt / 1000;
      const newLevel = 1 + Math.floor(state.elapsed / LEVEL_EVERY);
      if (newLevel !== state.level) {
        state.level = newLevel;
        sfx.levelUp();
        flash.trigger(NEON.cyan, 0.1);
      }

      ship.x += (ship.targetX - ship.x) * SHIP_SMOOTHING;
      ship.y += (ship.targetY - ship.y) * SHIP_SMOOTHING;
      ship.x = Math.max(SHIP_RADIUS, Math.min(W - SHIP_RADIUS, ship.x));
      ship.y = Math.max(SHIP_RADIUS, Math.min(H - SHIP_RADIUS, ship.y));

      // Auto-fire — pinch for rapid fire
      state.sinceShot += dt;
      const interval = state.pinch ? FIRE_INTERVAL_PINCH : FIRE_INTERVAL;
      if (state.sinceShot >= interval && !state.handLost) {
        state.sinceShot = 0;
        fire();
      }

      // Bullets
      for (let i = state.bullets.length - 1; i >= 0; i--) {
        const b = state.bullets[i];
        b.x += b.vx;
        b.y += b.vy;
        b.life -= 1;
        if (b.life <= 0 || b.x < -10 || b.x > W + 10 || b.y < -10 || b.y > H + 10) {
          state.bullets.splice(i, 1);
          continue;
        }
        for (let j = state.asteroids.length - 1; j >= 0; j--) {
          const a = state.asteroids[j];
          if (Math.hypot(b.x - a.x, b.y - a.y) < SIZES[a.size] * 0.85) {
            state.bullets.splice(i, 1);
            breakAsteroid(j);
            break;
          }
        }
      }

      // Spawn pressure
      state.sinceSpawn += dt;
      const spawnInterval = Math.max(900, SPAWN_INTERVAL_BASE - (state.level - 1) * 220);
      if (state.sinceSpawn >= spawnInterval) {
        state.sinceSpawn = 0;
        state.asteroids.push(spawnRandom(state.level));
      }
      if (state.asteroids.length > 26) {
        state.asteroids.splice(0, state.asteroids.length - 26);
      }

      // Ship collision
      if (state.invincible > 0) {
        state.invincible--;
      } else {
        for (const a of state.asteroids) {
          if (Math.hypot(ship.x - a.x, ship.y - a.y) < SIZES[a.size] * 0.75 + SHIP_RADIUS * 0.8) {
            state.lives--;
            state.invincible = 140;
            shake.add(0.5);
            flash.trigger(NEON.danger, 0.3);
            particles.burst(ship.x, ship.y, { count: 26, color: NEON.danger, speed: 5, life: 45, size: 4 });
            if (state.lives <= 0) {
              state.dying = true;
              sfx.bigExplode();
              deathTimer = setTimeout(() => { if (running) onScore(state.score); }, 800);
            } else {
              sfx.explode();
            }
            break;
          }
        }
      }
    }

    function drawShip() {
      if (state.dying) return;
      if (state.invincible > 0 && Math.floor(state.invincible / 6) % 2 === 0) return;

      ctx.save();
      ctx.translate(ship.x, ship.y);

      const shieldAlpha = state.invincible > 0 ? 0.35 + 0.3 * Math.sin(state.invincible * 0.4) : 0.18;
      ctx.beginPath();
      ctx.arc(0, 0, SHIP_RADIUS + 6, 0, TAU);
      ctx.strokeStyle = `rgba(96,200,255,${shieldAlpha})`;
      ctx.lineWidth = 2;
      ctx.shadowColor = "#60c8ff";
      ctx.shadowBlur = 10;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(0, 0, SHIP_RADIUS * 0.55, 0, TAU);
      ctx.fillStyle = "#7dd3fc";
      ctx.shadowColor = "#38bdf8";
      ctx.shadowBlur = 14;
      ctx.fill();

      ctx.shadowBlur = 0;
      ctx.strokeStyle = "rgba(125,211,252,0.55)";
      ctx.lineWidth = 1;
      const r = SHIP_RADIUS + 3;
      ctx.beginPath();
      ctx.moveTo(-r, 0); ctx.lineTo(-SHIP_RADIUS * 0.7, 0);
      ctx.moveTo(r, 0);  ctx.lineTo(SHIP_RADIUS * 0.7, 0);
      ctx.moveTo(0, -r); ctx.lineTo(0, -SHIP_RADIUS * 0.7);
      ctx.moveTo(0, r);  ctx.lineTo(0, SHIP_RADIUS * 0.7);
      ctx.stroke();

      ctx.restore();
    }

    function draw() {
      ctx.save();
      shake.apply(ctx);

      ctx.fillStyle = "#000008";
      ctx.fillRect(-20, -20, W + 40, H + 40);

      // Stars
      ctx.fillStyle = "#ffffff33";
      for (let i = 0; i < 80; i++) {
        const sx = (i * 97 + 13) % W;
        const sy = (i * 67 + 31) % H;
        ctx.fillRect(sx, sy, i % 3 === 0 ? 2 : 1, i % 3 === 0 ? 2 : 1);
      }

      // Asteroids
      for (const a of state.asteroids) {
        ctx.save();
        ctx.translate(a.x, a.y);
        ctx.rotate(a.rot);
        ctx.strokeStyle = "#94a3b8";
        ctx.lineWidth = 2;
        ctx.shadowColor = "#475569";
        ctx.shadowBlur = 4;
        ctx.beginPath();
        ctx.moveTo(a.shape[0].x, a.shape[0].y);
        for (let i = 1; i < a.shape.length; i++) ctx.lineTo(a.shape[i].x, a.shape[i].y);
        ctx.closePath();
        ctx.stroke();
        ctx.restore();
      }
      ctx.shadowBlur = 0;

      // Bullets
      ctx.fillStyle = NEON.cyan;
      ctx.shadowColor = NEON.cyan;
      ctx.shadowBlur = 8;
      for (const b of state.bullets) {
        ctx.beginPath();
        ctx.arc(b.x, b.y, 3, 0, TAU);
        ctx.fill();
      }
      ctx.shadowBlur = 0;

      drawShip();
      particles.draw(ctx);

      // HUD
      drawHudText(ctx, `SCORE ${state.score}`, 14, 28, { size: 15, glow: NEON.accent });
      drawHudText(ctx, `LV ${state.level}`, W / 2, 28, { size: 15, align: "center", color: NEON.muted });
      drawLives(ctx, Math.max(0, state.lives), W - 16, 22);

      if (state.pinch && countdown.done && !state.dying) {
        drawHudText(ctx, "RAPID FIRE", W / 2, H - 14, { size: 12, align: "center", color: NEON.cyan, glow: NEON.cyan });
      }
      if (state.handLost && countdown.done && !state.dying) {
        drawHandLostBanner(ctx, W, H, "Hand not detected — show hand to fly");
      }

      flash.draw(ctx, W, H);
      countdown.draw(ctx, W, H);
      ctx.restore();
    }

    let raf = null;
    let running = true;
    let deathTimer = null;

    function step(ts) {
      if (!state.paused) {
        countdown.update();
        update(ts);
      } else {
        state.lastTs = ts; // don't accumulate time across a pause
      }
      draw();
      if (running) raf = requestAnimationFrame(step);
    }
    raf = requestAnimationFrame(step);

    return {
      pause() { state.paused = true; },
      resume() { state.paused = false; },
      unmount() {
        running = false;
        if (raf) cancelAnimationFrame(raf);
        clearTimeout(deathTimer);
        unsub();
      },
    };
  },
};
