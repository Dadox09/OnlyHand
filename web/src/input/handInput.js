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
};

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
    const result = recognizer.recognizeForVideo(video, performance.now());
    if (result.landmarks?.length > 0) {
      const lms = result.landmarks[0];
      const palm = lms[9];
      handState.x = palm.x;
      handState.y = palm.y;
      handState.isDetected = true;
      handState.landmarks = lms;
      handState.gesture = result.gestures?.[0]?.[0]?.categoryName ?? null;
    } else {
      handState.isDetected = false;
      handState.landmarks = null;
      handState.gesture = null;
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
