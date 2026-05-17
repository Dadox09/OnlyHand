import { HandInput } from "./input/handInput.js";
import { games } from "./games/registry.js";

const els = {
  status: document.getElementById("status"),
  video: document.getElementById("webcam"),
  overlay: document.getElementById("overlay"),
  gameList: document.getElementById("game-list"),
  menuSection: document.getElementById("menu-section"),
  gameSection: document.getElementById("game-section"),
  gameTitle: document.getElementById("game-title"),
  gameCanvas: document.getElementById("game-canvas"),
  backBtn: document.getElementById("back-btn"),
};

const handInput = new HandInput();
let currentGame = null;

async function bootstrap() {
  setStatus("Requesting camera…");
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 640, height: 480 },
      audio: false,
    });
    els.video.srcObject = stream;
    await new Promise((res) => (els.video.onloadedmetadata = res));
    resizeOverlay();
  } catch (err) {
    setStatus("Camera access denied. Refresh and allow access.");
    return;
  }

  setStatus("Loading hand model…");
  try {
    await handInput.init();
  } catch (err) {
    console.error(err);
    setStatus("Failed to load model: " + err.message);
    return;
  }

  handInput.start(els.video);
  handInput.onUpdate(drawOverlay);

  renderMenu();
  setStatus("Ready. Choose a game.");
}

function resizeOverlay() {
  const rect = els.video.getBoundingClientRect();
  els.overlay.width = rect.width;
  els.overlay.height = rect.height;
}

function drawOverlay(state) {
  const ctx = els.overlay.getContext("2d");
  const W = els.overlay.width;
  const H = els.overlay.height;
  ctx.clearRect(0, 0, W, H);
  if (!state.isDetected || !state.landmarks) return;

  ctx.fillStyle = "#4ade80";
  for (const lm of state.landmarks) {
    ctx.beginPath();
    ctx.arc(lm.x * W, lm.y * H, 4, 0, Math.PI * 2);
    ctx.fill();
  }
}

function renderMenu() {
  els.gameList.innerHTML = "";
  for (const g of games) {
    const li = document.createElement("li");
    li.className = "game-card";
    li.innerHTML = `<h3>${g.name}</h3><p>${g.description}</p>`;
    li.addEventListener("click", () => launchGame(g));
    els.gameList.appendChild(li);
  }
}

function launchGame(game) {
  els.menuSection.hidden = true;
  els.gameSection.hidden = false;
  els.gameTitle.textContent = game.name;
  currentGame = game.factory({
    canvas: els.gameCanvas,
    handInput,
  });
}

function exitGame() {
  if (currentGame && currentGame.destroy) currentGame.destroy();
  currentGame = null;
  els.gameSection.hidden = true;
  els.menuSection.hidden = false;
}

function setStatus(text) {
  els.status.textContent = text;
}

els.backBtn.addEventListener("click", exitGame);
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && currentGame) exitGame();
});
window.addEventListener("resize", resizeOverlay);

bootstrap();
