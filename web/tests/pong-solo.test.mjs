import assert from "node:assert/strict";
import { test } from "node:test";
globalThis.window = { addEventListener() {} };
const { pickOrbType } = await import("../src/games/pong/index.js");

test("solo Pong can roll every mystery orb, including the new perks", () => {
  const random = Math.random;
  try {
    const cases = [
      [0.05, "GROW"], [0.145, "SLOW"], [0.26, "MULTI"],
      [0.38, "SHRINK"], [0.47, "GHOST"], [0.55, "HEART"],
      [0.64, "BOOST"], [0.75, "FREEZE"], [0.84, "SHIELD"],
      [0.93, "BONUS"], [0.98, "CRIT"],
    ];
    for (const [roll, expected] of cases) {
      Math.random = () => roll;
      assert.equal(pickOrbType(), expected);
    }
  } finally {
    Math.random = random;
  }
});
