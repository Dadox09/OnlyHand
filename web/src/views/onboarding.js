// OnlyHand · Onboarding / camera-permission (v2 Neon Arcade)
// First-run gate: explains the webcam controller, reassures on privacy, and
// actually requests the camera + warms the hand model before entering the hub.
// First access ever also asks for a player tag (name + avatar) before the hub.
import { navigate } from "../router.js";
import { deferCamera, initCamera, getCameraVideo } from "../core/camera.js";
import { startHandInput } from "../input/handInput.js";
import { icon } from "../core/icon.js";
import { getProfile, updateProfile } from "../core/profile.js";
import { syncProfile } from "../core/backend.js";
import { startHandCursor, stopHandCursor } from "../core/handCursor.js";
import { track } from "../core/analytics.js";
import { visibleGames as games } from "../games/registry.js";

const AVATARS = ["🎮", "🤖", "👾", "🕹️", "🦾", "🧠", "🐉", "🦅", "🔥", "⚡"];
const DEMO_URL = `${import.meta.env.BASE_URL}demo.webp`;

let busy = false;

export function mount(app) {
  render(app, "idle");
}

export function unmount() {
  busy = false;
  stopHandCursor();
}

function enterHub(app) {
  // First access: pick a player tag before the hub. Returning players skip.
  if (!getProfile().named) render(app, "name");
  else navigate("/hub");
}

function render(app, phase, errorMsg) {
  if (phase === "name") { renderNameStep(app); return; }
  if (phase === "howto") { renderHowToStep(app); return; }

  app.innerHTML = `
    <div class="onboard-wrap">
      <div class="onboard-panel onboard-hero oh-pop">
        <div class="onboard-hero-copy">
          <div class="cam-ring">${icon(phase === "idle" ? "camera" : "hand", { size: 30, strokeWidth: 1.8 })}</div>

          <h1 class="onboard-wordmark">ONLY<span class="lit">HAND</span></h1>
          <p class="onboard-tagline">Your hand is the controller.</p>

          <p class="onboard-copy">
            Point, pinch and move to play a neon arcade through your webcam.
            No gamepad, no install — just show your hand and start.
          </p>

          <div class="onboard-benefits" aria-label="OnlyHand benefits">
            <span>${icon("zap", { size: 13 })} instant play</span>
            <span>${icon("trophy", { size: 13 })} daily challenges</span>
            <span>${icon("video", { size: 13 })} creator clips</span>
          </div>

          ${phase === "idle" ? `
            <div class="onboard-cta">
              <button class="btn btn-accent" id="enable" style="padding:0.75rem 1.6rem;font-size:0.95rem">
                ${icon("camera", { size: 16 })} Play with my hand
              </button>
              <button class="btn btn-ghost" id="skip">Explore games first</button>
            </div>
          ` : `
            <div class="onboard-status">
              <span class="oh-dot oh-live-dot"></span>
              ${phase === "starting" ? "Starting your camera…" : "Loading the hand controller…"}
            </div>
          `}

          ${errorMsg ? `<p class="onboard-error">${errorMsg}</p>
            <button class="btn btn-ghost" id="skip2">Continue without camera</button>` : ""}

          <div class="onboard-privacy">
            <span class="ic">${icon("shield-check", { size: 15 })}</span>
            Camera processing stays on this device. No video is uploaded.
          </div>
        </div>

        <div class="onboard-demo-col">
          <div class="onboard-demo-frame">
            <img src="${DEMO_URL}" width="800" height="500"
                 alt="Asteroids reacting live to a player moving their hand"
                 decoding="async" fetchpriority="high" />
            <span class="demo-live"><i></i> REAL HAND · REAL TIME</span>
            <span class="demo-caption">Move · pinch · make a fist · survive.</span>
          </div>
          <div class="onboard-proof">
            <span><b>${games.length}</b> polished games</span>
            <span><b>0</b> downloads</span>
            <span><b>100%</b> local tracking</span>
          </div>
        </div>
      </div>
    </div>
  `;

  app.querySelector("#enable")?.addEventListener("click", () => {
    track("Camera Prompt Requested");
    enable(app);
  });
  app.querySelector("#skip")?.addEventListener("click", exploreWithoutCamera);
  app.querySelector("#skip2")?.addEventListener("click", exploreWithoutCamera);
}

