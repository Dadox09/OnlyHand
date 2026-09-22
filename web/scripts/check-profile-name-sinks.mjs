// Run with: node web/scripts/check-profile-name-sinks.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const menu = read("../src/views/menu.js");
const profile = read("../src/views/profileView.js");
const onboarding = read("../src/views/onboarding.js");
const leaderboard = read("../src/views/leaderboardView.js");

assert.doesNotMatch(menu, /\$\{profile\.name\}/);
assert.match(menu, /\.textContent = profile\.name/);
assert.doesNotMatch(profile, /value="\$\{profile\.name\}"/);
assert.match(profile, /\.value = profile\.name/);
assert.doesNotMatch(onboarding, /value="\$\{[^}]*profile\.name/);
assert.match(onboarding, /input\.value = profile\.name/);
assert.match(leaderboard, /esc\(profile\.name\)/);
console.log("Player-name HTML sinks are safe.");
