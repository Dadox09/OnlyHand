const W = 800;
const H = 550;
const TAU = Math.PI * 2;

const SIZES = { large: 42, medium: 24, small: 13 };
const SHIP_SMOOTHING = 0.14;
const SHIP_RADIUS = 12;
const SPAWN_INTERVAL_BASE = 2800; // ms between spawns at level 1
const LEVEL_EVERY = 15;           // seconds per level step

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

function spawnInitial(n = 5, level = 1) {
  return Array.from({ length: n }, () => {
    let x, y;
    do { x = Math.random() * W; y = Math.random() * H; }
    while (Math.hypot(x - W / 2, y - H / 2) < 160);
    return makeAsteroid("large", x, y, level);
  });
}

function spawnRandom(level) {
  // Spawn from edge
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
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");

    const ship = {
      x: W / 2, y: H / 2,
      targetX: W / 2, targetY: H / 2,
      radius: SHIP_RADIUS,
    };

    const state = {
      ship,
      asteroids: spawnInitial(5, 1),
      score: 0,
      lives: 3,
      level: 1,
      gameOver: false,
      invincible: 0,
      handLost: !handState.isDetected,
      startTs: null,
      lastTs: 0,
      lastSpawn: 0,
      elapsed: 0,
      gesture: null,
      restarting: false,
    };

    const unsub = onHandUpdate((s) => {
      state.handLost = !s.isDetected;
      state.gesture = s.gesture ?? null;
      if (s.isDetected) {
        state.ship.targetX = (1 - s.x) * W;
        state.ship.targetY = s.y * H;
      }
      if (state.gameOver && s.gesture === "Thumb_Up" && !state.restarting) {
        state.restarting = true;
        restart(state);
        state.restarting = false;
      }
    });

    let raf = null;
    let running = true;

    function step(ts) {
      try {
        update(state, ts);
        draw(ctx, state);
      } catch (e) {
        console.error("[asteroids] frame error:", e);
      }
      if (running) raf = requestAnimationFrame(step);
    }
    raf = requestAnimationFrame(step);

    return {
      unmount() {
        running = false;
        if (raf) cancelAnimationFrame(raf);
        unsub();
      },
    };
  },
};

function update(state, ts) {
  // Always move asteroids (no freeze on game over)
  for (const a of state.asteroids) {
    a.x = wrap(a.x + a.vx, W);
    a.y = wrap(a.y + a.vy, H);
    a.rot += a.rotSpeed;
  }
  if (state.gameOver) return;
  if (state.startTs === null) state.startTs = ts;

  const dt = Math.min(ts - state.lastTs, 100); // cap dt
  state.lastTs = ts;

  if (!state.handLost) {
    state.elapsed = (ts - state.startTs) / 1000;
    state.score = Math.floor(state.elapsed);
  }

  // Level up every LEVEL_EVERY seconds
  state.level = 1 + Math.floor(state.elapsed / LEVEL_EVERY);

  const { ship } = state;

  ship.x += (ship.targetX - ship.x) * SHIP_SMOOTHING;
  ship.y += (ship.targetY - ship.y) * SHIP_SMOOTHING;
  ship.x = Math.max(SHIP_RADIUS, Math.min(W - SHIP_RADIUS, ship.x));
  ship.y = Math.max(SHIP_RADIUS, Math.min(H - SHIP_RADIUS, ship.y));

  // Periodic spawn
  const spawnInterval = Math.max(900, SPAWN_INTERVAL_BASE - (state.level - 1) * 220);
  if (ts - state.lastSpawn > spawnInterval) {
    state.asteroids.push(spawnRandom(state.level));
    state.lastSpawn = ts;
  }

  // Cap asteroid count
  if (state.asteroids.length > 28) {
    state.asteroids.splice(0, state.asteroids.length - 28);
  }

  // Ship-asteroid collision
  if (state.invincible > 0) {
    state.invincible--;
  } else {
    for (const a of state.asteroids) {
      if (Math.hypot(ship.x - a.x, ship.y - a.y) < SIZES[a.size] * 0.75 + SHIP_RADIUS * 0.8) {
        state.lives--;
        state.invincible = 140;
        if (state.lives <= 0) {
          state.gameOver = true;
          onScore(state.score);
        }
        break;
      }
    }
  }
}

