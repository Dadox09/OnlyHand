import {
  NEON, setupCanvas, createParticles, createShake, createFlash,
  createCountdown, createFixedStep, drawHudText, drawHandLostBanner, drawLives, sfx,
} from "../../core/gameKit.js";

const W = 800;
const H = 550;
const TAU = Math.PI * 2;
const R = 25;
const RUN_FRAMES = 54 * 60;
const FEVER_COMBO = 8;

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const rand = (min, max) => min + Math.random() * (max - min);

export default {
  async mount({ canvas, onHandUpdate, handState, onScore }) {
    const ctx = setupCanvas(canvas, W, H);
    const particles = createParticles();
    const shake = createShake();
    const flash = createFlash();
    const countdown = createCountdown((label) => (label === "GO" ? sfx.go() : sfx.tick()));
    const state = {
      jellies: [], popups: [], trail: [], score: 0, lives: 3, combo: 0,
      fever: 0, timer: RUN_FRAMES, spawnIn: 25, px: W / 2, py: H * 0.7,
      pinch: false, pinchReleased: false, releaseArmed: false, awaitFreshPinch: false, handLost: !handState.isDetected,
      holding: null, grabLock: false, frame: 0, paused: false, dying: false,
    };
    let running = true;
    let deathTimer = null;
    let lastInput = [];

    const unsub = onHandUpdate((s) => {
      if (!s.isDetected) {
        state.handLost = true;
        state.pinch = false;
        state.pinchReleased = false;
        state.releaseArmed = false;
        state.awaitFreshPinch = true;
        return;
      }
      if (state.paused) return;
      if (state.handLost) {
        state.handLost = false;
        state.pinch = false;
        state.pinchReleased = false;
        state.releaseArmed = false;
        state.awaitFreshPinch = true;
      }
      state.px = (1 - s.x) * W;
      state.py = s.y * H;
      if (state.awaitFreshPinch) {
        if (!s.pinch) { state.awaitFreshPinch = false; state.grabLock = false; }
        state.pinch = false;
        return;
      }
      if (state.pinch && !s.pinch && state.releaseArmed) state.pinchReleased = true;
      state.pinch = s.pinch;
      if (s.pinch) state.releaseArmed = true;
      const now = performance.now();
      lastInput.push({ x: state.px, y: state.py, t: now });
      lastInput = lastInput.filter((p) => now - p.t < 150);
      state.trail.push({ x: state.px, y: state.py, life: 14 });
    });

    function portal() {
      return { x: W / 2 + Math.sin(state.frame * 0.018) * 220, y: 130 + Math.sin(state.frame * 0.032) * 24 };
    }

    function popup(x, y, text, color = NEON.text, size = 16) {
      state.popups.push({ x, y, text, color, size, life: 48 });
    }

    function spawnJelly(force = null) {
      const kind = force || (Math.random() < 0.1 ? "gold"
        : state.timer < RUN_FRAMES - 8 * 60 && Math.random() < 0.12 ? "bomb" : "normal");
      const golden = kind === "gold";
      const bomb = kind === "bomb";
      const colors = ["#fb7185", "#a78bfa", "#38bdf8", "#4ade80", "#fb923c"];
      state.jellies.push({
        x: rand(150, W - 150), y: rand(H * 0.56, H - 85), vx: 0, vy: 0,
        r: golden ? 29 : R, color: golden ? "#facc15" : bomb ? NEON.danger : colors[(Math.random() * colors.length) | 0],
        golden, bomb, held: false, airborne: false, life: Math.max(220, 430 - Math.floor((RUN_FRAMES - state.timer) / 90)),
        wobble: Math.random() * TAU,
      });
    }

    function hurt(text, x = W / 2, y = H / 2) {
      if (state.dying || state.handLost) return;
      state.lives--;
      state.combo = 0;
      state.fever = 0;
      popup(x, y, text, NEON.danger, 21);
      particles.burst(x, y, { count: 20, color: NEON.danger, speed: 5, life: 34, size: 4 });
      shake.add(0.42);
      flash.trigger(NEON.danger, 0.2);
      sfx.explode();
      if (state.lives <= 0) finish("SPLAT!");
    }

    function finish(label) {
      if (state.dying) return;
      state.dying = true;
      popup(W / 2, H / 2, label, label === "TIME!" ? NEON.cyan : NEON.danger, 30);
      if (label !== "TIME!") sfx.lose();
      deathTimer = setTimeout(() => { if (running) onScore(Math.floor(state.score)); }, 850);
    }

    function scoreJelly(j) {
      const p = portal();
      const base = j.golden ? 50 : 15;
      const multiplier = 1 + Math.floor(state.combo / 3) + (state.fever > 0 ? 1 : 0);
      const earned = base * multiplier;
      state.score += earned;
      state.combo++;
      if (state.combo === FEVER_COMBO) {
        state.fever = 7 * 60;
        popup(W / 2, H / 2 - 40, "FEVER ×2", NEON.magenta, 28);
        flash.trigger(NEON.magenta, 0.18);
        sfx.powerup();
      } else sfx.score();
      popup(p.x, p.y - 44, `${j.golden ? "GOLD! " : ""}+${earned}`, j.golden ? "#facc15" : NEON.accent, 18);
      particles.burst(p.x, p.y, { count: j.golden ? 28 : 16, color: j.color, speed: 4.5, life: 34, size: 3.5 });
      shake.add(j.golden ? 0.15 : 0.07);
      state.jellies.splice(state.jellies.indexOf(j), 1);
      if (state.holding === j) state.holding = null;
    }

    function grab(j) {
      if (j.bomb) {
        state.jellies.splice(state.jellies.indexOf(j), 1);
        state.grabLock = true;
        hurt("BOMB JELLY!", j.x, j.y);
        return;
      }
      j.held = true;
      j.airborne = false;
      j.vx = j.vy = 0;
      state.holding = j;
      sfx.hit();
    }

    function release() {
      const j = state.holding;
      state.holding = null;
      if (!j) return;
      j.held = false;
      const p = portal();
      if (distance(j, p) < 72 + j.r) { scoreJelly(j); return; }
      const first = lastInput[0];
      const last = lastInput.at(-1);
      const dt = first && last ? Math.max(25, last.t - first.t) : 150;
      j.vx = clamp(((last?.x ?? j.x) - (first?.x ?? j.x)) / dt * 4.2, -14, 14);
      j.vy = clamp(((last?.y ?? j.y) - (first?.y ?? j.y)) / dt * 4.2, -15, 12);
      j.airborne = true;
      particles.burst(j.x, j.y, { count: 6, color: j.color, speed: 2.5, life: 20, size: 2 });
      sfx.shoot();
    }

    function update() {
      state.frame++;
      countdown.update();
      particles.update(); shake.update(); flash.update();
      for (let i = state.trail.length - 1; i >= 0; i--) if (--state.trail[i].life <= 0) state.trail.splice(i, 1);
      for (let i = state.popups.length - 1; i >= 0; i--) {
        const p = state.popups[i]; p.y -= 0.65; if (--p.life <= 0) state.popups.splice(i, 1);
      }
      if (!countdown.done || state.dying || state.handLost) return;

      state.timer--;
      if (state.timer <= 0) { finish("TIME!"); return; }
      if (state.fever > 0 && --state.fever === 0) popup(W / 2, 90, "FEVER OUT", NEON.muted, 15);
      if (!state.pinch && !state.awaitFreshPinch) state.grabLock = false;
      if (state.pinchReleased) { release(); state.pinchReleased = false; }

      if (!state.holding && state.pinch && !state.grabLock) {
        let nearest = null;
        for (const j of state.jellies) if (!j.airborne && distance(j, { x: state.px, y: state.py }) < j.r + 42
          && (!nearest || distance(j, { x: state.px, y: state.py }) < distance(nearest, { x: state.px, y: state.py }))) nearest = j;
        if (nearest) grab(nearest);
      }
      if (state.holding) {
        state.holding.x += (state.px - state.holding.x) * 0.52;
        state.holding.y += (state.py - state.holding.y) * 0.52;
      }

      const p = portal();
      for (let i = state.jellies.length - 1; i >= 0; i--) {
        const j = state.jellies[i];
        if (j.held) continue;
        j.wobble += 0.08;
        if (!j.airborne) {
          if (--j.life <= 0) {
            state.jellies.splice(i, 1);
            if (j.bomb) popup(j.x, j.y, "PHEW", NEON.muted, 14);
            else hurt("TOO SLOW", j.x, j.y);
          }
          continue;
        }
        j.x += j.vx; j.y += j.vy; j.vy += 0.28; j.vx *= 0.992;
        if (distance(j, p) < 62 + j.r) { scoreJelly(j); continue; }
        if (j.x < -j.r || j.x > W + j.r || j.y > H + j.r) { state.jellies.splice(i, 1); hurt("SPLASH!", clamp(j.x, 70, W - 70), H - 45); }
      }
      if (--state.spawnIn <= 0 && state.jellies.length < 3) {
        spawnJelly();
        const elapsed = (RUN_FRAMES - state.timer) / 60;
        state.spawnIn = Math.max(38, 98 - elapsed * 1.1);
      }
    }

    function drawJelly(j) {
      const squish = j.held ? 0.85 : 1 + Math.sin(j.wobble) * 0.07;
      ctx.save(); ctx.translate(j.x, j.y); ctx.scale(1 / squish, squish);
      ctx.fillStyle = j.color; ctx.shadowColor = j.color; ctx.shadowBlur = j.golden ? 20 : 12;
      ctx.beginPath(); ctx.arc(0, 2, j.r, Math.PI, 0); ctx.lineTo(j.r, 14); ctx.quadraticCurveTo(0, j.r + 6, -j.r, 14); ctx.closePath(); ctx.fill();
      ctx.shadowBlur = 0;
      if (j.golden) { ctx.strokeStyle = "#fff7ae"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 2, j.r + 5, 0, TAU); ctx.stroke(); }
      ctx.fillStyle = "#172033";
      ctx.beginPath(); ctx.arc(-8, 4, 3, 0, TAU); ctx.arc(8, 4, 3, 0, TAU); ctx.fill();
      ctx.strokeStyle = "#172033"; ctx.lineWidth = 2; ctx.beginPath();
      if (j.bomb) { ctx.moveTo(-7, 15); ctx.lineTo(7, 15); ctx.moveTo(0, -j.r + 2); ctx.lineTo(5, -j.r - 9); ctx.stroke(); ctx.fillText("!", -3, -2); }
      else { ctx.arc(0, 12, 8, 0, Math.PI); ctx.stroke(); }
      ctx.restore();
      if (!j.airborne && !j.held && !j.bomb) {
        ctx.globalAlpha = clamp(j.life / 90, 0.25, 1); drawHudText(ctx, "PINCH", j.x, j.y + j.r + 18, { size: 10, align: "center", color: NEON.muted }); ctx.globalAlpha = 1;
      }
    }

    function draw() {
      const p = portal();
      const grad = ctx.createLinearGradient(0, 0, 0, H);
      grad.addColorStop(0, state.fever ? "#26102e" : "#071426"); grad.addColorStop(1, "#101828");
      ctx.fillStyle = grad; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "rgba(255,255,255,0.14)";
      for (let i = 0; i < 36; i++) ctx.fillRect((i * 83 + 19) % W, (i * 47 + state.frame * 0.45) % H, 2, 2);
      ctx.save(); shake.apply(ctx);
      ctx.strokeStyle = state.fever ? NEON.magenta : NEON.cyan; ctx.shadowColor = ctx.strokeStyle; ctx.shadowBlur = 22; ctx.lineWidth = 7;
      ctx.beginPath(); ctx.arc(p.x, p.y, 45 + Math.sin(state.frame * 0.12) * 5, 0, TAU); ctx.stroke();
      ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(p.x, p.y, 30, 0, TAU); ctx.stroke(); ctx.shadowBlur = 0;
      drawHudText(ctx, "YEET PORTAL", p.x, p.y + 5, { size: 11, align: "center", color: NEON.text });
      for (const j of state.jellies) drawJelly(j);
      particles.draw(ctx);
      for (const t of state.trail) { ctx.globalAlpha = t.life / 18; ctx.fillStyle = NEON.cyan; ctx.beginPath(); ctx.arc(t.x, t.y, 4, 0, TAU); ctx.fill(); } ctx.globalAlpha = 1;
      if (!state.handLost) { ctx.strokeStyle = state.pinch ? NEON.accent : NEON.cyan; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(state.px, state.py, state.pinch ? 13 : 9, 0, TAU); ctx.stroke(); }
      for (const pop of state.popups) { ctx.globalAlpha = pop.life / 48; drawHudText(ctx, pop.text, pop.x, pop.y, { size: pop.size, align: "center", color: pop.color, glow: pop.color }); } ctx.globalAlpha = 1;
      ctx.restore();
      const seconds = Math.max(0, Math.ceil(state.timer / 60));
      drawHudText(ctx, `SCORE ${Math.floor(state.score)}`, 24, 36, { size: 20, color: NEON.text });
      drawHudText(ctx, `${seconds}s`, W - 26, 36, { size: 20, align: "right", color: seconds <= 10 ? NEON.warn : NEON.text });
      drawLives(ctx, state.lives, W - 28, 61);
      if (state.combo > 1) drawHudText(ctx, `COMBO ×${state.combo}`, 24, 63, { size: 14, color: NEON.accent });
      if (state.fever) drawHudText(ctx, "FEVER ×2", W / 2, 38, { size: 18, align: "center", color: NEON.magenta, glow: NEON.magenta });
      if (!countdown.done) drawHudText(ctx, "PINCH A JELLY · DROP OR YEET IT INTO THE PORTAL", W / 2, H - 28, { size: 13, align: "center", color: NEON.text });
      else if (state.handLost) drawHandLostBanner(ctx, W, H, "Hand lost — game paused");
      flash.draw(ctx, W, H); countdown.draw(ctx, W, H);
    }

    const fixed = createFixedStep(update);
    let raf = null;
    function loop(t) { if (!running) return; if (!state.paused) { fixed.tick(t); draw(); } raf = requestAnimationFrame(loop); }
    raf = requestAnimationFrame(loop);
    return {
      pause() {
        state.paused = true;
        state.pinch = false;
        state.pinchReleased = false;
        state.releaseArmed = false;
        state.awaitFreshPinch = true;
        state.grabLock = true;
        lastInput = [];
      },
      resume() {
        state.paused = false;
        state.pinch = false;
        state.pinchReleased = false;
        state.releaseArmed = false;
        state.awaitFreshPinch = true;
        state.grabLock = true;
        lastInput = [];
        fixed.reset();
      },
      unmount() { running = false; cancelAnimationFrame(raf); clearTimeout(deathTimer); unsub(); },
    };
  },
};
