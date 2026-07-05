import {
  NEON, setupCanvas, createParticles, createShake, createFlash,
  createCountdown, createFixedStep, drawHudText, drawHandLostBanner, drawLives, sfx,
} from "../../core/gameKit.js";

const W = 800;
const H = 550;

const PADDLE_W = 150;
const PADDLE_H = 14;
const PADDLE_Y = H - 40;
const BALL_R = 8;
const BRICK_COLS = 10;
const BRICK_W = 68;
const BRICK_H = 22;
const BRICK_PAD = 4;
const BRICK_OFFSET_X = (W - (BRICK_COLS * (BRICK_W + BRICK_PAD) - BRICK_PAD)) / 2;
const BRICK_OFFSET_Y = 55;

const ROW_COLORS = ["#f87171", "#fb923c", "#facc15", "#4ade80", "#60a5fa", "#a78bfa", "#e879f9"];
const DROP_CHANCE = 0.14;
const WIDE_FRAMES = 12 * 60;   // ~12s
const LEVEL_BANNER_FRAMES = 90;

function makeBricks(level) {
  const rows = Math.min(5 + (level - 1), 7);
  const bricks = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < BRICK_COLS; c++) {
      bricks.push({
        x: BRICK_OFFSET_X + c * (BRICK_W + BRICK_PAD),
        y: BRICK_OFFSET_Y + r * (BRICK_H + BRICK_PAD),
        color: ROW_COLORS[r % ROW_COLORS.length],
        points: rows - r,
        alive: true,
      });
    }
  }
  return bricks;
}

