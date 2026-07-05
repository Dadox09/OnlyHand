import {
  NEON, setupCanvas, createParticles, createShake, createFlash,
  createCountdown, drawHudText, drawHandLostBanner, drawLives, sfx,
} from "../../core/gameKit.js";

const W = 800;
const H = 550;
const TAU = Math.PI * 2;

const GRAVITY = 0.085;            // px/frame² on fruits and chunks
const TRAIL_LIFE = 160;           // ms a blade point stays visible
const SLICE_SPEED = 0.5;          // px/ms — swipes slice, slow drift doesn't
const COMBO_WINDOW = 500;         // ms between slices to keep a combo alive
const SPAWN_INTERVAL_BASE = 1900; // ms between volleys at level 1
const LEVEL_EVERY = 25;           // seconds per level step

const FRUITS = [
  { color: NEON.accent,  glow: "#4ade80", r: 26, points: 1 },
  { color: "#fb923c",    glow: "#fb923c", r: 24, points: 1 },
  { color: NEON.magenta, glow: "#e879f9", r: 20, points: 2 },
  { color: NEON.cyan,    glow: "#22d3ee", r: 30, points: 1 },
];
const GOLDEN = { color: NEON.warn, glow: "#fbbf24", r: 18, points: 5 };

function randRange(a, b) { return a + Math.random() * (b - a); }

// Distance from point c to segment ab — blade slice test.
function segDist(ax, ay, bx, by, cx, cy) {
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((cx - ax) * dx + (cy - ay) * dy) / len2));
  return Math.hypot(cx - (ax + dx * t), cy - (ay + dy * t));
}

function makeFruit(level) {
  const golden = Math.random() < 0.06;
  const kind = golden ? GOLDEN : FRUITS[Math.floor(Math.random() * FRUITS.length)];
  const x = randRange(W * 0.15, W * 0.85);
  return {
    ...kind, golden,
    x, y: H + kind.r + 10,
    vx: (W / 2 - x) * 0.004 + randRange(-1.2, 1.2),
    vy: randRange(-11, -8.5) - Math.min(1.5, (level - 1) * 0.15),
    rot: Math.random() * TAU,
    rotSpeed: randRange(-0.06, 0.06),
    bomb: false,
  };
}

function makeBomb(level) {
  const x = randRange(W * 0.2, W * 0.8);
  return {
    color: "#1e293b", glow: NEON.danger, r: 22, points: 0, golden: false,
    x, y: H + 32,
    vx: (W / 2 - x) * 0.004 + randRange(-1, 1),
    vy: randRange(-10.5, -8.5) - Math.min(1.5, (level - 1) * 0.15),
    rot: Math.random() * TAU,
    rotSpeed: randRange(-0.04, 0.04),
    bomb: true,
  };
}

