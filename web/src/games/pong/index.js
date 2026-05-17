const W = 800;
const H = 500;
const PADDLE_W = 14;
const PADDLE_H = 100;
const PADDLE_X = 30;
const BALL_R = 9;

export default {
  async mount({ canvas, onHandUpdate, handState, onScore }) {
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");

    const state = {
      paddleY: H / 2 - PADDLE_H / 2,
      targetY: H / 2 - PADDLE_H / 2,
      ball: { x: W / 2, y: H / 2, vx: -5, vy: 3 },
      score: 0,
      gameOver: false,
      handLost: !handState.isDetected,
      restartPending: false,
    };

    const unsub = onHandUpdate((s) => {
      state.handLost = !s.isDetected;
      if (s.isDetected) {
        state.targetY = s.y * H - PADDLE_H / 2;
      }
      if (state.gameOver && s.isDetected && !state.restartPending) {
        state.restartPending = true;
        setTimeout(() => {
          if (state.gameOver) reset();
          state.restartPending = false;
        }, 800);
      }
    });

    function reset() {
      state.ball.x = W / 2;
      state.ball.y = H / 2;
      state.ball.vx = -5;
      state.ball.vy = (Math.random() - 0.5) * 3;
      state.score = 0;
      state.gameOver = false;
    }

    let raf = null;
    let running = true;

    function step() {
      state.paddleY += (state.targetY - state.paddleY) * 0.25;
      state.paddleY = Math.max(0, Math.min(H - PADDLE_H, state.paddleY));

      if (!state.gameOver) {
        const b = state.ball;
        b.x += b.vx;
        b.y += b.vy;

        if (b.y < BALL_R) { b.y = BALL_R; b.vy *= -1; }
        else if (b.y > H - BALL_R) { b.y = H - BALL_R; b.vy *= -1; }
        if (b.x > W - BALL_R) { b.x = W - BALL_R; b.vx *= -1; }

        if (
          b.vx < 0 &&
          b.x - BALL_R < PADDLE_X + PADDLE_W &&
          b.x - BALL_R > PADDLE_X &&
          b.y > state.paddleY &&
          b.y < state.paddleY + PADDLE_H
        ) {
          b.x = PADDLE_X + PADDLE_W + BALL_R;
          b.vx *= -1.04;
          b.vy += ((b.y - (state.paddleY + PADDLE_H / 2)) / (PADDLE_H / 2)) * 2;
          state.score += 1;
        }

        if (b.x < -BALL_R) {
          state.gameOver = true;
          onScore(state.score);
        }
      }

      draw(ctx, state);
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

function draw(ctx, state) {
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, W, H);

  ctx.strokeStyle = "#1f2430";
  ctx.setLineDash([8, 8]);
  ctx.beginPath();
  ctx.moveTo(W / 2, 0);
  ctx.lineTo(W / 2, H);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.fillStyle = state.handLost ? "#665533" : "#4ade80";
  ctx.fillRect(PADDLE_X, state.paddleY, PADDLE_W, PADDLE_H);

  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.arc(state.ball.x, state.ball.y, BALL_R, 0, Math.PI * 2);
  ctx.fill();

  ctx.font = "20px system-ui, sans-serif";
  ctx.fillStyle = "#e8eaed";
  ctx.textAlign = "left";
  ctx.fillText(`Score: ${state.score}`, 20, 30);

  if (state.handLost) {
    ctx.fillStyle = "#fbbf24";
    ctx.font = "15px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Hand not detected — paddle frozen", W / 2, H - 15);
  }

  if (state.gameOver) {
    ctx.fillStyle = "rgba(0,0,0,0.72)";
    ctx.fillRect(0, H / 2 - 70, W, 140);
    ctx.fillStyle = "#fff";
    ctx.font = "bold 36px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Game Over", W / 2, H / 2 - 8);
    ctx.font = "17px system-ui, sans-serif";
    ctx.fillStyle = "#8a8f99";
    ctx.fillText(`Score: ${state.score}  •  Show your hand to restart`, W / 2, H / 2 + 30);
  }
}
