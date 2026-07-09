import { GestureRecognizer, FilesetResolver } from "@mediapipe/tasks-vision";

// Singleton — model loaded once, shared across all games.
let recognizer = null;
let initPromise = null;
const subscribers = new Set();
let rafHandle = null;
let video = null;
let lastVideoTime = -1;

export const handState = {
  x: 0.5,
  y: 0.5,
  isDetected: false,
  landmarks: null,
  gesture: null, // e.g. "Thumb_Up", "Open_Palm", "Closed_Fist", etc.
  pinch: false,  // thumb tip close to index tip (scale-invariant)
};

// ── One-Euro filter: kills jitter at rest, stays snappy on fast moves ──
function makeOneEuro({ minCutoff = 1.4, beta = 0.012, dCutoff = 1.0 } = {}) {
  let prev = null, dPrev = 0, tPrev = null;
  const alpha = (cutoff, dt) => {
    const tau = 1 / (2 * Math.PI * cutoff);
    return 1 / (1 + tau / dt);
  };
  return (v, tMs) => {
    if (prev === null) { prev = v; tPrev = tMs; return v; }
    const dt = Math.max((tMs - tPrev) / 1000, 1e-3);
    tPrev = tMs;
    const dv = (v - prev) / dt;
    dPrev = dPrev + alpha(dCutoff, dt) * (dv - dPrev);
    const cutoff = minCutoff + beta * Math.abs(dPrev);
    prev = prev + alpha(cutoff, dt) * (v - prev);
    return prev;
  };
}

let filterX = makeOneEuro();
let filterY = makeOneEuro();

// ── Coasting: on a short detection dropout (fast hand, motion blur) keep the
// cursor moving along its last velocity instead of freezing/flagging lost.
// Dropouts under COAST_MS become invisible to the player.
const COAST_MS = 200;
const COAST_DAMP_TAU = 0.1; // s — velocity halves roughly every 70 ms
let vx = 0, vy = 0;
let lastSeenAt = 0;   // last frame with a real detection
let lastFrameAt = 0;  // last processed camera frame (for coast dt)
const clamp01 = (v) => Math.min(1, Math.max(0, v));

// Map an inner "active box" of the camera frame to the full 0–1 range: the
// hand reaches the edge of the play area / screen while still well inside the
// frame, where tracking is reliable. EDGE_MARGIN = normalized distance from
// the frame border that already counts as "fully at the edge".
export const EDGE_MARGIN = 0.18;
export const mapToActiveBox = (v) =>
  Math.min(1, Math.max(0, (v - EDGE_MARGIN) / (1 - 2 * EDGE_MARGIN)));

const PINCH_ON = 0.32;   // d(thumbTip, indexTip) / d(wrist, middleMCP) — hysteresis
const PINCH_OFF = 0.42;

function detectPinch(lms, wasPinching) {
  const dx = lms[4].x - lms[8].x, dy = lms[4].y - lms[8].y;
  const px = lms[0].x - lms[9].x, py = lms[0].y - lms[9].y;
  const palmSize = Math.hypot(px, py) || 1e-4;
  const ratio = Math.hypot(dx, dy) / palmSize;
  return wasPinching ? ratio < PINCH_OFF : ratio < PINCH_ON;
}

function createRecognizer(fileset, delegate) {
  return GestureRecognizer.createFromOptions(fileset, {
    baseOptions: {
      // BASE_URL-relative: itch.io & co. serve the app from a subpath
      modelAssetPath: `${import.meta.env.BASE_URL}models/hand/gesture_recognizer.task`,
      delegate,
    },
    runningMode: "VIDEO",
    numHands: 1,
    // Default 0.5 drops the hand on motion-blurred frames; 0.3 keeps the
    // tracker latched during fast moves at the cost of rare false holds.
    minTrackingConfidence: 0.3,
  });
}

async function ensureModel() {
  if (recognizer) return;
  if (initPromise) return initPromise;
  initPromise = (async () => {
    const fileset = await FilesetResolver.forVisionTasks(`${import.meta.env.BASE_URL}wasm`);
    try {
      recognizer = await createRecognizer(fileset, "GPU");
    } catch {
      recognizer = await createRecognizer(fileset, "CPU");
    }
  })();
  return initPromise;
}

function loop() {
  if (subscribers.size === 0) {
    rafHandle = null;
    return;
  }
  if (video && video.readyState >= 2 && video.currentTime !== lastVideoTime) {
    lastVideoTime = video.currentTime;
    const now = performance.now();
    const result = recognizer.recognizeForVideo(video, now);
    if (result.landmarks?.length > 0) {
      const lms = result.landmarks[0];
      const palm = lms[9];
      // Re-seed filters after a detection gap so the cursor doesn't glide
      // across the screen from its stale position.
      if (!handState.isDetected) {
        filterX = makeOneEuro();
        filterY = makeOneEuro();
        vx = 0;
        vy = 0;
      }
      const prevX = handState.x, prevY = handState.y;
      handState.x = filterX(palm.x, now);
      handState.y = filterY(palm.y, now);
      if (handState.isDetected && lastFrameAt) {
        const dt = Math.max((now - lastFrameAt) / 1000, 1e-3);
        vx = vx * 0.6 + ((handState.x - prevX) / dt) * 0.4;
        vy = vy * 0.6 + ((handState.y - prevY) / dt) * 0.4;
      }
      handState.isDetected = true;
      handState.landmarks = lms;
      handState.gesture = result.gestures?.[0]?.[0]?.categoryName ?? null;
      handState.pinch = detectPinch(lms, handState.pinch);
      lastSeenAt = now;
    } else if (handState.isDetected && now - lastSeenAt < COAST_MS) {
      // Brief dropout: extrapolate along damped velocity; landmarks/gesture/
      // pinch stay frozen at their last real values.
      const dt = Math.max((now - lastFrameAt) / 1000, 1e-3);
      const damp = Math.exp(-dt / COAST_DAMP_TAU);
      vx *= damp;
      vy *= damp;
      handState.x = clamp01(handState.x + vx * dt);
      handState.y = clamp01(handState.y + vy * dt);
    } else {
      handState.isDetected = false;
      handState.landmarks = null;
      handState.gesture = null;
      handState.pinch = false;
      vx = 0;
      vy = 0;
    }
    lastFrameAt = now;
    for (const cb of subscribers) cb({ ...handState });
  }
  rafHandle = requestAnimationFrame(loop);
}

export async function startHandInput(videoElement) {
  await ensureModel();
  video = videoElement;
  if (!rafHandle) {
    rafHandle = requestAnimationFrame(loop);
  }
}

export function onHandUpdate(cb) {
  subscribers.add(cb);
  if (rafHandle === null && recognizer && video) {
    rafHandle = requestAnimationFrame(loop);
  }
  return () => subscribers.delete(cb);
}