function drawShip(ctx, ship, invincible) {
  if (invincible > 0 && Math.floor(invincible / 6) % 2 === 0) return;

  ctx.save();
  ctx.translate(ship.x, ship.y);

  // Outer ring (shield)
  const shieldAlpha = invincible > 0 ? 0.35 + 0.3 * Math.sin(invincible * 0.4) : 0.18;
  ctx.beginPath();
  ctx.arc(0, 0, SHIP_RADIUS + 6, 0, TAU);
  ctx.strokeStyle = `rgba(96,200,255,${shieldAlpha})`;
  ctx.lineWidth = 2;
  ctx.shadowColor = "#60c8ff";
  ctx.shadowBlur = 10;
  ctx.stroke();

  // Core dot
  ctx.beginPath();
  ctx.arc(0, 0, SHIP_RADIUS * 0.55, 0, TAU);
  ctx.fillStyle = "#7dd3fc";
  ctx.shadowColor = "#38bdf8";
  ctx.shadowBlur = 14;
  ctx.fill();

  // Cross/reticle lines
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

function draw(ctx, state) {
  ctx.fillStyle = "#000008";
  ctx.fillRect(0, 0, W, H);

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

  drawShip(ctx, state.ship, state.invincible);

  // HUD
  ctx.shadowBlur = 0;
  ctx.font = "bold 17px system-ui, sans-serif";
  ctx.fillStyle = "#e8eaed";
  ctx.textAlign = "left";
  ctx.fillText(`${state.score}s`, 12, 24);
  ctx.textAlign = "center";
  ctx.fillText(`Lv ${state.level}`, W / 2, 24);
  ctx.textAlign = "right";
  ctx.fillText("❤️".repeat(Math.max(0, state.lives)), W - 12, 24);

  if (state.handLost && !state.gameOver) {
    ctx.fillStyle = "#fbbf24";
    ctx.font = "14px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Hand not detected — show hand to play", W / 2, H - 10);
  }

  if (state.gameOver) {
    ctx.fillStyle = "rgba(0,0,0,0.78)";
    ctx.fillRect(0, H / 2 - 85, W, 170);
    ctx.fillStyle = "#fff";
    ctx.font = "bold 38px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Game Over", W / 2, H / 2 - 20);
    ctx.font = "17px system-ui, sans-serif";
    ctx.fillStyle = "#8a8f99";
    ctx.fillText(`Survived: ${state.score}s`, W / 2, H / 2 + 20);
    ctx.font = "14px system-ui, sans-serif";
    ctx.fillStyle = "#fbbf24";
    ctx.fillText("👍 Show Thumb Up to restart", W / 2, H / 2 + 48);
    // Gesture debug feedback
    const g = state.gesture;
    ctx.font = "13px monospace";
    ctx.fillStyle = g === "Thumb_Up" ? "#4ade80" : "#64748b";
    ctx.fillText(`Detected: ${g ?? "none"}`, W / 2, H / 2 + 72);
  }
}

function restart(state) {
  state.ship.x = W / 2; state.ship.y = H / 2;
  state.ship.targetX = W / 2; state.ship.targetY = H / 2;
  state.asteroids = spawnInitial(5, 1);
  state.score = 0;
  state.lives = 3;
  state.level = 1;
  state.gameOver = false;
  state.invincible = 90; // brief grace on restart
  state.startTs = null;
  state.lastTs = 0;
  state.lastSpawn = 0;
  state.elapsed = 0;
  state.gesture = null;
}
