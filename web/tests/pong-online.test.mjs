import assert from "node:assert/strict";
import { test } from "node:test";
import { createMatch, stepMatch, H, PADDLE_H, LEFT_X, PADDLE_W, BALL_R } from "../src/games/pong/onlinePhysics.js";

test("Pong online scores a miss and ends at seven", () => {
  const m = createMatch();
  m.serve = 0;
  m.scores = [6, 0];
  m.ball = { x: 800, y: 20, vx: 15, vy: 0 };
  assert.equal(stepMatch(m, 0, H - PADDLE_H), "win");
  assert.deepEqual(m.scores, [7, 0]);
  assert.equal(m.winner, 0);
  assert.equal(stepMatch(m, 0, 0), null);
});

test("Pong online bounces a fast ball at the paddle plane", () => {
  const m = createMatch();
  m.serve = 0;
  m.left = 190;
  m.ball = { x: LEFT_X + PADDLE_W + BALL_R + 5, y: 240, vx: -16, vy: 0 };
  assert.equal(stepMatch(m, 190, 190), "hit");
  assert.ok(m.ball.vx > 0);
  assert.equal(m.scores[1], 0);
});
