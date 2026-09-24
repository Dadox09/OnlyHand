export const W = 800;
export const H = 500;
export const PADDLE_H = 96;
export const PADDLE_W = 14;
export const LEFT_X = 30;
export const RIGHT_X = W - LEFT_X - PADDLE_W;
export const BALL_R = 9;
const ORB_R = 17;
const PERK_NAMES = ["BIG HANDS", "TINY RIVAL", "BANANA BALL", "ROCKET BALL", "SHIELD", "CRIT BOOST", "CURVE SHOT"];
const newPerks = () => ({ grow: [0, 0], shrink: [0, 0], shield: [0, 0], crit: [0, 0], curve: [0, 0] });

export function paddleHeight(m, side) {
  return PADDLE_H * (m.perks.grow[side] > 0 ? 1.5 : 1) * (m.perks.shrink[side] > 0 ? 0.6 : 1);
}

export function createMatch() {
  return {
    left: (H - PADDLE_H) / 2,
    right: (H - PADDLE_H) / 2,
    ball: { x: W / 2, y: H / 2, vx: 0, vy: 0, lastHit: null, wobble: 0 },
    scores: [0, 0],
    serve: 60,
    direction: Math.random() < 0.5 ? -1 : 1,
    winner: null,
    orb: null,
    orbCooldown: 180,
    perks: newPerks(),
    banner: null,
  };
}

const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

export function sampleMatch(snapshots, at) {
  if (!snapshots.length) return null;
  const next = snapshots.findIndex((s) => s.at >= at);
  if (next <= 0) return snapshots[next < 0 ? snapshots.length - 1 : 0].model;
  const a = snapshots[next - 1], b = snapshots[next];
  const t = clamp((at - a.at) / (b.at - a.at), 0, 1);
  const mix = (x, y) => x + (y - x) * t;
  return {
    ...b.model,
    left: mix(a.model.left, b.model.left),
    right: mix(a.model.right, b.model.right),
    ball: { ...b.model.ball, x: mix(a.model.ball.x, b.model.ball.x), y: mix(a.model.ball.y, b.model.ball.y) },
    orb: a.model.orb && b.model.orb
      ? { ...b.model.orb, y: mix(a.model.orb.y, b.model.orb.y) }
      : b.model.orb,
  };
}

