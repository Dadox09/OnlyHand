import {
  NEON, setupCanvas, createParticles, createShake, createFlash,
  createCountdown, createFixedStep, createMusic, STEP_MS, drawHudText, drawHandLostBanner, drawLives, sfx, hudFont,
} from "../../core/gameKit.js";
import { getProfile } from "../../core/profile.js";
import { getShipDef, ENEMY_FIGHTERS } from "./fleet.js";

const W = 800;
const H = 550;
const TAU = Math.PI * 2;

/* ── Tuning ───────────────────────────────────────────────────── */
const SIZES = { large: 42, medium: 24, small: 13, comet: 9 };
const POINTS = { large: 1, medium: 2, small: 3, comet: 5 };
const SPLIT = { large: "medium", medium: "small", small: null, comet: null };
const SHIP_SMOOTHING = 0.14;
const SHIP_RADIUS = 12;
const SHIP_HITBOX = SHIP_RADIUS * 0.96; // damage hitbox (was ×0.8, +20%)
const SHIP_DRAW = 50;             // sprite size on canvas (px)
const FIRE_INTERVAL = 460;        // ms, auto-fire
const FIRE_INTERVAL_PINCH = 245;  // ms while pinching (~30% slower cadence than the old 170)
const BULLET_SPEED = 12;
const BULLET_LIFE = 70;           // frames
const UFO_EVERY = 12000;          // ms between UFO spawns (level 4+)
const UFO_SHOOT_EVERY = 1700;     // ms
const FIGHTER_BASE_EVERY = 9500;  // ms between fighter squads (level 2+, shrinks per level)
const FIGHTER_MIN_EVERY = 5000;
const FIGHTER_BULLET_SPEED = 3.4;
const BOSS_EVERY = 3;             // boss wave every N levels
const BOSS_NAMES = ["DREADCLAW", "BONE HARROW", "VOID SEER"]; // Monsters.png rows 1–3
const TRIPLE_DUR = 540;           // frames (~9 s)
const COMBO_WINDOW = 110;         // frames to keep the chain alive
const BANNER_FRAMES = 150;
const CLEAR_FRAMES = 130;
const MAX_LIVES = 4;
const HAZARD_EVERY = 5;           // hazard sector every N levels (skipped on boss levels)
const HAZARD_NAMES = { storm: "ASTEROID STORM", well: "GRAVITY WELL", blackout: "BLACKOUT" };
const STORM_SPAWN_MS = 2100;      // extra rock cadence during ASTEROID STORM
const CARRIER_HP = 14;
const CARRIER_SPAWN_MS = 4200;    // drone bay cadence
const MAX_FIGHTERS = 5;

/* ── Level themes ─────────────────────────────────────────────── */
// bg image per theme comes from /assets/asteroids/bg<N>.(jpg|png|webp);
// `hue` drives the procedural fallback nebula when the image is missing.
const LEVELS = [
  { name: "DEEP SPACE", hue: 215 },
  { name: "VIOLET NEBULA", hue: 285 },
  { name: "ASTEROID BELT", hue: 160 },
  { name: "RED GIANT", hue: 12 },
  { name: "ALIEN SECTOR", hue: 120 },
];

const ASSET_BASE = `${import.meta.env.BASE_URL}assets/asteroids/`;
// Ships.png columns: one static ship, shots, impacts, deaths.
const SHIPS = [
  { ship: [70, 20, 210, 252], shots: [[68, 20], [125, 27], [190, 38], [258, 40]],
    impacts: [[50, 28], [94, 48], [160, 62], [238, 80]], deaths: [[30, 90], [120, 90], [210, 110]], thrust: "#38bdf8" },
  { ship: [370, 20, 212, 252], shots: [[385, 14], [435, 18], [493, 22], [558, 23]],
    impacts: [[382, 40], [445, 55], [515, 78]], deaths: [[352, 65], [420, 88], [508, 105]], thrust: "#38bdf8" },
  { ship: [650, 20, 265, 252], shots: [[680, 45], [754, 56], [837, 68]],
    impacts: [[660, 52], [718, 85], [812, 105]], deaths: [[646, 75], [718, 100], [818, 105]], thrust: "#f59e0b" },
  { ship: [980, 20, 232, 252], shots: [[980, 40], [1038, 68], [1118, 85]],
    impacts: [[965, 42], [1029, 75], [1118, 98]], deaths: [[958, 65], [1025, 95], [1122, 110]], thrust: "#a855f7" },
  { ship: [1305, 18, 195, 255], shots: [[1281, 25], [1334, 30], [1392, 42], [1459, 47]],
    impacts: [[1276, 57], [1342, 74], [1423, 92]], deaths: [[1277, 60], [1320, 95], [1400, 120]], thrust: "#22c55e" },
];
// Monsters.png: three rows, each with six flight frames, four shots and five death frames.
const MONSTERS = [
  { y: 24, h: 230, flight: [16, 172, 324, 489, 638, 795], shotY: 45, shots: [972, 1025, 1078, 1123], deathY: 185,
    deaths: [[947, 103], [1063, 102], [1175, 103], [1293, 116], [1418, 95]] },
  { y: 350, h: 220, flight: [10, 172, 324, 481, 637, 782], shotY: 380, shots: [953, 997, 1042, 1094], deathY: 522,
    deaths: [[950, 110], [1068, 125], [1200, 110], [1320, 100], [1428, 80]] },
  { y: 688, h: 245, flight: [12, 180, 333, 481, 638, 785], shotY: 710, shots: [955, 997, 1054, 1103], deathY: 838,
    deaths: [[950, 110], [1060, 130], [1195, 115], [1318, 90], [1418, 85]] },
];

// ── RNG ─────────────────────────────────────────────────────────
// Sim code draws from `rand`; mount() points it at a seeded generator in
// daily-run mode (same UTC day = same wave layout for everyone). Draw-only
// randomness (fallback bg, engine flame) stays on Math.random so rendering
// never consumes the sim sequence.
let rand = Math.random;

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// FNV-1a over the UTC day string → 32-bit seed
function seedFrom(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function randRange(a, b) { return a + rand() * (b - a); }

/* ── Asset loading (all optional — game runs without files) ───── */
function loadFirst(paths) {
  return new Promise((resolve) => {
    let i = 0;
    const next = () => {
      if (i >= paths.length) return resolve(null);
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => { i++; next(); };
      img.src = paths[i];
    };
    next();
  });
}

function withExts(base) {
  return ["jpg", "png", "webp"].map((e) => `${ASSET_BASE}${base}.${e}`);
}

// Procedural nebula background, cached per theme, used until/unless
// the real image loads.
const fallbackBgs = new Map();
function makeFallbackBg(idx) {
  if (fallbackBgs.has(idx)) return fallbackBgs.get(idx);
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const g = c.getContext("2d");
  const hue = LEVELS[idx % LEVELS.length].hue;
  g.fillStyle = "#020309";
  g.fillRect(0, 0, W, H);
  for (let i = 0; i < 4; i++) {
    const x = randRange(0, W), y = randRange(0, H), r = randRange(140, 320);
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, `hsla(${hue + randRange(-25, 25)}, 70%, 32%, 0.22)`);
    grad.addColorStop(1, "transparent");
    g.fillStyle = grad;
    g.fillRect(0, 0, W, H);
  }
  for (let i = 0; i < 150; i++) {
    g.globalAlpha = randRange(0.15, 0.8);
    g.fillStyle = "#ffffff";
    const s = Math.random() < 0.15 ? 2 : 1;
    g.fillRect(Math.random() * W, Math.random() * H, s, s);
  }
  g.globalAlpha = 1;
  fallbackBgs.set(idx, c);
  return c;
}

/* ── Entities ─────────────────────────────────────────────────── */
function makeAsteroid(size, x, y, level) {
  const angle = Math.PI / 2 + randRange(-0.28, 0.28);
  const speedMult = 1 + (level - 1) * 0.12;
  const speed = (size === "large" ? randRange(1.2, 2.2)
    : size === "medium" ? randRange(1.7, 3.2)
      : size === "comet" ? randRange(4.2, 6.0)
        : randRange(3.0, 5.0)) * (size === "comet" ? 1 + (level - 1) * 0.06 : speedMult);
  const verts = 9;
  const R = SIZES[size];
  const shape = Array.from({ length: verts }, (_, i) => {
    const a = (i / verts) * TAU;
    const r = R * randRange(0.72, 1.0);
    return { x: Math.cos(a) * r, y: Math.sin(a) * r };
  });
  const nCraters = size === "large" ? 3 : size === "medium" ? 2 : 1;
  const craters = Array.from({ length: nCraters }, () => {
    const a = rand() * TAU, d = randRange(0.15, 0.55) * R;
    return { x: Math.cos(a) * d, y: Math.sin(a) * d, r: randRange(0.12, 0.24) * R };
  });
  return {
    x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
    rot: rand() * TAU, rotSpeed: randRange(-0.02, 0.02) * (size === "comet" ? 4 : 1),
    size, shape, craters, rockSeed: (rand() * 3) | 0,
  };
}

