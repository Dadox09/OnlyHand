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

const PINCH_ON = 0.32;   // d(thumbTip, indexTip) / d(wrist, middleMCP) — hysteresis
const PINCH_OFF = 0.42;

function detectPinch(lms, wasPinching) {
  const dx = lms[4].x - lms[8].x, dy = lms[4].y - lms[8].y;
  const px = lms[0].x - lms[9].x, py = lms[0].y - lms[9].y;
  const palmSize = Math.hypot(px, py) || 1e-4;
  const ratio = Math.hypot(dx, dy) / palmSize;
  return wasPinching ? ratio < PINCH_OFF : ratio < PINCH_ON;
}

async function ensureModel() {
  if (recognizer) return;
  if (initPromise) return initPromise;
  initPromise = (async () => {
    const fileset = await FilesetResolver.forVisionTasks("/wasm");
    recognizer = await GestureRecognizer.createFromOptions(fileset, {
      baseOptions: {
        modelAssetPath: "/models/hand/gesture_recognizer.task",
        delegate: "CPU",
      },
      runningMode: "VIDEO",
      numHands: 1,
    });
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
      }
      handState.x = filterX(palm.x, now);
      handState.y = filterY(palm.y, now);
      handState.isDetected = true;
      handState.landmarks = lms;
      handState.gesture = result.gestures?.[0]?.[0]?.categoryName ?? null;
      handState.pinch = detectPinch(lms, handState.pinch);
    } else {
      handState.isDetected = false;
      handState.landmarks = null;
      handState.gesture = null;
      handState.pinch = false;
    }
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
