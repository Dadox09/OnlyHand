import {
  NEON, setupCanvas, createParticles, createShake, createFlash,
  createCountdown, drawHudText, drawHandLostBanner, sfx,
} from "../../core/gameKit.js";

const COLS = 24;
const ROWS = 18;
const CELL = 30;
const W = COLS * CELL;   // 720
const H = ROWS * CELL;   // 540

// Steering: direction = where your hand is relative to the frame center.
// Beyond DEADZONE the dominant axis wins — much snappier than edge zones.
const DEADZONE = 0.13;

const DIR = { UP: [0,-1], DOWN: [0,1], LEFT: [-1,0], RIGHT: [1,0] };
const OPPOSITE = { UP: "DOWN", DOWN: "UP", LEFT: "RIGHT", RIGHT: "LEFT" };

const SPEEDS = [180, 150, 120, 100, 85, 72];  // ms per tick, faster every 5 score

function rnd(max) { return Math.floor(Math.random() * max); }
function spawnFood(snake) {
  let pos;
  do { pos = { x: rnd(COLS), y: rnd(ROWS) }; }
  while (snake.some(s => s.x === pos.x && s.y === pos.y));
  return pos;
}

export default {
  async mount({ canvas, onHandUpdate, handState, onScore }) {
    const ctx = setupCanvas(canvas, W, H);

    const particles = createParticles();
    const shake = createShake();
    const flash = createFlash();
    const countdown = createCountdown((label) => (label === "GO" ? sfx.go() : sfx.tick()));

    const initialSnake = [
      { x: 12, y: 9 }, { x: 11, y: 9 }, { x: 10, y: 9 },
    ];

    const state = {
      snake: initialSnake,
      dir: "RIGHT",
      nextDir: "RIGHT",
      food: spawnFood(initialSnake),
      score: 0,
      dying: false,
      paused: false,
      handLost: !handState.isDetected,
      steer: null,      // "UP" | "DOWN" | "LEFT" | "RIGHT" | null
      steerVec: null,   // {dx, dy} for the HUD compass
    };

    const unsub = onHandUpdate((s) => {
      state.handLost = !s.isDetected;
      if (!s.isDetected) { state.steer = null; state.steerVec = null; return; }

      // Vector from frame center to hand (x mirrored to match the preview)
      const dx = (1 - s.x) - 0.5;
      const dy = s.y - 0.5;
      state.steerVec = { dx, dy };

      let steer = null;
      if (Math.hypot(dx, dy) > DEADZONE) {
        steer = Math.abs(dx) > Math.abs(dy)
          ? (dx < 0 ? "LEFT" : "RIGHT")
          : (dy < 0 ? "UP" : "DOWN");
      }
      state.steer = steer;

      if (steer && steer !== OPPOSITE[state.dir]) {
        state.nextDir = steer;
      }
    });

    let tickHandle = null;
    let raf = null;
    let running = true;
    let deathTimer = null;

    function die() {
      state.dying = true;
      sfx.lose();
      shake.add(0.5);
      flash.trigger(NEON.danger, 0.3);
      const h = state.snake[0];
      particles.burst(h.x * CELL + CELL / 2, h.y * CELL + CELL / 2, {
        count: 26, color: NEON.danger, speed: 4.5, life: 45, size: 4,
      });
      deathTimer = setTimeout(() => { if (running) onScore(state.score); }, 700);
    }

    function tick() {
      if (state.dying || state.paused || !countdown.done) return;
      state.dir = state.nextDir;
      const head = state.snake[0];
      const [dx, dy] = DIR[state.dir];
      const next = { x: head.x + dx, y: head.y + dy };

      if (next.x < 0 || next.x >= COLS || next.y < 0 || next.y >= ROWS) { die(); return; }
      if (state.snake.some(s => s.x === next.x && s.y === next.y)) { die(); return; }

      state.snake.unshift(next);

      if (next.x === state.food.x && next.y === state.food.y) {
        state.score += 1;
        sfx.eat();
        flash.trigger(NEON.accent, 0.05);
        particles.burst(next.x * CELL + CELL / 2, next.y * CELL + CELL / 2, {
          count: 12, color: NEON.danger, speed: 3, life: 30, size: 3,
        });
        state.food = spawnFood(state.snake);
      } else {
        state.snake.pop();
      }
    }

    function schedTick() {
      if (!running) return;
      tick();
      const speed = SPEEDS[Math.min(Math.floor(state.score / 5), SPEEDS.length - 1)];
      tickHandle = setTimeout(schedTick, speed);
    }
    schedTick();

    function render() {
      if (!running) return;
      if (!state.paused) {
        countdown.update();
        particles.update();
        shake.update();
        flash.update();
      }
      draw();
      raf = requestAnimationFrame(render);
    }
    raf = requestAnimationFrame(render);

    function draw() {
      ctx.save();
      shake.apply(ctx);

      // Background + checker grid
      ctx.fillStyle = "#0a0c10";
      ctx.fillRect(-20, -20, W + 40, H + 40);
      ctx.fillStyle = "#111520";
      for (let x = 0; x < COLS; x++) {
        for (let y = 0; y < ROWS; y++) {
          if ((x + y) % 2 === 0)
            ctx.fillRect(x * CELL, y * CELL, CELL, CELL);
        }
      }

      // Food — pulsing circle
      const pulse = 0.85 + 0.15 * Math.sin(Date.now() / 200);
      ctx.fillStyle = NEON.danger;
      ctx.shadowColor = NEON.danger;
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.arc(
        state.food.x * CELL + CELL / 2,
        state.food.y * CELL + CELL / 2,
        (CELL / 2 - 4) * pulse, 0, Math.PI * 2
      );
      ctx.fill();
      ctx.shadowBlur = 0;

      // Snake
      if (!state.dying) {
        state.snake.forEach((seg, i) => {
          const t = i / state.snake.length;
          ctx.fillStyle = i === 0
            ? NEON.accent
            : `hsl(${140 - t * 40}, ${80 - t * 20}%, ${50 - t * 15}%)`;
          if (i === 0) { ctx.shadowColor = NEON.accent; ctx.shadowBlur = 10; }
          ctx.beginPath();
          ctx.roundRect(seg.x * CELL + 2, seg.y * CELL + 2, CELL - 4, CELL - 4, 5);
          ctx.fill();
          ctx.shadowBlur = 0;
        });

        // Eyes on head
        const h = state.snake[0];
        const [dx, dy] = DIR[state.dir];
        ctx.fillStyle = "#000";
        const ex = h.x * CELL + CELL/2 + dx * 5;
        const ey = h.y * CELL + CELL/2 + dy * 5;
        const perp = Math.abs(dy) > 0 ? 4 : 0;
        const perpY = Math.abs(dx) > 0 ? 4 : 0;
        ctx.beginPath(); ctx.arc(ex - perpY, ey - perp, 2.5, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc(ex + perpY, ey + perp, 2.5, 0, Math.PI*2); ctx.fill();
      }

      particles.draw(ctx);

      // HUD
      drawHudText(ctx, `SCORE ${state.score}`, 12, 26, { size: 15, glow: NEON.accent });

      // Steering compass — shows the live hand vector, top-right
      const cx = W - 34, cy = 30, cr = 18;
      ctx.strokeStyle = "rgba(74,222,128,0.25)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(cx, cy, cr, 0, Math.PI * 2);
      ctx.stroke();
      if (state.steerVec) {
        const { dx, dy } = state.steerVec;
        const mag = Math.min(1, Math.hypot(dx, dy) / 0.4);
        const a = Math.atan2(dy, dx);
        ctx.strokeStyle = state.steer ? NEON.accent : NEON.faint;
        ctx.lineWidth = 3;
        ctx.lineCap = "round";
        ctx.shadowColor = NEON.accent;
        ctx.shadowBlur = state.steer ? 8 : 0;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(a) * cr * mag, cy + Math.sin(a) * cr * mag);
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.lineCap = "butt";
      }

      if (countdown.done && !state.dying) {
        if (state.handLost) {
          drawHandLostBanner(ctx, W, H, "Hand not detected — snake keeps going");
        } else if (state.score === 0) {
          ctx.fillStyle = NEON.muted;
          ctx.font = "13px system-ui, sans-serif";
          ctx.textAlign = "center";
          ctx.fillText("Move your hand away from center to steer", W/2, H - 10);
        }
      }

      flash.draw(ctx, W, H);
      countdown.draw(ctx, W, H);
      ctx.restore();
    }

    return {
      pause() { state.paused = true; },
      resume() { state.paused = false; },
      unmount() {
        running = false;
        clearTimeout(tickHandle);
        clearTimeout(deathTimer);
        if (raf) cancelAnimationFrame(raf);
        unsub();
      },
    };
  },
};
