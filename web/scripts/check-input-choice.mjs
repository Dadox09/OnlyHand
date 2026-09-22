// Run with: node web/scripts/check-input-choice.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { games } from "../src/games/registry.js";

const noop = () => {};
const source = (path) => readFileSync(new URL(path, import.meta.url), "utf8")
  .replace(/^import .*;\r?\n/gm, "").replace(/^export /gm, "");
const elements = new Map();
function element() {
  return {
    handlers: {}, style: {},
    addEventListener(name, handler) { this.handlers[name] = handler; },
    removeEventListener(name) { delete this.handlers[name]; },
    querySelector: (selector) => {
      if (!elements.has(selector)) elements.set(selector, element());
      return elements.get(selector);
    },
    querySelectorAll() { return [this.querySelector("#use-camera"), this.querySelector("#use-pointer")]; },
    appendChild(child) { elements.set(`#${child.id}`, child); },
    remove() { elements.delete(`#${this.id}`); },
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 500 }),
  };
}

// Every game must wait for an explicit choice, including with an existing camera.
const app = element();
const sessions = [];
const host = vm.createContext({
  games, window: element(),
  document: { createElement: element, getElementById: (id) => elements.get(`#${id}`) },
  ResizeObserver: class { observe() {} disconnect() {} },
  getStream: () => ({}), getStats: () => null, getBest: () => 0,
  readChallenge: () => null, icon: () => "", setupCanvas: noop, track: noop,
  stopPointerInput: noop, stopHandCursor: noop,
  navigate: () => assert.fail("Unexpected navigation"), sessions,
});
vm.runInContext(source("../src/views/gameHost.js"), host);
vm.runInContext(`
  startCameraSession = async () => sessions.push("camera");
  startPointerSession = async () => sessions.push("pointer");
`, host);
for (const { id } of games) {
  for (const mode of ["camera", "pointer"]) {
    elements.clear();
    sessions.length = 0;
    await host.mount(app, { params: { id } });
    assert.equal(sessions.length, 0, `${id} must not auto-start`);
    assert(elements.has("#input-choice"), `${id} must show the choice`);
    assert.match(app.innerHTML, /Choose controls/);
    await elements.get(`#use-${mode}`).handlers.click();
    assert.deepEqual(sessions, [mode]);
    host.unmount();
  }
}

// Choosing mouse after hand tracking cancels inference; new game subscribers
// must not restart it. Choosing the hand again must resume it.
const frames = new Map();
let nextFrame = 0;
const input = vm.createContext({
  window: element(),
  requestAnimationFrame: (cb) => { frames.set(++nextFrame, cb); return nextFrame; },
  cancelAnimationFrame: (id) => frames.delete(id),
});
vm.runInContext(source("../src/input/handInput.js")
  .replaceAll("import.meta.env.BASE_URL", '"/"'), input);
vm.runInContext("recognizer = {}; video = {};", input);
const unsubscribe = input.onHandUpdate(noop);
assert.equal(frames.size, 1);
const canvas = element();
input.startPointerInput(canvas);
assert.equal(frames.size, 0, "Mouse selection stops camera inference");
let state;
const unsubscribeGame = input.onHandUpdate((value) => { state = value; });
assert.equal(frames.size, 0, "Game subscription must preserve mouse mode");
canvas.handlers.pointermove({ clientX: 200, clientY: 100 });
assert.equal(state.source, "pointer");
assert.equal(state.x, 0.75);
assert.equal(state.y, 0.2);
await input.startHandInput({});
assert.equal(frames.size, 1, "Hand selection restarts camera inference");
assert.equal(canvas.handlers.pointermove, undefined);
unsubscribeGame();
unsubscribe();
console.log("Input choice OK: all games wait for selection; mouse and hand stay independent.");
