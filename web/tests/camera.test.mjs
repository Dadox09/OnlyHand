import assert from "node:assert/strict";

const video = {
  readyState: 1,
  srcObject: null,
  play: async () => {},
  pause() {},
};
globalThis.document = { getElementById: () => video };
globalThis.window = { addEventListener() {} };

let acquire;
Object.defineProperty(globalThis, "navigator", { value: {
  mediaDevices: { getUserMedia: () => new Promise((resolve) => { acquire = resolve; }) },
}, configurable: true });
const { initCamera, stopCamera, getStream } = await import("../src/core/camera.js");
const makeStream = () => {
  const track = { stopped: false, stop() { this.stopped = true; } };
  return { track, getTracks: () => [track] };
};

const pending = initCamera();
stopCamera();
const late = makeStream();
acquire(late);
await assert.rejects(pending, { name: "AbortError" });
assert.equal(late.track.stopped, true);
assert.equal(getStream(), null);

const failing = initCamera();
const failedStream = makeStream();
video.play = async () => { throw new Error("play failed"); };
acquire(failedStream);
await assert.rejects(failing, /play failed/);
assert.equal(failedStream.track.stopped, true);
assert.equal(video.srcObject, null);

video.play = async () => {};
const working = initCamera();
const active = makeStream();
acquire(active);
assert.equal(await working, active);
stopCamera();
assert.equal(active.track.stopped, true);
assert.equal(video.srcObject, null);
