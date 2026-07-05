import {
  NEON, setupCanvas, createParticles, createShake, createFlash,
  createCountdown, createFixedStep, drawHudText, drawHandLostBanner, sfx,
} from "../../core/gameKit.js";

const W = 800;
const H = 500;
const PADDLE_W = 14;
const PADDLE_H = 100;
const PADDLE_X = 30;
const BALL_R = 9;
const MAX_VX = 16.5;
const TRAIL_LEN = 12;

export default {
  async mount({ canvas, onHandUpdate, handState, onScore }) {
    const ctx = setupCanvas(canvas, W, H);

    const particles = createParticles();
    const shake = createShake();
    const flash = createFlash();
    const countdown = createCountdown((label) => (label === "GO" ? sfx.go() : sfx.tick()));

    const state = {
      paddleY: H / 2 - PADDLE_H / 2,
      targetY: H / 2 - PADDLE_H / 2,
      ball: { x: W / 2, y: H / 2, vx: -7.5, vy: 4.5 },
      trail: [],
      score: 0,
      dying: false,
      paused: false,
      handLost: !handState.isDetected,
    };

    const unsub = onHandUpdate((s) => {
      state.handLost = !s.isDetected;
      if (s.isDetected) state.targetY = s.y * H - PADDLE_H / 2;
    });

    let raf = null;
    let running = true;
    let deathTimer = null;

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

    function update() {
      state.paddleY += (state.targetY - state.paddleY) * 0.25;
      state.paddleY = Math.max(0, Math.min(H - PADDLE_H, state.paddleY));

      particles.update();
      shake.update();
      flash.update();

      if (!countdown.done || state.dying) return;

      const b = state.ball;
      b.x += b.vx;
      b.y += b.vy;

      state.trail.push({ x: b.x, y: b.y });
      if (state.trail.length > TRAIL_LEN) state.trail.shift();

      if (b.y < BALL_R) {
        b.y = BALL_R; b.vy *= -1;
        sfx.bounce();
        particles.burst(b.x, 0, { count: 6, color: NEON.cyan, speed: 2, life: 25, size: 2 });
      } else if (b.y > H - BALL_R) {
        b.y = H - BALL_R; b.vy *= -1;
        sfx.bounce();
        particles.burst(b.x, H, { count: 6, color: NEON.cyan, speed: 2, life: 25, size: 2 });
      }
      if (b.x > W - BALL_R) {
        b.x = W - BALL_R; b.vx *= -1;
        sfx.bounce();
        particles.burst(W, b.y, { count: 6, color: NEON.cyan, speed: 2, life: 25, size: 2 });
      }

      if (
        b.vx < 0 &&
        b.x - BALL_R < PADDLE_X + PADDLE_W &&
        b.x - BALL_R > PADDLE_X &&
        b.y > state.paddleY &&
        b.y < state.paddleY + PADDLE_H
      ) {
        b.x = PADDLE_X + PADDLE_W + BALL_R;
        b.vx = Math.min(-b.vx * 1.04, MAX_VX);
        b.vy += ((b.y - (state.paddleY + PADDLE_H / 2)) / (PADDLE_H / 2)) * 3;
        state.score += 1;
        sfx.hit();
        shake.add(0.12);
        flash.trigger(NEON.accent, 0.06);
        particles.burst(PADDLE_X + PADDLE_W, b.y, {
          count: 14, color: NEON.accent, speed: 4, life: 35, size: 3,
          angle: 0, spread: Math.PI * 0.9,
        });
      }

      if (b.x < -BALL_R && !state.dying) {
        state.dying = true;
        sfx.lose();
        shake.add(0.6);
        flash.trigger(NEON.danger, 0.3);
        particles.burst(0, b.y, { count: 30, color: NEON.danger, speed: 5, life: 50, size: 4 });
        state.trail.length = 0;
        deathTimer = setTimeout(() => {
          if (running) onScore(state.score);
        }, 700);
      }
    }

    function draw() {
      ctx.save();
      shake.apply(ctx);

      ctx.fillStyle = NEON.canvas;
      ctx.fillRect(-20, -20, W + 40, H + 40);

      // Center line
      ctx.strokeStyle = "rgba(74,222,128,0.12)";
      ctx.setLineDash([8, 10]);
      ctx.beginPath();
      ctx.moveTo(W / 2, 0);
      ctx.lineTo(W / 2, H);
      ctx.stroke();
      ctx.setLineDash([]);

      // Ball trail
      state.trail.forEach((p, i) => {
        const t = (i + 1) / state.trail.length;
        ctx.globalAlpha = t * 0.35;
        ctx.fillStyle = NEON.cyan;
        ctx.beginPath();
        ctx.arc(p.x, p.y, BALL_R * t * 0.8, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.globalAlpha = 1;

      // Paddle
      ctx.fillStyle = state.handLost ? NEON.warn : NEON.accent;
      ctx.shadowColor = state.handLost ? NEON.warn : NEON.accent;
      ctx.shadowBlur = 16;
      ctx.beginPath();
      ctx.roundRect(PADDLE_X, state.paddleY, PADDLE_W, PADDLE_H, 6);
      ctx.fill();
      ctx.shadowBlur = 0;

      // Ball
      if (!state.dying) {
        ctx.fillStyle = "#fff";
        ctx.shadowColor = NEON.cyan;
        ctx.shadowBlur = 14;
        ctx.beginPath();
        ctx.arc(state.ball.x, state.ball.y, BALL_R, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      particles.draw(ctx);

      drawHudText(ctx, `SCORE ${state.score}`, 20, 32, { size: 16, glow: NEON.accent });
      if (state.handLost && countdown.done) drawHandLostBanner(ctx, W, H, "Hand not detected — paddle frozen");

      flash.draw(ctx, W, H);
      countdown.draw(ctx, W, H);
      ctx.restore();
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
