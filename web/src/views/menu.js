import { games } from "../games/registry.js";
import { getProfile } from "../core/profile.js";
import { getBest } from "../core/scores.js";
import { initCamera, getCameraVideo } from "../core/camera.js";
import { startHandInput, onHandUpdate } from "../input/handInput.js";

let cleanup = null;

export async function mount(app) {
  const profile = getProfile();

  app.innerHTML = `
    <nav>
      <a class="logo" href="#/">OnlyHand</a>
      <a href="#/profile">${profile.avatar} ${profile.name}</a>
    </nav>
    <div class="page">
      <div class="page-header" style="grid-column:1/-1">
        <div>
          <h1>Games</h1>
          <p class="subtitle">Control everything with your hands</p>
        </div>
      </div>
      <div>
        <div class="webcam-panel" id="cam-panel">
          <video id="preview-video" autoplay playsinline muted></video>
          <canvas id="overlay-canvas"></canvas>
          <div class="status-bar" id="status">Initializing camera…</div>
        </div>
      </div>
      <div class="game-grid" id="game-grid"></div>
    </div>
  `;

  const panel = app.querySelector("#cam-panel");
  const preview = app.querySelector("#preview-video");
  const overlayCanvas = app.querySelector("#overlay-canvas");

  // Resize overlay canvas to match panel
  const resizeOverlay = () => {
    const r = panel.getBoundingClientRect();
    overlayCanvas.width = r.width;
    overlayCanvas.height = r.height;
  };
  const ro = new ResizeObserver(resizeOverlay);
  ro.observe(panel);

  const statusEl = app.querySelector("#status");
  try {
    // Init shared camera (idempotent) + connect stream to local preview video
    const stream = await initCamera();
    preview.srcObject = stream;

    statusEl.textContent = "Loading hand model…";
    // Hand model reads from the hidden #webcam in body, not the preview
    await startHandInput(getCameraVideo());
    statusEl.textContent = "Ready — show your hand";
  } catch (err) {
    statusEl.textContent = "Error: " + err.message;
  }

  // Draw landmarks — canvas is CSS scaleX(-1), so draw at lm.x directly
  const unsub = onHandUpdate((state) => {
    const ctx = overlayCanvas.getContext("2d");
    const W = overlayCanvas.width;
    const H = overlayCanvas.height;
    ctx.clearRect(0, 0, W, H);
    if (!state.isDetected || !state.landmarks) return;
    ctx.fillStyle = "#4ade80";
    for (const lm of state.landmarks) {
      ctx.beginPath();
      ctx.arc(lm.x * W, lm.y * H, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  });

  // Render game cards
  const grid = app.querySelector("#game-grid");
  for (const g of games) {
    const best = getBest(g.id);
    const card = document.createElement("a");
    card.className = "game-card";
    card.href = `#/games/${g.id}`;
    card.innerHTML = `
      <span class="icon">${g.icon}</span>
      <h3>${g.name}</h3>
      <p>${g.description}</p>
      <div style="display:flex;gap:0.4rem;flex-wrap:wrap;margin-top:0.3rem">
        ${g.requires.map((r) => `<span class="tag">${r}</span>`).join("")}
        ${best > 0 ? `<span class="tag">Best: ${best}</span>` : ""}
      </div>
    `;
    grid.appendChild(card);
  }

  cleanup = () => {
    unsub();
    ro.disconnect();
    // preview video is in app DOM, destroyed on next app.innerHTML replacement
  };
}

export function unmount() {
  cleanup?.();
  cleanup = null;
}
