import { games } from "../games/registry.js";
import { navigate } from "../router.js";
import { initCamera, getCameraVideo } from "../core/camera.js";
import { startHandInput, onHandUpdate, handState } from "../input/handInput.js";
import { recordPlay } from "../core/scores.js";

let activeGame = null;
let handUnsub = null;

export async function mount(app, { params }) {
  const meta = games.find((g) => g.id === params.id);
  if (!meta) {
    navigate("/");
    return;
  }

  app.innerHTML = `
    <div class="game-host">
      <div class="game-host-header">
        <button class="btn" id="back-btn">← Menu</button>
        <span class="title">${meta.icon} ${meta.name}</span>
        <span class="hand-indicator" id="hand-ind">✋ Detecting…</span>
      </div>
      <canvas id="game-canvas" width="800" height="500"></canvas>
    </div>
  `;

  const canvas = app.querySelector("#game-canvas");
  const handInd = app.querySelector("#hand-ind");

  // Update hand indicator
  handUnsub = onHandUpdate((s) => {
    handInd.textContent = s.isDetected ? "✋ Detected" : "❌ Hand lost";
    handInd.className = "hand-indicator " + (s.isDetected ? "detected" : "lost");
  });

  // Init camera + hand
  await initCamera();
  const video = getCameraVideo();
  await startHandInput(video);

  // Lazy-load and mount game module
  const startTime = Date.now();
  const module = await meta.load();
  activeGame = await module.default.mount({
    canvas,
    onHandUpdate,
    handState,
    onScore(score) {
      const duration = Math.round((Date.now() - startTime) / 1000);
      recordPlay(meta.id, score, duration);
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
  handUnsub?.();
  handUnsub = null;
  activeGame?.unmount?.();
  activeGame = null;
}
