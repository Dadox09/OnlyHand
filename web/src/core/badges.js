// Gamification: XP → level curve + achievement badges.
// Everything is computed from the profile (stats/counters); earned badge ids
// are persisted in profile.badges = { [id]: earnedAtISO } so "new unlock"
// moments can be detected once and shown on the Game Over overlay.
import { getProfile } from "./profile.js";
import { PLAYER_SHIPS } from "../games/asteroids/fleet.js";
import { games } from "../games/registry.js";

// ── XP / level ──────────────────────────────────────────────────
// XP = every point scored + a flat bonus per finished run.
const XP_PER_PLAY = 25;

export function getXP(p = getProfile()) {
  let xp = 0;
  for (const s of Object.values(p.stats)) {
    xp += (s.totalScore ?? 0) + (s.plays ?? 0) * XP_PER_PLAY;
  }
  return xp;
}

// Cumulative XP needed to reach level L: 100 · L·(L−1)/2
// → L2 at 100, L3 at 300, L4 at 600, L5 at 1000 …
const xpForLevel = (level) => (100 * level * (level - 1)) / 2;

export function getLevel(p = getProfile()) {
  const xp = getXP(p);
  let level = 1;
  while (xp >= xpForLevel(level + 1)) level++;
  const floor = xpForLevel(level);
  const ceil = xpForLevel(level + 1);
  return {
    level,
    xp,
    intoLevel: xp - floor,
    span: ceil - floor,
    pct: Math.min(1, (xp - floor) / (ceil - floor)),
  };
}

// ── Badge definitions ───────────────────────────────────────────
const stat = (p, gameId) => p.stats[gameId] ?? { best: 0, plays: 0, totalScore: 0 };
const totalPlays = (p) => Object.values(p.stats).reduce((n, s) => n + (s.plays ?? 0), 0);
const totalScore = (p) => Object.values(p.stats).reduce((n, s) => n + (s.totalScore ?? 0), 0);
const gamesPlayed = (p) => Object.values(p.stats).filter((s) => (s.plays ?? 0) > 0).length;
const records = (p) => p.counters?.records ?? 0;

export const BADGES = [
  // Journey
  { id: "first-steps",   name: "First Steps",    icon: "🎮", desc: "Finish your first run",
    progress: (p) => [Math.min(totalPlays(p), 1), 1] },
  { id: "regular",       name: "Regular",        icon: "🕹️", desc: "Finish 25 runs",
    progress: (p) => [totalPlays(p), 25] },
  { id: "no-life",       name: "Arcade Rat",     icon: "🔥", desc: "Finish 100 runs",
    progress: (p) => [totalPlays(p), 100] },
  { id: "explorer",      name: "Explorer",       icon: "🧭", desc: "Play every game at least once",
    progress: (p) => [gamesPlayed(p), games.length] },
  { id: "marathoner",    name: "Marathoner",     icon: "⏱️", desc: "30 minutes of total playtime",
    progress: (p) => [Math.floor((p.totalPlaytime ?? 0) / 60), 30] },
  // Records
  { id: "record-breaker", name: "Record Breaker", icon: "📈", desc: "Beat your personal best 5 times",
    progress: (p) => [records(p), 5] },
  { id: "record-machine", name: "Record Machine", icon: "🏅", desc: "Beat your personal best 20 times",
    progress: (p) => [records(p), 20] },
  { id: "high-roller",    name: "High Roller",    icon: "💰", desc: "Score 5000 points across all games",
    progress: (p) => [totalScore(p), 5000] },
  // Per-game mastery
  { id: "pong-ace",     name: "Pong Ace",       icon: "🏓", desc: "Score 50 in Hand Pong",
    progress: (p) => [stat(p, "pong").best, 50] },
  { id: "brick-lord",   name: "Brick Lord",     icon: "🧱", desc: "Score 100 in Breakout",
    progress: (p) => [stat(p, "breakout").best, 100] },
  { id: "serpent-king", name: "Serpent King",   icon: "🐍", desc: "Score 300 in Snake",
    progress: (p) => [stat(p, "snake").best, 300] },
  { id: "fruit-ninja",  name: "Blade Master",   icon: "🍉", desc: "Score 150 in Fruit Slash",
    progress: (p) => [stat(p, "slash").best, 150] },
  { id: "star-pilot",   name: "Star Pilot",     icon: "🚀", desc: "Score 75 in Asteroids",
    progress: (p) => [stat(p, "asteroids").best, 75] },
  { id: "pulse-rider",  name: "Pulse Rider",    icon: "🎧", desc: "Score 250 in Beat Pulse",
    progress: (p) => [stat(p, "beat").best, 250] },
  // Asteroids mastery — counters filled by gameHost from the end-of-run report
  { id: "warlord-slayer", name: "Warlord Slayer", icon: "🛰️", desc: "Destroy 3 warlord carriers in Asteroids",
    progress: (p) => [p.counters?.warlordKills ?? 0, 3] },
  { id: "untouchable",    name: "Untouchable",    icon: "🛡️", desc: "Clear an Asteroids boss wave without a scratch",
    progress: (p) => [p.counters?.flawlessBosses ?? 0, 1] },
  { id: "fleet-admiral",  name: "Fleet Admiral",  icon: "🪐", desc: `Fly every ship in the hangar (${PLAYER_SHIPS.length})`,
    progress: (p) => [Object.keys(p.counters?.shipsFlown ?? {}).length, PLAYER_SHIPS.length] },
];

// Full badge list with live progress + earned state, for the profile view.
export function getBadges(p = getProfile()) {
  const earned = p.badges ?? {};
  return BADGES.map((b) => {
    const [cur, goal] = b.progress(p);
    return {
      ...b,
      cur: Math.min(cur, goal),
      goal,
      pct: Math.min(1, cur / goal),
      unlocked: !!earned[b.id] || cur >= goal,
      earnedAt: earned[b.id] ?? null,
    };
  });
}

// Persist newly completed badges on the given (mutable) profile.
// Returns the defs unlocked by this call — caller shows the celebration.
// The caller is responsible for saveProfile().
export function syncBadges(p) {
  p.badges = p.badges ?? {};
  const fresh = [];
  for (const b of BADGES) {
    if (p.badges[b.id]) continue;
    const [cur, goal] = b.progress(p);
    if (cur >= goal) {
      p.badges[b.id] = new Date().toISOString();
      fresh.push(b);
    }
  }
  return fresh;
}