export default {
  async mount({ canvas, onHandUpdate, handState, onScore }) {
    const ctx = setupCanvas(canvas, W, H);

    const particles = createParticles();
    const shake = createShake();
    const flash = createFlash();
    const countdown = createCountdown((label) => (label === "GO" ? sfx.go() : sfx.tick()));

    const state = {
      fruits: [],
      chunks: [],      // sliced halves flying apart
      popups: [],      // floating score/combo texts
      trail: [],       // blade points {x, y, t}
      segments: [],    // unprocessed blade moves {ax, ay, bx, by, speed}
      score: 0,
      lives: 3,
      level: 1,
      combo: 0,
      lastSliceAt: -Infinity,
      elapsed: 0,
      lastTs: null,
      sinceSpawn: 0,
      dying: false,
      paused: false,
      handLost: !handState.isDetected,
    };

    let lastPoint = null;
    const unsub = onHandUpdate((s) => {
      state.handLost = !s.isDetected;
      if (!s.isDetected) { lastPoint = null; return; }
      const x = (1 - s.x) * W;
      const y = s.y * H;
      const t = performance.now();
      state.trail.push({ x, y, t });
      if (lastPoint) {
        const dt = Math.max(t - lastPoint.t, 1);
        state.segments.push({
          ax: lastPoint.x, ay: lastPoint.y, bx: x, by: y,
          speed: Math.hypot(x - lastPoint.x, y - lastPoint.y) / dt,
        });
      }
      lastPoint = { x, y, t };
    });

    function addPopup(x, y, text, color) {
      state.popups.push({ x, y, text, color, life: 55, maxLife: 55 });
    }

    function sliceFruit(f, seg) {
      const now = performance.now();
      state.combo = now - state.lastSliceAt < COMBO_WINDOW ? state.combo + 1 : 1;
      state.lastSliceAt = now;

      const bonus = state.combo >= 3 ? state.combo : 0;
      const gained = f.points + bonus;
      state.score += gained;

      // Halves fly apart perpendicular to the blade stroke
      const strokeA = Math.atan2(seg.by - seg.ay, seg.bx - seg.ax);
      for (const dir of [-1, 1]) {
        state.chunks.push({
          x: f.x, y: f.y,
          vx: f.vx + Math.cos(strokeA + dir * Math.PI / 2) * 2.4,
          vy: f.vy * 0.4 + Math.sin(strokeA + dir * Math.PI / 2) * 2.4 - 1,
          r: f.r, color: f.color, glow: f.glow,
          rot: strokeA + (dir > 0 ? 0 : Math.PI),
          rotSpeed: randRange(-0.08, 0.08),
          life: 60, maxLife: 60,
        });
      }
      particles.burst(f.x, f.y, { count: f.golden ? 26 : 14, color: f.color, speed: 4, life: 38, size: 3, gravity: 0.06 });
      if (f.golden) {
        sfx.powerup();
        flash.trigger(NEON.warn, 0.12);
        addPopup(f.x, f.y - f.r, `+${gained}`, NEON.warn);
      } else {
        sfx.eat();
        addPopup(f.x, f.y - f.r, bonus > 0 ? `COMBO x${state.combo} +${gained}` : `+${gained}`, bonus > 0 ? NEON.cyan : f.color);
      }
      shake.add(0.06);
    }

    function sliceBomb(f) {
      state.lives--;
      state.combo = 0;
      shake.add(0.55);
      flash.trigger(NEON.danger, 0.35);
      particles.burst(f.x, f.y, { count: 30, color: NEON.danger, speed: 5.5, life: 45, size: 4 });
      addPopup(f.x, f.y - f.r, "BOOM", NEON.danger);
      if (state.lives <= 0) {
        state.dying = true;
        sfx.bigExplode();
        deathTimer = setTimeout(() => { if (running) onScore(state.score); }, 800);
      } else {
        sfx.explode();
      }
    }

    function spawnVolley() {
      const extraChance = Math.min(0.75, 0.3 + (state.level - 1) * 0.09);
      let count = 1;
      while (count < 4 && Math.random() < extraChance) count++;
      for (let i = 0; i < count; i++) state.fruits.push(makeFruit(state.level));
      const bombChance = Math.min(0.35, 0.12 + (state.level - 1) * 0.04);
      if (Math.random() < bombChance) state.fruits.push(makeBomb(state.level));
    }

    function update(ts) {
      particles.update();
      shake.update();
      flash.update();

      const now = performance.now();
      state.trail = state.trail.filter((p) => now - p.t < TRAIL_LIFE);

      if (state.lastTs === null) state.lastTs = ts;
      const dt = Math.min(ts - state.lastTs, 100);
      state.lastTs = ts;

      // Chunks and popups keep animating even while dying — feels alive
      for (let i = state.chunks.length - 1; i >= 0; i--) {
        const c = state.chunks[i];
        c.x += c.vx; c.y += c.vy; c.vy += GRAVITY;
        c.rot += c.rotSpeed;
        c.life--;
        if (c.life <= 0 || c.y > H + 60) state.chunks.splice(i, 1);
      }
      for (let i = state.popups.length - 1; i >= 0; i--) {
        const p = state.popups[i];
        p.y -= 0.7;
        p.life--;
        if (p.life <= 0) state.popups.splice(i, 1);
      }

      if (!countdown.done || state.dying) {
        state.segments.length = 0;
        return;
      }

      state.elapsed += dt / 1000;
      const newLevel = 1 + Math.floor(state.elapsed / LEVEL_EVERY);
      if (newLevel !== state.level) {
        state.level = newLevel;
        sfx.levelUp();
        flash.trigger(NEON.cyan, 0.1);
      }

      // Fruit physics
      for (let i = state.fruits.length - 1; i >= 0; i--) {
        const f = state.fruits[i];
        f.x += f.vx; f.y += f.vy; f.vy += GRAVITY;
        f.rot += f.rotSpeed;
        if (f.y > H + f.r + 40 && f.vy > 0) state.fruits.splice(i, 1);
      }

      // Blade vs fruit — only fast strokes cut
      for (const seg of state.segments) {
        if (seg.speed < SLICE_SPEED) continue;
        for (let i = state.fruits.length - 1; i >= 0; i--) {
          const f = state.fruits[i];
          if (segDist(seg.ax, seg.ay, seg.bx, seg.by, f.x, f.y) < f.r) {
            state.fruits.splice(i, 1);
            if (f.bomb) sliceBomb(f);
            else sliceFruit(f, seg);
            if (state.dying) break;
          }
        }
        if (state.dying) break;
      }
      state.segments.length = 0;

      if (now - state.lastSliceAt > COMBO_WINDOW) state.combo = 0;

      // Spawn pressure
      state.sinceSpawn += dt;
      const spawnInterval = Math.max(750, SPAWN_INTERVAL_BASE - (state.level - 1) * 180);
      if (state.sinceSpawn >= spawnInterval && !state.handLost) {
        state.sinceSpawn = 0;
        spawnVolley();
      }
    }

    function drawFruit(f) {
      ctx.save();
      ctx.translate(f.x, f.y);
      ctx.rotate(f.rot);
      if (f.bomb) {
        ctx.fillStyle = f.color;
        ctx.strokeStyle = NEON.danger;
        ctx.lineWidth = 2.5;
        ctx.shadowColor = NEON.danger;
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.arc(0, 0, f.r, 0, TAU);
        ctx.fill();
        ctx.stroke();
        // Sparking fuse
        ctx.shadowBlur = 0;
        ctx.strokeStyle = "#64748b";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(0, -f.r);
        ctx.quadraticCurveTo(8, -f.r - 10, 12, -f.r - 14);
        ctx.stroke();
        const sparkR = 2.5 + Math.random() * 2.5;
        ctx.fillStyle = NEON.warn;
        ctx.shadowColor = NEON.warn;
        ctx.shadowBlur = 14;
        ctx.beginPath();
        ctx.arc(12, -f.r - 14, sparkR, 0, TAU);
        ctx.fill();
      } else {
        ctx.fillStyle = f.color;
        ctx.shadowColor = f.glow;
        ctx.shadowBlur = f.golden ? 22 : 12;
        ctx.beginPath();
        ctx.arc(0, 0, f.r, 0, TAU);
        ctx.fill();
        // Highlight + leaf
        ctx.shadowBlur = 0;
        ctx.fillStyle = "rgba(255,255,255,0.3)";
        ctx.beginPath();
        ctx.arc(-f.r * 0.32, -f.r * 0.32, f.r * 0.3, 0, TAU);
        ctx.fill();
        if (!f.golden) {
          ctx.fillStyle = NEON.accent;
          ctx.beginPath();
          ctx.ellipse(0, -f.r - 3, 7, 3.5, -0.5, 0, TAU);
          ctx.fill();
        }
      }
      ctx.restore();
    }

    function drawChunk(c) {
      const t = c.life / c.maxLife;
      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.rotate(c.rot);
      ctx.globalAlpha = t;
      ctx.fillStyle = c.color;
      ctx.shadowColor = c.glow;
      ctx.shadowBlur = 8 * t;
      ctx.beginPath();
      ctx.arc(0, 0, c.r, -Math.PI / 2, Math.PI / 2); // half-disc
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;
    }

    function drawBlade() {
      const now = performance.now();
      const pts = state.trail;
      if (pts.length < 2) return;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      for (let i = 1; i < pts.length; i++) {
        const age = 1 - (now - pts[i].t) / TRAIL_LIFE;
        if (age <= 0) continue;
        ctx.strokeStyle = `rgba(255,255,255,${0.85 * age})`;
        ctx.shadowColor = NEON.cyan;
        ctx.shadowBlur = 14 * age;
        ctx.lineWidth = 1 + 7 * age * (i / pts.length);
        ctx.beginPath();
        ctx.moveTo(pts[i - 1].x, pts[i - 1].y);
        ctx.lineTo(pts[i].x, pts[i].y);
        ctx.stroke();
      }
      ctx.shadowBlur = 0;
    }

    function draw() {
      ctx.save();
      shake.apply(ctx);

      const grad = ctx.createLinearGradient(0, 0, 0, H);
      grad.addColorStop(0, "#05060c");
      grad.addColorStop(1, "#0b1018");
      ctx.fillStyle = grad;
      ctx.fillRect(-20, -20, W + 40, H + 40);

      for (const c of state.chunks) drawChunk(c);
      for (const f of state.fruits) drawFruit(f);
      particles.draw(ctx);
      if (!state.dying) drawBlade();

      for (const p of state.popups) {
        ctx.globalAlpha = p.life / p.maxLife;
        drawHudText(ctx, p.text, p.x, p.y, { size: 16, align: "center", color: p.color, glow: p.color });
        ctx.globalAlpha = 1;
      }

      // HUD
      drawHudText(ctx, `SCORE ${state.score}`, 14, 28, { size: 15, glow: NEON.accent });
      drawHudText(ctx, `LV ${state.level}`, W / 2, 28, { size: 15, align: "center", color: NEON.muted });
      drawLives(ctx, Math.max(0, state.lives), W - 16, 22);
      if (state.combo >= 3 && countdown.done && !state.dying) {
        drawHudText(ctx, `COMBO x${state.combo}`, 14, 50, { size: 12, color: NEON.cyan, glow: NEON.cyan });
      }

      if (state.handLost && countdown.done && !state.dying) {
        drawHandLostBanner(ctx, W, H, "Hand not detected — show hand to slash");
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
        state.lastTs = ts;
        state.segments.length = 0; // discard strokes made while paused
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
