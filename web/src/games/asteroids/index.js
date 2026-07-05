import {
  NEON, setupCanvas, createParticles, createShake, createFlash,
  createCountdown, createFixedStep, STEP_MS, drawHudText, drawHandLostBanner, drawLives, sfx, hudFont,
} from "../../core/gameKit.js";

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
const BOSS_EVERY = 3;             // boss wave every N levels
const BOSS_NAMES = ["DREADCLAW", "BONE HARROW", "VOID SEER"]; // boss1/2/3.png
const TRIPLE_DUR = 540;           // frames (~9 s)
const COMBO_WINDOW = 110;         // frames to keep the chain alive
const BANNER_FRAMES = 150;
const CLEAR_FRAMES = 130;
const MAX_LIVES = 4;

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

const ASSET_BASE = "/assets/asteroids/";

function randRange(a, b) { return a + Math.random() * (b - a); }
function wrap(v, max) { return ((v % max) + max) % max; }
function lerpAngle(a, b, t) {
  const d = ((b - a + Math.PI) % TAU + TAU) % TAU - Math.PI;
  return a + d * t;
}

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
  const angle = Math.random() * TAU;
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
    const a = Math.random() * TAU, d = randRange(0.15, 0.55) * R;
    return { x: Math.cos(a) * d, y: Math.sin(a) * d, r: randRange(0.12, 0.24) * R };
  });
  return {
    x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
    rot: Math.random() * TAU, rotSpeed: randRange(-0.02, 0.02) * (size === "comet" ? 4 : 1),
    size, shape, craters, rockSeed: (Math.random() * 3) | 0,
  };
}

function edgePos() {
  const edge = (Math.random() * 4) | 0;
  if (edge === 0) return { x: Math.random() * W, y: -50 };
  if (edge === 1) return { x: Math.random() * W, y: H + 50 };
  if (edge === 2) return { x: -50, y: Math.random() * H };
  return { x: W + 50, y: Math.random() * H };
}

function buildWave(level, ship) {
  const arr = [];
  const nLarge = Math.min(2 + level, 8);
  for (let i = 0; i < nLarge; i++) {
    let x, y;
    do { x = Math.random() * W; y = Math.random() * H; }
    while (Math.hypot(x - ship.x, y - ship.y) < 180);
    arr.push(makeAsteroid("large", x, y, level));
  }
  const nComets = level >= 3 ? Math.min(level - 2, 4) : 0;
  for (let i = 0; i < nComets; i++) {
    const p = edgePos();
    arr.push(makeAsteroid("comet", p.x, p.y, level));
  }
  return arr;
}

function isBossLevel(n) { return n % BOSS_EVERY === 0; }

