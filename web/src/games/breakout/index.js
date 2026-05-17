const W = 800;
const H = 550;

const PADDLE_W = 150;
const PADDLE_H = 14;
const PADDLE_Y = H - 40;
const BALL_R = 8;
const BRICK_COLS = 10;
const BRICK_ROWS = 5;
const BRICK_W = 68;
const BRICK_H = 22;
const BRICK_PAD = 4;
const BRICK_OFFSET_X = (W - (BRICK_COLS * (BRICK_W + BRICK_PAD) - BRICK_PAD)) / 2;
const BRICK_OFFSET_Y = 55;

const ROW_COLORS = ["#f87171", "#fb923c", "#facc15", "#4ade80", "#60a5fa"];
const ROW_POINTS = [5, 4, 3, 2, 1];

function makeBricks() {
  const bricks = [];
  for (let r = 0; r < BRICK_ROWS; r++) {
    for (let c = 0; c < BRICK_COLS; c++) {
      bricks.push({
        x: BRICK_OFFSET_X + c * (BRICK_W + BRICK_PAD),
        y: BRICK_OFFSET_Y + r * (BRICK_H + BRICK_PAD),
        color: ROW_COLORS[r],
        points: ROW_POINTS[r],
        alive: true,
      });
    }
  }
  return bricks;
}

