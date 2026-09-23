import { visibleGames as games } from "../games/registry.js";
import { getProfile } from "../core/profile.js";
import { getBest, getDailyProgress } from "../core/scores.js";
import { getCameraVideo, getStream, initCamera, stopCamera } from "../core/camera.js";
import { startHandInput, stopHandInput, onHandUpdate } from "../input/handInput.js";
import { icon } from "../core/icon.js";
import { startHandCursor, stopHandCursor } from "../core/handCursor.js";
import { attachCardPreview, stopCardPreviews } from "../core/cardPreviews.js";
import { onInstallAvailable, promptInstall } from "../core/install.js";
import { track } from "../core/analytics.js";

let cleanup = null;

export async function mount(app) {
  const profile = getProfile();
  const daily = getDailyProgress();
  const cameraDeferred = !getStream();

  app.innerHTML = `
    <nav>
      <a class="logo" href="#/hub">ONLY<span class="lit">HAND</span></a>
      <a href="#/board">${icon("trophy", { size: 14 })} Hall of Fame</a>
      <button class="nav-install" id="install-app" hidden>${icon("download", { size: 14 })} Install</button>
      <a href="#/profile">${profile.avatar} <span id="player-name"></span> ${icon("chevron-right", { size: 14 })}</a>
    </nav>
    <div class="page">
      <div class="page-header oh-fade-up">
        <div class="hero-copy">
          <span class="hero-kicker"><span class="oh-dot"></span> ONLYHAND · GESTURE ARCADE</span>
          <h1>THE ARCADE<br><span>IS IN YOUR HANDS.</span></h1>
          <p class="subtitle">Point to move. Pinch to play. No controller required.</p>
          <button class="hero-random" id="random-game" type="button">${icon("zap", { size: 16 })} SURPRISE ME</button>
        </div>
        <div class="hero-visual" aria-hidden="true">
          <span class="hero-visual-core">${icon("hand", { size: 38 })}</span>
          <span class="hero-coordinate hero-coordinate--top">POINT TO MOVE</span>
          <span class="hero-coordinate hero-coordinate--bottom">PINCH TO PLAY</span>
        </div>
      </div>

      <a class="daily-drop oh-fade-up" href="#/daily" style="animation-delay:0.03s">
        <div class="daily-copy">
          <span class="daily-kicker">${icon("calendar", { size: 13 })} TODAY'S DROP</span>
          <h2>Same galaxy. One shot. Everyone.</h2>
          <p>Play the seeded Asteroids run and challenge the world before it resets.</p>
        </div>
        <div class="daily-meta">
          <span class="daily-streak">${icon("flame", { size: 15 })} ${daily.streak || 0} day streak</span>
          <span class="daily-reset" id="daily-reset">Resets in --:--:--</span>
          <span class="daily-play">PLAY DAILY ${icon("chevron-right", { size: 15 })}</span>
        </div>
      </a>

      <div class="webcam-col oh-fade-up" style="animation-delay:0.05s">
        <div class="webcam-panel" id="cam-panel">
          <video id="preview-video" autoplay playsinline muted></video>
          <canvas id="overlay-canvas"></canvas>
          <div class="status-bar" id="status">
            <span id="camera-status">${cameraDeferred ? "Camera off" : "Initializing camera…"}</span>
            <button class="status-camera-btn" id="hub-camera">${cameraDeferred ? "Enable hand control" : "Turn off camera"}</button>
          </div>
        </div>
        <div class="live-row">
          <span class="oh-dot${cameraDeferred ? "" : " oh-live-dot"}" id="tracking-dot"></span>
          <span class="live-label" id="tracking-label">${cameraDeferred ? "CAMERA OFF" : "TRACKING LIVE"}</span>
          <span class="live-meta" id="tracking-meta">${cameraDeferred ? "Browse first · enable anytime" : "MediaPipe · 60 fps"}</span>
        </div>
        <div class="gesture-guide" role="note" aria-label="Hand controls: point to move the cursor, pinch to select">
          <span class="guide-title">${icon("hand", { size: 13 })} HAND CONTROLS</span>
          <span class="guide-chip">
            <span class="guide-ic">${icon("pointer", { size: 16 })}</span>
            <b>POINT</b><em>move cursor</em>
          </span>
          <span class="guide-chip guide-chip--accent">
            <span class="guide-ic">${icon("pinch", { size: 16 })}</span>
            <b>PINCH</b><em>select</em>
          </span>
        </div>
      </div>

      <div class="game-grid oh-stagger" id="game-grid">
        <div class="catalogue-head">
          <h2>CHOOSE YOUR GAME</h2>
          <span>${games.length} ARCADE GAMES <i>·</i> SELECT ONE TO PLAY</span>
        </div>
      </div>

      <footer class="hub-footer">
        <span>OnlyHand — your camera never leaves your device.</span>
        <a href="#/privacy">Privacy</a>
      </footer>
    </div>
  `;

  app.querySelector("#player-name").textContent = profile.name;

  const panel = app.querySelector("#cam-panel");
  const preview = app.querySelector("#preview-video");
  const overlayCanvas = app.querySelector("#overlay-canvas");
  const installButton = app.querySelector("#install-app");
  app.querySelector("#random-game").addEventListener("click", () => {
    location.hash = `#/games/${games[Math.floor(Math.random() * games.length)].id}`;
  });
  const unsubInstall = onInstallAvailable((available) => { installButton.hidden = !available; });
  installButton.addEventListener("click", async () => {
    if (await promptInstall()) track("PWA Installed");
  });

  const updateDailyClock = () => {
    const el = app.querySelector("#daily-reset");
    if (!el) return;
    const now = new Date();
    const reset = new Date(now);
    reset.setUTCHours(24, 0, 0, 0);
    const seconds = Math.max(0, Math.floor((reset - now) / 1000));
    const h = String(Math.floor(seconds / 3600)).padStart(2, "0");
    const m = String(Math.floor((seconds % 3600) / 60)).padStart(2, "0");
    const s = String(seconds % 60).padStart(2, "0");
    el.textContent = `Resets in ${h}:${m}:${s}`;
  };
  updateDailyClock();
  const dailyTimer = setInterval(updateDailyClock, 1000);

  const resizeOverlay = () => {
    const r = panel.getBoundingClientRect();
    overlayCanvas.width = r.width;
    overlayCanvas.height = r.height;
  };
  const ro = new ResizeObserver(resizeOverlay);
  ro.observe(panel);
  let cancelled = false;
  let cameraRequest = 0;
  let startingCamera = false;
  let unsub = () => {};

  // Render the catalogue before camera setup. A pending/ignored permission
  // prompt must never leave a shared visitor staring at an empty arcade.
  const grid = app.querySelector("#game-grid");
  for (const g of games) {
    const best = getBest(g.id);
    const card = document.createElement("a");
    card.className = "game-card oh-fade-up";
    card.href = `#/games/${g.id}`;
    card.innerHTML = `
      <div class="card-preview-wrap">
        <canvas class="card-preview" aria-hidden="true"></canvas>
        <span class="icon" aria-hidden="true">${g.icon}</span>
        <span class="card-category">${g.category}</span>
      </div>
      <div class="card-copy">
        <div class="card-heading">
          <h3>${g.name}</h3>
          <span class="play" aria-hidden="true">${icon("play", { size: 16 })}</span>
        </div>
        <p>${g.description}</p>
        <div class="chips">
          ${g.requires.map((r) => `<span class="tag">${r}</span>`).join("")}
          ${best > 0 ? `<span class="tag chip-best">Best: ${best}</span>` : ""}
        </div>
      </div>
    `;
    grid.appendChild(card);
    attachCardPreview(card.querySelector(".card-preview"), g.id);
  }

  startHandCursor();
  cleanup = () => {
    cancelled = true;
    if (startingCamera) { stopHandInput(); stopCamera(); }
    unsub();
    ro.disconnect();
    stopHandCursor();
    stopCardPreviews();
    unsubInstall();
    clearInterval(dailyTimer);
  };

  const statusEl = app.querySelector("#camera-status");
  const cameraButton = app.querySelector("#hub-camera");
  const trackingDot = app.querySelector("#tracking-dot");
  const trackingLabel = app.querySelector("#tracking-label");
  const trackingMeta = app.querySelector("#tracking-meta");
  const turnOffCamera = () => {
    cameraRequest++;
    startingCamera = false;
    stopHandInput();
    stopCamera();
    preview.srcObject = null;
    statusEl.textContent = "Camera off";
    cameraButton.textContent = "Enable hand control";
    trackingDot.classList.remove("oh-live-dot");
    trackingLabel.textContent = "CAMERA OFF";
    trackingMeta.textContent = "Browse first · enable anytime";
  };
  const startHubCamera = async (source = "automatic") => {
    const request = ++cameraRequest;
    startingCamera = true;
    statusEl.textContent = "Starting camera…";
    cameraButton.textContent = "Turn off camera";
    try {
      const stream = await initCamera();
      if (cancelled || request !== cameraRequest) return;
      preview.srcObject = stream;
      statusEl.textContent = "Loading hand model…";
      await startHandInput(getCameraVideo());
      if (cancelled || request !== cameraRequest) return;
      startingCamera = false;
      statusEl.textContent = "Ready — show your hand";
      trackingDot.classList.add("oh-live-dot");
      trackingLabel.textContent = "TRACKING LIVE";
      trackingMeta.textContent = "MediaPipe · 60 fps";
      if (source === "hub") track("Camera Enabled", { source: "hub" });
    } catch (err) {
      if (cancelled || request !== cameraRequest) return;
      turnOffCamera();
      statusEl.textContent = "Error: " + (err?.message || err);
      trackingMeta.textContent = "Games still work with mouse / touch";
      if (source === "hub") track("Camera Denied", { source: "hub", reason: err?.name || "unknown" });
    }
  };

  cameraButton.addEventListener("click", () => {
    if (getStream() || startingCamera) turnOffCamera();
    else startHubCamera("hub");
  });
  if (!cameraDeferred) {
    await startHubCamera();
  }

  // Draw glowing landmark dots — canvas is CSS scaleX(-1), draw at lm.x directly
  unsub = onHandUpdate((state) => {
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
}

export function unmount() {
  cleanup?.();
  cleanup = null;
}
