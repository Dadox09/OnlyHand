import { games } from "../games/registry.js";
import { navigate } from "../router.js";
import { initCamera, getCameraVideo } from "../core/camera.js";
import { startHandInput, onHandUpdate, handState } from "../input/handInput.js";
import { recordPlay, getBest, getStats, getLeaderboard } from "../core/scores.js";
import { icon } from "../core/icon.js";

let meta = null;
let activeGame = null;
let unsubIndicator = null;
let unsubLandmarks = null;
let unsubRestart = null;
let ro = null;
let startTime = 0;
let restartPending = false;
let appRef = null;

export async function mount(app, { params }) {
  meta = games.find((g) => g.id === params.id);
  if (!meta) { navigate("/hub"); return; }
  appRef = app;

  const stats = getStats(meta.id);
  app.innerHTML = `
    <div class="game-host">
      <div class="game-host-header">
        <button class="btn btn-ghost" id="back-btn">${icon("arrow-left", { size: 15 })} Menu</button>
        <span class="title">${meta.icon} <span class="name">${meta.name}</span></span>
        <span class="hand-indicator" id="hand-ind"><span class="dot"></span> Detecting…</span>
      </div>
      <div class="game-host-body">
        <div class="oh-fade-up">
          <div class="canvas-wrap" id="canvas-wrap">
            <canvas id="game-canvas" width="800" height="500"></canvas>
          </div>
          <div class="hint-bar">
            <span class="desc">${meta.description}</span>
            <span class="esc">ESC — exit</span>
          </div>
        </div>
        <div class="host-sidebar oh-fade-up" style="animation-delay:0.05s">
          <div class="webcam-panel game-webcam" id="cam-panel">
            <video id="game-preview" autoplay playsinline muted></video>
            <canvas id="game-overlay"></canvas>
          </div>
          <div class="stat-card">
            <div class="label">${meta.icon} Your best</div>
            <div class="value">${getBest(meta.id)}</div>
            ${stats ? `<div class="label">${stats.plays} plays</div>` : ""}
          </div>
        </div>
      </div>
    </div>
  `;

  const handInd = app.querySelector("#hand-ind");
  const preview = app.querySelector("#game-preview");
  const overlayCanvas = app.querySelector("#game-overlay");
  const panel = app.querySelector("#cam-panel");

  ro = new ResizeObserver(() => {
    const r = panel.getBoundingClientRect();
    overlayCanvas.width = r.width;
    overlayCanvas.height = r.height;
  });
  ro.observe(panel);

  const stream = await initCamera();
  preview.srcObject = stream;
  await startHandInput(getCameraVideo());

  // Hand indicator pill (live)
  unsubIndicator = onHandUpdate((s) => {
    if (s.isDetected) {
      handInd.className = "hand-indicator detected";
      handInd.innerHTML = `<span class="dot oh-live-dot"></span> Hand detected`;
    } else {
      handInd.className = "hand-indicator lost";
      handInd.innerHTML = `<span class="dot"></span> Hand lost`;
    }
  });

  // Glowing landmark dots on the webcam overlay
  unsubLandmarks = onHandUpdate((s) => {
    const ctx = overlayCanvas.getContext("2d");
    const W = overlayCanvas.width;
    const H = overlayCanvas.height;
    ctx.clearRect(0, 0, W, H);
    if (!s.isDetected || !s.landmarks) return;
    ctx.fillStyle = "#4ade80";
    ctx.shadowColor = "rgba(74,222,128,0.8)";
    ctx.shadowBlur = 6;
    for (const lm of s.landmarks) {
      ctx.beginPath();
      ctx.arc(lm.x * W, lm.y * H, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.shadowBlur = 0;
  });

  await startGame(app);

  app.querySelector("#back-btn").addEventListener("click", () => navigate("/hub"));
  window.addEventListener("keydown", onKey);
}

// (Re)mount the active game module on the canvas. The DOM Game Over overlay
// owns the game-over moment, so we stop the game on its onScore signal.
async function startGame(app) {
  clearGameOver();
  const canvas = app.querySelector("#game-canvas");
  startTime = Date.now();
  const module = await meta.load();
  activeGame = await module.default.mount({
    canvas,
    onHandUpdate,
    handState,
    onScore(score) {
      recordPlay(meta.id, score, Math.round((Date.now() - startTime) / 1000));
      activeGame?.unmount?.();
      activeGame = null;
      showGameOver(app, score);
    },
  });
}

function showGameOver(app, score) {
  const best = getBest(meta.id);
  const isRecord = score >= best && score > 0;
  const board = getLeaderboard(meta.id, score);

  const wrap = app.querySelector("#canvas-wrap");
  const overlay = document.createElement("div");
  overlay.className = "go-overlay oh-pop";
  overlay.id = "go-overlay";
  overlay.innerHTML = `
    <div class="go-panel">
      <div class="go-title">GAME OVER</div>
      <div class="go-score">${score}</div>
      <div class="go-best">
        ${isRecord ? `${icon("zap", { size: 14 })} New personal best!` : `Personal best · ${best}`}
      </div>
      <div class="board">
        <div class="board-head">${icon("trophy", { size: 13 })} TOP HANDS</div>
        ${board.map((r, i) => `
          <div class="board-row${r.you ? " lead" : ""}">
            <span class="rank">${i + 1}</span>
            <span class="av">${r.avatar}</span>
            <span class="nm">${r.name}${r.you ? " (you)" : ""}</span>
            <span class="sc">${r.score}</span>
          </div>
        `).join("")}
      </div>
      <div class="go-actions">
        <button class="btn btn-accent" id="play-again">${icon("rotate-ccw", { size: 15 })} Play again</button>
        <button class="btn" id="go-menu">${icon("arrow-left", { size: 15 })} Menu</button>
      </div>
      <div class="go-hint">…or just show your hand to restart</div>
    </div>
  `;
  wrap.appendChild(overlay);

  overlay.querySelector("#play-again").addEventListener("click", () => startGame(app));
  overlay.querySelector("#go-menu").addEventListener("click", () => navigate("/hub"));

  // Show your hand to restart — mirrors the in-game convention.
  restartPending = false;
  unsubRestart = onHandUpdate((s) => {
    if (s.isDetected && !restartPending) {
      restartPending = true;
      setTimeout(() => {
        if (document.getElementById("go-overlay")) startGame(app);
      }, 800);
    }
  });
}

function clearGameOver() {
  unsubRestart?.();
  unsubRestart = null;
  restartPending = false;
  document.getElementById("go-overlay")?.remove();
}

function onKey(e) {
  if (e.key === "Escape") navigate("/hub");
}

export function unmount() {
  window.removeEventListener("keydown", onKey);
  clearGameOver();
  unsubIndicator?.();
  unsubLandmarks?.();
  unsubIndicator = null;
  unsubLandmarks = null;
  ro?.disconnect();
  ro = null;
  activeGame?.unmount?.();
  activeGame = null;
  appRef = null;
}
