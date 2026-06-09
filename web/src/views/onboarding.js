// OnlyHand · Onboarding / camera-permission (v2 Neon Arcade)
// First-run gate: explains the webcam controller, reassures on privacy, and
// actually requests the camera + warms the hand model before entering the hub.
import { navigate } from "../router.js";
import { initCamera, getCameraVideo } from "../core/camera.js";
import { startHandInput } from "../input/handInput.js";
import { icon } from "../core/icon.js";

let busy = false;

export function mount(app) {
  render(app, "idle");
}

export function unmount() {
  busy = false;
}

function render(app, phase, errorMsg) {
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
  app.querySelector("#skip")?.addEventListener("click", () => navigate("/hub"));
  app.querySelector("#skip2")?.addEventListener("click", () => navigate("/hub"));
}

async function enable(app) {
  if (busy) return;
  busy = true;
  render(app, "starting");
  try {
    await initCamera();
    render(app, "loading");
    await startHandInput(getCameraVideo());
    if (busy) navigate("/hub");
  } catch (err) {
    busy = false;
    render(app, "idle", "Camera unavailable: " + err.message);
  }
}
