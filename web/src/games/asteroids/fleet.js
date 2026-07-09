// Ship catalog for the sprites extracted from bucket.png
// (web/public/assets/asteroids/ships/, see sheet rows top→bottom = 0..11).
// Player picks from PLAYER_SHIPS in the profile HANGAR; the orange family
// is reserved for the enemy fighter squads.
const BASE = `${import.meta.env.BASE_URL}assets/asteroids/ships/`;

export const DEFAULT_SHIP = "viper";

// stats: agility → ship smoothing mult · fire → fire-interval mult (lower = faster)
// hitbox → damage hitbox mult · lives → extra starting lives · score → point mult
// double → parallel twin shot · triple → native narrow 3-way
// unlock: player level required (core/badges.js getLevel)
export const PLAYER_SHIPS = [
  { id: "viper",   name: "VIPER",   desc: "Agile scarlet interceptor",  perk: "AGILE",       unlock: 1,
    sprite: `${BASE}ship0.png`,  fire: `${BASE}fire0.png`,
    stats: { agility: 1.2,  fire: 0.95, hitbox: 1.0,  lives: 0, score: 1.0,  double: false, triple: false } },
  { id: "comet",   name: "COMET",   desc: "Silver all-rounder",         perk: "BALANCED",    unlock: 1,
    sprite: `${BASE}ship1.png`,  fire: `${BASE}fire1.png`,
    stats: { agility: 1.0,  fire: 1.0,  hitbox: 1.0,  lives: 0, score: 1.0,  double: false, triple: false } },
  { id: "titan",   name: "TITAN",   desc: "Armored assault frame",      perk: "+1 LIFE",     unlock: 3,
    sprite: `${BASE}ship3.png`,  fire: `${BASE}fire3.png`,
    stats: { agility: 0.85, fire: 1.05, hitbox: 1.05, lives: 1, score: 1.0,  double: false, triple: false } },
  { id: "phantom", name: "PHANTOM", desc: "Void-tech prototype",        perk: "RAPID FIRE",  unlock: 5,
    sprite: `${BASE}ship4.png`,  fire: `${BASE}fire4.png`,
    stats: { agility: 1.0,  fire: 0.75, hitbox: 1.12, lives: 0, score: 1.0,  double: false, triple: false } },
  { id: "pip",     name: "PIP",     desc: "Tiny scout, big heart",      perk: "TINY +10%",   unlock: 8,
    sprite: `${BASE}ship9.png`,  fire: `${BASE}fire9.png`,
    stats: { agility: 1.1,  fire: 1.0,  hitbox: 0.72, lives: 0, score: 1.1,  double: false, triple: false } },
  { id: "goliath", name: "GOLIATH", desc: "Heavy cruiser",              perk: "TWIN SHOT",   unlock: 12,
    sprite: `${BASE}ship10.png`, fire: `${BASE}fire10.png`,
    stats: { agility: 0.78, fire: 1.1,  hitbox: 1.1,  lives: 0, score: 1.0,  double: true,  triple: false } },
  // fire11 in the sheet is a curved tracer that reads badly in-game — NOVA borrows TITAN's bolt
  { id: "nova",    name: "NOVA",    desc: "Deep-space flagship",        perk: "TRIPLE SHOT", unlock: 16,
    sprite: `${BASE}ship11.png`, fire: `${BASE}fire3.png`,
    stats: { agility: 0.9,  fire: 1.15, hitbox: 1.05, lives: 0, score: 1.0,  double: false, triple: true } },
];

export function getShipDef(id) {
  return PLAYER_SHIPS.find((s) => s.id === id) ?? PLAYER_SHIPS[0];
}

export function isShipUnlocked(shipDef, playerLevel) {
  return playerLevel >= (shipDef.unlock ?? 1);
}

// Enemy fighters (orange faction). `tier` gates when they start appearing:
// fighters spawn from level `tier` upward, tougher types on later levels.
export const ENEMY_FIGHTERS = [
  { id: "drone",   sprite: `${BASE}ship6.png`, fire: `${BASE}fire6.png`, hp: 1, r: 15, score: 8,  speed: 1.5, shootEvery: 1900, tier: 2 },
  { id: "gunner",  sprite: `${BASE}ship5.png`, fire: `${BASE}fire5.png`, hp: 2, r: 16, score: 12, speed: 1.2, shootEvery: 1500, tier: 4 },
  { id: "raptor",  sprite: `${BASE}ship7.png`, fire: `${BASE}fire7.png`, hp: 2, r: 18, score: 14, speed: 1.7, shootEvery: 1400, tier: 6 },
  { id: "talon",   sprite: `${BASE}ship8.png`, fire: `${BASE}fire8.png`, hp: 3, r: 18, score: 16, speed: 1.5, shootEvery: 1250, tier: 8 },
  { id: "warlord", sprite: `${BASE}ship2.png`, fire: `${BASE}fire2.png`, hp: 5, r: 21, score: 25, speed: 0.9, shootEvery: 1050, tier: 10 },
];
