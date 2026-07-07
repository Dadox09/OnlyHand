import { visibleGames as games } from "../games/registry.js";
import { getProfile } from "../core/profile.js";
import { getBest } from "../core/scores.js";
import { initCamera, getCameraVideo } from "../core/camera.js";
import { startHandInput, onHandUpdate } from "../input/handInput.js";
import { icon } from "../core/icon.js";
import { startHandCursor, stopHandCursor } from "../core/handCursor.js";
import { attachCardPreview, stopCardPreviews } from "../core/cardPreviews.js";

let cleanup = null;

export async function mount(app) {
  const profile = getProfile();

  app.innerHTML = `
    <nav>
      <a class="logo" href="#/hub">ONLY<span class="lit">HAND</span></a>
      <a href="#/board">${icon("trophy", { size: 14 })} Hall of Fame</a>
      <a href="#/profile">${profile.avatar} ${profile.name} ${icon("chevron-right", { size: 14 })}</a>
    </nav>
    <div class="page">
      <div class="page-header oh-fade-up">
        <h1>GAMES</h1>
        <p class="subtitle">Control everything with your hands</p>
      </div>

      <div class="webcam-col oh-fade-up" style="animation-delay:0.05s">
        <div class="webcam-panel" id="cam-panel">
          <video id="preview-video" autoplay playsinline muted></video>
          <canvas id="overlay-canvas"></canvas>
          <div class="status-bar" id="status">Initializing camera…</div>
        </div>
        <div class="live-row">
          <span class="oh-dot oh-live-dot"></span>
          <span class="live-label">TRACKING LIVE</span>
          <span class="live-meta">MediaPipe · 60 fps</span>
          <span class="live-meta pinch-hint">${icon("hand", { size: 13 })} point with your hand · pinch to select</span>
        </div>
      </div>

      <div class="game-grid oh-stagger" id="game-grid"></div>
    </div>
  `;

  const panel = app.querySelector("#cam-panel");
  const preview = app.querySelector("#preview-video");
  const overlayCanvas = app.querySelector("#overlay-canvas");

  const resizeOverlay = () => {
    const r = panel.getBoundingClientRect();
    overlayCanvas.width = r.width;
    overlayCanvas.height = r.height;
  };
  const ro = new ResizeObserver(resizeOverlay);
  ro.observe(panel);

  const statusEl = app.querySelector("#status");
  try {
    const stream = await initCamera();
    preview.srcObject = stream;
    statusEl.textContent = "Loading hand model…";
    await startHandInput(getCameraVideo());
    statusEl.textContent = "Ready — show your hand";
  } catch (err) {
    statusEl.textContent = "Error: " + err.message;
  }

  // Draw glowing landmark dots — canvas is CSS scaleX(-1), draw at lm.x directly
  const unsub = onHandUpdate((state) => {
    const ctx = overlayCanvas.getContext("2d");
    const W = overlayCanvas.width;
    const H = overlayCanvas.height;
    ctx.clearRect(0, 0, W, H);
    if (!state.isDetected || !state.landmarks) return;
    ctx.fillStyle = "#4ade80";
    ctx.shadowColor = "rgba(74,222,128,0.8)";
    ctx.shadowBlur = 6;
    for (const lm of state.landmarks) {
      ctx.beginPath();
      ctx.arc(lm.x * W, lm.y * H, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.shadowBlur = 0;
  });

  // Game cards
  const grid = app.querySelector("#game-grid");
  for (const g of games) {
    const best = getBest(g.id);
    const card = document.createElement("a");
    card.className = "game-card oh-fade-up";
    card.href = `#/games/${g.id}`;
    card.innerHTML = `
      <div class="card-preview-wrap">
        <canvas class="card-preview"></canvas>
        <span class="icon">${g.icon}</span>
        <span class="play">${icon("play", { size: 18 })}</span>
      </div>
      <h3>${g.name}</h3>
      <p>${g.description}</p>
      <div class="chips">
        ${g.requires.map((r) => `<span class="tag">${r}</span>`).join("")}
        ${best > 0 ? `<span class="tag chip-best">Best: ${best}</span>` : ""}
      </div>
    `;
    grid.appendChild(card);
    attachCardPreview(card.querySelector(".card-preview"), g.id);
  }

  startHandCursor();

  cleanup = () => {
    unsub();
    ro.disconnect();
    stopHandCursor();
    stopCardPreviews();
  };
}

export function unmount() {
  cleanup?.();
  cleanup = null;
}
