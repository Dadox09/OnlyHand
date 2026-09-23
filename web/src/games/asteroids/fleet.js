// Player ship catalog. `sheet` selects a column in ShipsAI/Ships.png.
// Player picks from PLAYER_SHIPS in the profile HANGAR.
const SHEET = `${import.meta.env.BASE_URL}assets/asteroids/ShipsAI/Ships.png`;

export const DEFAULT_SHIP = "viper";

// stats: agility → ship smoothing mult · fire → fire-interval mult (lower = faster)
// hitbox → damage hitbox mult · lives → extra starting lives · score → point mult
// double → parallel twin shot · triple → native narrow 3-way
// unlock: player level required (core/badges.js getLevel)
export const PLAYER_SHIPS = [
  { id: "viper",   name: "VIPER",   desc: "Agile scarlet interceptor",  perk: "AGILE",       unlock: 1,
    sprite: SHEET, sheet: 1,
    stats: { agility: 1.2,  fire: 0.95, hitbox: 1.0,  lives: 0, score: 1.0,  double: false, triple: false } },
  { id: "comet",   name: "COMET",   desc: "Azure all-rounder",          perk: "BALANCED",    unlock: 1,
    sprite: SHEET, sheet: 0,
    stats: { agility: 1.0,  fire: 1.0,  hitbox: 1.0,  lives: 0, score: 1.0,  double: false, triple: false } },
  { id: "titan",   name: "TITAN",   desc: "Armored assault frame",      perk: "+1 LIFE",     unlock: 3,
    sprite: SHEET, sheet: 2,
    stats: { agility: 0.85, fire: 1.05, hitbox: 1.05, lives: 1, score: 1.0,  double: false, triple: false } },
  { id: "phantom", name: "PHANTOM", desc: "Void-tech prototype",        perk: "RAPID FIRE",  unlock: 5,
    sprite: SHEET, sheet: 3,
    stats: { agility: 1.0,  fire: 0.75, hitbox: 1.12, lives: 0, score: 1.0,  double: false, triple: false } },
  { id: "pip",     name: "PIP",     desc: "Tiny scout, big heart",      perk: "TINY +10%",   unlock: 8,
    sprite: SHEET, sheet: 4,
    stats: { agility: 1.1,  fire: 1.0,  hitbox: 0.72, lives: 0, score: 1.1,  double: false, triple: false } },
  { id: "goliath", name: "GOLIATH", desc: "Heavy cruiser",              perk: "TWIN SHOT",   unlock: 12,
    sprite: SHEET, sheet: 2,
    stats: { agility: 0.78, fire: 1.1,  hitbox: 1.1,  lives: 0, score: 1.0,  double: true,  triple: false } },
  { id: "nova",    name: "NOVA",    desc: "Deep-space flagship",        perk: "TRIPLE SHOT", unlock: 16,
    sprite: SHEET, sheet: 4,
    stats: { agility: 0.9,  fire: 1.15, hitbox: 1.05, lives: 0, score: 1.0,  double: false, triple: true } },
];

export function getShipDef(id) {
  return PLAYER_SHIPS.find((s) => s.id === id) ?? PLAYER_SHIPS[0];
}

export function isShipUnlocked(shipDef, playerLevel) {
  return playerLevel >= (shipDef.unlock ?? 1);
}

// Enemy fighters use the three Monsters.png rows. `tier` gates when they start appearing:
// fighters spawn from level `tier` upward, tougher types on later levels.
export const ENEMY_FIGHTERS = [
  { id: "drone",   hp: 1, r: 15, score: 8,  speed: 1.5, shootEvery: 1900, tier: 2 },
  { id: "gunner",  hp: 2, r: 16, score: 12, speed: 1.2, shootEvery: 1500, tier: 4 },
  { id: "raptor",  hp: 2, r: 18, score: 14, speed: 1.7, shootEvery: 1400, tier: 6 },
  { id: "talon",   hp: 3, r: 18, score: 16, speed: 1.5, shootEvery: 1250, tier: 8 },
  { id: "warlord", hp: 5, r: 21, score: 25, speed: 0.9, shootEvery: 1050, tier: 10 },
];
