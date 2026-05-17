const STORAGE_KEY = "onlyhand:profile";
const SCHEMA_VERSION = 1;

function defaultProfile() {
  return {
    schemaVersion: SCHEMA_VERSION,
    id: crypto.randomUUID(),
    name: "Player",
    avatar: "🎮",
    createdAt: new Date().toISOString(),
    stats: {},
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
