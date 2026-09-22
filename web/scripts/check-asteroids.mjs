// Run with: node web/scripts/check-asteroids.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

// Exercise the actual game loop without a webcam, audio device or browser.
const noop = () => {};
const calls = [];
const ctx = new Proxy({}, {
  get: (_, name) => name.startsWith("create")
    ? () => ({ addColorStop: noop }) : (...args) => calls.push([name, ...args]),
  set: () => true,
});
const effects = new Proxy({}, { get: () => noop });
const countdown = { done: false };
let handUpdate;
const sandbox = vm.createContext({
  Math, Date, Image: class {}, NEON: {}, STEP_MS: 1000 / 60,
  setupCanvas: () => ctx,
  createParticles: () => effects, createShake: () => effects,
  createFlash: () => effects, createMusic: () => effects,
  createCountdown: () => countdown, createFixedStep: () => effects,
  drawHudText: noop, drawHandLostBanner: noop, drawLives: noop, hudFont: noop,
  sfx: effects, getProfile: () => ({ ship: "viper" }),
  requestAnimationFrame: () => 1, cancelAnimationFrame: noop, clearTimeout: noop,
});
const fleet = readFileSync(new URL("../src/games/asteroids/fleet.js", import.meta.url), "utf8");
const source = readFileSync(new URL("../src/games/asteroids/index.js", import.meta.url), "utf8");
vm.runInContext(
  fleet.replace(/^export /gm, "").replaceAll("import.meta.env.BASE_URL", '"/"') + "\n" +
  source.replace(/^import[\s\S]*?;\r?\n/gm, "")
    .replaceAll("import.meta.env.BASE_URL", '"/"')
    .replace("export default", "globalThis.game =")
    .replace("const fixed = createFixedStep(update);", `
      globalThis.sim = { state, update, startLevel, fire, breakAsteroid,
        damageBoss, detonateBomb, drawBackground, drawShip, assets, shipStats };
      const fixed = createFixedStep(update);`),
  sandbox,
);
const game = await sandbox.game.mount({
  canvas: {}, handState: { isDetected: true }, daily: true,
  onHandUpdate: (cb) => { handUpdate = cb; return noop; }, onScore: noop,
});
const { sim } = sandbox;
const { state } = sim;
state.invincible = Infinity;
assert(state.ship.y > 550 / 2, "The ship starts in the lower half");
for (let level = 1; level <= 30; level++) {
  const wave = sandbox.buildWave(level);
  assert(wave.every((a) => a.y < -42 && a.x >= 50 && a.x <= 750 && a.vy > 0));
}
const waitingY = state.asteroids[0].y;
sim.update();
assert.equal(state.asteroids[0].y, waitingY, "Waves wait for the countdown");
countdown.done = true;
sim.update();
assert(state.asteroids[0].y > waitingY && state.asteroids[0].y < 0, "Rocks enter from above without wrapping");

// Forward fire stays independent of targets and hand travel, for every loadout.
state.asteroids = [];
handUpdate({ isDetected: true, x: 0.1, y: 0.95 });
sim.update();
assert(state.ship.x > 400 && state.ship.y > 440);
for (const ship of vm.runInContext("PLAYER_SHIPS", sandbox)) {
  Object.assign(sim.shipStats, ship.stats);
  for (const tripleT of [0, 100]) {
    state.tripleT = tripleT;
    state.bullets = [];
    sim.fire();
    assert.equal(state.bullets.length, (tripleT || ship.stats.triple ? 3 : 1) * (ship.stats.double ? 2 : 1));
    assert(state.bullets.every((b) => b.vy < 0 && b.y < state.ship.y));
  }
}
state.tripleT = 0;
state.bullets = [];
state.handLost = true;

// Escaped rocks do not award kills or wrap, and sectors still advance to a boss.
sim.startLevel(1);
state.asteroids = [sandbox.makeAsteroid("small", 400, 570, 1)];
const kills = state.stats.kills.rocks;
sim.update();
assert.equal(state.asteroids.length, 0);
assert.equal(state.stats.kills.rocks, kills);
assert.equal(state.phase, "clear");
for (let i = 0; i < 5000 && state.level < 3; i++) sim.update();
assert.equal(state.level, 3);
assert.equal(state.bosses.length, 1);
assert(state.bosses[0].y < 0);
for (let i = 0; i < 100; i++) sim.update();
assert(state.bosses[0].y > 0);
sim.damageBoss(0, state.bosses[0].maxHp / 2);
assert.equal(state.bosses[0].phase, 1);
assert.equal(state.fighters.length, 2);
assert(state.fighters.every((f) => f.y < 0));
sim.damageBoss(0, state.bosses[0].maxHp / 4);
assert.equal(state.bosses[0].phase, 2);
sim.damageBoss(0, 1000);
for (let i = 0; i < 1000 && state.level < 4; i++) sim.update();
assert.equal(state.level, 4, "Boss death and departing escorts unlock the next sector");

// UFOs descend; powerups exit at the bottom instead of teleporting back.
state.asteroids = [];
state.ufo = sandbox.makeUfo();
assert(state.ufo.y < 0 && state.ufo.x > 0 && state.ufo.x < 800);
const ufoY = state.ufo.y;
state.powerups = [{ x: 100, y: 565, vx: 0, vy: 2, t: 0, life: 100 }];
sim.update();
assert(state.ufo.y > ufoY);
assert.equal(state.powerups.length, 0);
state.ufo.y = 601;
sim.update();
assert.equal(state.ufo, null);

// Splits keep falling, bombs leave future waves alone, and hazards can finish.
sim.startLevel(5);
state.asteroids = [sandbox.makeAsteroid("large", 400, 100, 5)];
sim.breakAsteroid(0);
assert.equal(state.asteroids.length, 2);
assert(state.asteroids.every((a) => a.size === "medium" && a.vy > 0));
const incoming = sandbox.makeAsteroid("large", 200, -500, 5);
state.asteroids.push(incoming);
sim.detonateBomb();
assert(state.asteroids.includes(incoming), "Bombs cannot clear unseen future rocks");
for (let i = 0; i < 5000 && state.level === 5; i++) sim.update();
assert.equal(state.level, 6, "The storm has a finite end");
sim.startLevel(10);
assert.equal(state.hazard, "well");
state.asteroids = [sandbox.makeAsteroid("small", state.well.x, state.well.y + 20, 10)];
state.asteroids[0].vy = 0.1;
sim.update();
assert(state.asteroids[0].vy >= 1, "Gravity cannot reverse the scrolling current");

// Background tiles cover the viewport at the loop boundary; stars move down.
sim.assets.bgs.fill({ width: 800, height: 550 });
state.bgFade = 1;
for (const frame of [0, 200, 1692, 1693]) {
  state.frame = frame;
  calls.length = 0;
  sim.drawBackground();
  const origins = calls.filter(([name]) => name === "translate").filter(([, , y]) => y !== 550);
  assert(origins[0][2] <= 0 && origins.at(-1)[2] + 550 >= 550);
  assert(calls.filter(([name]) => name === "drawImage").length >= 2);
  const stars = calls.filter(([name, , , w]) => name === "fillRect" && w === 1);
  assert.equal(stars[0][1], 13);
  assert.equal(stars[0][2], (31 + frame * 0.9) % 550);
}
state.invincible = 0;
sim.assets.ship = {};
calls.length = 0;
sim.drawShip();
assert(!calls.some(([name]) => name === "rotate"), "Ship artwork always faces up");
game.unmount();
console.log("Asteroids OK: vertical flight, waves, weapons, bosses, hazards and scrolling background.");
