import { getProfile, saveProfile } from "./profile.js";
import { submitScore } from "./backend.js";
import { syncBadges } from "./badges.js";

// opts.submitAs — cloud game_id override (daily runs post to "<id>-daily"
//                 so they never pollute the all-time board)
// opts.cloud — false for practice/fallback controllers; keeps official boards fair
// opts.practice — store in practiceStats and skip badges/counters/official totals
// opts.apply(p) — mutate extra profile counters (e.g. asteroids run stats)
//                 before badges are synced, inside the same save
export function recordPlay(gameId, score, durationSeconds = 0, opts = {}) {
  // Cloud submit runs in parallel; local stats never wait on the network.
  // The promise is returned so callers can wait for it before fetching the
  // global leaderboard (ensures this run's score is included).
  const submitted = opts.cloud === false
    ? Promise.resolve(false)
    : submitScore(opts.submitAs ?? gameId, score).catch(() => false);
  const p = getProfile();
  if (opts.practice) {
    p.practiceStats = p.practiceStats ?? {};
    const prev = p.practiceStats[gameId] ?? { best: 0, plays: 0, totalScore: 0, lastPlayed: null };
    p.practiceStats[gameId] = {
      best: Math.max(prev.best, score),
      plays: prev.plays + 1,
      totalScore: prev.totalScore + score,
      lastPlayed: new Date().toISOString(),
    };
    p.practicePlaytime = (p.practicePlaytime ?? 0) + durationSeconds;
    saveProfile(p);
    return { submitted, newBadges: [] };
  }
  const prev = p.stats[gameId] ?? { best: 0, plays: 0, totalScore: 0, lastPlayed: null };
  p.stats[gameId] = {
    best: Math.max(prev.best, score),
    plays: prev.plays + 1,
    totalScore: prev.totalScore + score,
    lastPlayed: new Date().toISOString(),
  };
  p.totalPlaytime = (p.totalPlaytime ?? 0) + durationSeconds;
  p.counters = p.counters ?? {};
  if (score > prev.best && prev.plays > 0) {
    p.counters.records = (p.counters.records ?? 0) + 1;
  }
  opts.apply?.(p);
  const newBadges = syncBadges(p);
  saveProfile(p);
  return { submitted, newBadges };
}

export function getBest(gameId) {
  return getProfile().stats[gameId]?.best ?? 0;
}

export function getStats(gameId) {
  return getProfile().stats[gameId] ?? null;
}

export function getPracticeBest(gameId) {
  return getProfile().practiceStats?.[gameId]?.best ?? 0;
}

export function getPracticeStats(gameId) {
  return getProfile().practiceStats?.[gameId] ?? null;
}

const utcDay = (date = new Date()) => date.toISOString().slice(0, 10);

export function updateDailyProgress(profile, date = new Date()) {
  const today = utcDay(date);
  const daily = profile.daily ?? { lastDay: null, streak: 0, bestStreak: 0 };
  if (daily.lastDay === today) return daily;
  const yesterday = new Date(date);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  daily.streak = daily.lastDay === utcDay(yesterday) ? daily.streak + 1 : 1;
  daily.lastDay = today;
  daily.bestStreak = Math.max(daily.bestStreak || 0, daily.streak);
  profile.daily = daily;
  return daily;
}

export function getDailyProgress() {
  const daily = getProfile().daily ?? { lastDay: null, streak: 0, bestStreak: 0 };
  // A streak remains alive during the day immediately after the last play.
  if (!daily.lastDay) return daily;
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  if (daily.lastDay !== utcDay(now) && daily.lastDay !== utcDay(yesterday)) {
    return { ...daily, streak: 0 };
  }
  return daily;
}

// House "ghost" rivals so the TOP HANDS board reads like an arcade cabinet
// even before you've climbed it. The player's own best is merged in live.
const HOUSE_RIVALS = {
  pong:      [{ name: "Nova",  avatar: "⚡", score: 87 },  { name: "Rex",   avatar: "🐉", score: 35 }],
  breakout:  [{ name: "Brick", avatar: "🤖", score: 90 },  { name: "Nova",  avatar: "⚡", score: 44 }],
  snake:     [{ name: "Viper", avatar: "🐍", score: 240 }, { name: "Nova",  avatar: "⚡", score: 150 }],
  slash:     [{ name: "Kenji", avatar: "🥷", score: 120 }, { name: "Nova",  avatar: "⚡", score: 65 }],
  beat:      [{ name: "Echo",  avatar: "🎧", score: 220 }, { name: "Nova",  avatar: "⚡", score: 110 }],
  asteroids: [{ name: "Nova",  avatar: "⚡", score: 60 },  { name: "Rex",   avatar: "🐉", score: 28 }],
};

// Build a small TOP HANDS leaderboard: house rivals + the player's best
// (or this run's score, whichever is higher), sorted, top `limit`.
export function getLeaderboard(gameId, score = 0, limit = 3, bestOverride = null) {
  const p = getProfile();
  const rivals = HOUSE_RIVALS[gameId] ?? HOUSE_RIVALS.pong;
  const you = {
    name: p.name,
    avatar: p.avatar,
    score: Math.max(bestOverride ?? getBest(gameId), score),
    you: true,
  };
  return [...rivals.map((r) => ({ ...r })), you]
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
