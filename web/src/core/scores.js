import { getProfile, saveProfile } from "./profile.js";
import { submitScore } from "./backend.js";

export function recordPlay(gameId, score, durationSeconds = 0) {
  // Cloud submit runs in parallel; local stats never wait on the network.
  // The promise is returned so callers can wait for it before fetching the
  // global leaderboard (ensures this run's score is included).
  const submitted = submitScore(gameId, score).catch(() => false);
  const p = getProfile();
  const prev = p.stats[gameId] ?? { best: 0, plays: 0, totalScore: 0, lastPlayed: null };
  p.stats[gameId] = {
    best: Math.max(prev.best, score),
    plays: prev.plays + 1,
    totalScore: prev.totalScore + score,
    lastPlayed: new Date().toISOString(),
  };
  p.totalPlaytime = (p.totalPlaytime ?? 0) + durationSeconds;
  saveProfile(p);
  return submitted;
}

export function getBest(gameId) {
  return getProfile().stats[gameId]?.best ?? 0;
}

export function getStats(gameId) {
  return getProfile().stats[gameId] ?? null;
}

// House "ghost" rivals so the TOP HANDS board reads like an arcade cabinet
// even before you've climbed it. The player's own best is merged in live.
const HOUSE_RIVALS = {
  pong:      [{ name: "Nova",  avatar: "⚡", score: 87 },  { name: "Rex",   avatar: "🐉", score: 35 }],
  breakout:  [{ name: "Brick", avatar: "🤖", score: 90 },  { name: "Nova",  avatar: "⚡", score: 44 }],
  snake:     [{ name: "Viper", avatar: "🐍", score: 240 }, { name: "Nova",  avatar: "⚡", score: 150 }],
  asteroids: [{ name: "Nova",  avatar: "⚡", score: 60 },  { name: "Rex",   avatar: "🐉", score: 28 }],
};

// Build a small TOP HANDS leaderboard: house rivals + the player's best
// (or this run's score, whichever is higher), sorted, top 3.
export function getLeaderboard(gameId, score = 0) {
  const p = getProfile();
  const rivals = HOUSE_RIVALS[gameId] ?? HOUSE_RIVALS.pong;
  const you = {
    name: p.name,
    avatar: p.avatar,
    score: Math.max(getBest(gameId), score),
    you: true,
  };
  return [...rivals.map((r) => ({ ...r })), you]
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
}
