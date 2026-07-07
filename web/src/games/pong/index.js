import {
  NEON, setupCanvas, createParticles, createShake, createFlash,
  createCountdown, createFixedStep, createMusic, drawHudText, drawHandLostBanner,
  drawLives, hudFont, sfx,
} from "../../core/gameKit.js";

const W = 800;
const H = 500;
const PADDLE_W = 14;
const PADDLE_H = 100;
const PADDLE_X = 30;
const AI_X = W - 30 - PADDLE_W;
const BALL_R = 9;

const SERVE_SPEED = 6.5;
const MAX_SPEED = 15;        // |vx| cap on normal returns
const SMASH_MAX = 19;        // pinch smash may exceed the normal cap
const MAX_VY = 9;
const SERVE_FRAMES = 50;
const BANNER_FRAMES = 90;
const MAX_BALLS = 3;

const ORB_R = 15;
const ORB_TTL = 10 * 60;
const GROW_FRAMES = 8 * 60;
const SLOW_FRAMES = 4 * 60;
const GHOST_FRAMES = 6 * 60;
const SHRINK_FRAMES = 8 * 60;

// Long rallies tire the AI: past this many player returns its aim noise grows
// each return, so no tier can stonewall forever.
const FATIGUE_START = 6;
const FATIGUE_PER_HIT = 0.3;
const FATIGUE_CAP = 3;

// OVERDRIVE: every 1000 score the match escalates so games actually end —
// faster ball, shorter player paddle, AI smash returns, AI denies orbs.
// Effects cap at level 5; the counter keeps climbing for bragging rights.
const OD_STEP = 1000;
const OD_FX_CAP = 5;
const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];

// Opponent ladder: every point past the AI ranks it up. err = aim noise in px
// (resampled on each player return), speed = paddle px/step. Reaching the top
// tier keeps the duel going endlessly at max difficulty.
const TIERS = [
  { name: "ROOKIE",    speed: 4.0, err: 70, color: NEON.accent },
  { name: "PLAYER",    speed: 5.0, err: 52, color: NEON.cyan },
  { name: "PRO",       speed: 6.0, err: 38, color: NEON.warn },
  { name: "ACE",       speed: 7.0, err: 27, color: NEON.magenta },
  { name: "MASTER",    speed: 8.2, err: 17, color: NEON.danger },
  { name: "NIGHTMARE", speed: 9.4, err: 9,  color: "#ffffff" },
];

const ORB_DEFS = {
  GROW:   { label: "W", color: NEON.cyan,    weight: 0.16 },
  SLOW:   { label: "S", color: NEON.magenta, weight: 0.16 },
  MULTI:  { label: "M", color: NEON.accent,  weight: 0.22 },
  SHRINK: { label: "−", color: NEON.warn,    weight: 0.18 },
  GHOST:  { label: "?", color: "#60a5fa",    weight: 0.16 },
  HEART:  { label: "+", color: NEON.danger,  weight: 0.12 },
};

function pickOrbType() {
  let r = Math.random();
  for (const [type, d] of Object.entries(ORB_DEFS)) {
    if ((r -= d.weight) <= 0) return type;
  }
  return "MULTI";
}

function makeBall(x, y, vx, vy, lastHit = null) {
  return { x, y, vx, vy, lastHit, trail: [] };
}

