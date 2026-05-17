// Singleton webcam: init once, shared across all views and games.
let stream = null;
const video = document.getElementById("webcam");

export async function initCamera() {
  if (stream) return stream;
  stream = await navigator.mediaDevices.getUserMedia({
    video: { width: 640, height: 480, facingMode: "user" },
    audio: false,
  });
  video.srcObject = stream;
  await new Promise((res) => (video.onloadedmetadata = res));
  await video.play();
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
