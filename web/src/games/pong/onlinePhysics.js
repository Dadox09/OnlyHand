export const W = 800;
export const H = 500;
export const PADDLE_H = 96;
export const PADDLE_W = 14;
export const LEFT_X = 30;
export const RIGHT_X = W - LEFT_X - PADDLE_W;
export const BALL_R = 9;

export function createMatch() {
  return {
    left: (H - PADDLE_H) / 2,
    right: (H - PADDLE_H) / 2,
    ball: { x: W / 2, y: H / 2, vx: 0, vy: 0 },
    scores: [0, 0],
    serve: 60,
    direction: Math.random() < 0.5 ? -1 : 1,
    winner: null,
  };
}

const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

export function stepMatch(m, leftTarget, rightTarget, leftSmash = false, rightSmash = false) {
  if (m.winner !== null) return null;
  m.left += (clamp(leftTarget, 0, H - PADDLE_H) - m.left) * 0.3;
  m.right += (clamp(rightTarget, 0, H - PADDLE_H) - m.right) * 0.3;
  const b = m.ball;
  if (m.serve > 0) {
    if (--m.serve === 0) {
      b.vx = 6.5 * m.direction;
      b.vy = (Math.random() * 2 - 1) * 3;
    }
    return null;
  }
  const oldX = b.x;
  const oldY = b.y;
  b.x += b.vx;
  b.y += b.vy;
  if (b.y < BALL_R) { b.y = BALL_R; b.vy = Math.abs(b.vy); }
  if (b.y > H - BALL_R) { b.y = H - BALL_R; b.vy = -Math.abs(b.vy); }

  const bounce = (plane, paddle, side, smash) => {
    const t = (plane - oldX) / b.vx;
    const atY = oldY + (b.y - oldY) * t;
    if (atY < paddle - BALL_R || atY > paddle + PADDLE_H + BALL_R) return false;
    b.x = plane;
    b.y = atY;
    b.vx = side * Math.min(16, (Math.abs(b.vx) + 0.35) * (smash ? 1.3 : 1));
    b.vy = clamp((atY - paddle - PADDLE_H / 2) * 0.11, -8, 8);
    return true;
  };
  if (b.vx < 0 && oldX >= LEFT_X + PADDLE_W + BALL_R && b.x <= LEFT_X + PADDLE_W + BALL_R) {
    if (bounce(LEFT_X + PADDLE_W + BALL_R, m.left, 1, leftSmash)) return "hit";
  }
  if (b.vx > 0 && oldX <= RIGHT_X - BALL_R && b.x >= RIGHT_X - BALL_R) {
    if (bounce(RIGHT_X - BALL_R, m.right, -1, rightSmash)) return "hit";
  }
  if (b.x < -BALL_R || b.x > W + BALL_R) {
    const scorer = b.x < 0 ? 1 : 0;
    m.scores[scorer]++;
    m.direction = scorer === 0 ? 1 : -1;
    m.ball = { x: W / 2, y: H / 2, vx: 0, vy: 0 };
    m.serve = 75;
    if (m.scores[scorer] === 7) m.winner = scorer;
    return m.winner !== null ? "win" : "point";
  }
  return null;
}