export default {
  async mount({ canvas, onHandUpdate, handState, onScore }) {
    const ctx = setupCanvas(canvas, W, H);

    const particles = createParticles();
    const shake = createShake();
    const flash = createFlash();
    const music = createMusic();
    const countdown = createCountdown((label) => (label === "GO" ? sfx.go() : sfx.tick()));

    const state = {
      paddleY: H / 2 - PADDLE_H / 2,
      targetY: H / 2 - PADDLE_H / 2,
      prevPaddleY: H / 2 - PADDLE_H / 2,
      aiY: H / 2 - PADDLE_H / 2,
      aiNoise: 0,
      balls: [makeBall(W / 2, H / 2, 0, 0)],
      serveT: SERVE_FRAMES,
      serveDir: -1,           // first serve comes to the player
      score: 0,
      points: 0,              // times the AI was beaten → tier index
      combo: 0,               // player returns in the current rally
      bestCombo: 0,
      lives: 3,
      pinch: false,
      orb: null,
      orbTimer: 6 * 60,
      growFrames: 0,
      slowFrames: 0,
      ghostFrames: 0,
      shrinkFrames: 0,
      odLevel: 0,
      popups: [],
      banner: null,           // { text, color, t }
      musicOn: false,
      dying: false,
      paused: false,
      handLost: !handState.isDetected,
    };

    const unsub = onHandUpdate((s) => {
      state.handLost = !s.isDetected;
      if (s.isDetected) {
        state.targetY = s.y * H - playerH() / 2;
        state.pinch = s.pinch;
      }
    });

    let raf = null;
    let running = true;
    let deathTimer = null;

    const tier = () => TIERS[Math.min(state.points, TIERS.length - 1)];
    const odFx = () => Math.min(state.odLevel, OD_FX_CAP);
    const odBoost = () => 1 + 0.08 * odFx();          // ball speed multiplier
    const playerH = () =>
      PADDLE_H * (state.growFrames > 0 ? 1.5 : 1) * (1 - 0.06 * odFx());
    const aiH = () => (state.shrinkFrames > 0 ? PADDLE_H * 0.6 : PADDLE_H);

    function updateMusic() {
      music.setIntensity(Math.min(1,
        0.3 + Math.min(state.points, TIERS.length - 1) * 0.14 + state.odLevel * 0.2));
    }

    function popup(text, x, y, color, size = 15) {
      state.popups.push({ text, x, y, color, size, life: 55, maxLife: 55 });
    }

    function setBanner(text, color) {
      state.banner = { text, color, t: BANNER_FRAMES };
    }

    function startServe(dir) {
      state.serveT = SERVE_FRAMES;
      state.serveDir = dir;
      state.balls = [makeBall(W / 2, H / 2, 0, 0)];
      state.combo = 0;
      state.slowFrames = 0;
      state.ghostFrames = 0;
    }

    // Predicted ball y at the AI plane, folding wall bounces.
    function predictY(b) {
      const frames = (AI_X - BALL_R - b.x) / b.vx;
      let y = b.y + b.vy * frames - BALL_R;
      const span = H - 2 * BALL_R;
      y = ((y % (2 * span)) + 2 * span) % (2 * span);
      return (y > span ? 2 * span - y : y) + BALL_R;
    }

    // Rally fatigue + ghost ball both blow up the AI's aim.
    function aiErrMul() {
      const fatigue = Math.min(FATIGUE_CAP, 1 + Math.max(0, state.combo - FATIGUE_START) * FATIGUE_PER_HIT);
      const ghost = state.ghostFrames > 0 ? 2.5 : 1;
      return fatigue * ghost;
    }

    function resampleAiNoise(smash, b) {
      const speedFrac = Math.min(1, Math.abs(b.vx) / MAX_SPEED);
      const mag = tier().err * (0.5 + speedFrac) * (smash ? 2.1 : 1) * aiErrMul();
      state.aiNoise = (Math.random() * 2 - 1) * Math.min(mag, 200);
    }

    function spawnOrb() {
      const a = Math.random() * Math.PI * 2;
      const sp = 0.5 + Math.random() * 0.8;
      state.orb = {
        x: W * (0.35 + Math.random() * 0.3),
        y: 70 + Math.random() * (H - 140),
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        type: pickOrbType(),
        ttl: ORB_TTL,
      };
    }

    function collectOrb(o, b) {
      sfx.powerup();
      flash.trigger(NEON.accent, 0.08);
      particles.burst(o.x, o.y, { count: 16, color: ORB_DEFS[o.type].color, speed: 3.5, life: 35, size: 3 });
      switch (o.type) {
        case "GROW":
          state.growFrames = GROW_FRAMES;
          popup("PADDLE +", o.x, o.y, NEON.cyan);
          break;
        case "SLOW":
          state.slowFrames = SLOW_FRAMES;
          popup("SLOW-MO", o.x, o.y, NEON.magenta);
          break;
        case "SHRINK":
          state.shrinkFrames = SHRINK_FRAMES;
          popup("AI SHRUNK", o.x, o.y, NEON.warn);
          break;
        case "GHOST":
          state.ghostFrames = GHOST_FRAMES;
          popup("GHOST BALL", o.x, o.y, "#60a5fa");
          break;
        case "MULTI":
          if (state.balls.length < MAX_BALLS) {
            state.balls.push(makeBall(b.x, b.y, b.vx, b.vy + (Math.random() < 0.5 ? 3 : -3), "player"));
            popup("MULTIBALL", o.x, o.y, NEON.accent, 17);
          } else {
            state.score += 25;
            popup("+25", o.x, o.y, NEON.accent);
          }
          break;
        case "HEART":
          if (state.lives < 3) {
            state.lives += 1;
            popup("+1 LIFE", o.x, o.y, NEON.danger);
          } else {
            state.score += 25;
            popup("+25", o.x, o.y, NEON.accent);
          }
          break;
      }
    }

    // A ball beat the AI. Rally keeps going if other balls are still live.
    function playerPoint(b) {
      const prevTier = tier();
      state.points += 1;
      const gain = 50 + state.combo * 3;
      state.score += gain;
      sfx.score();
      shake.add(0.25);
      flash.trigger(NEON.accent, 0.12);
      particles.burst(W, b.y, { count: 26, color: NEON.accent, speed: 5, life: 45, size: 4, angle: Math.PI, spread: Math.PI * 0.8 });
      popup(`+${gain}`, W - 90, b.y, NEON.accent, 18);
      const t = tier();
      if (t !== prevTier) {
        sfx.levelUp();
        setBanner(`VS ${t.name}`, t.color);
        updateMusic();
      } else {
        setBanner("POINT!", NEON.accent);
      }
      if (state.balls.length === 0) startServe(-1); // winner receives the serve
    }

    // Last ball escaped on the player's side.
    function loseLife(y) {
      state.lives -= 1;
      sfx.explode();
      shake.add(0.5);
      flash.trigger(NEON.danger, 0.28);
      particles.burst(0, y, { count: 30, color: NEON.danger, speed: 5, life: 50, size: 4 });
      if (state.lives <= 0) {
        state.dying = true;
        state.balls = [];
        sfx.lose();
        deathTimer = setTimeout(() => { if (running) onScore(state.score); }, 700);
      } else {
        startServe(1); // breathing room: next serve goes to the AI
      }
    }

    const fixed = createFixedStep(update);

    function step(ts) {
      if (!state.paused) {
        countdown.update();
        fixed.tick(ts);
      } else {
        fixed.reset();
      }
      draw();
      if (running) raf = requestAnimationFrame(step);
    }

    function update() {
      state.prevPaddleY = state.paddleY;
      state.paddleY += (state.targetY - state.paddleY) * 0.25;
      state.paddleY = Math.max(0, Math.min(H - playerH(), state.paddleY));
      const pvy = state.paddleY - state.prevPaddleY;

      particles.update();
      shake.update();
      flash.update();
      for (let i = state.popups.length - 1; i >= 0; i--) {
        const p = state.popups[i];
        p.y -= 0.7;
        if (--p.life <= 0) state.popups.splice(i, 1);
      }
      if (state.banner && --state.banner.t <= 0) state.banner = null;
      if (state.growFrames > 0) state.growFrames -= 1;
      if (state.slowFrames > 0) state.slowFrames -= 1;
      if (state.ghostFrames > 0) state.ghostFrames -= 1;
      if (state.shrinkFrames > 0) state.shrinkFrames -= 1;

      if (!countdown.done || state.dying) return;

      if (!state.musicOn) {
        state.musicOn = true;
        music.setIntensity(0.3);
        music.start();
        setBanner(`VS ${tier().name}`, tier().color);
      }

      // OVERDRIVE escalation — fires each time the score crosses a 1000 step
      const lvl = Math.floor(state.score / OD_STEP);
      if (lvl > state.odLevel) {
        state.odLevel = lvl;
        sfx.bigExplode();
        flash.trigger(NEON.danger, 0.2);
        shake.add(0.35);
        setBanner(`OVERDRIVE ${ROMAN[Math.min(lvl - 1, ROMAN.length - 1)]}`, NEON.danger);
        updateMusic();
      }

      // Serve: ball pulses at center, then launches toward serveDir.
      if (state.serveT > 0) {
        state.serveT -= 1;
        if (state.serveT === 0) {
          const b = state.balls[0];
          b.vx = SERVE_SPEED * odBoost() * state.serveDir;
          b.vy = (Math.random() * 2 - 1) * 3.5;
          resampleAiNoise(false, b);
        }
      }

      // Orb lifecycle — orbs drift and bounce around midfield
      if (state.orb) {
        const o = state.orb;
        o.x += o.vx;
        o.y += o.vy;
        if (o.x < W * 0.28 || o.x > W * 0.72) o.vx *= -1;
        if (o.y < 50 || o.y > H - 50) o.vy *= -1;
        if (--o.ttl <= 0) state.orb = null;
      } else if (--state.orbTimer <= 0) {
        spawnOrb();
        state.orbTimer = 420 + Math.random() * 300;
      }

      const slowMul = state.slowFrames > 0 ? 0.65 : 1;
      const pH = playerH();
      const pPlane = PADDLE_X + PADDLE_W;
      const aH = aiH();

      for (let i = state.balls.length - 1; i >= 0; i--) {
        const b = state.balls[i];
        const prevX = b.x;
        const prevY = b.y;

        if (state.serveT === 0) {
          b.x += b.vx * slowMul;
          b.y += b.vy * slowMul;
          b.trail.push({ x: b.x, y: b.y });
          const trailLen = Math.round(8 + Math.hypot(b.vx, b.vy) * 0.8);
          while (b.trail.length > trailLen) b.trail.shift();
        }

        // Walls
        if (b.y < BALL_R) {
          b.y = BALL_R; b.vy *= -1;
          sfx.bounce();
          particles.burst(b.x, 0, { count: 6, color: NEON.cyan, speed: 2, life: 25, size: 2 });
        } else if (b.y > H - BALL_R) {
          b.y = H - BALL_R; b.vy *= -1;
          sfx.bounce();
          particles.burst(b.x, H, { count: 6, color: NEON.cyan, speed: 2, life: 25, size: 2 });
        }

        // Orb pickup — only the player's shot collects it; in OVERDRIVE an
        // AI-hit ball destroys the orb instead (denial pressure)
        if (state.orb) {
          const o = state.orb;
          if (Math.hypot(b.x - o.x, b.y - o.y) < ORB_R + BALL_R) {
            if (b.lastHit === "player") {
              collectOrb(o, b);
              state.orb = null;
            } else if (b.lastHit === "ai" && state.odLevel > 0) {
              state.orb = null;
              popup("DENIED", o.x, o.y, NEON.muted, 12);
              particles.burst(o.x, o.y, { count: 10, color: NEON.muted, speed: 2.5, life: 25, size: 2 });
            }
          }
        }

        // Player paddle — swept check so fast balls can't tunnel through
        if (b.vx < 0 && prevX - BALL_R >= pPlane && b.x - BALL_R < pPlane) {
          const f = (prevX - BALL_R - pPlane) / Math.max(0.001, prevX - b.x);
          const yAt = prevY + (b.y - prevY) * f;
          if (yAt > state.paddleY - BALL_R && yAt < state.paddleY + pH + BALL_R) {
            const smash = state.pinch && !state.handLost;
            b.x = pPlane + BALL_R;
            b.y = yAt;
            let sp = Math.min(Math.abs(b.vx) * 1.05 + 0.15, MAX_SPEED * odBoost());
            if (smash) sp = Math.min(sp * 1.45, SMASH_MAX * odBoost());
            b.vx = sp;
            const rel = (yAt - (state.paddleY + pH / 2)) / (pH / 2);
            b.vy = Math.max(-MAX_VY, Math.min(MAX_VY, rel * 4 + pvy * 0.4));
            state.combo += 1;
            state.bestCombo = Math.max(state.bestCombo, state.combo);
            const gain = 2 + state.combo + (smash ? 8 : 0);
            state.score += gain;
            b.lastHit = "player";
            resampleAiNoise(smash, b);
            sfx.hit();
            shake.add(smash ? 0.3 : 0.12);
            flash.trigger(smash ? "#ffffff" : NEON.accent, smash ? 0.12 : 0.06);
            particles.burst(pPlane, yAt, {
              count: smash ? 24 : 14, color: smash ? "#ffffff" : NEON.accent,
              speed: smash ? 6 : 4, life: 35, size: 3, angle: 0, spread: Math.PI * 0.9,
            });
            popup(smash ? "SMASH!" : `+${gain}`, pPlane + 30, yAt, smash ? "#ffffff" : NEON.accent, smash ? 18 : 13);
          }
        }

        // AI paddle — same swept check on the right plane
        if (b.vx > 0 && prevX + BALL_R <= AI_X && b.x + BALL_R > AI_X) {
          const f = (AI_X - (prevX + BALL_R)) / Math.max(0.001, b.x - prevX);
          const yAt = prevY + (b.y - prevY) * f;
          if (yAt > state.aiY - BALL_R && yAt < state.aiY + aH + BALL_R) {
            b.x = AI_X - BALL_R;
            b.y = yAt;
            // In OVERDRIVE the AI smashes back sometimes — its win condition
            const aiSmash = state.odLevel > 0 &&
              Math.random() < Math.min(0.12 + 0.05 * state.odLevel, 0.45);
            let sp = Math.min(Math.abs(b.vx) * 1.03, MAX_SPEED * odBoost());
            if (aiSmash) sp = Math.min(sp * 1.4, SMASH_MAX * odBoost());
            b.vx = -sp;
            const rel = (yAt - (state.aiY + aH / 2)) / (aH / 2);
            b.vy = Math.max(-MAX_VY, Math.min(MAX_VY, rel * 3.4));
            b.lastHit = "ai";
            if (aiSmash) {
              sfx.shoot();
              shake.add(0.2);
              flash.trigger(NEON.danger, 0.08);
              popup("AI SMASH!", AI_X - 50, yAt, NEON.danger, 16);
              particles.burst(AI_X, yAt, {
                count: 20, color: NEON.danger, speed: 5, life: 32, size: 3,
                angle: Math.PI, spread: Math.PI * 0.9,
              });
            } else {
              sfx.bounce();
              particles.burst(AI_X, yAt, {
                count: 10, color: tier().color, speed: 3, life: 28, size: 2.5,
                angle: Math.PI, spread: Math.PI * 0.9,
              });
            }
          }
        }

        // Goals
        if (b.x - BALL_R > W) {
          state.balls.splice(i, 1);
          playerPoint(b);
          continue;
        }
        if (b.x + BALL_R < 0) {
          state.balls.splice(i, 1);
          if (state.balls.length === 0) {
            loseLife(b.y);
          } else {
            // multiball mercy: a stray ball out on your side costs no life
            shake.add(0.15);
            particles.burst(0, b.y, { count: 12, color: NEON.danger, speed: 3, life: 30, size: 3 });
            popup("BALL LOST", 90, b.y, NEON.danger, 12);
          }
          continue;
        }
      }

      // AI movement: chases whichever incoming ball reaches it first (plus aim
      // noise), drifts back to center otherwise. Tier caps its speed.
      const t = tier();
      let threat = null;
      let bestEta = Infinity;
      if (state.serveT === 0) {
        for (const b of state.balls) {
          if (b.vx <= 0) continue;
          const eta = (AI_X - b.x) / b.vx;
          if (eta < bestEta) { bestEta = eta; threat = b; }
        }
      }
      let aiTarget = H / 2 - aH / 2;
      if (threat) aiTarget = predictY(threat) + state.aiNoise - aH / 2;
      aiTarget = Math.max(0, Math.min(H - aH, aiTarget));
      const dy = aiTarget - state.aiY;
      state.aiY += Math.max(-t.speed, Math.min(t.speed, dy * 0.2));
    }

    function draw() {
      ctx.save();
      shake.apply(ctx);

      ctx.fillStyle = NEON.canvas;
      ctx.fillRect(-20, -20, W + 40, H + 40);

      // Subtle court grid
      ctx.strokeStyle = "rgba(74,222,128,0.04)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = 50; x < W; x += 50) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
      for (let y = 50; y < H; y += 50) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
      ctx.stroke();

      // Center line
      ctx.strokeStyle = "rgba(74,222,128,0.12)";
      ctx.setLineDash([8, 10]);
      ctx.beginPath();
      ctx.moveTo(W / 2, 0);
      ctx.lineTo(W / 2, H);
      ctx.stroke();
      ctx.setLineDash([]);

      // Power-up orb
      if (state.orb) {
        const o = state.orb;
        const def = ORB_DEFS[o.type];
        const pulse = 1 + Math.sin(performance.now() / 180) * 0.12;
        const fade = Math.min(1, o.ttl / 90);
        ctx.globalAlpha = fade;
        ctx.strokeStyle = def.color;
        ctx.shadowColor = def.color;
        ctx.shadowBlur = 12;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(o.x, o.y, ORB_R * pulse, 0, Math.PI * 2);
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.fillStyle = def.color;
        ctx.font = hudFont(11, 800);
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(def.label, o.x, o.y + 1);
        ctx.textBaseline = "alphabetic";
        ctx.globalAlpha = 1;
      }

      const ghost = state.ghostFrames > 0;

      // Ball trails
      for (const b of state.balls) {
        b.trail.forEach((p, i) => {
          let a = ((i + 1) / b.trail.length) * 0.35;
          if (ghost && p.x > W / 2) a *= 0.15;
          ctx.globalAlpha = a;
          ctx.fillStyle = state.slowFrames > 0 ? NEON.magenta : ghost ? "#60a5fa" : NEON.cyan;
          ctx.beginPath();
          ctx.arc(p.x, p.y, BALL_R * ((i + 1) / b.trail.length) * 0.8, 0, Math.PI * 2);
          ctx.fill();
        });
      }
      ctx.globalAlpha = 1;

      // Player paddle (grows with the GROW orb, warns on hand loss, glows on pinch)
      const pH = playerH();
      const padColor = state.handLost ? NEON.warn : state.pinch ? "#ffffff" : NEON.accent;
      ctx.fillStyle = padColor;
      ctx.shadowColor = padColor;
      ctx.shadowBlur = state.pinch && !state.handLost ? 26 : 16;
      ctx.beginPath();
      ctx.roundRect(PADDLE_X, state.paddleY, PADDLE_W, pH, 6);
      ctx.fill();
      ctx.shadowBlur = 0;

      // AI paddle — tinted by tier, shrinks under the SHRINK orb
      const aH = aiH();
      ctx.fillStyle = tier().color;
      ctx.shadowColor = tier().color;
      ctx.shadowBlur = 16;
      ctx.beginPath();
      ctx.roundRect(AI_X, state.aiY, PADDLE_W, aH, 6);
      ctx.fill();
      ctx.shadowBlur = 0;

      // Balls — glow scales with speed; ghost balls fade on the AI half
      if (!state.dying) {
        const serving = state.serveT > 0;
        for (const b of state.balls) {
          const spd = Math.hypot(b.vx, b.vy);
          const pulse = serving ? 1 + Math.sin(performance.now() / 120) * 0.2 : 1;
          const faded = ghost && b.x > W / 2;
          ctx.globalAlpha = faded ? 0.1 : 1;
          ctx.fillStyle = "#fff";
          ctx.shadowColor = spd > 12 ? "#ffffff" : NEON.cyan;
          ctx.shadowBlur = faded ? 0 : 10 + spd * 1.2;
          ctx.beginPath();
          ctx.arc(b.x, b.y, BALL_R * pulse, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0;
          ctx.globalAlpha = 1;
        }

        // Serve direction chevrons
        if (serving && countdown.done) {
          const d = state.serveDir;
          const sy = state.balls[0].y;
          ctx.fillStyle = NEON.muted;
          ctx.globalAlpha = 0.4 + Math.sin(performance.now() / 150) * 0.3;
          for (let i = 1; i <= 3; i++) {
            const cx = W / 2 + d * (BALL_R + 14 + i * 14);
            ctx.beginPath();
            ctx.moveTo(cx, sy - 7);
            ctx.lineTo(cx + d * 7, sy);
            ctx.lineTo(cx, sy + 7);
            ctx.closePath();
            ctx.fill();
          }
          ctx.globalAlpha = 1;
        }
      }

      particles.draw(ctx);

      // Floating score popups
      for (const p of state.popups) {
        ctx.globalAlpha = Math.min(1, p.life / (p.maxLife * 0.5));
        ctx.font = hudFont(p.size, 800);
        ctx.textAlign = "center";
        ctx.fillStyle = p.color;
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 8;
        ctx.fillText(p.text, p.x, p.y);
        ctx.shadowBlur = 0;
      }
      ctx.globalAlpha = 1;

      // HUD
      drawHudText(ctx, `SCORE ${state.score}`, 20, 32, { size: 16, glow: NEON.accent });
      drawHudText(ctx, `VS ${tier().name}`, W / 2, 32, { size: 14, align: "center", color: tier().color, glow: tier().color });
      if (state.odLevel > 0) {
        drawHudText(ctx, `OVERDRIVE ${ROMAN[Math.min(state.odLevel - 1, ROMAN.length - 1)]}`,
          W / 2, 50, { size: 10, align: "center", color: NEON.danger, glow: NEON.danger });
      }
      drawLives(ctx, state.lives, W - 20, 26);

      // Active-effect readout (seconds left)
      const fx = [];
      if (state.growFrames > 0) fx.push(`WIDE ${Math.ceil(state.growFrames / 60)}s`);
      if (state.slowFrames > 0) fx.push(`SLOW ${Math.ceil(state.slowFrames / 60)}s`);
      if (state.ghostFrames > 0) fx.push(`GHOST ${Math.ceil(state.ghostFrames / 60)}s`);
      if (state.shrinkFrames > 0) fx.push(`AI− ${Math.ceil(state.shrinkFrames / 60)}s`);
      if (fx.length) {
        drawHudText(ctx, fx.join(" · "), 20, 52, { size: 10, color: NEON.muted });
      }

      if (state.combo >= 3) {
        const tired = state.combo > FATIGUE_START;
        drawHudText(ctx, tired ? `RALLY x${state.combo} — RIVAL TIRING` : `RALLY x${state.combo}`,
          W / 2, H - 16, { size: 13, align: "center", color: tired ? NEON.warn : NEON.cyan, glow: tired ? NEON.warn : NEON.cyan });
      }

      // Big center banner (POINT! / VS TIER)
      if (state.banner) {
        const a = Math.min(1, state.banner.t / 30);
        ctx.globalAlpha = a;
        drawHudText(ctx, state.banner.text, W / 2, H / 2 - 60, {
          size: 40, align: "center", color: state.banner.color, glow: state.banner.color, weight: 900,
        });
        ctx.globalAlpha = 1;
      }

      if (state.handLost && countdown.done && !state.dying) {
        drawHandLostBanner(ctx, W, H, "Hand not detected — paddle frozen");
      }

      flash.draw(ctx, W, H);
      countdown.draw(ctx, W, H);
      ctx.restore();
    }

    raf = requestAnimationFrame(step);

    return {
      pause() {
        state.paused = true;
        music.stop();
      },
      resume() {
        state.paused = false;
        if (state.musicOn) music.start();
      },
      unmount() {
        running = false;
        if (raf) cancelAnimationFrame(raf);
        clearTimeout(deathTimer);
        music.stop();
        unsub();
      },
    };
  },
};