function buildWave(level) {
  const arr = [];
  const nLarge = Math.min(2 + level, 8);
  for (let i = 0; i < nLarge; i++) {
    arr.push(makeAsteroid("large", randRange(50, W - 50), -60 - i * 180, level));
  }
  const nComets = level >= 3 ? Math.min(level - 2, 4) : 0;
  for (let i = 0; i < nComets; i++) {
    arr.push(makeAsteroid("comet", randRange(50, W - 50), -400 - i * 260, level));
  }
  return arr;
}

function isBossLevel(n) { return n % BOSS_EVERY === 0; }

function makeBosses(level) {
  const tier = level / BOSS_EVERY;            // 1, 2, 3, … drives hp/fire rate
  const count = 1 + Math.floor(level / 15);   // 2 bosses from level 15, 3 from 30…
  const idx = (tier - 1) % BOSS_NAMES.length; // rotate monster/name every boss wave
  return Array.from({ length: count }, (_, i) => ({
    idx,
    phase: 0,   // 0 → 1 at 50% hp (ring attack + drones) → 2 at 25% (enrage)
    ringT: 0,
    name: BOSS_NAMES[idx],
    x: W * ((i + 1) / (count + 1)),
    baseX: W * ((i + 1) / (count + 1)),
    y: -110,
    hoverY: 118,
    t: rand() * 1000,
    r: count > 1 ? 42 : 54,
    hp: 16 + tier * 10,
    maxHp: 16 + tier * 10,
    shootT: 0,
    shootEvery: Math.max(450, 1500 - tier * 120),
    bulletSpeed: Math.min(5, 3.2 + tier * 0.15),
    spread: tier >= 3,                        // 3-way shots from the 3rd boss wave
  }));
}

function makeUfo() {
  const x = randRange(90, W - 90);
  return {
    x, baseX: x,
    y: -40, vy: 1.3, t: 0, hp: 3, shootT: 0, r: 19,
  };
}

function makeFighter(level) {
  const eligible = ENEMY_FIGHTERS.filter((f) => f.tier <= level);
  const type = eligible[(rand() * eligible.length) | 0];
  return {
    type,
    typeIdx: ENEMY_FIGHTERS.indexOf(type),
    baseX: randRange(70, W - 70),
    x: 0,
    y: randRange(-90, -40),
    t: rand() * 1000,
    hp: type.hp,
    r: type.r,
    offX: 0,                    // V-formation slot offset
    offY: 0,
    shootT: randRange(0, type.shootEvery * 0.5),
  };
}

// Warlord mini-carrier: hovers near the top like a mini-boss, strafes
// slowly and releases drones from its bay until it's destroyed.
function makeCarrier() {
  const type = ENEMY_FIGHTERS[ENEMY_FIGHTERS.length - 1]; // warlord
  return {
    type,
    typeIdx: ENEMY_FIGHTERS.indexOf(type),
    carrier: true,
    baseX: randRange(140, W - 140),
    x: 0,
    y: -80,
    hoverY: randRange(84, 120),
    t: rand() * 1000,
    hp: CARRIER_HP,
    r: 26,
    offX: 0,
    offY: 0,
    shootT: 0,
    spawnT: 0,
  };
}