function exploreWithoutCamera() {
  deferCamera();
  track("Hub Explored Without Camera");
  navigate("/hub");
}

function renderNameStep(app) {
  const profile = getProfile();
  let avatar = profile.avatar;

  app.innerHTML = `
    <div class="onboard-wrap">
      <div class="onboard-panel oh-pop">
        <div class="onboard-wordmark">PICK YOUR <span class="lit">TAG</span></div>
        <p class="onboard-tagline">This is you on the leaderboard</p>

        <div class="avatar-picker" style="justify-content:center">
          ${AVATARS.map((e) => `<button class="avatar sm${e === avatar ? " selected" : ""}" data-emoji="${e}">${e}</button>`).join("")}
        </div>

        <div class="form-row" style="justify-content:center">
          <input class="input" id="tag-input" maxlength="24" placeholder="Your name" autocomplete="off" />
          <button class="btn btn-accent" id="tag-go">${icon("play", { size: 15 })} Start</button>
        </div>

        <div class="onboard-privacy">
          <span class="ic">${icon("user", { size: 15 })}</span>
          No account needed — you can change this anytime in your profile.
        </div>
      </div>
    </div>
  `;

  const input = app.querySelector("#tag-input");
  input.value = profile.name === "Player" ? "" : profile.name;
  input.focus();

  app.querySelectorAll("[data-emoji]").forEach((btn) => {
    btn.addEventListener("click", () => {
      avatar = btn.dataset.emoji;
      app.querySelectorAll("[data-emoji]").forEach((b) => b.classList.toggle("selected", b === btn));
    });
  });

  const submit = () => {
    const name = input.value.trim() || "Player";
    updateProfile({ name, avatar, named: true });
    syncProfile().catch(() => {});
    render(app, "howto");
  };
  app.querySelector("#tag-go").addEventListener("click", submit);
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") submit(); });

  // Camera may already be live here — avatars and Start are pinchable.
  startHandCursor();
}

function renderHowToStep(app) {
  app.innerHTML = `
    <div class="onboard-wrap">
      <div class="onboard-panel oh-pop">
        <div class="onboard-wordmark">HOW TO <span class="lit">PLAY</span></div>
        <p class="onboard-tagline">Four moves. That's the whole controller.</p>

        <ul class="onboard-list">
          <li>
            <span class="ic">${icon("hand", { size: 18 })}</span>
            <span><b>Show your hand</b> to the camera — it becomes the controller.</span>
          </li>
          <li>
            <span class="ic">${icon("play", { size: 18 })}</span>
            <span><b>Move it</b> to aim — the neon ring follows your palm.</span>
          </li>
          <li>
            <span class="ic">${icon("zap", { size: 18 })}</span>
            <span><b>Pinch</b> thumb + index to confirm, like a click.</span>
          </li>
          <li>
            <span class="ic">${icon("rotate-ccw", { size: 18 })}</span>
            <span><b>ESC</b> pauses — hiding your hand for 2 s pauses too.</span>
          </li>
        </ul>

        <div class="onboard-cta">
          <button class="btn btn-accent" id="howto-go" style="padding:0.7rem 1.6rem;font-size:0.95rem">
            ${icon("play", { size: 16 })} Let's play
          </button>
        </div>

        <div class="onboard-privacy">
          <span class="ic">${icon("zap", { size: 15 })}</span>
          Try it now: point at the button and pinch.
        </div>
      </div>
    </div>
  `;

  app.querySelector("#howto-go").addEventListener("click", () => navigate("/hub"));
  startHandCursor();
}

async function enable(app) {
  if (busy) return;
  busy = true;
  render(app, "starting");
  try {
    await initCamera();
    render(app, "loading");
    await startHandInput(getCameraVideo());
    track("Camera Enabled");
    if (busy) enterHub(app);
  } catch (err) {
    track("Camera Denied", { reason: err?.name || "unknown" });
    busy = false;
    render(app, "idle", "Camera unavailable: " + err.message);
  }
}
