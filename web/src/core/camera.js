// Singleton webcam: init once, shared across all views and games.
let stream = null;
let opening = null;
let openingController = null;
const video = document.getElementById("webcam");
const DEFER_CAMERA_KEY = "onlyhand:defer-camera";

export function deferCamera() {
  try { sessionStorage.setItem(DEFER_CAMERA_KEY, "1"); } catch { /* Storage can be blocked in embeds. */ }
}

export function isCameraDeferred() {
  try { return sessionStorage.getItem(DEFER_CAMERA_KEY) === "1"; } catch { return false; }
}

function clearCameraDeferred() {
  try { sessionStorage.removeItem(DEFER_CAMERA_KEY); } catch { /* Storage can be blocked in embeds. */ }
}

export async function initCamera() {
  if (stream) {
    clearCameraDeferred();
    return stream;
  }
  if (opening) return opening;
  const controller = new AbortController();
  openingController = controller;
  const request = (async () => {
    const acquired = await navigator.mediaDevices.getUserMedia({
      // frameRate 60 (when the camera supports it): the inference loop is gated
      // on new video frames, so a 30 fps camera caps tracking at 30 Hz.
      video: { width: 640, height: 480, frameRate: { ideal: 60 }, facingMode: "user" },
      audio: false,
    });
    try {
      if (controller.signal.aborted) throw new DOMException("Camera stopped", "AbortError");
      stream = acquired;
      video.srcObject = acquired;
      if (video.readyState < 1) {
        await new Promise((resolve, reject) => {
          const done = () => {
            video.removeEventListener("loadedmetadata", loaded);
            controller.signal.removeEventListener("abort", aborted);
          };
          const loaded = () => { done(); resolve(); };
          const aborted = () => { done(); reject(new DOMException("Camera stopped", "AbortError")); };
          video.addEventListener("loadedmetadata", loaded, { once: true });
          controller.signal.addEventListener("abort", aborted, { once: true });
        });
      }
      await video.play();
      if (controller.signal.aborted) throw new DOMException("Camera stopped", "AbortError");
      clearCameraDeferred();
      return acquired;
    } catch (error) {
      acquired.getTracks().forEach((track) => track.stop());
      if (stream === acquired) stream = null;
      if (video.srcObject === acquired) { video.pause(); video.srcObject = null; }
      throw error;
    }
  })();
  opening = request;
  try { return await request; }
  finally {
    if (opening === request) opening = null;
    if (openingController === controller) openingController = null;
  }
}

export function stopCamera() {
  openingController?.abort();
  opening = null;
  stream?.getTracks().forEach((track) => track.stop());
  stream = null;
  video.pause();
  video.srcObject = null;
  deferCamera();
}

export function getStream() {
  return stream;
}

export function getCameraVideo() {
  return video;
}

window.addEventListener("beforeunload", () => {
  stopCamera();
});
