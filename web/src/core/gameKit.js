// Shared game-feel toolkit: neon palette, canvas HUD fonts, DPR scaling,
// particles, screen shake, flash, countdown, and a WebAudio synth (no assets).
// Every game pulls from here so the in-canvas look matches the CSS shell.

/* ── Palette (mirrors styles/main.css tokens) ─────────────────── */
export const NEON = {
  bg: "#080a10",
  canvas: "#000000",
  surface: "#10141c",
  border: "#222837",
  text: "#e8ecf3",
  muted: "#8a92a6",
  faint: "#323b4f",
  accent: "#4ade80",
  accentHover: "#6ef0a0",
  cyan: "#22d3ee",
  magenta: "#e879f9",
  danger: "#f87171",
  warn: "#fbbf24",
};

export function hudFont(size, weight = 700) {
  return `${weight} ${size}px Orbitron, system-ui, sans-serif`;
}
export function bodyFont(size, weight = 400) {
  return `${weight} ${size}px system-ui, -apple-system, sans-serif`;
}

/* ── Canvas setup: HiDPI + logical coordinates ────────────────── */
// Contain-fits the canvas into its stage container (.stage-box, or the
// parent element as fallback), renders at devicePixelRatio, and keeps
// game code in logical W×H coords via a base transform. A ResizeObserver
// re-fits on any container/viewport change, so games never handle resize.
const MAX_BACKING_W = 2560; // perf cap for 2D canvas on 4K screens

export function setupCanvas(canvas, W, H) {
  const box = canvas.closest(".stage-box") || canvas.parentElement;
  const ctx = canvas.getContext("2d");

  const fit = () => {
    const r = box.getBoundingClientRect();
    // borders on .canvas-wrap/canvas eat ~2px; keep a tiny safety margin
    const boxW = Math.max(r.width - 4, 50);
    const boxH = Math.max(r.height - 4, 50);
    const s = Math.min(boxW / W, boxH / H);
    const cssW = Math.floor(W * s);
    const cssH = Math.floor(H * s);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const scale = Math.min(dpr, MAX_BACKING_W / cssW);
    // explicit px on both axes: the backing store must never feed back
    // into layout, or the ResizeObserver would loop
    canvas.style.width = cssW + "px";
    canvas.style.height = cssH + "px";
    canvas.width = Math.round(cssW * scale);
    canvas.height = Math.round(cssH * scale);
    ctx.setTransform((cssW * scale) / W, 0, 0, (cssH * scale) / H, 0, 0);
  };

  fit();

  // remount / "Play again" calls setupCanvas again on the same element:
  // drop the previous observer before attaching a fresh one
  canvas._ohFit?.disconnect();
  const ro = new ResizeObserver(fit);
  ro.observe(box);
  canvas._ohFit = ro;

  return ctx;
}

/* ── Fixed timestep: same game speed on every display ─────────── */
// rAF fires at the display refresh rate (60/90/120/144 Hz), so games that
// move objects "per frame" would run faster or slower depending on the
// monitor. This wraps the update in a 60 Hz accumulator: call tick(ts)
// every rAF frame and stepFn runs exactly 60 times per second everywhere.
// All per-frame tuning constants in the games are calibrated for 60 Hz.
export const STEP_MS = 1000 / 60;

export function createFixedStep(stepFn) {
  let last = null;
  let acc = 0;
  return {
    tick(now) {
      if (last === null) last = now;
      acc += Math.min(now - last, 100); // clamp survives tab-switch/hiccups
      last = now;
      let steps = 0;
      while (acc >= STEP_MS && steps < 4) { stepFn(); acc -= STEP_MS; steps++; }
      if (steps === 4) acc = 0; // too far behind — drop the backlog
    },
    reset() { last = null; acc = 0; },
  };
}

/* ── Particles ────────────────────────────────────────────────── */
export function createParticles() {
  const parts = [];
  return {
    burst(x, y, { count = 12, color = NEON.accent, speed = 3, life = 40, size = 3, gravity = 0, spread = Math.PI * 2, angle = 0 } = {}) {
      for (let i = 0; i < count; i++) {
        const a = angle + (Math.random() - 0.5) * spread;
        const v = speed * (0.4 + Math.random() * 0.8);
        parts.push({
          x, y,
          vx: Math.cos(a) * v,
          vy: Math.sin(a) * v,
          life: life * (0.6 + Math.random() * 0.6),
          maxLife: life,
          color, size: size * (0.5 + Math.random() * 0.8),
          gravity,
        });
      }
    },
    update() {
      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i];
        p.x += p.vx;
        p.y += p.vy;
        p.vy += p.gravity;
        p.vx *= 0.97;
        p.vy *= 0.97;
        p.life -= 1;
        if (p.life <= 0) parts.splice(i, 1);
      }
    },
    draw(ctx) {
      for (const p of parts) {
        const t = Math.max(0, p.life / p.maxLife);
        ctx.globalAlpha = t;
        ctx.fillStyle = p.color;
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 8 * t;
        ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      }
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;
    },
    clear() { parts.length = 0; },
    get count() { return parts.length; },
  };
}