export default {
  async mount({ canvas, onHandUpdate, handState, onScore, daily = false }) {
    const ctx = setupCanvas(canvas, W, H);

    // Daily run: sim RNG seeded from the UTC day — everyone flies the same
    // sectors today. Free flight keeps plain Math.random.
    rand = daily
      ? mulberry32(seedFrom(new Date().toISOString().slice(0, 10)))
      : Math.random;

    const particles = createParticles();
    const shake = createShake();
    const flash = createFlash();
    const countdown = createCountdown((label) => (label === "GO" ? sfx.go() : sfx.tick()));
    const music = createMusic();
    music.start(); // no-ops until the browser unlocks audio, then fades in

    // Optional art — loads in the background, procedural fallbacks
    // render immediately so the game never waits on files.
    const assets = {
      ships: null, bgs: LEVELS.map(() => null), rocks: [],
      monsters: null, life: null,
    };
    // Hangar pick from the profile; all ships share the same sheet.
    const shipDef = getShipDef(getProfile().ship);
    const shipStats = shipDef.stats;
    const HITBOX = SHIP_HITBOX * shipStats.hitbox;
    loadFirst([`${ASSET_BASE}life.png`, `${ASSET_BASE}life.webp`]).then((img) => { assets.life = img; });
    loadFirst([shipDef.sprite]).then((img) => { assets.ships = img; });
    loadFirst([`${ASSET_BASE}Monsters/Monsters.png`]).then((img) => { assets.monsters = img; });
    LEVELS.forEach((_, i) => {
      loadFirst(withExts(`bg${i + 1}`)).then((img) => { assets.bgs[i] = img; });
    });
    for (let i = 1; i <= 3; i++) {
      loadFirst([`${ASSET_BASE}asteroid${i}.png`, `${ASSET_BASE}asteroid${i}.webp`])
        .then((img) => { if (img) assets.rocks.push(img); });
    }

    const ship = {
      x: W / 2, y: H * 0.8,
      targetX: W / 2, targetY: H * 0.8,
    };

    const state = {
      ship,
      asteroids: [],
      bullets: [],
      shotImpacts: [],
      enemyBullets: [],
      monsterDeaths: [],
      powerups: [],
      bosses: [],
      ufo: null,
      ufoT: 0,
      fighters: [],
      fighterT: 0,
      squadN: 0,              // squad spawn counter (every 3rd → carrier at level 10+)
      score: 0,
      lives: Math.min(MAX_LIVES, 3 + shipStats.lives),
      level: 0,
      phase: "play",        // "play" | "clear"
      clearT: 0,
      levelBanner: 0,
      combo: 0,
      comboT: 0,
      tripleT: 0,
      shield: false,
      bgIdx: 0,
      bgPrevIdx: 0,
      bgFade: 1,
      frame: 0,
      sinceShot: 0,         // ms accumulator
      shipDeathAt: -1000,
      invincible: 0,        // frames
      dying: false,
      paused: false,
      pinch: false,
      fist: false,
      fistHeld: false,        // edge trigger: reopen the hand between bombs
      bombs: 1,
      bombCooldown: 0,        // frames
      bombWave: -1,           // frames since detonation (drives the ring), -1 = idle
      bombX: 0,
      bombY: 0,
      hitStop: 0,             // frames frozen (boss/carrier kill impact)
      slowMo: 0,              // frames at half speed (dropping to last life)
      popups: [],             // floating combat text { text, x, y, t, color }
      streak: 0,              // big-kills inside the streak window
      streakT: 0,
      hazard: null,           // "storm" | "well" | "blackout" | null
      hazardN: 0,             // hazard sectors survived (drives the rotation)
      well: null,             // { x, y, t } for GRAVITY WELL
      stormT: 0,              // ms accumulator for storm spawns
      stormRemaining: 0,
      handLost: !handState.isDetected,
      bossWaveHit: false,     // took any hit during the current boss wave
      stats: {                // end-of-run report + badge counters
        shots: 0,
        hits: 0,
        maxCombo: 0,
        flawlessBosses: 0,
        kills: { rocks: 0, comets: 0, fighters: 0, ufos: 0, bosses: 0, carriers: 0 },
      },
    };

    const unsub = onHandUpdate((s) => {
      state.handLost = !s.isDetected;
      state.pinch = !!s.pinch;
      state.fist = s.isDetected && s.gesture === "Closed_Fist";
      if (s.isDetected) {
        ship.targetX = (1 - s.x) * W;
        ship.targetY = s.y * H;
      }
    });

    function startLevel(n) {
      state.level = n;
      state.phase = "play";
      state.levelBanner = BANNER_FRAMES;
      const boss = isBossLevel(n);
      state.asteroids = boss ? [] : buildWave(n);
      state.bosses = boss ? makeBosses(n) : [];
      state.bossWaveHit = false;
      if (boss) flash.trigger(NEON.danger, 0.12);
      state.enemyBullets.length = 0;
      state.shotImpacts.length = 0;
      state.monsterDeaths.length = 0;
      state.ufo = null;
      state.ufoT = 0;
      state.fighters = [];
      state.fighterT = 0;
      // hazard sector every 5 levels; boss levels stay pure boss fights.
      // rotation counts hazards actually played (a level-N modulo would
      // never reach BLACKOUT: every 15th level is a boss)
      state.hazard = !boss && n % HAZARD_EVERY === 0
        ? ["storm", "well", "blackout"][state.hazardN++ % 3] : null;
      state.well = state.hazard === "well"
        ? { x: randRange(W * 0.3, W * 0.7), y: randRange(H * 0.32, H * 0.68), t: 0 } : null;
      state.stormT = 0;
      state.stormRemaining = state.hazard === "storm" ? Math.min(4 + n, 12) : 0;
      state.invincible = Math.max(state.invincible, 80);
      state.bgPrevIdx = state.bgIdx;
      state.bgIdx = (n - 1) % LEVELS.length;
      state.bgFade = n === 1 ? 1 : 0;
    }
    startLevel(1);

    function comboMult() {
      return state.combo >= 10 ? 4 : state.combo >= 6 ? 3 : state.combo >= 3 ? 2 : 1;
    }

    function addScore(base) {
      state.combo++;
      state.stats.maxCombo = Math.max(state.stats.maxCombo, state.combo);
      state.comboT = COMBO_WINDOW;
      state.score += Math.round(base * comboMult() * shipStats.score);
    }

    function addPopup(text, x, y, color = NEON.magenta) {
      state.popups.push({
        text,
        x: Math.max(60, Math.min(W - 60, x)),
        y: Math.max(46, y),
        t: 0, color,
      });
    }

    // Big-kill streak (fighters/UFO/boss) inside a short window
    function addStreak(x, y) {
      state.streak++;
      state.streakT = 55;
      if (state.streak >= 2) {
        const label = state.streak === 2 ? "DOUBLE KILL"
          : state.streak === 3 ? "TRIPLE KILL" : "RAMPAGE";
        addPopup(label, x, y - 24);
        sfx.score();
      }
    }

    function fire() {
      const a = -Math.PI / 2;
      // triple powerup = wide spread; NOVA's native triple = tight spread
      const angles = state.tripleT > 0 ? [a - 0.22, a, a + 0.22]
        : shipStats.triple ? [a - 0.13, a, a + 0.13] : [a];
      // GOLIATH: twin parallel shots, offset perpendicular to the aim
      const offsets = shipStats.double ? [-4.5, 4.5] : [0];
      for (const ang of angles) {
        for (const off of offsets) {
          const ox = Math.cos(ang + Math.PI / 2) * off;
          const oy = Math.sin(ang + Math.PI / 2) * off;
          state.bullets.push({
            x: ship.x + Math.cos(ang) * (SHIP_RADIUS + 6) + ox,
            y: ship.y + Math.sin(ang) * (SHIP_RADIUS + 6) + oy,
            vx: Math.cos(ang) * BULLET_SPEED,
            vy: Math.sin(ang) * BULLET_SPEED,
            life: BULLET_LIFE,
            born: state.frame,
          });
        }
      }
      state.stats.shots += angles.length * offsets.length;
      sfx.shoot();
    }

    function maybeDrop(x, y, chance = 0.14) {
      if (rand() > chance) return;
      const r = rand();
      let type = r < 0.42 ? "shield" : r < 0.84 ? "triple" : "life";
      if (type === "life" && state.lives >= MAX_LIVES) type = "triple";
      state.powerups.push({
        x, y, vx: randRange(-0.4, 0.4), vy: randRange(1.0, 1.5),
        type, life: 520, t: 0,
      });
    }

    function breakAsteroid(idx) {
      const a = state.asteroids[idx];
      state.asteroids.splice(idx, 1);
      state.stats.kills[a.size === "comet" ? "comets" : "rocks"]++;
      addScore(POINTS[a.size]);
      const col = a.size === "large" ? NEON.muted
        : a.size === "medium" ? NEON.cyan
          : a.size === "comet" ? NEON.warn : NEON.accent;
      particles.burst(a.x, a.y, {
        count: a.size === "large" ? 22 : 12,
        color: col, speed: 3.5, life: 40, size: 3,
      });
      shake.add(a.size === "large" ? 0.18 : 0.1);
      sfx.explode();
      const child = SPLIT[a.size];
      if (child) {
        state.asteroids.push(makeAsteroid(child, a.x, a.y, state.level));
        state.asteroids.push(makeAsteroid(child, a.x, a.y, state.level));
      }
      maybeDrop(a.x, a.y);
    }

    function killFighter(k) {
      const f = state.fighters[k];
      state.fighters.splice(k, 1);
      state.monsterDeaths.push({ x: f.x, y: f.y, idx: f.typeIdx % 3, size: f.r * 2.6, born: state.frame });
      state.stats.kills[f.carrier ? "carriers" : "fighters"]++;
      addScore(f.carrier ? 60 : f.type.score);
      particles.burst(f.x, f.y, {
        count: f.carrier ? 44 : 24, color: NEON.warn,
        speed: f.carrier ? 5.5 : 4.5, life: f.carrier ? 55 : 45, size: 3.5,
      });
      shake.add(f.carrier ? 0.45 : 0.22);
      if (f.carrier) {
        state.hitStop = 2;
        flash.trigger(NEON.warn, 0.12);
        sfx.bigExplode();
        maybeDrop(f.x, f.y, 1); // carrier always drops
      } else {
        sfx.explode();
        maybeDrop(f.x, f.y, 0.22);
      }
      addStreak(f.x, f.y);
    }

    function fireRing(src, n, speed) {
      for (let i = 0; i < n; i++) {
        if (state.enemyBullets.length >= 16) break; // readability cap
        const a = (i / n) * TAU + randRange(-0.06, 0.06);
        state.enemyBullets.push({
          x: src.x, y: src.y,
          vx: Math.cos(a) * speed, vy: Math.sin(a) * speed,
          monsterIdx: src.idx,
        });
      }
      sfx.shoot();
    }

    // Damage a boss by index; handles phase transitions and death.
    function damageBoss(k, dmg) {
      const bo = state.bosses[k];
      bo.hp -= dmg;
      if (bo.hp <= 0) {
        state.bosses.splice(k, 1);
        state.monsterDeaths.push({ x: bo.x, y: bo.y, idx: bo.idx, size: bo.r * 2.5, born: state.frame });
        state.stats.kills.bosses++;
        addScore(40);
        particles.burst(bo.x, bo.y, { count: 50, color: NEON.danger, speed: 6, life: 60, size: 5 });
        particles.burst(bo.x, bo.y, { count: 30, color: NEON.warn, speed: 4, life: 50, size: 4 });
        shake.add(0.6);
        flash.trigger(NEON.danger, 0.2);
        sfx.bigExplode();
        maybeDrop(bo.x - 20, bo.y, 1);
        maybeDrop(bo.x + 20, bo.y, 1);
        state.bombs = Math.min(2, state.bombs + 1); // bomb recharge on boss kill
        state.hitStop = 3; // ~50 ms impact freeze
        addStreak(bo.x, bo.y);
        if (state.bosses.length === 0 && !state.bossWaveHit) {
          state.stats.flawlessBosses++;
          addPopup("FLAWLESS", bo.x, bo.y - 44, NEON.cyan);
        }
        return;
      }
      const frac = bo.hp / bo.maxHp;
      if (bo.phase === 0 && frac <= 0.5) {
        // phase 1: ring attack unlocked + escort drones
        bo.phase = 1;
        flash.trigger(NEON.danger, 0.15);
        shake.add(0.3);
        fireRing(bo, 10, 2.4);
        for (let i = 0; i < 2 && state.fighters.length < 4; i++) {
          state.fighters.push(makeFighter(2)); // tier 2 → drones only
        }
      } else if (bo.phase === 1 && frac <= 0.25) {
        // phase 2: enrage
        bo.phase = 2;
        bo.shootEvery = Math.max(380, bo.shootEvery * 0.65);
        bo.bulletSpeed *= 1.2;
        flash.trigger(NEON.danger, 0.2);
        shake.add(0.35);
        sfx.hit();
      }
    }

    // Fist = smart bomb: shockwave from the ship. One "hit" to everything —
    // clears enemy bullets, splits/kills asteroids, -3 fighters, -5 bosses.
    function detonateBomb() {
      state.bombs--;
      state.bombCooldown = 90; // 1.5 s before the next one
      state.bombWave = 0;
      state.bombX = ship.x;
      state.bombY = ship.y;
      flash.trigger("#ffffff", 0.35);
      shake.add(0.7);
      sfx.bigExplode();
      state.enemyBullets.length = 0;
      // backwards over the original list: children pushed by splits are untouched
      for (let i = state.asteroids.length - 1; i >= 0; i--) {
        const a = state.asteroids[i];
        if (a.y + SIZES[a.size] >= 0 && a.y - SIZES[a.size] <= H) breakAsteroid(i);
      }
      for (let k = state.fighters.length - 1; k >= 0; k--) {
        const f = state.fighters[k];
        f.hp -= 3;
        if (f.hp <= 0) killFighter(k);
      }
      if (state.ufo) {
        state.monsterDeaths.push({ x: state.ufo.x, y: state.ufo.y, idx: 2, size: 50, born: state.frame });
        state.stats.kills.ufos++;
        addScore(15);
        particles.burst(state.ufo.x, state.ufo.y, { count: 30, color: NEON.magenta, speed: 4.5, life: 50, size: 4 });
        maybeDrop(state.ufo.x, state.ufo.y, 0.6);
        addStreak(state.ufo.x, state.ufo.y);
        state.ufo = null;
      }
      for (let k = state.bosses.length - 1; k >= 0; k--) damageBoss(k, 5);
    }

    function hitShip() {
      if (state.invincible > 0 || state.dying) return;
      if (state.bosses.length) state.bossWaveHit = true; // shield hits count too
      if (state.shield) {
        state.shield = false;
        state.invincible = 100;
        shake.add(0.25);
        flash.trigger(NEON.cyan, 0.15);
        particles.burst(ship.x, ship.y, { count: 18, color: NEON.cyan, speed: 4, life: 35, size: 3 });
        sfx.hit();
        return;
      }
      state.lives--;
      state.invincible = 140;
      shake.add(0.5);
      flash.trigger(NEON.danger, 0.3);
      particles.burst(ship.x, ship.y, { count: 26, color: NEON.danger, speed: 5, life: 45, size: 4 });
      if (state.lives <= 0) {
        state.dying = true;
        state.shipDeathAt = state.frame;
        music.stop();
        sfx.bigExplode();
        particles.burst(ship.x, ship.y, { count: 40, color: NEON.warn, speed: 6, life: 55, size: 4 });
        deathTimer = setTimeout(() => {
          if (!running) return;
          // end-of-run report: gameHost renders it + feeds badge counters
          onScore(state.score, {
            ...state.stats,
            level: state.level,
            ship: shipDef.id,
            daily,
          });
        }, 800);
      } else {
        if (state.lives === 1) {
          // dramatic beat: half speed for ~1 s dropping to the last life
          state.slowMo = 110;
          addPopup("LAST LIFE", ship.x, ship.y - 30, NEON.danger);
        }
        sfx.explode();
      }
    }

    function applyPowerup(type) {
      if (type === "shield") state.shield = true;
      else if (type === "triple") state.tripleT = TRIPLE_DUR;
      else if (type === "life") state.lives = Math.min(MAX_LIVES, state.lives + 1);
      sfx.powerup();
      flash.trigger(NEON.accent, 0.08);
    }

    function update() {
      // hit-stop: freeze the whole sim for a couple of frames on big kills
      if (state.hitStop > 0) { state.hitStop--; return; }
      // slow-mo: run every other step at half speed
      if (state.slowMo > 0) {
        state.slowMo--;
        if (state.slowMo % 2 === 1) return;
      }
      state.frame++;
      state.shotImpacts = state.shotImpacts.filter((p) => state.frame - p.born < 16);
      state.monsterDeaths = state.monsterDeaths.filter((d) => state.frame - d.born < 30);

      // music follows the action: calm drift → boss → enrage
      music.setIntensity(state.bosses.length
        ? (state.bosses.some((b) => b.phase === 2) ? 1
          : state.bosses.some((b) => b.phase === 1) ? 0.85 : 0.7)
        : Math.min(0.55, 0.32 + state.level * 0.015));

      // Streak window + floating combat text (run even while dying)
      if (state.streakT > 0 && --state.streakT === 0) state.streak = 0;
      for (let i = state.popups.length - 1; i >= 0; i--) {
        if (++state.popups[i].t > 70) state.popups.splice(i, 1);
      }

      particles.update();
      shake.update();
      flash.update();
      state.bgFade = Math.min(1, state.bgFade + 0.02);

      const dt = STEP_MS; // fixed 60 Hz step

      if (!countdown.done || state.dying) return;

      // Incoming rocks travel down once, then leave the sector.
      for (let i = state.asteroids.length - 1; i >= 0; i--) {
        const a = state.asteroids[i];
        const r = SIZES[a.size];
        a.x += a.vx;
        a.y += a.vy;
        a.rot += a.rotSpeed;
        if (a.x < r || a.x > W - r) {
          a.x = Math.max(r, Math.min(W - r, a.x));
          a.vx *= -1;
        }
        if (a.y > H + r) state.asteroids.splice(i, 1);
      }

      if (state.levelBanner > 0) state.levelBanner--;

      // Combo & powerup timers
      if (state.comboT > 0) { state.comboT--; if (state.comboT === 0) state.combo = 0; }
      if (state.tripleT > 0) state.tripleT--;

      // Ship movement
      ship.x += (ship.targetX - ship.x) * SHIP_SMOOTHING * shipStats.agility;
      ship.y += (ship.targetY - ship.y) * SHIP_SMOOTHING * shipStats.agility;
      ship.x = Math.max(SHIP_RADIUS, Math.min(W - SHIP_RADIUS, ship.x));
      ship.y = Math.max(SHIP_RADIUS, Math.min(H - SHIP_RADIUS, ship.y));

      // GRAVITY WELL hazard: everything bends toward the vortex
      if (state.well) {
        const w = state.well;
        w.t++;
        const pull = (o, k) => {
          const dx = w.x - o.x, dy = w.y - o.y;
          const d = Math.max(40, Math.hypot(dx, dy));
          o.vx += (dx / d) * (k * 60 / d);
          o.vy += (dy / d) * (k * 60 / d);
        };
        for (const a of state.asteroids) {
          pull(a, 0.9);
          const s = Math.hypot(a.vx, a.vy);
          if (s > 5.5) { a.vx *= 5.5 / s; a.vy *= 5.5 / s; } // no slingshots
          a.vy = Math.max(1, a.vy); // the current keeps rocks moving down
        }
        for (const b of state.bullets) pull(b, 1.4);
        for (const b of state.enemyBullets) pull(b, 1.0);
        // ship: positional drag the player has to fight
        const dx = w.x - ship.x, dy = w.y - ship.y;
        const d = Math.max(60, Math.hypot(dx, dy));
        ship.x += (dx / d) * (110 / d);
        ship.y += (dy / d) * (110 / d);
      }

      // A finite storm from above: extra rocks must not keep a sector alive forever.
      if (state.hazard === "storm" && state.phase === "play"
          && state.asteroids.length > 0 && state.stormRemaining > 0) {
        state.stormT += dt;
        if (state.stormT >= STORM_SPAWN_MS) {
          state.stormT = 0;
          state.stormRemaining--;
          state.asteroids.push(makeAsteroid(rand() < 0.5 ? "comet" : "small", randRange(50, W - 50), -50, state.level));
        }
      }

      // Continuous thrust: forward flight also reads when the hand is still.
      if (state.frame % 2 === 0) {
        particles.burst(
          ship.x, ship.y + SHIP_RADIUS + 4,
          { count: 1, color: SHIPS[shipDef.sheet].thrust, speed: 1.6, life: 16, size: 2.5, angle: Math.PI / 2, spread: 0.5 },
        );
      }

      // Fist = smart bomb (edge-triggered: reopen the hand between bombs)
      if (state.bombCooldown > 0) state.bombCooldown--;
      if (state.bombWave >= 0 && ++state.bombWave > 34) state.bombWave = -1;
      if (state.fist && !state.fistHeld && state.bombs > 0
          && state.bombCooldown === 0 && !state.handLost) {
        detonateBomb();
      }
      state.fistHeld = state.fist;

      // Auto-fire — pinch for rapid fire
      state.sinceShot += dt;
      const interval = (state.pinch ? FIRE_INTERVAL_PINCH : FIRE_INTERVAL) * shipStats.fire;
      if (state.sinceShot >= interval && !state.handLost) {
        state.sinceShot = 0;
        fire();
      }

      // Player bullets
      outer:
      for (let i = state.bullets.length - 1; i >= 0; i--) {
        const b = state.bullets[i];
        b.x += b.vx;
        b.y += b.vy;
        b.life -= 1;
        if (b.life <= 0 || b.x < -10 || b.x > W + 10 || b.y < -10 || b.y > H + 10) {
          state.bullets.splice(i, 1);
          continue;
        }
        if (state.ufo && Math.hypot(b.x - state.ufo.x, b.y - state.ufo.y) < state.ufo.r + 3) {
          state.bullets.splice(i, 1);
          state.shotImpacts.push({ x: b.x, y: b.y, born: state.frame });
          state.stats.hits++;
          state.ufo.hp--;
          particles.burst(b.x, b.y, { count: 6, color: NEON.magenta, speed: 2.5, life: 25, size: 2.5 });
          sfx.hit();
          if (state.ufo.hp <= 0) {
            state.monsterDeaths.push({ x: state.ufo.x, y: state.ufo.y, idx: 2, size: 50, born: state.frame });
            state.stats.kills.ufos++;
            addScore(15);
            particles.burst(state.ufo.x, state.ufo.y, { count: 30, color: NEON.magenta, speed: 4.5, life: 50, size: 4 });
            shake.add(0.3);
            sfx.explode();
            maybeDrop(state.ufo.x, state.ufo.y, 0.6);
            addStreak(state.ufo.x, state.ufo.y);
            state.ufo = null;
          }
          continue;
        }
        for (let k = state.bosses.length - 1; k >= 0; k--) {
          const bo = state.bosses[k];
          if (Math.hypot(b.x - bo.x, b.y - bo.y) < bo.r * 0.8) {
            state.bullets.splice(i, 1);
            state.shotImpacts.push({ x: b.x, y: b.y, born: state.frame });
            state.stats.hits++;
            particles.burst(b.x, b.y, { count: 5, color: NEON.danger, speed: 2.5, life: 22, size: 2.5 });
            sfx.hit();
            damageBoss(k, 1);
            continue outer;
          }
        }
        for (let k = state.fighters.length - 1; k >= 0; k--) {
          const f = state.fighters[k];
          if (Math.hypot(b.x - f.x, b.y - f.y) < f.r + 4) {
            state.bullets.splice(i, 1);
            state.shotImpacts.push({ x: b.x, y: b.y, born: state.frame });
            state.stats.hits++;
            f.hp--;
            particles.burst(b.x, b.y, { count: 5, color: NEON.warn, speed: 2.5, life: 22, size: 2.5 });
            sfx.hit();
            if (f.hp <= 0) killFighter(k);
            continue outer;
          }
        }
        for (let j = state.asteroids.length - 1; j >= 0; j--) {
          const a = state.asteroids[j];
          // comets are tiny but fast — bigger bullet hitbox avoids tunneling
          const hitR = a.size === "comet" ? 14 : SIZES[a.size] * 0.85;
          if (Math.hypot(b.x - a.x, b.y - a.y) < hitR) {
            state.bullets.splice(i, 1);
            state.shotImpacts.push({ x: b.x, y: b.y, born: state.frame });
            state.stats.hits++;
            breakAsteroid(j);
            continue outer;
          }
        }
      }

      // Bosses
      for (const b of state.bosses) {
        b.t += b.phase === 2 ? 1.5 : 1; // enrage: faster strafing
        b.y += (b.hoverY - b.y) * 0.02;
        b.x = b.baseX + Math.sin(b.t * 0.008) * (W * 0.22 / state.bosses.length);
        if (b.phase >= 1) {
          b.ringT += dt;
          if (b.ringT >= 2600 && b.y > 55) {
            b.ringT = 0;
            fireRing(b, 10, 2.6);
          }
        }
        b.shootT += dt;
        if (b.shootT >= b.shootEvery && b.y > 55) {
          b.shootT = 0;
          const a = Math.atan2(ship.y - b.y, ship.x - b.x) + randRange(-0.08, 0.08);
          const angles = b.spread ? [a - 0.28, a, a + 0.28] : [a];
          for (const ang of angles) {
            state.enemyBullets.push({
              x: b.x, y: b.y + 18,
              vx: Math.cos(ang) * b.bulletSpeed,
              vy: Math.sin(ang) * b.bulletSpeed,
              monsterIdx: b.idx,
            });
          }
          sfx.shoot();
        }
        if (Math.hypot(ship.x - b.x, ship.y - b.y) < b.r * 0.8 + HITBOX) hitShip();
      }

      // UFO (level 4+, never during boss fights)
      if (state.phase === "play" && state.level >= 4 && !state.ufo
          && !isBossLevel(state.level) && state.asteroids.length > 0) {
        state.ufoT += dt;
        if (state.ufoT >= UFO_EVERY) { state.ufoT = 0; state.ufo = makeUfo(); }
      }
      if (state.ufo) {
        const u = state.ufo;
        u.t++;
        u.x = u.baseX + Math.sin(u.t * 0.025) * 70;
        u.y += u.vy;
        u.shootT += dt;
        if (u.shootT >= UFO_SHOOT_EVERY && u.y > 20 && u.y < H - 20) {
          u.shootT = 0;
          const a = Math.atan2(ship.y - u.y, ship.x - u.x) + randRange(-0.12, 0.12);
          state.enemyBullets.push({ x: u.x, y: u.y + 8, vx: Math.cos(a) * 3.2, vy: Math.sin(a) * 3.2, monsterIdx: 2 });
          sfx.shoot();
        }
        if (u.y > H + 50) state.ufo = null;
        else if (Math.hypot(ship.x - u.x, ship.y - u.y) < u.r + HITBOX) hitShip();
      }

      // Enemy fighters (level 2+, never during boss fights; stop spawning
      // once the field is clear so the wave can end)
      if (state.phase === "play" && state.level >= 2 && !state.bosses.length
          && state.asteroids.length > 0 && state.fighters.length < MAX_FIGHTERS) {
        state.fighterT += dt;
        const every = Math.max(FIGHTER_MIN_EVERY, FIGHTER_BASE_EVERY - state.level * 250);
        if (state.fighterT >= every) {
          state.fighterT = 0;
          state.squadN++;
          const hasCarrier = state.fighters.some((f) => f.carrier);
          if (state.level >= 10 && !hasCarrier && state.squadN % 3 === 0) {
            state.fighters.push(makeCarrier());
          } else {
            // V formation: wingmen share the leader's type, lane and phase
            const squad = 1 + (state.level >= 6 ? 1 : 0) + (state.level >= 12 ? 1 : 0);
            const lead = makeFighter(state.level);
            if (squad > 1) lead.baseX = Math.max(120, Math.min(W - 120, lead.baseX));
            state.fighters.push(lead);
            const slots = [[-46, -36], [46, -36], [0, -72]];
            for (let i = 1; i < squad && state.fighters.length < MAX_FIGHTERS; i++) {
              const wing = makeFighter(state.level);
              wing.type = lead.type;
              wing.typeIdx = lead.typeIdx;
              wing.hp = lead.type.hp;
              wing.r = lead.type.r;
              wing.baseX = lead.baseX;
              wing.t = lead.t;
              wing.offX = slots[i - 1][0];
              wing.offY = slots[i - 1][1];
              wing.y = lead.y + wing.offY;
              wing.shootT = lead.shootT - i * 300; // stagger the volleys
              state.fighters.push(wing);
            }
          }
        }
      }
      for (let i = state.fighters.length - 1; i >= 0; i--) {
        const f = state.fighters[i];
        f.t++;
        if (f.carrier) {
          // mini-carrier: settles into a hover and strafes like a mini-boss
          f.y += (f.hoverY - f.y) * 0.03;
          f.x = f.baseX + Math.sin(f.t * 0.01) * 70;
          // drone bay
          f.spawnT += dt;
          if (f.spawnT >= CARRIER_SPAWN_MS && f.y > 40 && state.fighters.length < MAX_FIGHTERS) {
            f.spawnT = 0;
            const d = makeFighter(2); // drones only
            d.baseX = Math.max(70, Math.min(W - 70, f.x));
            d.y = f.y + 24;
            state.fighters.push(d);
            particles.burst(f.x, f.y + 18, { count: 10, color: NEON.warn, speed: 2.5, life: 28, size: 2.5 });
            sfx.hit();
          }
        } else {
          f.y += f.type.speed;
          f.x = f.baseX + f.offX + Math.sin(f.t * 0.022) * 62;
          if (f.y > H + 60) { state.fighters.splice(i, 1); continue; }
        }
        f.shootT += dt;
        if (f.shootT >= f.type.shootEvery && f.y > 10 && f.y < H * 0.8
            && state.enemyBullets.length < 16) {
          f.shootT = 0;
          const a = Math.atan2(ship.y - f.y, ship.x - f.x) + randRange(-0.09, 0.09);
          state.enemyBullets.push({
            x: f.x, y: f.y + f.r * 0.6,
            vx: Math.cos(a) * FIGHTER_BULLET_SPEED,
            vy: Math.sin(a) * FIGHTER_BULLET_SPEED,
            monsterIdx: f.typeIdx % 3,
          });
          sfx.shoot();
        }
        if (Math.hypot(ship.x - f.x, ship.y - f.y) < f.r * 0.85 + HITBOX) {
          if (!f.carrier) { // ramming the carrier hurts you, not it
            state.fighters.splice(i, 1);
            state.monsterDeaths.push({ x: f.x, y: f.y, idx: f.typeIdx % 3, size: f.r * 2.6, born: state.frame });
            particles.burst(f.x, f.y, { count: 20, color: NEON.warn, speed: 4, life: 40, size: 3.5 });
            sfx.explode();
          }
          hitShip();
        }
      }

      // Enemy bullets
      for (let i = state.enemyBullets.length - 1; i >= 0; i--) {
        const b = state.enemyBullets[i];
        b.x += b.vx;
        b.y += b.vy;
        if (b.x < -10 || b.x > W + 10 || b.y < -10 || b.y > H + 10) {
          state.enemyBullets.splice(i, 1);
          continue;
        }
        if (Math.hypot(b.x - ship.x, b.y - ship.y) < 5 + HITBOX) {
          state.enemyBullets.splice(i, 1);
          hitShip();
        }
      }

      // Powerups
      for (let i = state.powerups.length - 1; i >= 0; i--) {
        const p = state.powerups[i];
        p.x += p.vx;
        p.y += p.vy;
        p.t++;
        p.life--;
        if (p.life <= 0 || p.y > H + 16 || p.x < -16 || p.x > W + 16) {
          state.powerups.splice(i, 1); continue;
        }
        if (!state.dying && Math.hypot(p.x - ship.x, p.y - ship.y) < 16 + SHIP_RADIUS) {
          state.powerups.splice(i, 1);
          applyPowerup(p.type);
          particles.burst(p.x, p.y, { count: 14, color: NEON.accent, speed: 3, life: 30, size: 3 });
        }
      }

      // Ship vs asteroids
      if (state.invincible > 0) {
        state.invincible--;
      } else {
        for (const a of state.asteroids) {
          if (Math.hypot(ship.x - a.x, ship.y - a.y) < SIZES[a.size] * 0.75 + HITBOX) {
            hitShip();
            break;
          }
        }
      }

      // Wave cleared → level transition
      if (state.phase === "play" && state.asteroids.length === 0 && !state.ufo
          && state.bosses.length === 0 && state.fighters.length === 0) {
        state.phase = "clear";
        state.clearT = CLEAR_FRAMES;
        state.score += state.level * 5; // clear bonus
        state.enemyBullets.length = 0;
        sfx.levelUp();
        flash.trigger(NEON.accent, 0.12);
      }
      if (state.phase === "clear") {
        state.clearT--;
        if (state.clearT <= 0) startLevel(state.level + 1);
      }
    }

    /* ── Drawing ──────────────────────────────────────────────── */
    const vignette = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, W * 0.72);
    vignette.addColorStop(0, "rgba(0,0,8,0)");
    vignette.addColorStop(1, "rgba(0,0,8,0.55)");

    function drawScrollingBg(img, alpha) {
      const s = Math.max(W / img.width, H / img.height);
      const dw = img.width * s, dh = img.height * s;
      const offset = (state.frame * 0.65) % (dh * 2);
      ctx.globalAlpha = alpha;
      // Alternate mirrored tiles so even non-seamless artwork joins cleanly.
      for (let y = offset - dh * 2, tile = 0; y < H; y += dh, tile++) {
        ctx.save();
        ctx.translate((W - dw) / 2, y);
        if (tile % 2 === 1) { ctx.translate(0, dh); ctx.scale(1, -1); }
        ctx.drawImage(img, 0, 0, dw, dh);
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    }

    function bgFor(idx) {
      return assets.bgs[idx] || makeFallbackBg(idx);
    }

    function drawBackground() {
      if (state.bgFade < 1 && state.bgPrevIdx !== state.bgIdx) {
        drawScrollingBg(bgFor(state.bgPrevIdx), 1);
        drawScrollingBg(bgFor(state.bgIdx), state.bgFade);
      } else {
        drawScrollingBg(bgFor(state.bgIdx), 1);
      }
      // readability veil + vignette so gameplay stays crisp over any art
      ctx.fillStyle = "rgba(2,5,12,0.32)";
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, W, H);

      // parallax star layers
      const t = state.frame;
      ctx.fillStyle = "rgba(255,255,255,0.25)";
      for (let i = 0; i < 40; i++) {
        ctx.fillRect((i * 97 + 13) % W, (i * 67 + 31 + t * 0.9) % H, 1, 1);
      }
      ctx.fillStyle = "rgba(255,255,255,0.45)";
      for (let i = 0; i < 20; i++) {
        ctx.fillRect((i * 131 + 57) % W, (i * 89 + 17 + t * 1.8) % H, 2, 2);
      }
    }

    function drawAsteroid(a) {
      ctx.save();
      ctx.translate(a.x, a.y);

      if (a.size === "comet") {
        const ang = Math.atan2(a.vy, a.vx);
        ctx.rotate(ang);
        const grad = ctx.createLinearGradient(-30, 0, 0, 0);
        grad.addColorStop(0, "rgba(34,211,238,0)");
        grad.addColorStop(1, "rgba(34,211,238,0.55)");
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.moveTo(-30, 0); ctx.lineTo(-4, -4); ctx.lineTo(-4, 4);
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.arc(0, 0, 5, 0, TAU);
        ctx.fillStyle = "#c9f5ff";
        ctx.shadowColor = NEON.cyan;
        ctx.shadowBlur = 12;
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.restore();
        return;
      }

      ctx.rotate(a.rot);
      const R = SIZES[a.size];
      const img = assets.rocks.length ? assets.rocks[a.rockSeed % assets.rocks.length] : null;
      if (img) {
        const d = R * 2.15;
        ctx.drawImage(img, -d / 2, -d / 2, d, d);
      } else {
        const grad = ctx.createRadialGradient(-R * 0.3, -R * 0.3, R * 0.2, 0, 0, R);
        grad.addColorStop(0, "#3d4d66");
        grad.addColorStop(1, "#141b29");
        ctx.beginPath();
        ctx.moveTo(a.shape[0].x, a.shape[0].y);
        for (let i = 1; i < a.shape.length; i++) ctx.lineTo(a.shape[i].x, a.shape[i].y);
        ctx.closePath();
        ctx.fillStyle = grad;
        ctx.fill();
        ctx.strokeStyle = "#5d6d87";
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.fillStyle = "rgba(8,12,20,0.5)";
        for (const c of a.craters) {
          ctx.beginPath();
          ctx.arc(c.x, c.y, c.r, 0, TAU);
          ctx.fill();
        }
      }
      ctx.restore();
    }

    function drawWell() {
      const w = state.well;
      if (!w) return;
      ctx.save();
      ctx.translate(w.x, w.y);
      ctx.shadowColor = NEON.magenta;
      ctx.shadowBlur = 14;
      // counter-rotating dashed rings
      for (let i = 0; i < 3; i++) {
        const r = 20 + i * 19;
        ctx.save();
        ctx.rotate(w.t * 0.02 * (i % 2 === 0 ? 1 : -1.4));
        ctx.beginPath();
        ctx.setLineDash([r * 0.7, r * 0.5]);
        ctx.arc(0, 0, r, 0, TAU);
        ctx.strokeStyle = `rgba(232,121,249,${0.55 - i * 0.14})`;
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.restore();
      }
      // dark core
      ctx.beginPath();
      ctx.arc(0, 0, 11, 0, TAU);
      ctx.fillStyle = "#0a0312";
      ctx.fill();
      ctx.strokeStyle = NEON.magenta;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.restore();
    }

    function drawBlackout() {
      if (state.hazard !== "blackout") return;
      // darkness closes in outside the ship's light radius
      const R = 190 + Math.sin(state.frame * 0.05) * 12;
      const g = ctx.createRadialGradient(ship.x, ship.y, R * 0.45, ship.x, ship.y, R);
      g.addColorStop(0, "rgba(1,2,6,0)");
      g.addColorStop(1, "rgba(1,2,6,0.93)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }

    function drawPopups() {
      for (const p of state.popups) {
        const a = p.t < 10 ? p.t / 10 : Math.max(0, 1 - (p.t - 45) / 25);
        ctx.globalAlpha = a;
        drawHudText(ctx, p.text, p.x, p.y - p.t * 0.5, {
          size: 18, align: "center", color: p.color, glow: p.color, weight: 900,
        });
        ctx.globalAlpha = 1;
      }
    }

    function drawMonster(idx, frame, x, y, size) {
      const row = MONSTERS[idx];
      ctx.drawImage(assets.monsters, row.flight[frame], row.y, 150, row.h,
        x - size / 2, y - size * 0.65, size, size * 1.3);
    }

    function drawMonsterDeaths() {
      if (!assets.monsters) return;
      for (const d of state.monsterDeaths) {
        const frame = Math.floor((state.frame - d.born) / 6);
        const row = MONSTERS[d.idx];
        const [x, width] = row.deaths[frame];
        ctx.drawImage(assets.monsters, x, row.deathY, width, 155,
          d.x - d.size / 2, d.y - d.size * 0.65, d.size, d.size * 1.3);
      }
    }

    function drawUfo() {
      const u = state.ufo;
      if (!u) return;
      if (assets.monsters) {
        drawMonster(2, Math.floor(u.t / 8) % 6, u.x, u.y, 50);
        return;
      }
      ctx.save();
      ctx.translate(u.x, u.y);
      ctx.shadowColor = NEON.magenta;
      ctx.shadowBlur = 12;
      // saucer body
      ctx.beginPath();
      ctx.ellipse(0, 4, 19, 8, 0, 0, TAU);
      ctx.fillStyle = "#3b2350";
      ctx.fill();
      ctx.strokeStyle = NEON.magenta;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      // dome
      ctx.beginPath();
      ctx.arc(0, -2, 8, Math.PI, 0);
      ctx.fillStyle = "rgba(232,121,249,0.45)";
      ctx.fill();
      // running lights
      ctx.shadowBlur = 6;
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath();
        ctx.arc(i * 10, 5, 1.8, 0, TAU);
        ctx.fillStyle = (state.frame >> 3) % 3 === i + 1 ? "#ffffff" : NEON.magenta;
        ctx.fill();
      }
      ctx.restore();
    }

    function drawFighters() {
      for (const f of state.fighters) {
        if (assets.monsters) {
          drawMonster(f.typeIdx % 3, Math.floor(f.t / 8) % 6, f.x, f.y, f.r * 2.6);
        } else {
          ctx.save();
          ctx.translate(f.x, f.y);
          // vector fallback: orange dart
          ctx.beginPath();
          ctx.moveTo(0, -f.r);
          ctx.lineTo(f.r * 0.8, f.r * 0.7);
          ctx.lineTo(0, f.r * 0.3);
          ctx.lineTo(-f.r * 0.8, f.r * 0.7);
          ctx.closePath();
          ctx.fillStyle = "#7c3a10";
          ctx.fill();
          ctx.strokeStyle = NEON.warn;
          ctx.lineWidth = 1.5;
          ctx.shadowColor = NEON.warn;
          ctx.shadowBlur = 10;
          ctx.stroke();
          ctx.shadowBlur = 0;
          ctx.restore();
        }
        if (f.carrier) {
          const bw = 46, frac = Math.max(0, f.hp / CARRIER_HP);
          ctx.fillStyle = "rgba(12,6,10,0.7)";
          ctx.fillRect(f.x - bw / 2, f.y - f.r - 16, bw, 5);
          ctx.fillStyle = NEON.warn;
          ctx.fillRect(f.x - bw / 2 + 1, f.y - f.r - 15, (bw - 2) * frac, 3);
        }
      }
    }

    function drawBosses() {
      for (const b of state.bosses) {
        ctx.save();
        ctx.translate(b.x, b.y + Math.sin(b.t * 0.05) * 4);
        ctx.rotate(Math.sin(b.t * 0.02) * 0.06);
        if (b.phase === 2) {
          // enrage aura
          const pulse = 0.3 + 0.25 * Math.sin(state.frame * 0.3);
          ctx.beginPath();
          ctx.arc(0, 0, b.r * 1.18, 0, TAU);
          ctx.strokeStyle = `rgba(248,113,113,${pulse})`;
          ctx.lineWidth = 3;
          ctx.shadowColor = NEON.danger;
          ctx.shadowBlur = 18;
          ctx.stroke();
          ctx.shadowBlur = 0;
        }
        const d = b.r * 2.5;
        if (assets.monsters) {
          drawMonster(b.idx, Math.floor(b.t / 8) % 6, 0, 0, d);
        } else {
          // vector fallback: spiked core
          ctx.beginPath();
          for (let i = 0; i < 10; i++) {
            const a = (i / 10) * TAU;
            const rr = i % 2 === 0 ? b.r : b.r * 0.6;
            ctx[i === 0 ? "moveTo" : "lineTo"](Math.cos(a) * rr, Math.sin(a) * rr);
          }
          ctx.closePath();
          ctx.fillStyle = "#2a1020";
          ctx.fill();
          ctx.strokeStyle = NEON.danger;
          ctx.lineWidth = 2;
          ctx.shadowColor = NEON.danger;
          ctx.shadowBlur = 14;
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(0, 0, b.r * 0.28, 0, TAU);
          ctx.fillStyle = NEON.danger;
          ctx.fill();
          ctx.shadowBlur = 0;
        }
        ctx.restore();
      }
    }

    function drawBossBars() {
      const n = state.bosses.length;
      if (!n) return;
      const barW = n === 1 ? 260 : 170;
      const gap = 26;
      let x = (W - (n * barW + (n - 1) * gap)) / 2;
      for (const b of state.bosses) {
        const frac = Math.max(0, b.hp / b.maxHp);
        const y = 58;
        drawHudText(ctx, `${b.name}  LV ${state.level}`, x + barW / 2, y - 6, {
          size: 11, align: "center", color: NEON.danger, glow: NEON.danger, weight: 900,
        });
        ctx.fillStyle = "rgba(12,6,10,0.75)";
        ctx.fillRect(x, y, barW, 9);
        const blink = frac < 0.25 && (state.frame >> 4) % 2 === 0;
        ctx.fillStyle = blink ? "#ffb3b3" : NEON.danger;
        ctx.shadowColor = NEON.danger;
        ctx.shadowBlur = 8;
        ctx.fillRect(x + 1, y + 1, (barW - 2) * frac, 7);
        ctx.shadowBlur = 0;
        ctx.strokeStyle = "rgba(248,113,113,0.6)";
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 0.5, y + 0.5, barW - 1, 8);
        x += barW + gap;
      }
    }

    function drawPowerup(p) {
      const pulse = 1 + Math.sin(p.t * 0.12) * 0.12;
      const fade = p.life < 90 ? (Math.floor(p.life / 6) % 2 === 0 ? 0.35 : 1) : 1;
      const col = p.type === "shield" ? NEON.cyan : p.type === "triple" ? NEON.warn : NEON.accent;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.scale(pulse, pulse);
      ctx.globalAlpha = fade;
      if (p.type === "life" && assets.life) {
        ctx.shadowColor = NEON.danger;
        ctx.shadowBlur = 12;
        ctx.drawImage(assets.life, -14, -14, 28, 28);
        ctx.restore();
        return;
      }
      ctx.beginPath();
      ctx.arc(0, 0, 13, 0, TAU);
      ctx.fillStyle = "rgba(6,10,18,0.75)";
      ctx.fill();
      ctx.strokeStyle = col;
      ctx.lineWidth = 2;
      ctx.shadowColor = col;
      ctx.shadowBlur = 10;
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.fillStyle = col;
      ctx.font = hudFont(11, 900);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(p.type === "shield" ? "S" : p.type === "triple" ? "3" : "+", 0, 1);
      ctx.restore();
    }

    function drawShip() {
      const art = SHIPS[shipDef.sheet];
      if (state.dying) {
        if (assets.ships) {
          const frame = Math.min(2, Math.floor((state.frame - state.shipDeathAt) / 16));
          const [x, width] = art.deaths[frame];
          ctx.drawImage(assets.ships, x, 835, width, 155, ship.x - 38, ship.y - 38, 76, 76);
        }
        return;
      }
      if (state.invincible > 0 && Math.floor(state.invincible / 6) % 2 === 0) return;

      ctx.save();
      ctx.translate(ship.x, ship.y);

      // shield / spawn-protection ring
      if (state.shield || state.invincible > 0) {
        const a = state.shield ? 0.5 : 0.35 + 0.3 * Math.sin(state.invincible * 0.4);
        ctx.beginPath();
        ctx.arc(0, 0, SHIP_RADIUS + 9, 0, TAU);
        ctx.strokeStyle = `rgba(96,200,255,${a})`;
        ctx.lineWidth = 2;
        ctx.shadowColor = "#60c8ff";
        ctx.shadowBlur = 10;
        ctx.stroke();
        ctx.shadowBlur = 0;
      }

      if (assets.ships) {
        const [x, y, width, height] = art.ship;
        const scale = Math.min(SHIP_DRAW / width, SHIP_DRAW * 1.3 / height);
        ctx.drawImage(assets.ships, x, y, width, height,
          -width * scale / 2, -height * scale / 2, width * scale, height * scale);
      } else {
        // vector fallback ship (nose toward +x before rotation)
        ctx.rotate(-Math.PI / 2);
        const flame = 6 + Math.random() * 6;
        ctx.beginPath();
        ctx.moveTo(-6, 3.5); ctx.lineTo(-6 - flame, 0); ctx.lineTo(-6, -3.5);
        ctx.closePath();
        ctx.fillStyle = "rgba(252,161,74,0.85)";
        ctx.shadowColor = "#fca14a";
        ctx.shadowBlur = 10;
        ctx.fill();

        const grad = ctx.createLinearGradient(-12, 0, 17, 0);
        grad.addColorStop(0, "#155e75");
        grad.addColorStop(1, "#7dd3fc");
        ctx.beginPath();
        ctx.moveTo(17, 0);
        ctx.lineTo(-11, 10);
        ctx.lineTo(-5, 0);
        ctx.lineTo(-11, -10);
        ctx.closePath();
        ctx.fillStyle = grad;
        ctx.shadowColor = "#38bdf8";
        ctx.shadowBlur = 12;
        ctx.fill();
        ctx.strokeStyle = "#bae6fd";
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.beginPath();
        ctx.arc(4, 0, 2.6, 0, TAU);
        ctx.fillStyle = "#e0f2fe";
        ctx.fill();
      }

      ctx.restore();
    }

    function drawBanners() {
      const theme = LEVELS[(state.level - 1) % LEVELS.length];
      if (state.levelBanner > 0) {
        const boss = isBossLevel(state.level);
        const alpha = Math.min(1, state.levelBanner / 22, (BANNER_FRAMES - state.levelBanner) / 15);
        ctx.globalAlpha = Math.max(0, alpha);
        drawHudText(ctx, `LEVEL ${state.level}`, W / 2, H / 2 - 34, {
          size: 42, align: "center", glow: boss ? NEON.danger : NEON.accent, weight: 900,
          color: boss ? NEON.danger : NEON.text,
        });
        const sub = boss
          ? `⚠ ${BOSS_NAMES[(state.level / BOSS_EVERY - 1) % BOSS_NAMES.length]} ⚠`
          : theme.name;
        drawHudText(ctx, sub, W / 2, H / 2 - 4, {
          size: 15, align: "center",
          color: boss ? NEON.danger : NEON.muted, glow: boss ? NEON.danger : null,
        });
        if (state.hazard) {
          drawHudText(ctx, `⚠ ${HAZARD_NAMES[state.hazard]} ⚠`, W / 2, H / 2 + 22, {
            size: 14, align: "center", color: NEON.warn, glow: NEON.warn,
          });
        }
        ctx.globalAlpha = 1;
      }
      if (state.phase === "clear") {
        const pulse = 0.7 + 0.3 * Math.sin(state.frame * 0.15);
        ctx.globalAlpha = pulse;
        drawHudText(ctx, "SECTOR CLEAR", W / 2, H / 2 - 20, { size: 34, align: "center", glow: NEON.accent, weight: 900, color: NEON.accent });
        drawHudText(ctx, `BONUS +${state.level * 5}`, W / 2, H / 2 + 10, { size: 14, align: "center", color: NEON.muted });
        ctx.globalAlpha = 1;
      }
    }

    function draw() {
      ctx.save();
      shake.apply(ctx);

      drawBackground();
      drawWell();

      for (const a of state.asteroids) drawAsteroid(a);
      drawUfo();
      drawFighters();
      drawBosses();
      drawMonsterDeaths();

      // BLACKOUT veil hides the field — bullets, powerups and the ship
      // draw above it so the fight is never a blind bullet-hell
      drawBlackout();
      for (const p of state.powerups) drawPowerup(p);

      // Player bullets use the selected ship's shot frames.
      if (assets.ships) {
        const art = SHIPS[shipDef.sheet];
        for (const b of state.bullets) {
          const frame = Math.floor((state.frame - b.born) / 4) % art.shots.length;
          const [x, width] = art.shots[frame];
          ctx.save();
          ctx.translate(b.x, b.y);
          ctx.rotate(Math.atan2(b.vy, b.vx) + Math.PI / 2);
          ctx.drawImage(assets.ships, x, 580, width, 125, -8, -14, 16, 28);
          ctx.restore();
        }
      } else {
        ctx.fillStyle = NEON.cyan;
        ctx.shadowColor = NEON.cyan;
        ctx.shadowBlur = 8;
        for (const b of state.bullets) {
          ctx.beginPath();
          ctx.arc(b.x, b.y, 3, 0, TAU);
          ctx.fill();
        }
        ctx.shadowBlur = 0;
      }
      if (assets.ships) {
        const art = SHIPS[shipDef.sheet];
        for (const p of state.shotImpacts) {
          const frame = Math.min(art.impacts.length - 1, Math.floor((state.frame - p.born) / 4));
          const [x, width] = art.impacts[frame];
          ctx.drawImage(assets.ships, x, 715, width, 120, p.x - 16, p.y - 16, 32, 32);
        }
      }
      // Enemy shots use the matching monster row.
      for (const b of state.enemyBullets) {
        if (assets.monsters && b.monsterIdx != null) {
          const row = MONSTERS[b.monsterIdx];
          const frame = Math.floor(state.frame / 5) % 4;
          ctx.save();
          ctx.translate(b.x, b.y);
          ctx.rotate(Math.atan2(b.vy, b.vx) + Math.PI / 2);
          ctx.drawImage(assets.monsters, row.shots[frame], row.shotY, 38, 115,
            -8, -15, 16, 30);
          ctx.restore();
        } else {
          ctx.fillStyle = NEON.danger;
          ctx.shadowColor = NEON.danger;
          ctx.shadowBlur = 8;
          ctx.beginPath();
          ctx.arc(b.x, b.y, 4, 0, TAU);
          ctx.fill();
          ctx.shadowBlur = 0;
        }
      }

      // bomb shockwave ring
      if (state.bombWave >= 0) {
        const p = state.bombWave / 34;
        const r = 30 + p * Math.max(W, H) * 0.85;
        ctx.beginPath();
        ctx.arc(state.bombX, state.bombY, r, 0, TAU);
        ctx.strokeStyle = `rgba(255,255,255,${0.75 * (1 - p)})`;
        ctx.lineWidth = 5 * (1 - p) + 1;
        ctx.shadowColor = NEON.cyan;
        ctx.shadowBlur = 18;
        ctx.stroke();
        ctx.shadowBlur = 0;
      }

      drawShip();
      particles.draw(ctx);
      drawPopups();

      // slow-mo tint
      if (state.slowMo > 0) {
        ctx.fillStyle = "rgba(34,211,238,0.07)";
        ctx.fillRect(0, 0, W, H);
      }

      // HUD
      const mult = comboMult();
      drawHudText(ctx, `SCORE ${state.score}`, 14, 28, { size: 15, glow: NEON.accent });
      if (mult > 1) {
        drawHudText(ctx, `COMBO x${mult}`, 14, 48, { size: 12, color: NEON.magenta, glow: NEON.magenta });
      }
      drawHudText(ctx, `LV ${state.level}`, W / 2, 28, { size: 15, align: "center", color: NEON.muted });
      if (state.hazard) {
        drawHudText(ctx, HAZARD_NAMES[state.hazard], W / 2, 44, { size: 10, align: "center", color: NEON.warn });
      }
      if (daily) {
        drawHudText(ctx, "★ DAILY RUN", W / 2, state.hazard ? 57 : 44, {
          size: 10, align: "center", color: NEON.cyan, glow: NEON.cyan,
        });
      }
      if (assets.life) {
        for (let i = 0; i < Math.max(0, state.lives); i++) {
          ctx.drawImage(assets.life, W - 16 - 20 - i * 23, 12, 20, 20);
        }
      } else {
        drawLives(ctx, Math.max(0, state.lives), W - 16, 22);
      }
      drawBossBars();

      // bombs (fist to detonate)
      drawHudText(ctx, `💣 ${state.bombs}`, 14, H - 44, {
        size: 12,
        color: state.bombs > 0 ? NEON.text : NEON.muted,
        glow: state.bombs > 0 ? NEON.warn : null,
      });

      if (state.tripleT > 0) {
        const w = 80 * (state.tripleT / TRIPLE_DUR);
        ctx.fillStyle = NEON.warn;
        ctx.shadowColor = NEON.warn;
        ctx.shadowBlur = 6;
        ctx.fillRect(14, H - 22, w, 4);
        ctx.shadowBlur = 0;
        drawHudText(ctx, "TRIPLE", 14, H - 28, { size: 10, color: NEON.warn });
      }
      if (state.pinch && countdown.done && !state.dying) {
        drawHudText(ctx, "RAPID FIRE", W / 2, H - 14, { size: 12, align: "center", color: NEON.cyan, glow: NEON.cyan });
      }
      if (state.handLost && countdown.done && !state.dying) {
        drawHandLostBanner(ctx, W, H, "Hand not detected — show hand to fly");
      }

      drawBanners();
      flash.draw(ctx, W, H);
      countdown.draw(ctx, W, H);
      ctx.restore();
    }

    let raf = null;
    let running = true;
    let deathTimer = null;

    const fixed = createFixedStep(update);

    function step(ts) {
      if (!state.paused) {
        countdown.update();
        fixed.tick(ts);
      } else {
        fixed.reset(); // don't accumulate time across a pause
      }
      draw();
      if (running) raf = requestAnimationFrame(step);
    }
    raf = requestAnimationFrame(step);

    return {
      pause() { state.paused = true; music.stop(); },
      resume() {
        state.paused = false;
        if (!state.dying) music.start();
      },
      unmount() {
        running = false;
        music.stop();
        if (raf) cancelAnimationFrame(raf);
        clearTimeout(deathTimer);
        unsub();
        rand = Math.random; // don't leak the daily seed into the next mount
      },
    };
  },
};
