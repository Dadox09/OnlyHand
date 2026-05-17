export function createPongGame({ canvas, handInput }) {
  const ctx = canvas.getContext("2d");
  const W = canvas.width;
  const H = canvas.height;

  const PADDLE_W = 14;
  const PADDLE_H = 100;
  const PADDLE_X = 30;
  const BALL_R = 9;

  const state = {
    paddleY: H / 2 - PADDLE_H / 2,
    targetY: H / 2 - PADDLE_H / 2,
    ball: { x: W / 2, y: H / 2, vx: -5, vy: 3 },
    score: 0,
    best: Number(localStorage.getItem("pong-best") || 0),
    gameOver: false,
    handLost: true,
  };

  const unsubscribe = handInput.onUpdate((s) => {
    if (s.isDetected) {
      // Mirror: webcam mirrored on screen, so paddle follows hand naturally.
      state.targetY = s.y * H - PADDLE_H / 2;
      state.handLost = false;
    } else {
      state.handLost = true;
    }
  });

  let raf = null;
  let running = true;

  function reset() {
    state.ball.x = W / 2;
    state.ball.y = H / 2;
    state.ball.vx = -5;
    state.ball.vy = (Math.random() - 0.5) * 6;
    state.score = 0;
    state.gameOver = false;
  }

  function step() {
    // Smooth paddle towards target.
    state.paddleY += (state.targetY - state.paddleY) * 0.25;
    state.paddleY = Math.max(0, Math.min(H - PADDLE_H, state.paddleY));

    if (!state.gameOver) {
      const b = state.ball;
      b.x += b.vx;
      b.y += b.vy;

      if (b.y < BALL_R) {
        b.y = BALL_R;
        b.vy *= -1;
      } else if (b.y > H - BALL_R) {
        b.y = H - BALL_R;
        b.vy *= -1;
      }

      if (b.x > W - BALL_R) {
        b.x = W - BALL_R;
        b.vx *= -1;
      }

      // Paddle collision.
      if (
        b.x - BALL_R < PADDLE_X + PADDLE_W &&
        b.x - BALL_R > PADDLE_X &&
        b.y > state.paddleY &&
        b.y < state.paddleY + PADDLE_H &&
        b.vx < 0
      ) {
        b.x = PADDLE_X + PADDLE_W + BALL_R;
        b.vx *= -1.08;
        const hitPos = (b.y - (state.paddleY + PADDLE_H / 2)) / (PADDLE_H / 2);
        b.vy += hitPos * 2;
        state.score += 1;
      }

      if (b.x < -BALL_R) {
        state.gameOver = true;
        if (state.score > state.best) {
          state.best = state.score;
          localStorage.setItem("pong-best", String(state.best));
        }
      }
    }

    draw();
    if (running) raf = requestAnimationFrame(step);
  }

  function draw() {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, W, H);

    // Center dashed line.
    ctx.strokeStyle = "#222";
    ctx.setLineDash([8, 8]);
    ctx.beginPath();
    ctx.moveTo(W / 2, 0);
    ctx.lineTo(W / 2, H);
    ctx.stroke();
    ctx.setLineDash([]);

    // Paddle.
    ctx.fillStyle = state.handLost ? "#665" : "#4ade80";
    ctx.fillRect(PADDLE_X, state.paddleY, PADDLE_W, PADDLE_H);

    // Ball.
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(state.ball.x, state.ball.y, BALL_R, 0, Math.PI * 2);
    ctx.fill();

    // HUD.
    ctx.fillStyle = "#e8eaed";
    ctx.font = "20px system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(`Score: ${state.score}`, 20, 30);
    ctx.textAlign = "right";
    ctx.fillText(`Best: ${state.best}`, W - 20, 30);

    if (state.handLost) {
      ctx.fillStyle = "#fbbf24";
      ctx.font = "16px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Hand not detected", W / 2, 30);
    }

    if (state.gameOver) {
      ctx.fillStyle = "rgba(0,0,0,0.7)";
      ctx.fillRect(0, H / 2 - 70, W, 140);
      ctx.fillStyle = "#fff";
      ctx.font = "bold 36px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Game Over", W / 2, H / 2 - 10);
      ctx.font = "18px system-ui, sans-serif";
      ctx.fillText("Show your hand to restart", W / 2, H / 2 + 30);

      if (!state.handLost) {
        // Auto-restart when hand reappears after game over.
        setTimeout(() => {
          if (!state.handLost && state.gameOver) reset();
        }, 800);
      }
    }
  }

  function destroy() {
    running = false;
    if (raf) cancelAnimationFrame(raf);
    unsubscribe();
  }

  step();

  return { destroy };
}
