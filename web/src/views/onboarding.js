// OnlyHand · Onboarding / camera-permission (v2 Neon Arcade)
// First-run gate: explains the webcam controller, reassures on privacy, and
// actually requests the camera + warms the hand model before entering the hub.
// First access ever also asks for a player tag (name + avatar) before the hub.
import { navigate } from "../router.js";
import { initCamera, getCameraVideo } from "../core/camera.js";
import { startHandInput } from "../input/handInput.js";
import { icon } from "../core/icon.js";
import { getProfile, updateProfile } from "../core/profile.js";
import { syncProfile } from "../core/backend.js";
import { startHandCursor, stopHandCursor } from "../core/handCursor.js";

const AVATARS = ["🎮", "🤖", "👾", "🕹️", "🦾", "🧠", "🐉", "🦅", "🔥", "⚡"];

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
      <div class="onboard-panel oh-pop">
        <div class="cam-ring">${icon(phase === "idle" ? "camera" : "hand", { size: 30, strokeWidth: 1.8 })}</div>

        <div class="onboard-wordmark">ONLY<span class="lit">HAND</span></div>
        <p class="onboard-tagline">Control everything with your hands</p>

        <p class="onboard-copy">
          Your webcam is the controller. OnlyHand tracks your hand in real time —
          no gamepad, no keyboard, no GPU.
        </p>

        ${phase === "idle" ? `
          <div class="onboard-cta">
            <button class="btn btn-accent" id="enable" style="padding:0.7rem 1.6rem;font-size:0.95rem">
              ${icon("camera", { size: 16 })} Enable camera
            </button>
            <button class="btn btn-ghost" id="skip">Not now</button>
          </div>
        ` : `
          <div class="onboard-status">
            <span class="oh-dot oh-live-dot"></span>
            ${phase === "starting" ? "Initializing camera…" : "Loading hand model…"}
          </div>
        `}

        ${errorMsg ? `<p class="onboard-tagline" style="color:var(--warn)">${errorMsg}</p>
          <button class="btn btn-ghost" id="skip2">Continue without camera</button>` : ""}

        <div class="onboard-privacy">
          <span class="ic">${icon("shield-check", { size: 15 })}</span>
          Everything runs locally in your browser. No video ever leaves your device.
        </div>
      </div>
    </div>
  `;

  app.querySelector("#enable")?.addEventListener("click", () => enable(app));
  app.querySelector("#skip")?.addEventListener("click", () => enterHub(app));
  app.querySelector("#skip2")?.addEventListener("click", () => enterHub(app));
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
          <input class="input" id="tag-input" maxlength="24" placeholder="Your name"
                 value="${(profile.name === "Player" ? "" : profile.name).replace(/"/g, "&quot;")}" autocomplete="off" />
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
    if (busy) enterHub(app);
  } catch (err) {
    busy = false;
    render(app, "idle", "Camera unavailable: " + err.message);
  }
}