function makeBall(x, y, level, vx = null) {
  const speed = 1 + (level - 1) * 0.08;
  return {
    x, y,
    vx: (vx ?? (Math.random() > 0.5 ? 1 : -1) * (4.5 + Math.random() * 1.5)) * speed,
    vy: -6 * speed,
    glued: vx === null, // fresh serve sticks to the paddle until launch
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
      paddleX: W / 2 - PADDLE_W / 2,
      targetX: W / 2 - PADDLE_W / 2,
      paddleW: PADDLE_W,
      wideFrames: 0,
      balls: [makeBall(W / 2, PADDLE_Y - BALL_R - 2, 1)],
      bricks: makeBricks(1),
      drops: [],
      level: 1,
      levelBanner: 0,
      score: 0,
      lives: 3,
      dying: false,
      paused: false,
      handLost: !handState.isDetected,
    };

    const unsub = onHandUpdate((s) => {
      state.handLost = !s.isDetected;
      if (s.isDetected) {
        state.targetX = (1 - s.x) * W - state.paddleW / 2;
      }
    });

    let raf = null;
    let running = true;
    let deathTimer = null;

    function launchGlued() {
      for (const b of state.balls) if (b.glued) b.glued = false;
    }

    function killBrick(brick) {
      brick.alive = false;
      state.score += brick.points;
      sfx.brick();
      shake.add(0.06);
      particles.burst(brick.x + BRICK_W / 2, brick.y + BRICK_H / 2, {
        count: 10, color: brick.color, speed: 3, life: 30, size: 3, gravity: 0.08,
      });
      if (Math.random() < DROP_CHANCE) {
        state.drops.push({
          x: brick.x + BRICK_W / 2,
          y: brick.y + BRICK_H / 2,
          vy: 3.6,
          type: Math.random() < 0.5 ? "WIDE" : "MULTI",
        });
      }
    }

    function applyPowerup(type) {
      sfx.powerup();
      flash.trigger(NEON.accent, 0.1);
      if (type === "WIDE") {
        state.paddleW = PADDLE_W * 1.55;
        state.wideFrames = WIDE_FRAMES;
      } else {
        const src = state.balls.find((b) => !b.glued) ?? state.balls[0];
        state.balls.push(makeBall(src.x, src.y, state.level, src.vx + 2.4));
        state.balls.push(makeBall(src.x, src.y, state.level, src.vx - 2.4));
      }
    }

    function nextLevel() {
      state.level += 1;
      state.levelBanner = LEVEL_BANNER_FRAMES;
      state.bricks = makeBricks(state.level);
      state.drops = [];
      state.balls = [makeBall(W / 2, PADDLE_Y - BALL_R - 2, state.level)];
      sfx.levelUp();
      flash.trigger(NEON.accent, 0.15);
    }

    function update() {
      state.paddleX += (state.targetX - state.paddleX) * 0.28;
      state.paddleX = Math.max(0, Math.min(W - state.paddleW, state.paddleX));

      particles.update();
      shake.update();
      flash.update();

      if (state.wideFrames > 0) {
        state.wideFrames -= 1;
        if (state.wideFrames === 0) state.paddleW = PADDLE_W;
      }
      if (state.levelBanner > 0) state.levelBanner -= 1;

      if (!countdown.done || state.dying) return;

      // Serve: glued balls ride the paddle, launch as soon as the hand is live
      for (const b of state.balls) {
        if (b.glued) {
          b.x = state.paddleX + state.paddleW / 2;
          b.y = PADDLE_Y - BALL_R - 2;
        }
      }
      if (!state.handLost) launchGlued();

      // Balls physics
      for (let i = state.balls.length - 1; i >= 0; i--) {
        const b = state.balls[i];
        if (b.glued) continue;
        b.x += b.vx;
        b.y += b.vy;

        if (b.x < BALL_R) { b.x = BALL_R; b.vx *= -1; sfx.bounce(); }
        else if (b.x > W - BALL_R) { b.x = W - BALL_R; b.vx *= -1; sfx.bounce(); }
        if (b.y < BALL_R) { b.y = BALL_R; b.vy *= -1; sfx.bounce(); }

        // Paddle
        if (
          b.vy > 0 &&
          b.y + BALL_R >= PADDLE_Y &&
          b.y + BALL_R <= PADDLE_Y + PADDLE_H + Math.abs(b.vy) &&
          b.x >= state.paddleX - BALL_R &&
          b.x <= state.paddleX + state.paddleW + BALL_R
        ) {
          b.y = PADDLE_Y - BALL_R;
          const rel = (b.x - (state.paddleX + state.paddleW / 2)) / (state.paddleW / 2);
          const speed = Math.hypot(b.vx, b.vy);
          b.vx = rel * speed * 1.1;
          b.vy = -Math.sqrt(Math.max(1, speed * speed - b.vx * b.vx));
          sfx.hit();
          particles.burst(b.x, PADDLE_Y, { count: 6, color: NEON.accent, speed: 2.5, life: 22, size: 2, angle: -Math.PI / 2, spread: Math.PI * 0.8 });
        }

        // Lost below
        if (b.y > H + BALL_R) {
          state.balls.splice(i, 1);
          continue;
        }

        // Bricks
        for (const brick of state.bricks) {
          if (!brick.alive) continue;
          if (
            b.x + BALL_R > brick.x &&
            b.x - BALL_R < brick.x + BRICK_W &&
            b.y + BALL_R > brick.y &&
            b.y - BALL_R < brick.y + BRICK_H
          ) {
            killBrick(brick);
            const overlapL = b.x + BALL_R - brick.x;
            const overlapR = brick.x + BRICK_W - (b.x - BALL_R);
            const overlapT = b.y + BALL_R - brick.y;
            const overlapB = brick.y + BRICK_H - (b.y - BALL_R);
            if (Math.min(overlapL, overlapR) < Math.min(overlapT, overlapB)) b.vx *= -1;
            else b.vy *= -1;
            break;
          }
        }
      }

      // Drops
      for (let i = state.drops.length - 1; i >= 0; i--) {
        const d = state.drops[i];
        d.y += d.vy;
        if (
          d.y > PADDLE_Y - 6 && d.y < PADDLE_Y + PADDLE_H + 10 &&
          d.x > state.paddleX - 10 && d.x < state.paddleX + state.paddleW + 10
        ) {
          applyPowerup(d.type);
          state.drops.splice(i, 1);
        } else if (d.y > H + 20) {
          state.drops.splice(i, 1);
        }
      }

      // All balls gone → lose a life
      if (state.balls.length === 0) {
        state.lives -= 1;
        shake.add(0.4);
        flash.trigger(NEON.danger, 0.25);
        if (state.lives <= 0) {
          state.dying = true;
          sfx.lose();
          deathTimer = setTimeout(() => { if (running) onScore(state.score); }, 700);
        } else {
          sfx.explode();
          state.balls = [makeBall(W / 2, PADDLE_Y - BALL_R - 2, state.level)];
        }
      }

      // Level cleared
      if (state.bricks.every((br) => !br.alive)) nextLevel();
    }

    function draw() {
      ctx.save();
      shake.apply(ctx);

      ctx.fillStyle = NEON.canvas;
      ctx.fillRect(-20, -20, W + 40, H + 40);

      // Bricks
      for (const br of state.bricks) {
        if (!br.alive) continue;
        ctx.fillStyle = br.color;
        ctx.beginPath();
        ctx.roundRect(br.x, br.y, BRICK_W, BRICK_H, 3);
        ctx.fill();
        ctx.fillStyle = "rgba(255,255,255,0.18)";
        ctx.fillRect(br.x + 2, br.y + 2, BRICK_W - 4, 3);
      }

      // Drops
      for (const d of state.drops) {
        const col = d.type === "WIDE" ? NEON.cyan : NEON.magenta;
        ctx.fillStyle = col;
        ctx.shadowColor = col;
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.roundRect(d.x - 16, d.y - 9, 32, 18, 5);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = "#04130a";
        ctx.font = `800 10px Orbitron, system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(d.type === "WIDE" ? "W" : "M", d.x, d.y + 1);
        ctx.textBaseline = "alphabetic";
      }

      // Paddle
      const padColor = state.handLost ? NEON.warn : (state.wideFrames > 0 ? NEON.cyan : NEON.accent);
      ctx.fillStyle = padColor;
      ctx.shadowColor = padColor;
      ctx.shadowBlur = 14;
      ctx.beginPath();
      ctx.roundRect(state.paddleX, PADDLE_Y, state.paddleW, PADDLE_H, 6);
      ctx.fill();
      ctx.shadowBlur = 0;

      // Balls
      for (const b of state.balls) {
        ctx.fillStyle = "#fff";
        ctx.shadowColor = NEON.cyan;
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.arc(b.x, b.y, BALL_R, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      particles.draw(ctx);

      // HUD
      drawHudText(ctx, `SCORE ${state.score}`, 16, 32, { size: 15, glow: NEON.accent });
      drawHudText(ctx, `LV ${state.level}`, W / 2, 32, { size: 15, align: "center", color: NEON.muted });
      drawLives(ctx, state.lives, W - 16, 26);

      if (state.levelBanner > 0) {
        const a = Math.min(1, state.levelBanner / 30);
        ctx.globalAlpha = a;
        drawHudText(ctx, `LEVEL ${state.level}`, W / 2, H / 2, { size: 42, align: "center", color: NEON.accent, glow: NEON.accent, weight: 900 });
        ctx.globalAlpha = 1;
      }

      if (state.handLost && countdown.done && !state.dying) {
        drawHandLostBanner(ctx, W, H, "Hand not detected — paddle frozen");
      }

      flash.draw(ctx, W, H);
      countdown.draw(ctx, W, H);
      ctx.restore();
    }

    const fixed = createFixedStep(update);

    function step(ts) {
      if (!state.paused) {
        countdown.update();
        fixed.tick(ts);
      } else {
        fixed.reset();
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
