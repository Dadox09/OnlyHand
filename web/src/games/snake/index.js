const COLS = 24;
const ROWS = 18;
const CELL = 30;
const W = COLS * CELL;   // 720
const H = ROWS * CELL;   // 540

// Dead-zone: hand must be clearly outside center to steer
const ZONE = 0.28; // fraction from each edge that counts as directional input

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
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");

    const initialSnake = [
      { x: 12, y: 9 }, { x: 11, y: 9 }, { x: 10, y: 9 },
    ];

    const state = {
      snake: initialSnake,
      dir: "RIGHT",
      nextDir: "RIGHT",
      food: spawnFood(initialSnake),
      score: 0,
      gameOver: false,
      handLost: !handState.isDetected,
      // Steering indicator: which zone is the hand in
      zone: null,   // "UP" | "DOWN" | "LEFT" | "RIGHT" | null
    };

    const unsub = onHandUpdate((s) => {
      state.handLost = !s.isDetected;
      if (!s.isDetected) { state.zone = null; return; }

      // Detect zone from hand position (x, y are 0–1 in original frame,
      // but webcam is mirrored in preview so flip x for intuitive left/right)
      const mx = 1 - s.x;   // mirror x to match what user sees
      const my = s.y;

      let zone = null;
      if (mx < ZONE)        zone = "LEFT";
      else if (mx > 1-ZONE) zone = "RIGHT";
      else if (my < ZONE)   zone = "UP";
      else if (my > 1-ZONE) zone = "DOWN";

      state.zone = zone;

      if (zone && zone !== OPPOSITE[state.dir]) {
        state.nextDir = zone;
      }

      if (state.gameOver && !state.restartPending) {
        state.restartPending = true;
        setTimeout(() => { restart(state); state.restartPending = false; }, 900);
      }
    });

    // Game tick — separate from render loop
    let tickHandle = null;
    let running = true;

    function tick() {
      if (state.gameOver) return;
      state.dir = state.nextDir;
      const head = state.snake[0];
      const [dx, dy] = DIR[state.dir];
      const next = { x: head.x + dx, y: head.y + dy };

      // Wall collision
      if (next.x < 0 || next.x >= COLS || next.y < 0 || next.y >= ROWS) {
        state.gameOver = true;
        onScore(state.score);
        return;
      }
      // Self collision
      if (state.snake.some(s => s.x === next.x && s.y === next.y)) {
        state.gameOver = true;
        onScore(state.score);
        return;
      }

      state.snake.unshift(next);

      if (next.x === state.food.x && next.y === state.food.y) {
        state.score += 1;
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

    // Render loop
    let raf = null;
    function render() {
      if (!running) return;
      draw(ctx, state);
      raf = requestAnimationFrame(render);
    }
    raf = requestAnimationFrame(render);

    return {
      unmount() {
        running = false;
        clearTimeout(tickHandle);
        if (raf) cancelAnimationFrame(raf);
        unsub();
      },
    };
  },
};

function restart(state) {
  const init = [{ x:12, y:9 }, { x:11, y:9 }, { x:10, y:9 }];
  state.snake = init;
  state.dir = "RIGHT";
  state.nextDir = "RIGHT";
  state.food = spawnFood(init);
  state.score = 0;
  state.gameOver = false;
}

function draw(ctx, state) {
  // Background + grid
  ctx.fillStyle = "#0a0c10";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#111520";
  for (let x = 0; x < COLS; x++) {
    for (let y = 0; y < ROWS; y++) {
      if ((x + y) % 2 === 0)
        ctx.fillRect(x * CELL, y * CELL, CELL, CELL);
    }
  }

  // Zone indicator borders
  if (state.zone && !state.gameOver) {
    const z = state.zone;
    ctx.strokeStyle = "#4ade8055";
    ctx.lineWidth = 6;
    ctx.beginPath();
    if (z === "LEFT")  { ctx.moveTo(0, 0); ctx.lineTo(0, H); }
    if (z === "RIGHT") { ctx.moveTo(W, 0); ctx.lineTo(W, H); }
    if (z === "UP")    { ctx.moveTo(0, 0); ctx.lineTo(W, 0); }
    if (z === "DOWN")  { ctx.moveTo(0, H); ctx.lineTo(W, H); }
    ctx.stroke();
    ctx.lineWidth = 1;
  }

  // Food — pulsing circle
  const pulse = 0.85 + 0.15 * Math.sin(Date.now() / 200);
  ctx.fillStyle = "#f87171";
  ctx.beginPath();
  ctx.arc(
    state.food.x * CELL + CELL / 2,
    state.food.y * CELL + CELL / 2,
    (CELL / 2 - 4) * pulse, 0, Math.PI * 2
  );
  ctx.fill();

  // Snake
  state.snake.forEach((seg, i) => {
    const t = i / state.snake.length;
    ctx.fillStyle = i === 0
      ? "#4ade80"
      : `hsl(${140 - t * 40}, ${80 - t * 20}%, ${50 - t * 15}%)`;
    ctx.beginPath();
    ctx.roundRect(seg.x * CELL + 2, seg.y * CELL + 2, CELL - 4, CELL - 4, 5);
    ctx.fill();
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

  // HUD
  ctx.fillStyle = "#e8eaed";
  ctx.font = "bold 18px system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText(`Score: ${state.score}`, 10, 22);

  // Direction hint arrows
  const arrows = { UP:"↑", DOWN:"↓", LEFT:"←", RIGHT:"→" };
  ctx.textAlign = "right";
  ctx.fillStyle = state.zone ? "#4ade80" : "#333a47";
  ctx.font = "22px system-ui, sans-serif";
  ctx.fillText(arrows[state.dir] ?? "", W - 10, 24);

  if (state.handLost && !state.gameOver) {
    ctx.fillStyle = "#fbbf24";
    ctx.font = "14px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Hand not detected — snake keeps going", W/2, H - 10);
  }

  if (!state.handLost && !state.gameOver && state.score === 0) {
    ctx.fillStyle = "#8a8f99";
    ctx.font = "14px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Move hand to edge of frame to steer", W/2, H - 10);
  }

  if (state.gameOver) {
    ctx.fillStyle = "rgba(0,0,0,0.75)";
    ctx.fillRect(0, H/2 - 75, W, 150);
    ctx.fillStyle = "#fff";
    ctx.font = "bold 38px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Game Over", W/2, H/2 - 10);
    ctx.font = "17px system-ui, sans-serif";
    ctx.fillStyle = "#8a8f99";
    ctx.fillText(`Score: ${state.score}  •  Show your hand to restart`, W/2, H/2 + 30);
  }
}