/* ── Screen shake (trauma-based, decays each frame) ───────────── */
export function createShake() {
  let trauma = 0;
  return {
    add(amount) { trauma = Math.min(1, trauma + amount); },
    // Call inside draw: ctx.save(); shake.apply(ctx); ...draw...; ctx.restore();
    apply(ctx) {
      if (trauma <= 0.001) return;
      const s = trauma * trauma;
      ctx.translate((Math.random() - 0.5) * 16 * s, (Math.random() - 0.5) * 16 * s);
    },
    update() { trauma = Math.max(0, trauma - 0.035); },
    reset() { trauma = 0; },
  };
}

/* ── Full-canvas flash ────────────────────────────────────────── */
export function createFlash() {
  let alpha = 0;
  let color = "#ffffff";
  return {
    trigger(c = "#ffffff", strength = 0.35) { color = c; alpha = strength; },
    update() { alpha = Math.max(0, alpha - 0.04); },
    draw(ctx, W, H) {
      if (alpha <= 0) return;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
    },
  };
}

/* ── Countdown 3‑2‑1‑GO gating game start ─────────────────────── */
export function createCountdown(onTick = null) {
  let t = 3.999; // seconds remaining; >1 shows number, <1 shows GO
  let lastShown = null;
  let prev = performance.now();
  return {
    get done() { return t <= 0.4; },       // GO fades slightly early
    get active() { return t > 0.4; },
    update() {
      const now = performance.now();
      t -= Math.min((now - prev) / 1000, 0.1); // clamp: survives pauses/tab-switch
      prev = now;
      const label = t > 1 ? String(Math.ceil(t - 1)) : "GO";
      if (label !== lastShown && t > 0.4) {
        lastShown = label;
        onTick?.(label);
      }
    },
    draw(ctx, W, H) {
      if (this.done) return;
      const label = t > 1 ? String(Math.ceil(t - 1)) : "GO";
      const frac = t > 1 ? (t - 1) % 1 : Math.max(0, t - 0.4) / 0.6;
      const scale = 1 + (1 - frac) * 0.25;
      ctx.save();
      ctx.fillStyle = "rgba(2,4,8,0.55)";
      ctx.fillRect(0, 0, W, H);
      ctx.translate(W / 2, H / 2);
      ctx.scale(scale, scale);
      ctx.globalAlpha = 0.35 + frac * 0.65;
      ctx.font = hudFont(label === "GO" ? 64 : 84, 900);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = label === "GO" ? NEON.accent : NEON.text;
      ctx.shadowColor = NEON.accent;
      ctx.shadowBlur = 30;
      ctx.fillText(label, 0, 0);
      ctx.restore();
    },
  };
}

/* ── HUD helpers ──────────────────────────────────────────────── */
export function drawHudText(ctx, text, x, y, { size = 16, color = NEON.text, align = "left", glow = null, weight = 700 } = {}) {
  ctx.font = hudFont(size, weight);
  ctx.textAlign = align;
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = color;
  if (glow) { ctx.shadowColor = glow; ctx.shadowBlur = 10; }
  ctx.fillText(text, x, y);
  ctx.shadowBlur = 0;
}

export function drawHandLostBanner(ctx, W, H, msg = "Hand not detected") {
  ctx.fillStyle = NEON.warn;
  ctx.font = bodyFont(13, 600);
  ctx.textAlign = "center";
  ctx.shadowColor = "rgba(251,191,36,0.5)";
  ctx.shadowBlur = 8;
  ctx.fillText(msg, W / 2, H - 12);
  ctx.shadowBlur = 0;
}

