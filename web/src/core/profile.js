const STORAGE_KEY = "onlyhand:profile";
const SCHEMA_VERSION = 1;
const DEFAULT_DAILY = { lastDay: null, streak: 0, bestStreak: 0 };
const DEFAULT_SETTINGS = { mirrorWebcam: true, showLandmarks: true, handedness: "right" };

const asRecord = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};

function defaultProfile() {
  return {
    schemaVersion: SCHEMA_VERSION,
    id: crypto.randomUUID(),
    name: "Player",
    avatar: "🎮",
    ship: "viper", // asteroids hangar pick — see games/asteroids/fleet.js
    createdAt: new Date().toISOString(),
    stats: {},
    practiceStats: {}, // mouse/touch runs; never mixed with hand leaderboards or badges
    badges: {},    // { [badgeId]: earnedAtISO } — see core/badges.js
    counters: {},  // { records } — personal bests broken
    daily: { ...DEFAULT_DAILY },
    totalPlaytime: 0,
    settings: { ...DEFAULT_SETTINGS },
  };
}

export function getProfile() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultProfile();
    const p = asRecord(JSON.parse(raw));
    if (p.schemaVersion !== SCHEMA_VERSION) return defaultProfile();
    for (const key of ["stats", "practiceStats", "badges", "counters"]) p[key] = asRecord(p[key]);
    if (!p.ship) p.ship = "viper"; // backfill profiles saved before the hangar existed
    p.daily = { ...DEFAULT_DAILY, ...asRecord(p.daily) };
    p.settings = { ...DEFAULT_SETTINGS, ...asRecord(p.settings) };
    return p;
  } catch {
    return defaultProfile();
  }
}

export function saveProfile(profile) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
}

export function deleteLocalProfile() {
  localStorage.removeItem(STORAGE_KEY);
}

export function updateProfile(patch) {
  const p = { ...getProfile(), ...patch };
  saveProfile(p);
  return p;
}

export function updateSettings(patch) {
  const p = getProfile();
  p.settings = { ...p.settings, ...patch };
  saveProfile(p);
  return p;
}
