import { HandLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";

// Singleton — model loaded once, shared across all games.
let landmarker = null;
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
};

async function ensureModel() {
  if (landmarker) return;
  if (initPromise) return initPromise;
  initPromise = (async () => {
    const fileset = await FilesetResolver.forVisionTasks("/wasm");
    landmarker = await HandLandmarker.createFromOptions(fileset, {
      baseOptions: {
        modelAssetPath: "/models/hand/hand_landmarker.task",
        delegate: "GPU",
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
    const result = landmarker.detectForVideo(video, performance.now());
    if (result.landmarks?.length > 0) {
      const lms = result.landmarks[0];
      const palm = lms[9];
      handState.x = palm.x;
      handState.y = palm.y;
      handState.isDetected = true;
      handState.landmarks = lms;
    } else {
      handState.isDetected = false;
      handState.landmarks = null;
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
  if (rafHandle === null && landmarker && video) {
    rafHandle = requestAnimationFrame(loop);
  }
  return () => subscribers.delete(cb);
}
