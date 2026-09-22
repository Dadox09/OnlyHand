// Run with: node web/scripts/check-profile.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("../src/core/profile.js", import.meta.url), "utf8")
  .replace(/^export /gm, "");
const context = vm.createContext({
  localStorage: { getItem: () => JSON.stringify({
    schemaVersion: 1,
    stats: null,
    practiceStats: [],
    badges: "bad data",
    counters: null,
    daily: { streak: 3 },
    settings: { mirrorWebcam: false },
  }) },
});
vm.runInContext(`${source}\nglobalThis.profile = getProfile();`, context);
const profile = JSON.parse(JSON.stringify(context.profile));

assert.deepEqual(profile.stats, {});
assert.deepEqual(profile.practiceStats, {});
assert.deepEqual(profile.badges, {});
assert.deepEqual(profile.counters, {});
assert.deepEqual(profile.daily, { lastDay: null, streak: 3, bestStreak: 0 });
assert.deepEqual(profile.settings, { mirrorWebcam: false, showLandmarks: true, handedness: "right" });
console.log("Profile normalization OK.");