export function drawLives(ctx, lives, x, y, { color = NEON.danger, r = 5, gap = 16 } = {}) {
  for (let i = 0; i < lives; i++) {
    ctx.beginPath();
    ctx.arc(x - i * gap, y, r, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 8;
    ctx.fill();
  }
  ctx.shadowBlur = 0;
}

/* ── WebAudio synth SFX (zero assets) ─────────────────────────── */
let actx = null;
let master = null;

function ensureAudio() {
  if (!actx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    actx = new AC();
    master = actx.createGain();
    master.gain.value = 0.22;
    master.connect(actx.destination);
  }
  if (actx.state === "suspended") actx.resume().catch(() => {});
  return actx;
}

// Unlock audio on first user interaction (browsers gate AudioContext).
for (const evt of ["pointerdown", "keydown"]) {
  window.addEventListener(evt, () => ensureAudio(), { once: true, passive: true });
}

function tone({ freq = 440, freqEnd = null, type = "square", dur = 0.1, vol = 1, delay = 0 } = {}) {
  const ac = ensureAudio();
  if (!ac || ac.state !== "running") return;
  const t0 = ac.currentTime + delay;
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (freqEnd) osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), t0 + dur);
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  osc.connect(g).connect(master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

function noise({ dur = 0.2, vol = 0.8, delay = 0, lowpass = 1800 } = {}) {
  const ac = ensureAudio();
  if (!ac || ac.state !== "running") return;
  const t0 = ac.currentTime + delay;
  const len = Math.floor(ac.sampleRate * dur);
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ac.createBufferSource();
  src.buffer = buf;
  const filt = ac.createBiquadFilter();
  filt.type = "lowpass";
  filt.frequency.value = lowpass;
  const g = ac.createGain();
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  src.connect(filt).connect(g).connect(master);
  src.start(t0);
}

/* ── Procedural music: dark-synthwave loop (zero assets) ──────── */
// createMusic() → { start(), stop(), setIntensity(0..1) }. Lookahead
// scheduler over the shared AudioContext; every voice runs through a
// private gain so the sfx above always cut through. Layers stack with
// intensity: kick+bass always, hats ≥0.35, arp ≥0.5, snare ≥0.6; the
// bass filter and arp brightness open as intensity rises (boss fights).
const MUSIC_BPM = 112;
const MUSIC_STEP = 60 / MUSIC_BPM / 2;         // 8th notes
const MUSIC_ROOTS = [33, 33, 29, 31];          // A1 · A1 · F1 · G1 (Am/Am/F/G)
const MUSIC_ARP = [0, 3, 7, 12, 7, 3, 10, 7];  // minor arp intervals

function mtof(m) { return 440 * Math.pow(2, (m - 69) / 12); }

export function createMusic() {
  let timer = null;
  let out = null;       // private music bus → master
  let step = 0;
  let nextT = 0;
  let intensity = 0.4;
  const LEVEL = 0.42;   // music bed sits under the sfx

  function bus() {
    if (!out) {
      out = actx.createGain();
      out.gain.value = LEVEL;
      out.connect(master);
    }
    return out;
  }

  function voice(t, { freq, freqEnd = null, type = "sawtooth", dur, vol, filter = null }) {
    const o = actx.createOscillator();
    const g = actx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (freqEnd) o.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    let head = o;
    if (filter) {
      const f = actx.createBiquadFilter();
      f.type = filter.type;
      f.frequency.value = filter.freq;
      if (filter.q) f.Q.value = filter.q;
      o.connect(f);
      head = f;
    }
    head.connect(g).connect(bus());
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  function hiss(t, { dur, vol, type = "highpass", freq = 6000 }) {
    const len = Math.max(1, Math.floor(actx.sampleRate * dur));
    const buf = actx.createBuffer(1, len, actx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = actx.createBufferSource();
    src.buffer = buf;
    const f = actx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = actx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f).connect(g).connect(bus());
    src.start(t);
  }

  function playStep(s, t) {
    const root = MUSIC_ROOTS[s >> 3];
    // kick — four on the floor
    if (s % 4 === 0) voice(t, { freq: 120, freqEnd: 38, type: "sine", dur: 0.13, vol: 0.9 });
    // bass — driving 8ths with an octave jump; filter opens with intensity
    const up = s % 8 === 3 || s % 8 === 6 ? 12 : 0;
    voice(t, {
      freq: mtof(root + up), type: "sawtooth", dur: MUSIC_STEP * 0.85, vol: 0.32,
      filter: { type: "lowpass", freq: 260 + intensity * 1100, q: 6 },
    });
    // offbeat hats
    if (intensity >= 0.35 && s % 2 === 1) hiss(t, { dur: 0.03, vol: 0.12 });
    // snare on the backbeat
    if (intensity >= 0.6 && s % 8 === 4) hiss(t, { dur: 0.12, vol: 0.26, type: "bandpass", freq: 1900 });
    // high arp — the "danger" layer
    if (intensity >= 0.5) {
      voice(t, {
        freq: mtof(root + 24 + MUSIC_ARP[s % MUSIC_ARP.length]),
        type: "square", dur: 0.09, vol: 0.05 + intensity * 0.06,
        filter: { type: "lowpass", freq: 900 + intensity * 2400 },
      });
    }
  }

  function tick() {
    const ac = ensureAudio();
    if (!ac || ac.state !== "running") return; // retries until audio unlocks
    if (nextT < ac.currentTime + 0.02) nextT = ac.currentTime + 0.05; // (re)sync
    while (nextT < ac.currentTime + 0.3) {
      playStep(step, nextT);
      step = (step + 1) % 32;
      nextT += MUSIC_STEP;
    }
  }

  return {
    start() {
      if (timer) return;
      timer = setInterval(tick, 80);
      if (out && actx) {
        out.gain.cancelScheduledValues(actx.currentTime);
        out.gain.setValueAtTime(0, actx.currentTime);
        out.gain.linearRampToValueAtTime(LEVEL, actx.currentTime + 0.4);
      }
      tick();
    },
    stop() {
      if (!timer) return;
      clearInterval(timer);
      timer = null;
      // fade the bus so already-scheduled notes don't ring past the stop
      if (out && actx) {
        out.gain.cancelScheduledValues(actx.currentTime);
        out.gain.setValueAtTime(out.gain.value, actx.currentTime);
        out.gain.linearRampToValueAtTime(0, actx.currentTime + 0.2);
      }
    },
    setIntensity(v) { intensity = Math.max(0, Math.min(1, v)); },
  };
}

export const sfx = {
  hit()      { tone({ freq: 220, freqEnd: 440, type: "square", dur: 0.06, vol: 0.5 }); },
  bounce()   { tone({ freq: 160, freqEnd: 120, type: "triangle", dur: 0.05, vol: 0.4 }); },
  score()    { tone({ freq: 660, type: "square", dur: 0.07, vol: 0.4 }); tone({ freq: 880, type: "square", dur: 0.09, vol: 0.4, delay: 0.07 }); },
  brick()    { tone({ freq: 520, freqEnd: 700, type: "square", dur: 0.05, vol: 0.4 }); },
  eat()      { tone({ freq: 440, freqEnd: 880, type: "sine", dur: 0.09, vol: 0.5 }); },
  shoot()    { tone({ freq: 900, freqEnd: 300, type: "sawtooth", dur: 0.08, vol: 0.25 }); },
  explode()  { noise({ dur: 0.3, vol: 0.7, lowpass: 1200 }); tone({ freq: 110, freqEnd: 40, type: "sine", dur: 0.3, vol: 0.6 }); },
  bigExplode(){ noise({ dur: 0.5, vol: 0.9, lowpass: 900 }); tone({ freq: 80, freqEnd: 30, type: "sine", dur: 0.5, vol: 0.8 }); },
  powerup()  { tone({ freq: 523, type: "square", dur: 0.07, vol: 0.4 }); tone({ freq: 659, type: "square", dur: 0.07, vol: 0.4, delay: 0.07 }); tone({ freq: 784, type: "square", dur: 0.1, vol: 0.4, delay: 0.14 }); },
  lose()     { tone({ freq: 300, freqEnd: 80, type: "sawtooth", dur: 0.45, vol: 0.5 }); },
  levelUp()  { tone({ freq: 440, type: "square", dur: 0.08, vol: 0.4 }); tone({ freq: 554, type: "square", dur: 0.08, vol: 0.4, delay: 0.08 }); tone({ freq: 659, type: "square", dur: 0.08, vol: 0.4, delay: 0.16 }); tone({ freq: 880, type: "square", dur: 0.14, vol: 0.45, delay: 0.24 }); },
  tick()     { tone({ freq: 440, type: "sine", dur: 0.06, vol: 0.35 }); },
  go()       { tone({ freq: 880, type: "sine", dur: 0.18, vol: 0.45 }); },
  pause()    { tone({ freq: 500, freqEnd: 250, type: "sine", dur: 0.12, vol: 0.35 }); },
  resume()   { tone({ freq: 250, freqEnd: 500, type: "sine", dur: 0.12, vol: 0.35 }); },
  click()    { tone({ freq: 700, freqEnd: 900, type: "sine", dur: 0.06, vol: 0.35 }); },
  hover()    { tone({ freq: 500, type: "sine", dur: 0.03, vol: 0.12 }); },
};
