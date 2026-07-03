import { games } from "../games/registry.js";
import { navigate } from "../router.js";
import { initCamera, getCameraVideo } from "../core/camera.js";
import { startHandInput, onHandUpdate, handState } from "../input/handInput.js";
import { recordPlay, getBest, getStats, getLeaderboard } from "../core/scores.js";
import { icon } from "../core/icon.js";
import { sfx } from "../core/gameKit.js";
import { startHandCursor, stopHandCursor } from "../core/handCursor.js";
import { isOnline, fetchLeaderboard, fetchMyRank } from "../core/backend.js";

let meta = null;
let activeGame = null;
let unsubIndicator = null;
let unsubLandmarks = null;
let unsubPause = null;
let ro = null;
let startTime = 0;
let appRef = null;
let paused = false;
let autoPaused = false;
let handLostAt = null;

const AUTO_PAUSE_MS = 2000; // hand gone this long → auto-pause

// Leaderboard names come from other users — always escape before innerHTML.
const esc = (s) => String(s).replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

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
            <span class="esc">ESC — pause</span>
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

  // Auto-pause when the hand disappears mid-game, auto-resume on return.
  unsubPause = onHandUpdate((s) => {
    if (!activeGame) return;
    if (!s.isDetected) {
      if (handLostAt === null) handLostAt = Date.now();
      else if (!paused && Date.now() - handLostAt > AUTO_PAUSE_MS) setPaused(true, true);
    } else {
      handLostAt = null;
      if (paused && autoPaused) setPaused(false);
    }
  });

  await startGame(app);

  app.querySelector("#back-btn").addEventListener("click", () => navigate("/hub"));
  window.addEventListener("keydown", onKey);
}

function setPaused(on, auto = false) {
  if (!activeGame || on === paused) return;
  paused = on;
  autoPaused = on && auto;
  if (on) {
    activeGame.pause?.();
    sfx.pause();
    showPauseOverlay(auto);
    startHandCursor();
  } else {
    activeGame.resume?.();
    sfx.resume();
    document.getElementById("pause-overlay")?.remove();
    stopHandCursor();
  }
}

function showPauseOverlay(auto) {
  const wrap = appRef?.querySelector("#canvas-wrap");
  if (!wrap) return;
  const overlay = document.createElement("div");
  overlay.className = "go-overlay oh-pop";
  overlay.id = "pause-overlay";
  overlay.innerHTML = `
    <div class="go-panel">
      <div class="go-title">PAUSED</div>
      <div class="go-best">${auto ? `${icon("hand", { size: 14 })} Hand lost — show it to resume` : "Take a breath"}</div>
      <div class="go-actions">
        <button class="btn btn-accent" id="resume-btn">${icon("play", { size: 15 })} Resume</button>
        <button class="btn" id="pause-menu">${icon("arrow-left", { size: 15 })} Menu</button>
      </div>
      <div class="go-hint">${auto ? "" : "…or press ESC again"}</div>
    </div>
  `;
  wrap.appendChild(overlay);
  overlay.querySelector("#resume-btn").addEventListener("click", () => setPaused(false));
  overlay.querySelector("#pause-menu").addEventListener("click", () => navigate("/hub"));
}

// (Re)mount the active game module on the canvas. The DOM Game Over overlay
// owns the game-over moment, so we stop the game on its onScore signal.
async function startGame(app) {
  clearGameOver();
  paused = false;
  autoPaused = false;
  handLostAt = null;
  document.getElementById("pause-overlay")?.remove();
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
            <span class="av">${esc(r.avatar)}</span>
            <span class="nm">${esc(r.name)}${r.you ? " (you)" : ""}</span>
            <span class="sc">${r.score}</span>
          </div>
        `).join("")}
      </div>
      <div class="go-actions">
        <button class="btn btn-accent" id="play-again">${icon("rotate-ccw", { size: 15 })} Play again</button>
        <button class="btn" id="go-menu">${icon("arrow-left", { size: 15 })} Menu</button>
      </div>
      <div class="go-hint">${icon("hand", { size: 13 })} point with your hand · pinch to select</div>
    </div>
  `;
  wrap.appendChild(overlay);

  overlay.querySelector("#play-again").addEventListener("click", () => startGame(app));
  overlay.querySelector("#go-menu").addEventListener("click", () => navigate("/hub"));

  startHandCursor();

  // Upgrade the house board to the global one when a backend is configured.
  // Small delay so this run's submit (fired in recordPlay) is likely included.
  if (isOnline()) {
    const gameId = meta.id;
    setTimeout(async () => {
      const [rows, rank] = await Promise.all([
        fetchLeaderboard(gameId, 5),
        fetchMyRank(gameId),
      ]);
      const boardEl = document.querySelector("#go-overlay .board");
      if (!rows?.length || !boardEl) return;
      boardEl.innerHTML = `
        <div class="board-head">${icon("trophy", { size: 13 })} TOP HANDS · GLOBAL</div>
        ${rows.map((r, i) => `
          <div class="board-row${r.you ? " lead" : ""}">
            <span class="rank">${i + 1}</span>
            <span class="av">${esc(r.avatar)}</span>
            <span class="nm">${esc(r.name)}${r.you ? " (you)" : ""}</span>
            <span class="sc">${r.score}</span>
          </div>
        `).join("")}
        ${rank && !rows.some((r) => r.you) ? `
          <div class="board-row lead">
            <span class="rank">${rank.rank}</span>
            <span class="av">…</span>
            <span class="nm">(you)</span>
            <span class="sc">${rank.best}</span>
          </div>` : ""}
      `;
    }, 800);
  }
}

function clearGameOver() {
  document.getElementById("go-overlay")?.remove();
  stopHandCursor();
}

function onKey(e) {
  if (e.key !== "Escape") return;
  // During a game: ESC toggles pause. On game over (no active game): exit.
  if (activeGame) setPaused(!paused);
  else navigate("/hub");
}

export function unmount() {
  window.removeEventListener("keydown", onKey);
  clearGameOver();
  document.getElementById("pause-overlay")?.remove();
  paused = false;
  autoPaused = false;
  handLostAt = null;
  unsubIndicator?.();
  unsubLandmarks?.();
  unsubPause?.();
  unsubIndicator = null;
  unsubLandmarks = null;
  unsubPause = null;
  ro?.disconnect();
  ro = null;
  activeGame?.unmount?.();
  activeGame = null;
  appRef = null;
}
