// BEAT PULSE — hand-tracking rhythm game. Orbs spawn on a 120 BPM grid with a
// shrinking approach ring: be on the orb when the ring closes. Stars need a
// pinch, shock orbs must be dodged, hold notes are followed along a path.
// Combos build a multiplier; combo ≥ 24 ignites FEVER (score ×2, music wide
// open) until the first miss. HP gates the run — empty bar ends it.
// Music comes from ./music.js, scheduled on the same song clock as the notes,
// so the kick lands exactly when a ring closes.
import {
  NEON, setupCanvas, createParticles, createShake, createFlash,
  createCountdown, createFixedStep, STEP_MS, drawHudText, drawHandLostBanner, sfx,
} from "../../core/gameKit.js";
import { createBeatMusic, BEAT } from "./music.js";

const W = 800;
const H = 550;
const TAU = Math.PI * 2;

const FIELD = { x0: 80, y0: 95, x1: W - 80, y1: H - 70 }; // note spawn area
const NOTE_R = 42;           // tap/star body radius (hit test uses +8 grace)
const HOLD_R = NOTE_R * 1.35; // follow tolerance on hold paths
const SHOCK_R = 78;

// Judgement windows (s) around a note's time t — tuned for camera latency:
// inside the orb during [t−0.10, t+0.12] → PERFECT, until t+0.30 → GOOD.
// A fresh pinch inside the orb commits the hit early ("snap") from t−0.65;
// grade is |Δt| either way, so snapping far ahead trades PERFECT for GOOD.
const EARLY = 0.10;
const PERFECT_LATE = 0.12;
const LATE = 0.30;
const PINCH_EARLY = 0.9;
const STAR_EARLY = 0.15;     // pinch stars get a wider window
const STAR_LATE = 0.35;

const APPROACH_BASE = 1.6;   // s the ring takes to close (shrinks per level)
const APPROACH_MIN = 1.15;
const LEVEL_EVERY = 20;      // seconds per level step
const FEVER_COMBO = 24;      // combo that ignites FEVER (×2 until a miss)

const NOTE_COLORS = [NEON.accent, NEON.cyan, NEON.magenta];

function randRange(a, b) { return a + Math.random() * (b - a); }
function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }

