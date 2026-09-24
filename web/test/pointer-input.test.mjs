import test from "node:test";
import assert from "node:assert/strict";
import { handState, onHandUpdate, startPointerInput, stopPointerInput } from "../src/input/handInput.js";

test("touch steering ignores other fingers and the bomb button triggers a fist", () => {
  const oldWindow = globalThis.window;
  const oldRaf = globalThis.requestAnimationFrame;
  const oldCancel = globalThis.cancelAnimationFrame;
  const pending = new Map();
  let nextFrame = 0;
  globalThis.window = new EventTarget();
  globalThis.requestAnimationFrame = (cb) => { pending.set(++nextFrame, cb); return nextFrame; };
  globalThis.cancelAnimationFrame = (id) => pending.delete(id);
  const frame = () => {
    for (const [id, cb] of [...pending]) { pending.delete(id); cb(); }
  };
  const pointer = (target, type, pointerId, x = 20) => {
    const event = Object.assign(new Event(type, { cancelable: true }), {
      pointerId, pointerType: "touch", clientX: x, clientY: 50,
    });
    target.dispatchEvent(event);
  };
  const canvas = Object.assign(new EventTarget(), {
    style: {}, getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }),
    setPointerCapture() {},
  });
  const bomb = Object.assign(new EventTarget(), { setPointerCapture() {} });
  const states = [];
  const unsubscribe = onHandUpdate((state) => states.push(state));
  try {
    startPointerInput(canvas, { fistButton: bomb });
    pointer(canvas, "pointerdown", 1);
    pointer(canvas, "pointerdown", 2, 80);
    pointer(canvas, "pointermove", 2, 80);
    pointer(window, "pointerup", 2, 80);
    assert.equal(handState.x, 0.8);
    assert.equal(handState.pinch, true);
    pointer(bomb, "pointerdown", 2);
    assert.equal(states.at(-1).gesture, "Closed_Fist");
    pointer(bomb, "pointerup", 2);
    frame();
    assert.equal(handState.gesture, null);
    assert.equal(handState.pinch, true);
    pointer(window, "pointerup", 1);
    frame();
    assert.equal(handState.pinch, false);
  } finally {
    unsubscribe();
    stopPointerInput();
    globalThis.window = oldWindow;
    globalThis.requestAnimationFrame = oldRaf;
    globalThis.cancelAnimationFrame = oldCancel;
  }
});
