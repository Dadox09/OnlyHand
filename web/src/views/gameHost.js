import { games } from "../games/registry.js";
import { navigate } from "../router.js";
import { initCamera, getCameraVideo, getStream } from "../core/camera.js";
import { startHandInput, onHandUpdate, handState } from "../input/handInput.js";
import { recordPlay } from "../core/scores.js";

let activeGame = null;
let unsubIndicator = null;
let unsubLandmarks = null;
let ro = null;

export async function mount(app, { params }) {
  const meta = games.find((g) => g.id === params.id);
  if (!meta) { navigate("/"); return; }

  app.innerHTML = `
    <div class="game-host">
      <div class="game-host-header">
        <button class="btn" id="back-btn">← Menu</button>
        <span class="title">${meta.icon} ${meta.name}</span>
        <span class="hand-indicator" id="hand-ind">✋ Detecting…</span>
      </div>
      <div class="game-host-body">
        <canvas id="game-canvas" width="800" height="500"></canvas>
        <div class="webcam-panel game-webcam" id="cam-panel">
          <video id="game-preview" autoplay playsinline muted></video>
          <canvas id="game-overlay"></canvas>
        </div>
      </div>
    </div>
  `;

  const canvas = app.querySelector("#game-canvas");
  const handInd = app.querySelector("#hand-ind");
  const preview = app.querySelector("#game-preview");
  const overlayCanvas = app.querySelector("#game-overlay");
  const panel = app.querySelector("#cam-panel");

  // Sync overlay canvas size to panel
  ro = new ResizeObserver(() => {
    const r = panel.getBoundingClientRect();
    overlayCanvas.width = r.width;
    overlayCanvas.height = r.height;
  });
  ro.observe(panel);

  // Init camera + hand
  const stream = await initCamera();
  preview.srcObject = stream;
  await startHandInput(getCameraVideo());

  // Hand indicator
  unsubIndicator = onHandUpdate((s) => {
    handInd.textContent = s.isDetected ? "✋ Detected" : "❌ Hand lost";
    handInd.className = "hand-indicator " + (s.isDetected ? "detected" : "lost");
  });

  // Landmark dots on preview overlay
  unsubLandmarks = onHandUpdate((s) => {
    const ctx = overlayCanvas.getContext("2d");
    const W = overlayCanvas.width;
    const H = overlayCanvas.height;
    ctx.clearRect(0, 0, W, H);
    if (!s.isDetected || !s.landmarks) return;
    ctx.fillStyle = "#4ade80";
    for (const lm of s.landmarks) {
      ctx.beginPath();
      ctx.arc(lm.x * W, lm.y * H, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  });

  // Mount game
  const startTime = Date.now();
  const module = await meta.load();
  activeGame = await module.default.mount({
    canvas,
    onHandUpdate,
    handState,
    onScore(score) {
      recordPlay(meta.id, score, Math.round((Date.now() - startTime) / 1000));
    },
  });

  app.querySelector("#back-btn").addEventListener("click", () => navigate("/"));
  window.addEventListener("keydown", onKey);
}

function onKey(e) {
  if (e.key === "Escape") navigate("/");
}

export function unmount() {
  window.removeEventListener("keydown", onKey);
  unsubIndicator?.();
  unsubLandmarks?.();
  unsubIndicator = null;
  unsubLandmarks = null;
  ro?.disconnect();
  ro = null;
  activeGame?.unmount?.();
  activeGame = null;
}