export default {
  async mount({ canvas, onHandUpdate, handState, onScore }) {
    const ctx = setupCanvas(canvas, W, H);

    const particles = createParticles();
    const shake = createShake();
    const flash = createFlash();
    const music = createBeatMusic();
    const countdown = createCountdown((label) => (label === "GO" ? sfx.go() : sfx.tick()));

    const state = {
      notes: [],
      fx: [],          // hit shockwaves {x, y, age, color}
      popups: [],      // floating judgement texts
      trail: [],       // cursor comet points {x, y, t}
      songTime: 0,     // song clock (s) — frozen while paused, drives everything
      score: 0,
      combo: 0,
      maxCombo: 0,
      hp: 100,
      level: 1,
      fever: false,
      comboFlash: 0,   // frames of combo pop animation
      px: W / 2, py: H / 2,
      pinch: false,
      pinchEdge: false, // fresh pinch (off→on) not yet spent on a note
      handLost: !handState.isDetected,
      started: false,  // music + judging live (after countdown)
      dying: false,
      paused: false,
    };

    const unsub = onHandUpdate((s) => {
      state.handLost = !s.isDetected;
      if (!s.isDetected) return;
      state.px = (1 - s.x) * W; // mirror to match the webcam preview
      state.py = s.y * H;
      if (s.pinch && !state.pinch) state.pinchEdge = true; // latched until the step consumes it
      state.pinch = s.pinch;
      state.trail.push({ x: state.px, y: state.py, t: performance.now() });
    });

    /* ── Pattern generator: phrases on the beat grid ────────────── */
    let genBeat = 4;                         // absolute beat of the next phrase
    let lastPos = { x: W / 2, y: H * 0.45 }; // random walk keeps notes reachable
    let colorIdx = 0;

    function nextPos(minD, maxD) {
      for (let i = 0; i < 12; i++) {
        const a = Math.random() * TAU;
        const d = randRange(minD, maxD);
        const x = lastPos.x + Math.cos(a) * d;
        const y = lastPos.y + Math.sin(a) * d;
        if (x > FIELD.x0 && x < FIELD.x1 && y > FIELD.y0 && y < FIELD.y1) {
          lastPos = { x, y };
          return lastPos;
        }
      }
      lastPos = { x: randRange(FIELD.x0, FIELD.x1), y: randRange(FIELD.y0, FIELD.y1) };
      return lastPos;
    }

    function pushTap(beat, minD, maxD) {
      const p = nextPos(minD, maxD);
      state.notes.push({
        type: "tap", t: beat * BEAT, x: p.x, y: p.y,
        color: NOTE_COLORS[colorIdx++ % NOTE_COLORS.length],
        done: false, result: null, doneAt: 0,
      });
    }

    // Each phrase fills whole beats and returns how many it consumed.
    function phraseTaps(level) {
      for (let b = 0; b < 4; b++) pushTap(genBeat + b, 130, 260 + level * 15);
      return 4;
    }
    function phraseEighths(level) {
      const n = level >= 4 ? 8 : 6; // tight stream — small hops on 8ths
      for (let i = 0; i < n; i++) pushTap(genBeat + i * 0.5, 55, 115);
      return n / 2;
    }
    function phraseZigzag() {
      for (let b = 0; b < 4; b++) {
        lastPos = {
          x: b % 2 ? randRange(FIELD.x1 - 120, FIELD.x1) : randRange(FIELD.x0, FIELD.x0 + 120),
          y: randRange(FIELD.y0, FIELD.y1),
        };
        pushTap(genBeat + b, 0, 0);
      }
      return 4;
    }
    function phraseHold(level) {
      const p = nextPos(120, 240);
      const q = nextPos(150, 260);
      state.notes.push({
        type: "hold", t: genBeat * BEAT, x: p.x, y: p.y, x2: q.x, y2: q.y,
        durBeats: 2, color: NOTE_COLORS[colorIdx++ % NOTE_COLORS.length],
        done: false, result: null, doneAt: 0,
        started: false, broken: false, goodT: 0, offT: 0, nextTick: 0.5,
      });
      pushTap(genBeat + 2.5, 120, 240 + level * 10);
      pushTap(genBeat + 3.5, 120, 240 + level * 10);
      return 4;
    }
    function phraseStar(level) {
      for (let b = 0; b < 3; b++) pushTap(genBeat + b, 130, 250 + level * 12);
      const p = nextPos(150, 260);
      state.notes.push({
        type: "star", t: (genBeat + 3) * BEAT, x: p.x, y: p.y,
        color: NEON.warn, done: false, result: null, doneAt: 0,
      });
      return 4;
    }
    function phraseShock(level) {
      pushTap(genBeat, 130, 250);
      pushTap(genBeat + 1, 110, 220);
      // shock detonates where the player just was — forces the evacuation
      state.notes.push({
        type: "shock", t: (genBeat + 2) * BEAT,
        x: lastPos.x + randRange(-40, 40), y: lastPos.y + randRange(-40, 40),
        done: false, fired: false, doneAt: 0,
      });
      pushTap(genBeat + 3, 190, 300 + level * 15);
      return 4;
    }

    function genPhrase(level) {
      const pool = [[phraseTaps, 3]];
      if (level >= 2) pool.push([phraseEighths, 2], [phraseShock, 2], [phraseHold, 2]);
      if (level >= 3) pool.push([phraseZigzag, 2], [phraseStar, 2]);
      let total = 0;
      for (const [, w] of pool) total += w;
      let r = Math.random() * total;
      let fn = pool[0][0];
      for (const [f, w] of pool) { r -= w; if (r <= 0) { fn = f; break; } }
      const consumed = fn(level);
      genBeat += consumed + (level < 3 ? 1 : 0); // early levels get a breather beat
    }

    /* ── Scoring ─────────────────────────────────────────────────── */
    const mult = () => 1 + Math.min(3, Math.floor(state.combo / 8));

    function addPopup(x, y, text, color, size = 16) {
      state.popups.push({ x, y, text, color, size, life: 55, maxLife: 55 });
    }

    function award(points) {
      state.score += points * mult() * (state.fever ? 2 : 1);
    }

    function bumpCombo() {
      state.combo++;
      state.maxCombo = Math.max(state.maxCombo, state.combo);
      state.comboFlash = 14;
      if (!state.fever && state.combo >= FEVER_COMBO) {
        state.fever = true;
        sfx.powerup();
        flash.trigger(NEON.magenta, 0.16);
        addPopup(W / 2, H / 2 - 60, "FEVER ×2", NEON.magenta, 26);
      }
    }

    function breakCombo() {
      state.combo = 0;
      if (state.fever) {
        state.fever = false;
        addPopup(W / 2, 120, "FEVER LOST", NEON.muted, 14);
      }
    }

    function damage(amount) {
      if (state.handLost) return; // no HP drain while the camera lost the hand
      state.hp -= amount;
      if (state.hp <= 0 && !state.dying) {
        state.hp = 0;
        state.dying = true;
        music.stop();
        sfx.lose();
        shake.add(0.5);
        deathTimer = setTimeout(() => { if (running) onScore(state.score); }, 900);
      }
    }

    function hitNote(n, grade, viaPinch = false) {
      n.done = true;
      n.result = grade;
      n.doneAt = state.songTime;
      bumpCombo();
      const perfect = grade === "perfect";
      award(perfect ? 3 : 1);
      state.hp = Math.min(100, state.hp + (perfect ? 2 : 1));
      state.fx.push({ x: n.x, y: n.y, age: 0, color: n.color });
      particles.burst(n.x, n.y, {
        count: perfect ? 16 : 9, color: n.color, speed: perfect ? 4.2 : 3, life: 34, size: 3,
      });
      addPopup(n.x, n.y - NOTE_R - 8, perfect ? "PERFECT" : viaPinch ? "SNAP" : "GOOD",
        perfect ? n.color : viaPinch ? NEON.cyan : NEON.text, perfect ? 17 : 14);
      if (perfect) sfx.score(); else sfx.hit();
      shake.add(perfect ? 0.05 : 0.02);
    }

    function missNote(n, hpLoss = 10) {
      n.done = true;
      n.result = "miss";
      n.doneAt = state.songTime;
      breakCombo();
      damage(hpLoss);
      addPopup(n.x, n.y - NOTE_R - 8, "MISS", NEON.danger, 14);
      sfx.bounce();
    }

    const inside = (n, r = NOTE_R + 8) => Math.hypot(state.px - n.x, state.py - n.y) < r;

    /* ── Update (fixed 60 Hz) ────────────────────────────────────── */
    function update() {
      particles.update();
      shake.update();
      flash.update();

      const now = performance.now();
      state.trail = state.trail.filter((p) => now - p.t < 260);
      if (state.comboFlash > 0) state.comboFlash--;
      for (let i = state.popups.length - 1; i >= 0; i--) {
        const p = state.popups[i];
        p.y -= 0.7;
        p.life--;
        if (p.life <= 0) state.popups.splice(i, 1);
      }
      for (let i = state.fx.length - 1; i >= 0; i--) {
        state.fx[i].age += STEP_MS / 1000;
        if (state.fx[i].age > 0.35) state.fx.splice(i, 1);
      }

      if (!countdown.done || state.dying) return;

      if (!state.started) {
        state.started = true;
        music.start(0);
      }

      const dt = STEP_MS / 1000;
      state.songTime += dt;
      const st = state.songTime;

      const newLevel = 1 + Math.floor(st / LEVEL_EVERY);
      if (newLevel !== state.level) {
        state.level = newLevel;
        sfx.levelUp();
        flash.trigger(NEON.cyan, 0.1);
        addPopup(W / 2, 120, `LEVEL ${newLevel}`, NEON.cyan, 18);
      }
      music.setIntensity(state.fever ? 1 : Math.min(1, 0.3 + (state.level - 1) * 0.12));
      music.schedule(st);
      if (state.fever) state.hp = Math.min(100, state.hp + 0.02);

      // keep the choreography generated well ahead of the playhead
      while (genBeat * BEAT < st + 4) genPhrase(state.level);

      const approach = Math.max(APPROACH_MIN, APPROACH_BASE - (state.level - 1) * 0.06);

      for (const n of state.notes) {
        if (n.done) continue;
        if (n.type === "tap") {
          const snap = state.pinchEdge && st >= n.t - PINCH_EARLY && st <= n.t + LATE
            && !state.handLost && inside(n);
          if (snap || (!state.handLost && st >= n.t - EARLY && st <= n.t + LATE && inside(n))) {
            hitNote(n, Math.abs(st - n.t) <= PERFECT_LATE ? "perfect" : "good", snap);
            if (snap) state.pinchEdge = false; // one pinch spends on one note
          } else if (st > n.t + LATE) missNote(n);

        } else if (n.type === "star") {
          if (!state.handLost && st >= n.t - STAR_EARLY && st <= n.t + STAR_LATE
            && state.pinch && inside(n)) {
            n.done = true;
            n.result = "star";
            n.doneAt = st;
            bumpCombo();
            award(10);
            state.hp = Math.min(100, state.hp + 2);
            state.fx.push({ x: n.x, y: n.y, age: 0, color: NEON.warn });
            particles.burst(n.x, n.y, { count: 24, color: NEON.warn, speed: 5, life: 42, size: 3.5 });
            addPopup(n.x, n.y - NOTE_R - 8, "STAR!", NEON.warn, 18);
            flash.trigger(NEON.warn, 0.1);
            sfx.powerup();
            shake.add(0.08);
          } else if (st > n.t + STAR_LATE) missNote(n, 8);

        } else if (n.type === "shock") {
          if (!n.fired && st >= n.t) {
            n.fired = true;
            n.done = true;
            n.doneAt = st;
            state.fx.push({ x: n.x, y: n.y, age: 0, color: NEON.danger });
            particles.burst(n.x, n.y, { count: 22, color: NEON.danger, speed: 5, life: 38, size: 3.5 });
            sfx.explode();
            if (!state.handLost && inside(n, SHOCK_R)) {
              breakCombo();
              damage(18);
              shake.add(0.5);
              flash.trigger(NEON.danger, 0.3);
              addPopup(n.x, n.y - SHOCK_R, "SHOCKED", NEON.danger, 18);
            }
          }

        } else if (n.type === "hold") {
          const tEnd = n.t + n.durBeats * BEAT;
          if (!n.started) {
            // head judged like a tap (snap works here too);
            // a missed head fails the whole note
            const snap = state.pinchEdge && st >= n.t - PINCH_EARLY && st <= n.t + LATE
              && !state.handLost && inside(n);
            if (snap || (!state.handLost && st >= n.t - EARLY && st <= n.t + LATE && inside(n))) {
              n.started = true;
              bumpCombo();
              award(Math.abs(st - n.t) <= PERFECT_LATE ? 3 : 1);
              sfx.hit();
              state.fx.push({ x: n.x, y: n.y, age: 0, color: n.color });
              if (snap) state.pinchEdge = false;
            } else if (st > n.t + LATE) { missNote(n); continue; }
          }
          if (n.started && !n.broken) {
            const k = clamp((st - n.t) / (n.durBeats * BEAT), 0, 1);
            const hx = n.x + (n.x2 - n.x) * k;
            const hy = n.y + (n.y2 - n.y) * k;
            if (Math.hypot(state.px - hx, state.py - hy) < HOLD_R && !state.handLost) {
              n.offT = 0;
              n.goodT += dt;
              if (st - n.t >= n.nextTick * BEAT) {
                n.nextTick += 0.5;
                award(1);
                sfx.hover();
                particles.burst(hx, hy, { count: 3, color: n.color, speed: 2, life: 20, size: 2 });
              }
            } else {
              n.offT += dt;
              if (n.offT > 0.35) {
                n.broken = true;
                n.done = true;
                n.doneAt = st;
                breakCombo();
                damage(6);
                addPopup(hx, hy - 20, "BREAK", NEON.danger, 14);
                sfx.bounce();
              }
            }
            if (!n.broken && st >= tEnd) {
              n.done = true;
              n.doneAt = st;
              n.result = "hold";
              if (n.goodT / (n.durBeats * BEAT) >= 0.8) {
                bumpCombo();
                award(5);
                addPopup(n.x2, n.y2 - 20, "HOLD ★", n.color, 17);
                state.fx.push({ x: n.x2, y: n.y2, age: 0, color: n.color });
                sfx.score();
              }
            }
          }
        }
      }

      // a pinch that hit nothing this step is spent — no lingering auto-hits
      state.pinchEdge = false;

      // sweep notes that finished fading
      for (let i = state.notes.length - 1; i >= 0; i--) {
        const n = state.notes[i];
        if (n.done && state.songTime - n.doneAt > 0.5) state.notes.splice(i, 1);
      }
    }

    /* ── Draw ────────────────────────────────────────────────────── */
    function approachTime() {
      return Math.max(APPROACH_MIN, APPROACH_BASE - (state.level - 1) * 0.06);
    }

    function drawBackground() {
      const grad = ctx.createLinearGradient(0, 0, 0, H);
      grad.addColorStop(0, "#04060d");
      grad.addColorStop(1, state.fever ? "#140a1c" : "#0a0e19");
      ctx.fillStyle = grad;
      ctx.fillRect(-20, -20, W + 40, H + 40);

      if (!state.started) return;
      const phase = (state.songTime % BEAT) / BEAT;
      const pulse = Math.pow(1 - phase, 2);

      // grid that breathes on the kick
      ctx.strokeStyle = state.fever ? NEON.magenta : NEON.accent;
      ctx.globalAlpha = 0.03 + 0.05 * pulse;
      ctx.lineWidth = 1;
      for (let x = 50; x < W; x += 70) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
      }
      for (let y = 50; y < H; y += 70) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
      }
      // radar ring expanding from center every beat
      ctx.globalAlpha = 0.14 * (1 - phase);
      ctx.beginPath();
      ctx.arc(W / 2, H / 2, 60 + phase * 340, 0, TAU);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    function drawStarShape(x, y, rOut, rIn) {
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const r = i % 2 === 0 ? rOut : rIn;
        const a = -Math.PI / 2 + (i / 10) * TAU;
        ctx[i === 0 ? "moveTo" : "lineTo"](x + Math.cos(a) * r, y + Math.sin(a) * r);
      }
      ctx.closePath();
    }

    function drawNote(n) {
      const st = state.songTime;
      const approach = approachTime();
      if (st < n.t - approach) return;

      if (n.done) {
        // misses fade out in place; hits are handled by the fx ring
        if (n.result === "miss") {
          const f = 1 - (st - n.doneAt) / 0.4;
          if (f <= 0) return;
          ctx.globalAlpha = 0.35 * f;
          ctx.strokeStyle = NEON.danger;
          ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(n.x, n.y, NOTE_R, 0, TAU); ctx.stroke();
          ctx.globalAlpha = 1;
        }
        return;
      }

      const k = clamp((n.t - st) / approach, 0, 1);
      const appear = clamp((st - (n.t - approach)) / 0.15, 0, 1);

      if (n.type === "shock") {
        const a = appear * (0.45 + 0.4 * (1 - k)) * (0.75 + 0.25 * Math.sin(st * 22));
        ctx.globalAlpha = a;
        ctx.strokeStyle = NEON.danger;
        ctx.shadowColor = NEON.danger;
        ctx.shadowBlur = 14;
        ctx.lineWidth = 3;
        ctx.setLineDash([10, 8]);
        ctx.beginPath(); ctx.arc(n.x, n.y, SHOCK_R, 0, TAU); ctx.stroke();
        ctx.setLineDash([]);
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(n.x, n.y, SHOCK_R * (0.25 + 0.75 * k), 0, TAU); ctx.stroke();
        ctx.shadowBlur = 0;
        drawHudText(ctx, "⚠", n.x, n.y + 8, { size: 26, align: "center", color: NEON.danger, glow: NEON.danger });
        ctx.globalAlpha = 1;
        return;
      }

      if (n.type === "hold") {
        // path track
        ctx.globalAlpha = appear * 0.9;
        ctx.lineCap = "round";
        ctx.strokeStyle = "rgba(255,255,255,0.08)";
        ctx.lineWidth = HOLD_R * 0.9;
        ctx.beginPath(); ctx.moveTo(n.x, n.y); ctx.lineTo(n.x2, n.y2); ctx.stroke();
        ctx.strokeStyle = n.color;
        ctx.shadowColor = n.color;
        ctx.shadowBlur = 10;
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(n.x, n.y); ctx.lineTo(n.x2, n.y2); ctx.stroke();
        ctx.shadowBlur = 0;
        if (n.started) {
          const kk = clamp((st - n.t) / (n.durBeats * BEAT), 0, 1);
          const hx = n.x + (n.x2 - n.x) * kk;
          const hy = n.y + (n.y2 - n.y) * kk;
          ctx.fillStyle = n.color;
          ctx.shadowColor = n.color;
          ctx.shadowBlur = 18;
          ctx.beginPath(); ctx.arc(hx, hy, 16, 0, TAU); ctx.fill();
          ctx.shadowBlur = 0;
        }
        ctx.globalAlpha = 1;
        if (n.started) return; // head ring below only before the hold starts
      }

      // tap/star/hold-head body + closing approach ring
      ctx.globalAlpha = appear;
      const late = st > n.t + PERFECT_LATE;
      ctx.fillStyle = n.color;
      ctx.shadowColor = n.color;
      ctx.shadowBlur = 16;
      if (n.type === "star") {
        ctx.globalAlpha = appear * (0.8 + 0.2 * Math.sin(st * 10));
        drawStarShape(n.x, n.y, NOTE_R * 0.9, NOTE_R * 0.42);
        ctx.fill();
        ctx.globalAlpha = appear;
        drawHudText(ctx, "PINCH", n.x, n.y + NOTE_R + 18, { size: 11, align: "center", color: NEON.warn, glow: NEON.warn });
      } else {
        ctx.globalAlpha = appear * 0.18;
        ctx.beginPath(); ctx.arc(n.x, n.y, NOTE_R, 0, TAU); ctx.fill();
        ctx.globalAlpha = appear;
        ctx.lineWidth = 3;
        ctx.strokeStyle = n.color;
        ctx.beginPath(); ctx.arc(n.x, n.y, NOTE_R, 0, TAU); ctx.stroke();
      }
      // approach ring
      ctx.strokeStyle = late ? NEON.danger : "rgba(255,255,255,0.85)";
      ctx.lineWidth = 2.5;
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(n.x, n.y, NOTE_R * (1 + 1.9 * k), 0, TAU);
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
    }

    function drawCursor() {
      if (state.handLost || state.dying) return;
      const now = performance.now();
      for (const p of state.trail) {
        const a = 1 - (now - p.t) / 260;
        if (a <= 0) continue;
        ctx.globalAlpha = a * 0.35;
        ctx.fillStyle = state.fever ? NEON.magenta : NEON.cyan;
        ctx.beginPath(); ctx.arc(p.x, p.y, 4 + 6 * a, 0, TAU); ctx.fill();
      }
      ctx.globalAlpha = 1;
      const c = state.fever ? NEON.magenta : NEON.cyan;
      ctx.strokeStyle = c;
      ctx.shadowColor = c;
      ctx.shadowBlur = 16;
      ctx.lineWidth = state.pinch ? 4 : 2.5;
      ctx.beginPath();
      ctx.arc(state.px, state.py, state.pinch ? 9 : 14, 0, TAU);
      ctx.stroke();
      ctx.fillStyle = "#fff";
      ctx.beginPath(); ctx.arc(state.px, state.py, 3.5, 0, TAU); ctx.fill();
      ctx.shadowBlur = 0;
    }

    function drawHud() {
      drawHudText(ctx, `SCORE ${state.score}`, 14, 28, { size: 15, glow: NEON.accent });
      const m = mult();
      if (m > 1) drawHudText(ctx, `×${m}`, 14, 50, { size: 13, color: NEON.cyan, glow: NEON.cyan });
      drawHudText(ctx, `LV ${state.level}`, W / 2, 28, { size: 15, align: "center", color: NEON.muted });

      // HP bar
      const bw = 150, bh = 9, bx = W - 16 - bw, by = 17;
      ctx.fillStyle = "rgba(255,255,255,0.08)";
      ctx.fillRect(bx, by, bw, bh);
      const hpc = state.hp > 50 ? NEON.accent : state.hp > 25 ? NEON.warn : NEON.danger;
      ctx.fillStyle = hpc;
      ctx.shadowColor = hpc;
      ctx.shadowBlur = 8;
      ctx.fillRect(bx, by, bw * (state.hp / 100), bh);
      ctx.shadowBlur = 0;

      if (state.combo >= 5) {
        const pop = 1 + (state.comboFlash / 14) * 0.25;
        ctx.save();
        ctx.translate(W / 2, 64);
        ctx.scale(pop, pop);
        drawHudText(ctx, `COMBO ×${state.combo}`, 0, 0, {
          size: 19, align: "center",
          color: state.fever ? NEON.magenta : NEON.cyan,
          glow: state.fever ? NEON.magenta : NEON.cyan,
        });
        ctx.restore();
      }
      if (state.fever) {
        const a = 0.7 + 0.3 * Math.sin(performance.now() / 90);
        ctx.globalAlpha = a;
        drawHudText(ctx, "FEVER ×2", W / 2, 92, { size: 14, align: "center", color: NEON.magenta, glow: NEON.magenta });
        ctx.globalAlpha = 1;
      }
    }

    function draw() {
      ctx.save();
      shake.apply(ctx);
      drawBackground();

      // soonest notes drawn last so they sit on top
      const visible = state.notes.slice().sort((a, b) => b.t - a.t);
      for (const n of visible) drawNote(n);

      for (const f of state.fx) {
        const t = 1 - f.age / 0.35;
        ctx.globalAlpha = t;
        ctx.strokeStyle = f.color;
        ctx.shadowColor = f.color;
        ctx.shadowBlur = 14 * t;
        ctx.lineWidth = 3.5 * t;
        ctx.beginPath();
        ctx.arc(f.x, f.y, NOTE_R * (1 + 1.4 * (1 - t)), 0, TAU);
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;
      }

      particles.draw(ctx);
      drawCursor();

      for (const p of state.popups) {
        ctx.globalAlpha = p.life / p.maxLife;
        drawHudText(ctx, p.text, p.x, p.y, { size: p.size, align: "center", color: p.color, glow: p.color });
        ctx.globalAlpha = 1;
      }

      drawHud();

      if (state.handLost && countdown.done && !state.dying) {
        drawHandLostBanner(ctx, W, H, "Hand not detected — show hand to play");
      }

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
        fixed.reset();
      }
      draw();
      if (running) raf = requestAnimationFrame(step);
    }
    raf = requestAnimationFrame(step);

    return {
      pause() {
        state.paused = true;
        music.stop();
      },
      resume() {
        state.paused = false;
        if (state.started && !state.dying) music.start(state.songTime);
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
