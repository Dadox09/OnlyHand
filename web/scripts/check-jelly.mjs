// Run with: node web/scripts/check-jelly.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const noop = () => {};
const effects = new Proxy({}, { get: () => noop });
let countdownUpdates = 0;
const countdown = { done: false, draw: noop, update() { countdownUpdates++; } };
let handUpdate;
let now = 0;
const ctx = new Proxy({}, {
  get: (_, name) => name.startsWith("create") ? () => ({ addColorStop: noop }) : noop,
  set: () => true,
});
const source = readFileSync(new URL("../src/games/jelly/index.js", import.meta.url), "utf8");
const sandboxMath = Object.create(Math);
sandboxMath.random = Math.random;
const sandbox = vm.createContext({
  Math: sandboxMath, performance: { now: () => now }, NEON: { accent: "#0f0", cyan: "#0ff", danger: "#f00", magenta: "#f0f", text: "#fff", muted: "#888", warn: "#ff0" },
  setupCanvas: () => ctx, createParticles: () => effects, createShake: () => effects,
  createFlash: () => effects, createCountdown: () => countdown, createFixedStep: () => effects,
  drawHudText: noop, drawHandLostBanner: noop, drawLives: noop, sfx: effects,
  requestAnimationFrame: () => 1, cancelAnimationFrame: noop, setTimeout: () => 1, clearTimeout: noop,
});
vm.runInContext(source.replace(/^import[\s\S]*?;\r?\n/gm, "")
  .replace("const fixed = createFixedStep(update);", "globalThis.sim = { state, update, portal, spawnJelly }; const fixed = createFixedStep(update);")
  .replace("export default", "globalThis.game ="), sandbox);
const game = await sandbox.game.mount({
  canvas: {}, handState: { isDetected: true }, onScore: noop,
  onHandUpdate: (cb) => { handUpdate = cb; return noop; },
});
const { state } = sandbox.sim;
const point = (x, y, pinch) => {
  now += 40;
  handUpdate({ isDetected: true, x: 1 - x / 800, y: y / 550, pinch });
};

// No jelly can be grabbed or timed out before the countdown.
sandbox.sim.spawnJelly();
const waiting = state.jellies[0];
waiting.life = 1;
point(waiting.x, waiting.y, true);
sandbox.sim.update();
assert.equal(state.holding, null);
assert.equal(waiting.life, 1);
assert.equal(countdownUpdates, 1, "The countdown advances from the game loop");

// A generous pinch grabs, then a release over the mobile portal scores.
countdown.done = true;
state.pinch = false;
point(waiting.x, waiting.y, true);
sandbox.sim.update();
assert.equal(state.holding, waiting);
const p = sandbox.sim.portal();
waiting.x = p.x; waiting.y = p.y;
point(p.x, p.y, false);
sandbox.sim.update();
assert.equal(state.score, 15);
assert.equal(state.combo, 1);
assert.equal(state.jellies.length, 0);

// Bomb jellies cost a life on grab, while hand loss freezes deadlines.
sandbox.sim.spawnJelly("bomb");
const bomb = state.jellies[0];
point(bomb.x, bomb.y, true);
sandbox.sim.update();
assert.equal(state.lives, 2);
// A skipped bomb disappears on its own; avoiding it is never a penalty.
state.grabLock = false;
sandbox.sim.spawnJelly("bomb");
const skippedBomb = state.jellies[0];
skippedBomb.life = 1;
point(20, 20, false);
sandbox.sim.update();
assert.equal(state.lives, 2);
assert.equal(state.jellies.length, 0);
// A lucky random roll is gold only: bombs cannot masquerade as bonuses.
sandbox.Math.random = () => 0;
state.timer = 1;
sandbox.sim.spawnJelly();
const lucky = state.jellies.pop();
assert.equal(lucky.golden, true);
assert.equal(lucky.bomb, false);
sandbox.Math.random = Math.random;
state.timer = 1000;
const frozenTimer = state.timer;
handUpdate({ isDetected: false });
for (let i = 0; i < 20; i++) sandbox.sim.update();
assert.equal(state.timer, frozenTimer);
// A hand returning already pinched cannot release a jelly held before tracking dropped.
sandbox.sim.spawnJelly();
const held = state.jellies[0];
state.holding = held; held.held = true;
point(held.x, held.y, true);
sandbox.sim.update();
assert.equal(state.holding, held);
point(held.x, held.y, false); // first open hand only arms the next pinch
sandbox.sim.update();
assert.equal(state.holding, held);
// Pause drops all queued input; resuming also requires open then a fresh pinch.
const beforePause = { x: state.px, y: state.py };
game.pause();
point(700, 90, true);
assert.deepEqual({ x: state.px, y: state.py }, beforePause);
game.resume();
point(held.x, held.y, true);
sandbox.sim.update();
assert.equal(state.holding, held);
point(held.x, held.y, false);
sandbox.sim.update();
assert.equal(state.holding, held);
game.unmount();
console.log("Jelly Yeet OK: countdown, scoring, bomb safety, hand-loss and pause input guards.");