export default {
  async mount({ canvas, onHandUpdate, handState, onScore }) {
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");

    const state = {
      paddleX: W / 2 - PADDLE_W / 2,
      targetX: W / 2 - PADDLE_W / 2,
      ball: { x: W / 2, y: PADDLE_Y - BALL_R - 2, vx: 3.5, vy: -4 },
      bricks: makeBricks(),
      score: 0,
      lives: 3,
      gameOver: false,
      won: false,
      handLost: !handState.isDetected,
      launched: false,
    };

    const unsub = onHandUpdate((s) => {
      state.handLost = !s.isDetected;
      if (s.isDetected) {
        // hand x → paddle center, mirrored (1 - x) so moving hand right = paddle right on screen
        state.targetX = (1 - s.x) * W - PADDLE_W / 2;
        if (!state.launched) state.launched = true;
      }
      if ((state.gameOver || state.won) && s.isDetected && !state.restartPending) {
        state.restartPending = true;
        setTimeout(() => {
          if (state.gameOver || state.won) restart(state);
          state.restartPending = false;
        }, 900);
      }
    });

    let raf = null;
    let running = true;

    function step() {
      // Smooth paddle
      state.paddleX += (state.targetX - state.paddleX) * 0.28;
      state.paddleX = Math.max(0, Math.min(W - PADDLE_W, state.paddleX));

      if (!state.gameOver && !state.won && state.launched) {
        const b = state.ball;
        b.x += b.vx;
        b.y += b.vy;

        // Wall collisions
        if (b.x < BALL_R) { b.x = BALL_R; b.vx *= -1; }
        else if (b.x > W - BALL_R) { b.x = W - BALL_R; b.vx *= -1; }
        if (b.y < BALL_R) { b.y = BALL_R; b.vy *= -1; }

        // Paddle collision
        if (
          b.vy > 0 &&
          b.y + BALL_R >= PADDLE_Y &&
          b.y + BALL_R <= PADDLE_Y + PADDLE_H + Math.abs(b.vy) &&
          b.x >= state.paddleX - BALL_R &&
          b.x <= state.paddleX + PADDLE_W + BALL_R
        ) {
          b.y = PADDLE_Y - BALL_R;
          // Angle based on hit position
          const rel = (b.x - (state.paddleX + PADDLE_W / 2)) / (PADDLE_W / 2);
          const speed = Math.hypot(b.vx, b.vy);
          b.vx = rel * speed * 1.1;
          b.vy = -Math.sqrt(Math.max(1, speed * speed - b.vx * b.vx));
        }

        // Ball lost
        if (b.y > H + BALL_R) {
          state.lives -= 1;
          if (state.lives <= 0) {
            state.gameOver = true;
            onScore(state.score);
          } else {
            resetBall(state);
          }
        }

        // Brick collisions
        for (const brick of state.bricks) {
          if (!brick.alive) continue;
          if (
            b.x + BALL_R > brick.x &&
            b.x - BALL_R < brick.x + BRICK_W &&
            b.y + BALL_R > brick.y &&
            b.y - BALL_R < brick.y + BRICK_H
          ) {
            brick.alive = false;
            state.score += brick.points;

            // Which side did ball hit?
            const overlapL = b.x + BALL_R - brick.x;
            const overlapR = brick.x + BRICK_W - (b.x - BALL_R);
            const overlapT = b.y + BALL_R - brick.y;
            const overlapB = brick.y + BRICK_H - (b.y - BALL_R);
            const minH = Math.min(overlapL, overlapR);
            const minV = Math.min(overlapT, overlapB);
            if (minH < minV) b.vx *= -1;
            else b.vy *= -1;
            break; // one brick per frame
          }
        }

        // Win condition
        if (state.bricks.every((br) => !br.alive)) {
          state.won = true;
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

function resetBall(state) {
  state.ball.x = state.paddleX + PADDLE_W / 2;
  state.ball.y = PADDLE_Y - BALL_R - 2;
  state.ball.vx = (Math.random() > 0.5 ? 1 : -1) * (3 + Math.random());
  state.ball.vy = -4;
  state.launched = false;
}

function restart(state) {
  state.bricks = makeBricks();
  state.score = 0;
  state.lives = 3;
  state.gameOver = false;
  state.won = false;
  resetBall(state);
}

function draw(ctx, state) {
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, W, H);

  // Bricks
  for (const br of state.bricks) {
    if (!br.alive) continue;
    ctx.fillStyle = br.color;
    ctx.beginPath();
    ctx.roundRect(br.x, br.y, BRICK_W, BRICK_H, 3);
    ctx.fill();
  }

  // Paddle
  ctx.fillStyle = state.handLost ? "#665533" : "#e8eaed";
  ctx.beginPath();
  ctx.roundRect(state.paddleX, PADDLE_Y, PADDLE_W, PADDLE_H, 5);
  ctx.fill();

  // Ball
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.arc(state.ball.x, state.ball.y, BALL_R, 0, Math.PI * 2);
  ctx.fill();

  // HUD
  ctx.fillStyle = "#e8eaed";
  ctx.font = "18px system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText(`Score: ${state.score}`, 16, 30);
  ctx.textAlign = "center";
  ctx.fillText("❤️".repeat(state.lives), W / 2, 30);

  if (!state.launched && !state.gameOver && !state.won) {
    ctx.fillStyle = "#8a8f99";
    ctx.font = "15px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Show your hand to launch", W / 2, H - 12);
  }

  if (state.handLost && !state.gameOver && !state.won) {
    ctx.fillStyle = "#fbbf24";
    ctx.font = "14px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Hand not detected — paddle frozen", W / 2, H - 12);
  }

  if (state.gameOver) {
    overlay(ctx, "Game Over", `Score: ${state.score}  •  Show your hand to restart`);
  }

  if (state.won) {
    overlay(ctx, "You Win! 🎉", `Score: ${state.score}  •  Show your hand to play again`);
  }
}

function overlay(ctx, title, sub) {
  ctx.fillStyle = "rgba(0,0,0,0.72)";
  ctx.fillRect(0, H / 2 - 75, W, 150);
  ctx.fillStyle = "#fff";
  ctx.font = "bold 38px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(title, W / 2, H / 2 - 10);
  ctx.font = "17px system-ui, sans-serif";
  ctx.fillStyle = "#8a8f99";
  ctx.fillText(sub, W / 2, H / 2 + 30);
}