function makeBosses(level) {
  const tier = level / BOSS_EVERY;            // 1, 2, 3, … drives hp/fire rate
  const count = 1 + Math.floor(level / 15);   // 2 bosses from level 15, 3 from 30…
  const idx = (tier - 1) % BOSS_NAMES.length; // rotate sprite/name every boss wave
  return Array.from({ length: count }, (_, i) => ({
    idx,
    name: BOSS_NAMES[idx],
    x: W * ((i + 1) / (count + 1)),
    baseX: W * ((i + 1) / (count + 1)),
    y: -110,
    hoverY: 118,
    t: Math.random() * 1000,
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
  const dir = Math.random() < 0.5 ? 1 : -1;
  return {
    x: dir > 0 ? -40 : W + 40,
    baseY: randRange(70, H - 170),
    y: 0, vx: dir * 1.7, t: 0, hp: 3, shootT: 0, r: 19,
  };
}

export default {
  async mount({ canvas, onHandUpdate, handState, onScore }) {
    const ctx = setupCanvas(canvas, W, H);

    const particles = createParticles();
    const shake = createShake();
    const flash = createFlash();
    const countdown = createCountdown((label) => (label === "GO" ? sfx.go() : sfx.tick()));

    // Optional art — loads in the background, procedural fallbacks
    // render immediately so the game never waits on files.
    const assets = {
      ship: null, bgs: LEVELS.map(() => null), rocks: [],
      bosses: [null, null, null], pfire: null, efire: null, life: null,
    };
    loadFirst([`${ASSET_BASE}life.png`, `${ASSET_BASE}life.webp`]).then((img) => { assets.life = img; });
    loadFirst(withExts("ship").reverse()).then((img) => { assets.ship = img; }); // prefer png/webp
    loadFirst([`${ASSET_BASE}playerfire.png`, `${ASSET_BASE}playerfire.webp`]).then((img) => { assets.pfire = img; });
    loadFirst([`${ASSET_BASE}enemyfire.png`, `${ASSET_BASE}enemyfire.webp`]).then((img) => { assets.efire = img; });
    BOSS_NAMES.forEach((_, i) => {
      loadFirst([`${ASSET_BASE}boss${i + 1}.png`, `${ASSET_BASE}boss${i + 1}.webp`])
        .then((img) => { assets.bosses[i] = img; });
    });
    LEVELS.forEach((_, i) => {
      loadFirst(withExts(`bg${i + 1}`)).then((img) => { assets.bgs[i] = img; });
    });
    for (let i = 1; i <= 3; i++) {
      loadFirst([`${ASSET_BASE}asteroid${i}.png`, `${ASSET_BASE}asteroid${i}.webp`])
        .then((img) => { if (img) assets.rocks.push(img); });
    }

    const ship = {
      x: W / 2, y: H / 2,
      targetX: W / 2, targetY: H / 2,
      prevX: W / 2, prevY: H / 2,
      aim: -Math.PI / 2,
    };

    const state = {
      ship,
      asteroids: [],
      bullets: [],
      enemyBullets: [],
      powerups: [],
      bosses: [],
      ufo: null,
      ufoT: 0,
      score: 0,
      lives: 3,
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
      invincible: 0,        // frames
      dying: false,
      paused: false,
      pinch: false,
      handLost: !handState.isDetected,
    };

    const unsub = onHandUpdate((s) => {
      state.handLost = !s.isDetected;
      state.pinch = !!s.pinch;
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
      state.asteroids = boss ? [] : buildWave(n, ship);
      state.bosses = boss ? makeBosses(n) : [];
      if (boss) flash.trigger(NEON.danger, 0.12);
      state.enemyBullets.length = 0;
      state.ufo = null;
      state.ufoT = 0;
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
      state.comboT = COMBO_WINDOW;
      state.score += base * comboMult();
    }

    function nearestTarget() {
      let best = null, bestD = Infinity;
      for (const a of state.asteroids) {
        const d = Math.hypot(a.x - ship.x, a.y - ship.y);
        if (d < bestD) { bestD = d; best = a; }
      }
      if (state.ufo) {
        const d = Math.hypot(state.ufo.x - ship.x, state.ufo.y - ship.y);
        if (d < bestD) { bestD = d; best = state.ufo; }
      }
      for (const b of state.bosses) {
        const d = Math.hypot(b.x - ship.x, b.y - ship.y);
        if (d < bestD) { bestD = d; best = b; }
      }
      return best;
    }

    function fire() {
      const target = nearestTarget();
      if (!target) return;
      const a = Math.atan2(target.y - ship.y, target.x - ship.x);
      const angles = state.tripleT > 0 ? [a - 0.22, a, a + 0.22] : [a];
      for (const ang of angles) {
        state.bullets.push({
          x: ship.x + Math.cos(ang) * (SHIP_RADIUS + 6),
          y: ship.y + Math.sin(ang) * (SHIP_RADIUS + 6),
          vx: Math.cos(ang) * BULLET_SPEED,
          vy: Math.sin(ang) * BULLET_SPEED,
          life: BULLET_LIFE,
        });
      }
      sfx.shoot();
    }

    function maybeDrop(x, y, chance = 0.14) {
      if (Math.random() > chance) return;
      const r = Math.random();
      let type = r < 0.42 ? "shield" : r < 0.84 ? "triple" : "life";
      if (type === "life" && state.lives >= MAX_LIVES) type = "triple";
      state.powerups.push({
        x, y, vx: randRange(-0.4, 0.4), vy: randRange(-0.4, 0.4),
        type, life: 520, t: 0,
      });
    }

    function breakAsteroid(idx) {
      const a = state.asteroids[idx];
      state.asteroids.splice(idx, 1);
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

    function hitShip() {
      if (state.invincible > 0 || state.dying) return;
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
        sfx.bigExplode();
        particles.burst(ship.x, ship.y, { count: 40, color: NEON.warn, speed: 6, life: 55, size: 4 });
        deathTimer = setTimeout(() => { if (running) onScore(state.score); }, 800);
      } else {
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
      state.frame++;

      // Asteroids always drift (looks alive even while dying)
      for (const a of state.asteroids) {
        a.x = wrap(a.x + a.vx, W);
        a.y = wrap(a.y + a.vy, H);
        a.rot += a.rotSpeed;
      }

      particles.update();
      shake.update();
      flash.update();
      state.bgFade = Math.min(1, state.bgFade + 0.02);

      const dt = STEP_MS; // fixed 60 Hz step

      if (!countdown.done || state.dying) return;

      if (state.levelBanner > 0) state.levelBanner--;

      // Combo & powerup timers
      if (state.comboT > 0) { state.comboT--; if (state.comboT === 0) state.combo = 0; }
      if (state.tripleT > 0) state.tripleT--;

      // Ship movement
      ship.prevX = ship.x; ship.prevY = ship.y;
      ship.x += (ship.targetX - ship.x) * SHIP_SMOOTHING;
      ship.y += (ship.targetY - ship.y) * SHIP_SMOOTHING;
      ship.x = Math.max(SHIP_RADIUS, Math.min(W - SHIP_RADIUS, ship.x));
      ship.y = Math.max(SHIP_RADIUS, Math.min(H - SHIP_RADIUS, ship.y));

      // Aim: face nearest threat, else face travel direction
      const svx = ship.x - ship.prevX, svy = ship.y - ship.prevY;
      const speed = Math.hypot(svx, svy);
      const tgt = nearestTarget();
      const desired = tgt ? Math.atan2(tgt.y - ship.y, tgt.x - ship.x)
        : speed > 1 ? Math.atan2(svy, svx) : ship.aim;
      ship.aim = lerpAngle(ship.aim, desired, 0.12);

      // Engine trail
      if (speed > 0.5 && state.frame % 2 === 0) {
        particles.burst(
          ship.x - Math.cos(ship.aim) * (SHIP_RADIUS + 4),
          ship.y - Math.sin(ship.aim) * (SHIP_RADIUS + 4),
          { count: 1, color: "#fca14a", speed: 1.6, life: 16, size: 2.5, angle: ship.aim + Math.PI, spread: 0.5 },
        );
      }

      // Auto-fire — pinch for rapid fire
      state.sinceShot += dt;
      const interval = state.pinch ? FIRE_INTERVAL_PINCH : FIRE_INTERVAL;
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
          state.ufo.hp--;
          particles.burst(b.x, b.y, { count: 6, color: NEON.magenta, speed: 2.5, life: 25, size: 2.5 });
          sfx.hit();
          if (state.ufo.hp <= 0) {
            addScore(15);
            particles.burst(state.ufo.x, state.ufo.y, { count: 30, color: NEON.magenta, speed: 4.5, life: 50, size: 4 });
            shake.add(0.3);
            sfx.explode();
            maybeDrop(state.ufo.x, state.ufo.y, 0.6);
            state.ufo = null;
          }
          continue;
        }
        for (let k = state.bosses.length - 1; k >= 0; k--) {
          const bo = state.bosses[k];
          if (Math.hypot(b.x - bo.x, b.y - bo.y) < bo.r * 0.8) {
            state.bullets.splice(i, 1);
            bo.hp--;
            particles.burst(b.x, b.y, { count: 5, color: NEON.danger, speed: 2.5, life: 22, size: 2.5 });
            sfx.hit();
            if (bo.hp <= 0) {
              state.bosses.splice(k, 1);
              addScore(40);
              particles.burst(bo.x, bo.y, { count: 50, color: NEON.danger, speed: 6, life: 60, size: 5 });
              particles.burst(bo.x, bo.y, { count: 30, color: NEON.warn, speed: 4, life: 50, size: 4 });
              shake.add(0.6);
              flash.trigger(NEON.danger, 0.2);
              sfx.bigExplode();
              maybeDrop(bo.x - 20, bo.y, 1);
              maybeDrop(bo.x + 20, bo.y, 1);
            }
            continue outer;
          }
        }
        for (let j = state.asteroids.length - 1; j >= 0; j--) {
          const a = state.asteroids[j];
          // comets are tiny but fast — bigger bullet hitbox avoids tunneling
          const hitR = a.size === "comet" ? 14 : SIZES[a.size] * 0.85;
          if (Math.hypot(b.x - a.x, b.y - a.y) < hitR) {
            state.bullets.splice(i, 1);
            breakAsteroid(j);
            continue outer;
          }
        }
      }

      // Bosses
      for (const b of state.bosses) {
        b.t++;
        b.y += (b.hoverY - b.y) * 0.02;
        b.x = b.baseX + Math.sin(b.t * 0.008) * (W * 0.22 / state.bosses.length);
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
            });
          }
          sfx.shoot();
        }
        if (Math.hypot(ship.x - b.x, ship.y - b.y) < b.r * 0.8 + SHIP_HITBOX) hitShip();
      }

      // UFO (level 4+, never during boss fights)
      if (state.phase === "play" && state.level >= 4 && !state.ufo && !state.bosses.length) {
        state.ufoT += dt;
        if (state.ufoT >= UFO_EVERY) { state.ufoT = 0; state.ufo = makeUfo(); }
      }
      if (state.ufo) {
        const u = state.ufo;
        u.t++;
        u.x += u.vx;
        u.y = u.baseY + Math.sin(u.t * 0.025) * 36;
        u.shootT += dt;
        if (u.shootT >= UFO_SHOOT_EVERY && u.x > 20 && u.x < W - 20) {
          u.shootT = 0;
          const a = Math.atan2(ship.y - u.y, ship.x - u.x) + randRange(-0.12, 0.12);
          state.enemyBullets.push({ x: u.x, y: u.y + 8, vx: Math.cos(a) * 3.2, vy: Math.sin(a) * 3.2 });
          sfx.shoot();
        }
        if ((u.vx > 0 && u.x > W + 50) || (u.vx < 0 && u.x < -50)) state.ufo = null;
        else if (Math.hypot(ship.x - u.x, ship.y - u.y) < u.r + SHIP_HITBOX) hitShip();
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
        if (Math.hypot(b.x - ship.x, b.y - ship.y) < 5 + SHIP_HITBOX) {
          state.enemyBullets.splice(i, 1);
          hitShip();
        }
      }

      // Powerups
      for (let i = state.powerups.length - 1; i >= 0; i--) {
        const p = state.powerups[i];
        p.x = wrap(p.x + p.vx, W);
        p.y = wrap(p.y + p.vy, H);
        p.t++;
        p.life--;
        if (p.life <= 0) { state.powerups.splice(i, 1); continue; }
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
          if (Math.hypot(ship.x - a.x, ship.y - a.y) < SIZES[a.size] * 0.75 + SHIP_HITBOX) {
            hitShip();
            break;
          }
        }
      }

      // Wave cleared → level transition
      if (state.phase === "play" && state.asteroids.length === 0 && !state.ufo && state.bosses.length === 0) {
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

    function drawCover(img, alpha) {
      const s = Math.max(W / img.width, H / img.height);
      const dw = img.width * s, dh = img.height * s;
      ctx.globalAlpha = alpha;
      ctx.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh);
      ctx.globalAlpha = 1;
    }

    function bgFor(idx) {
      return assets.bgs[idx] || makeFallbackBg(idx);
    }

    function drawBackground() {
      if (state.bgFade < 1 && state.bgPrevIdx !== state.bgIdx) {
        drawCover(bgFor(state.bgPrevIdx), 1);
        drawCover(bgFor(state.bgIdx), state.bgFade);
      } else {
        drawCover(bgFor(state.bgIdx), 1);
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
        ctx.fillRect(((i * 97 + 13) + t * 0.12) % W, (i * 67 + 31) % H, 1, 1);
      }
      ctx.fillStyle = "rgba(255,255,255,0.45)";
      for (let i = 0; i < 20; i++) {
        ctx.fillRect(((i * 131 + 57) + t * 0.3) % W, (i * 89 + 17) % H, 2, 2);
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

    function drawUfo() {
      const u = state.ufo;
      if (!u) return;
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

    function drawBosses() {
      for (const b of state.bosses) {
        ctx.save();
        ctx.translate(b.x, b.y + Math.sin(b.t * 0.05) * 4);
        ctx.rotate(Math.sin(b.t * 0.02) * 0.06);
        const img = assets.bosses[b.idx];
        const d = b.r * 2.5;
        if (img) {
          ctx.drawImage(img, -d / 2, -d / 2, d, d);
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
      if (state.dying) return;
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

      if (assets.ship) {
        // sprite points UP → rotate aim + 90°
        ctx.rotate(ship.aim + Math.PI / 2);
        ctx.drawImage(assets.ship, -SHIP_DRAW / 2, -SHIP_DRAW / 2, SHIP_DRAW, SHIP_DRAW);
      } else {
        // vector fallback ship (nose toward +x before rotation)
        ctx.rotate(ship.aim);
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

      for (const p of state.powerups) drawPowerup(p);
      for (const a of state.asteroids) drawAsteroid(a);
      drawUfo();
      drawBosses();

      // player bullets — sprite points UP, rotate along velocity
      if (assets.pfire) {
        const bh = 24, bw = bh * (assets.pfire.width / assets.pfire.height);
        for (const b of state.bullets) {
          ctx.save();
          ctx.translate(b.x, b.y);
          ctx.rotate(Math.atan2(b.vy, b.vx) + Math.PI / 2);
          ctx.drawImage(assets.pfire, -bw / 2, -bh / 2, bw, bh);
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
      // enemy bullets
      if (assets.efire) {
        const bh = 26, bw = bh * (assets.efire.width / assets.efire.height);
        for (const b of state.enemyBullets) {
          ctx.save();
          ctx.translate(b.x, b.y);
          ctx.rotate(Math.atan2(b.vy, b.vx) + Math.PI / 2);
          ctx.drawImage(assets.efire, -bw / 2, -bh / 2, bw, bh);
          ctx.restore();
        }
      } else {
        ctx.fillStyle = NEON.danger;
        ctx.shadowColor = NEON.danger;
        ctx.shadowBlur = 8;
        for (const b of state.enemyBullets) {
          ctx.beginPath();
          ctx.arc(b.x, b.y, 4, 0, TAU);
          ctx.fill();
        }
        ctx.shadowBlur = 0;
      }

      drawShip();
      particles.draw(ctx);

      // HUD
      const mult = comboMult();
      drawHudText(ctx, `SCORE ${state.score}`, 14, 28, { size: 15, glow: NEON.accent });
      if (mult > 1) {
        drawHudText(ctx, `COMBO x${mult}`, 14, 48, { size: 12, color: NEON.magenta, glow: NEON.magenta });
      }
      drawHudText(ctx, `LV ${state.level}`, W / 2, 28, { size: 15, align: "center", color: NEON.muted });
      if (assets.life) {
        for (let i = 0; i < Math.max(0, state.lives); i++) {
          ctx.drawImage(assets.life, W - 16 - 20 - i * 23, 12, 20, 20);
        }
      } else {
        drawLives(ctx, Math.max(0, state.lives), W - 16, 22);
      }
      drawBossBars();

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
      pause() { state.paused = true; },
      resume() { state.paused = false; },
      unmount() {
        running = false;
        if (raf) cancelAnimationFrame(raf);
        clearTimeout(deathTimer);
        unsub();
      },
    };
  },
};
