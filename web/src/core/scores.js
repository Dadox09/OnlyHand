import { getProfile, saveProfile } from "./profile.js";

export function recordPlay(gameId, score, durationSeconds = 0) {
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
}

export function getBest(gameId) {
  return getProfile().stats[gameId]?.best ?? 0;
}

export function getStats(gameId) {
  return getProfile().stats[gameId] ?? null;
}
