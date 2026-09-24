import assert from "node:assert/strict";
import { test } from "node:test";
import { createMatch, stepMatch, sampleMatch, paddleHeight, H, PADDLE_H, LEFT_X, RIGHT_X, PADDLE_W, BALL_R } from "../src/games/pong/onlinePhysics.js";

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
  assert.ok(["hit", "critical"].includes(stepMatch(m, 190, 190)));
  assert.ok(m.ball.vx > 0);
  assert.equal(m.scores[1], 0);
});

test("Pong guest collision follows a rapid paddle move", () => {
  const m = createMatch();
  m.serve = 0;
  m.right = 0;
  m.ball = { x: RIGHT_X - BALL_R - 5, y: 300, vx: 16, vy: 0 };
  assert.ok(["hit", "critical"].includes(stepMatch(m, 0, 250)));
  assert.equal(m.right, 250);
  assert.ok(m.ball.vx < 0);
});

test("Pong guest renders between snapshots without changing the authoritative state", () => {
  const first = createMatch();
  const second = createMatch();
  second.left = 122;
  second.ball.x = 430;
  second.ball.y = 280;
  first.orb = { x: 400, y: 200, vy: 1, ttl: 100 };
  second.orb = { x: 400, y: 220, vy: 1, ttl: 97 };
  const snapshots = [{ at: 100, model: first }, { at: 150, model: second }];
  const frame = sampleMatch(snapshots, 125);
  assert.equal(frame.left, (first.left + second.left) / 2);
  assert.equal(frame.ball.x, 415);
  assert.equal(frame.ball.y, 265);
  assert.equal(frame.orb.y, 210);
  assert.equal(first.ball.x, 400);
  assert.equal(second.ball.x, 430);
  assert.equal(sampleMatch(snapshots, 200), second);
});

test("Pong mystery orb grants each perk to the last hitter and resets after a point", () => {
  const random = Math.random;
  try {
    const m = createMatch();
    m.serve = 0;
    const collect = (roll, owner = 0) => {
      Math.random = () => roll;
      m.orb = { x: 400, y: 250, vy: 0, ttl: 100 };
      m.ball = { x: 380, y: 250, vx: 16, vy: 0, lastHit: owner, wobble: 0 };
      assert.equal(stepMatch(m, 0, 0), "perk");
      assert.equal(m.orb, null);
    };
    collect(0, 1);
    assert.equal(m.perks.grow[1], 360);
    assert.equal(m.perks.grow[0], 0);
    assert.equal(paddleHeight(m, 1), PADDLE_H * 1.5);
    Math.random = () => 0.5;
    m.ball = { x: RIGHT_X - BALL_R - 5, y: 130, vx: 16, vy: 0, lastHit: 0, wobble: 0 };
    assert.equal(stepMatch(m, 0, 0), "hit");
    assert.ok(m.ball.vx < 0);
    collect(0.2);
    assert.equal(paddleHeight(m, 1), PADDLE_H * 1.5 * 0.6);
    collect(0.35);
    assert.equal(m.ball.wobble, 180);
    collect(0.5);
    assert.equal(m.ball.vx, 20);
    collect(0.65);
    assert.equal(m.perks.shield[0], 1);
    collect(0.8);
    assert.equal(m.perks.crit[0], 360);
    collect(0.95);
    assert.equal(m.perks.curve[0], 360);
    m.ball = { x: 800, y: 20, vx: 16, vy: 0, lastHit: 0, wobble: 0 };
    assert.equal(stepMatch(m, 0, 0), "point");
    assert.equal(paddleHeight(m, 1), PADDLE_H);
    assert.equal(m.perks.shield[0], 0);
    assert.equal(m.perks.crit[0], 0);
    assert.equal(m.ball.lastHit, null);

    m.serve = 0;
    m.orb = { x: 400, y: 250, vy: 0, ttl: 100 };
    m.ball = { x: 380, y: 250, vx: 16, vy: 0, lastHit: null, wobble: 0 };
    assert.equal(stepMatch(m, 0, 0), null);
    assert.ok(m.orb);
  } finally {
    Math.random = random;
  }
});

test("Pong critical returns, curve, shield save, and faster serve", () => {
  const random = Math.random;
  try {
    const m = createMatch();
    m.serve = 1;
    Math.random = () => 0.5;
    stepMatch(m, 0, 0);
    assert.equal(Math.abs(m.ball.vx), 8.5);
    m.serve = 0;
    m.perks.crit[0] = 360;
    m.perks.curve[0] = 360;
    m.ball = { x: LEFT_X + PADDLE_W + BALL_R + 5, y: 220, vx: -8, vy: 0, lastHit: 1, wobble: 0 };
    Math.random = () => 0.2;
    assert.equal(stepMatch(m, 190, 190), "critical");
    assert.ok(m.ball.vx > 11);
    assert.ok(m.ball.vy < 0);
    assert.match(m.banner.text, /CRITICAL HIT/);
    m.perks.shield[0] = 1;
    m.ball = { x: -9, y: 20, vx: -8, vy: 0, lastHit: 1, wobble: 0 };
    assert.equal(stepMatch(m, 190, 190), "shield");
    assert.deepEqual(m.scores, [0, 0]);
    assert.equal(m.perks.shield[0], 0);
    assert.equal(m.serve, 30);
  } finally {
    Math.random = random;
  }
});
