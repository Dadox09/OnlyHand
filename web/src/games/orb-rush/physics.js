export const W = 800;
export const H = 500;
export const R = 34;
const CAPTURE = 0.7;
const PULSE = 0.8;
const COOLDOWN = 5;

const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const cursor = (x, y) => ({ x, y, active: false, pinch: false, pulse: 0, cooldown: 0 });

export function newOrb(players) {
  let orb;
  for (let i = 0; i < 24; i++) {
    orb = { x: 65 + Math.random() * (W - 130), y: 90 + Math.random() * (H - 155) };
    if (players.every((p) => Math.hypot(p.x - orb.x, p.y - orb.y) > 120)) break;
  }
  return orb;
}

export function createMatch() {
  const players = [cursor(170, 270), cursor(630, 270)];
  return { players, orb: newOrb(players), scores: [0, 0], progress: [0, 0], remaining: 60, respawn: 0, winner: null };
}

export function stepMatch(m, inputs, dt) {
  if (m.winner !== null || !Number.isFinite(dt) || dt <= 0) return null;
  dt = Math.min(dt, 0.1);
  for (let i = 0; i < 2; i++) {
    const p = m.players[i], input = inputs[i];
    p.active = input?.active === true && Number.isFinite(input.x) && Number.isFinite(input.y);
    if (p.active) { p.x = clamp(input.x, 0, W); p.y = clamp(input.y, 0, H); }
    p.pulse = Math.max(0, p.pulse - dt);
    p.cooldown = Math.max(0, p.cooldown - dt);
    if (p.active && input.pinch === true && !p.pinch && p.cooldown === 0) {
      p.pulse = PULSE;
      p.cooldown = COOLDOWN;
    }
    p.pinch = p.active && input.pinch === true;
  }
  m.remaining = Math.max(0, m.remaining - dt);
  if (m.remaining === 0) {
    m.winner = m.scores[0] === m.scores[1] ? 2 : m.scores[0] > m.scores[1] ? 0 : 1;
    return "end";
  }
  if (m.respawn > 0) {
    m.respawn = Math.max(0, m.respawn - dt);
    if (m.respawn === 0) m.orb = newOrb(m.players);
    return null;
  }
  const inside = m.players.map((p) => p.active && Math.hypot(p.x - m.orb.x, p.y - m.orb.y) <= R);
  if (inside[0] && inside[1]) return "contested";
  for (let i = 0; i < 2; i++) {
    if (!inside[i]) m.progress[i] = 0;
    else m.progress[i] = Math.min(1, m.progress[i] + dt * (m.players[i].pulse > 0 ? 2 : 1) / CAPTURE);
    if (m.progress[i] >= 1) {
      m.scores[i]++;
      m.progress = [0, 0];
      m.respawn = 0.35;
      return "point";
    }
  }
  return null;
}
