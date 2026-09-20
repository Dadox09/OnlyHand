// Singleton webcam: init once, shared across all views and games.
let stream = null;
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
  stream = await navigator.mediaDevices.getUserMedia({
    // frameRate 60 (when the camera supports it): the inference loop is gated
    // on new video frames, so a 30 fps camera caps tracking at 30 Hz.
    video: { width: 640, height: 480, frameRate: { ideal: 60 }, facingMode: "user" },
    audio: false,
  });
  video.srcObject = stream;
  await new Promise((res) => (video.onloadedmetadata = res));
  await video.play();
  clearCameraDeferred();
  return stream;
}

export function getStream() {
  return stream;
}

export function getCameraVideo() {
  return video;
}

window.addEventListener("beforeunload", () => {
  stream?.getTracks().forEach((t) => t.stop());
});
