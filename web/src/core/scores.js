import { getProfile, saveProfile } from "./profile.js";
import { submitScore } from "./backend.js";
import { syncBadges } from "./badges.js";

// opts.practice — store mouse/touch progression separately from hand progression
// opts.daily — post to the separate UTC daily leaderboard
// opts.apply(p) — mutate extra profile counters (e.g. asteroids run stats)
//                 before badges are synced, inside the same save
export const scoreGameId = (gameId, mode = "camera", daily = false) =>
  `${gameId}${daily ? "-daily" : ""}${mode === "pointer" ? "-pointer" : ""}`;

export function recordPlay(gameId, score, durationSeconds = 0, opts = {}) {
  // Cloud submit runs in parallel; local stats never wait on the network.
  // The promise is returned so callers can wait for it before fetching the
  // global leaderboard (ensures this run's score is included).
  const submitted = submitScore(scoreGameId(gameId, opts.practice ? "pointer" : "camera", opts.daily), score).catch(() => false);
  const p = getProfile();
  const statsKey = opts.practice ? "practiceStats" : "stats";
  const timeKey = opts.practice ? "practicePlaytime" : "totalPlaytime";
  const countersKey = opts.practice ? "practiceCounters" : "counters";
  const prev = p[statsKey][gameId] ?? { best: 0, plays: 0, totalScore: 0, lastPlayed: null };
  p[statsKey][gameId] = {
    best: Math.max(prev.best, score),
    plays: prev.plays + 1,
    totalScore: prev.totalScore + score,
    lastPlayed: new Date().toISOString(),
  };
  p[timeKey] = (p[timeKey] ?? 0) + durationSeconds;
  p[countersKey] = p[countersKey] ?? {};
  if (score > prev.best && prev.plays > 0) {
    p[countersKey].records = (p[countersKey].records ?? 0) + 1;
  }
  opts.apply?.(p);
  const newBadges = syncBadges(p, opts.practice ? "pointer" : "camera");
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

export function updateDailyProgress(profile, date = new Date(), mode = "camera") {
  const today = utcDay(date);
  const key = mode === "pointer" ? "practiceDaily" : "daily";
  const daily = profile[key] ?? { lastDay: null, streak: 0, bestStreak: 0 };
  if (daily.lastDay === today) return daily;
  const yesterday = new Date(date);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  daily.streak = daily.lastDay === utcDay(yesterday) ? daily.streak + 1 : 1;
  daily.lastDay = today;
  daily.bestStreak = Math.max(daily.bestStreak || 0, daily.streak);
  profile[key] = daily;
  return daily;
}

export function getDailyProgress(mode = "camera") {
  const p = getProfile();
  const daily = (mode === "pointer" ? p.practiceDaily : p.daily) ?? { lastDay: null, streak: 0, bestStreak: 0 };
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

// House "ghost" rivals so the local demo board reads like an arcade cabinet
// even before you've climbed it. The player's own best is merged in live.
const HOUSE_RIVALS = {
  pong:      [{ name: "Nova",  avatar: "⚡", score: 87 },  { name: "Rex",   avatar: "🐉", score: 35 }],
  breakout:  [{ name: "Brick", avatar: "🤖", score: 90 },  { name: "Nova",  avatar: "⚡", score: 44 }],
  snake:     [{ name: "Viper", avatar: "🐍", score: 240 }, { name: "Nova",  avatar: "⚡", score: 150 }],
  slash:     [{ name: "Kenji", avatar: "🥷", score: 120 }, { name: "Nova",  avatar: "⚡", score: 65 }],
  beat:      [{ name: "Echo",  avatar: "🎧", score: 220 }, { name: "Nova",  avatar: "⚡", score: 110 }],
  jelly:     [{ name: "Mochi", avatar: "🪼", score: 345 }, { name: "Boba",  avatar: "🫧", score: 180 }],
  asteroids: [{ name: "Nova",  avatar: "⚡", score: 60 },  { name: "Rex",   avatar: "🐉", score: 28 }],
};

// Build a small local leaderboard: house rivals + the player's best in this mode
// (or this run's score, whichever is higher), sorted, top `limit`.
export function getLeaderboard(gameId, score = 0, limit = 3, mode = "camera") {
  const p = getProfile();
  const rivals = HOUSE_RIVALS[gameId] ?? HOUSE_RIVALS.pong;
  const you = {
    name: p.name,
    avatar: p.avatar,
    score: Math.max(mode === "pointer" ? getPracticeBest(gameId) : getBest(gameId), score),
    you: true,
  };
  return [...rivals.map((r) => ({ ...r })), you]
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
