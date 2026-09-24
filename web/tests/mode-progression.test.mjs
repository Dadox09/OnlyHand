import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { webcrypto } from "node:crypto";

const storage = new Map();
const submitted = [];
const context = vm.createContext({
  crypto: webcrypto,
  localStorage: {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: (key) => storage.delete(key),
  },
  submitScore: async (gameId) => { submitted.push(gameId); return true; },
  visibleGames: [{ id: "pong" }],
  PLAYER_SHIPS: [{ id: "viper" }],
});
const source = ["profile", "badges", "scores"].map((name) =>
  readFileSync(new URL(`../src/core/${name}.js`, import.meta.url), "utf8")
    .replace(/^import .*;\r?\n/gm, "")
    .replace(/^export /gm, "")
).join("\n");
vm.runInContext(`${source}\nglobalThis.api = { recordPlay, scoreGameId, getProfile, getLevel, getBadges, getBest, getPracticeBest, updateDailyProgress };`, context);

const api = context.api;
await api.recordPlay("pong", 80, 12).submitted;
assert.equal(api.getLevel(api.getProfile()).xp, 105);
assert.equal(api.getLevel(api.getProfile(), "pointer").xp, 0);
await api.recordPlay("pong", 50, 12, { practice: true }).submitted;
const profile = api.getProfile();
assert.equal(api.getBest("pong"), 80);
assert.equal(api.getPracticeBest("pong"), 50);
assert.equal(api.getLevel(profile).xp, 105);
assert.equal(api.getLevel(profile, "pointer").xp, 75);
assert.equal(profile.totalPlaytime, 12);
assert.equal(profile.practicePlaytime, 12);
assert.ok(profile.badges["first-steps"]);
assert.ok(profile.practiceBadges["first-steps"]);
assert.deepEqual(submitted, ["pong", "pong-pointer"]);
assert.equal(api.scoreGameId("asteroids", "camera", true), "asteroids-daily");
assert.equal(api.scoreGameId("asteroids", "pointer", true), "asteroids-daily-pointer");

api.updateDailyProgress(profile, new Date("2026-09-24T12:00:00Z"), "pointer");
assert.equal(profile.daily.streak, 0);
assert.equal(profile.practiceDaily.streak, 1);

delete profile.practiceBadges;
delete profile.practiceDaily;
context.localStorage.setItem("onlyhand:profile", JSON.stringify(profile));
assert.equal(api.getLevel(api.getProfile(), "pointer").xp, 75); // old local runs survive
assert.equal(api.getBadges(api.getProfile(), "pointer").find((b) => b.id === "first-steps").unlocked, true);
console.log("Hands and mouse/touch progression stay independent.");
