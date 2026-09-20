const STORAGE_KEY = "onlyhand:profile";
const SCHEMA_VERSION = 1;

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
    daily: { lastDay: null, streak: 0, bestStreak: 0 },
    totalPlaytime: 0,
    settings: {
      mirrorWebcam: true,
      showLandmarks: true,
      handedness: "right",
    },
  };
}

export function getProfile() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultProfile();
    const p = JSON.parse(raw);
    if (p.schemaVersion !== SCHEMA_VERSION) return defaultProfile();
    if (!p.ship) p.ship = "viper"; // backfill profiles saved before the hangar existed
    if (!p.daily) p.daily = { lastDay: null, streak: 0, bestStreak: 0 };
    if (!p.practiceStats) p.practiceStats = {};
    return p;
  } catch {
    return defaultProfile();
  }
}

export function saveProfile(profile) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
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