export function stepMatch(m, leftTarget, rightTarget, leftSmash = false, rightSmash = false) {
  if (m.winner !== null) return null;
  for (const effect of [m.perks.grow, m.perks.shrink, m.perks.crit, m.perks.curve]) {
    for (let side = 0; side < 2; side++) if (effect[side] > 0) effect[side]--;
  }
  m.left = clamp(leftTarget, 0, H - paddleHeight(m, 0));
  m.right = clamp(rightTarget, 0, H - paddleHeight(m, 1));
  if (m.banner && --m.banner.frames <= 0) m.banner = null;
  if (m.orb) {
    m.orb.y += m.orb.vy;
    if (m.orb.y < 80 || m.orb.y > H - 80) m.orb.vy *= -1;
    if (--m.orb.ttl <= 0) { m.orb = null; m.orbCooldown = 300; }
  } else if (--m.orbCooldown <= 0) {
    m.orb = { x: W / 2, y: 100 + Math.random() * (H - 200), vy: Math.random() < 0.5 ? -1.2 : 1.2, ttl: 480 };
    m.banner = { text: "HIT THE MYSTERY ORB!", frames: 100 };
  }
  const b = m.ball;
  if (m.serve > 0) {
    if (--m.serve === 0) {
      b.vx = 8.5 * m.direction;
      b.vy = (Math.random() * 2 - 1) * 3;
    }
    return null;
  }
  const oldX = b.x;
  const oldY = b.y;
  if (b.wobble > 0) {
    b.vy = clamp(b.vy + Math.sin(b.wobble * 0.22) * 0.28, -8, 8);
    b.wobble--;
  }
  b.x += b.vx;
  b.y += b.vy;
  if (b.y < BALL_R) { b.y = BALL_R; b.vy = Math.abs(b.vy); }
  if (b.y > H - BALL_R) { b.y = H - BALL_R; b.vy = -Math.abs(b.vy); }

  let event = null;
  if (m.orb && b.lastHit !== null) {
    const o = m.orb;
    const spanX = b.x - oldX, spanY = b.y - oldY;
    const t = clamp(((o.x - oldX) * spanX + (o.y - oldY) * spanY) / (spanX * spanX + spanY * spanY), 0, 1);
    if (Math.hypot(oldX + spanX * t - o.x, oldY + spanY * t - o.y) < BALL_R + ORB_R) {
      const owner = b.lastHit;
      const perk = Math.floor(Math.random() * PERK_NAMES.length);
      if (perk === 0) m.perks.grow[owner] = 360;
      else if (perk === 1) m.perks.shrink[1 - owner] = 300;
      else if (perk === 2) b.wobble = 180;
      else if (perk === 3) b.vx = Math.sign(b.vx) * Math.min(20, Math.abs(b.vx) * 1.4);
      else if (perk === 4) m.perks.shield[owner] = Math.min(2, m.perks.shield[owner] + 1);
      else if (perk === 5) m.perks.crit[owner] = 360;
      else m.perks.curve[owner] = 360;
      m.banner = { text: `${owner === 0 ? "LEFT" : "RIGHT"}: ${PERK_NAMES[perk]}!`, frames: 150 };
      m.orb = null;
      m.orbCooldown = 420;
      event = "perk";
    }
  }
  const bounce = (plane, paddle, height, side, smash, owner) => {
    const t = (plane - oldX) / b.vx;
    const atY = oldY + (b.y - oldY) * t;
    if (atY < paddle - BALL_R || atY > paddle + height + BALL_R) return false;
    b.x = plane;
    b.y = atY;
    const critical = Math.random() < (m.perks.crit[owner] > 0 ? 0.3 : 0.1);
    b.vx = side * Math.min(20, (Math.abs(b.vx) + 0.35) * (smash ? 1.3 : 1) * (critical ? 1.35 : 1));
    b.vy = clamp((atY - paddle - height / 2) * (m.perks.curve[owner] > 0 ? 0.17 : 0.11), -9, 9);
    b.lastHit = owner;
    if (critical) m.banner = { text: `${owner === 0 ? "LEFT" : "RIGHT"}: CRITICAL HIT!`, frames: 90 };
    return critical ? "critical" : "hit";
  };
  if (b.vx < 0 && oldX >= LEFT_X + PADDLE_W + BALL_R && b.x <= LEFT_X + PADDLE_W + BALL_R) {
    const hit = bounce(LEFT_X + PADDLE_W + BALL_R, m.left, paddleHeight(m, 0), 1, leftSmash, 0);
    if (hit) return hit;
  }
  if (b.vx > 0 && oldX <= RIGHT_X - BALL_R && b.x >= RIGHT_X - BALL_R) {
    const hit = bounce(RIGHT_X - BALL_R, m.right, paddleHeight(m, 1), -1, rightSmash, 1);
    if (hit) return hit;
  }
  if (b.x < -BALL_R || b.x > W + BALL_R) {
    const scorer = b.x < 0 ? 1 : 0;
    const defender = 1 - scorer;
    if (m.perks.shield[defender] > 0) {
      m.perks.shield[defender]--;
      m.ball = { x: W / 2, y: H / 2, vx: 0, vy: 0, lastHit: null, wobble: 0 };
      m.serve = 30;
      m.direction = defender === 0 ? 1 : -1;
      m.banner = { text: `${defender === 0 ? "LEFT" : "RIGHT"}: SHIELD SAVE!`, frames: 90 };
      return "shield";
    }
    m.scores[scorer]++;
    m.direction = scorer === 0 ? 1 : -1;
    m.ball = { x: W / 2, y: H / 2, vx: 0, vy: 0, lastHit: null, wobble: 0 };
    m.serve = 75;
    m.orb = null;
    m.orbCooldown = 180;
    m.perks = newPerks();
    m.banner = null;
    if (m.scores[scorer] === 7) m.winner = scorer;
    return m.winner !== null ? "win" : "point";
  }
  return event;
}
