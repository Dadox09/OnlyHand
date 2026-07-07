// Animated mini-scenes for the hub game cards. One shared rAF drives all
// registered canvases; time-based so every card loops deterministically.
import { NEON } from "./gameKit.js";

const PW = 240; // logical size (canvas is CSS-scaled to fit the card)
const PH = 90;

const SCENES = {
  pong(ctx, t) {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, PW, PH);
    // ball ping-pongs between paddle and right wall
    const phase = (t / 1400) % 2;
    const k = phase < 1 ? phase : 2 - phase;
    const bx = 26 + k * (PW - 40);
    const by = PH / 2 + Math.sin(t / 300) * 22;
    const py = Math.max(8, Math.min(PH - 36, by - 14));
    ctx.fillStyle = NEON.accent;
    ctx.shadowColor = NEON.accent;
    ctx.shadowBlur = 8;
    ctx.fillRect(14, py, 5, 28);
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#fff";
    ctx.shadowColor = NEON.cyan;
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(bx, by, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  },

  breakout(ctx, t) {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, PW, PH);
    const colors = [NEON.danger, "#fb923c", "#facc15", NEON.accent];
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 8; c++) {
        // bricks blink out in a travelling wave
        if ((Math.floor(t / 260) + r * 3 + c) % 17 === 0) continue;
        ctx.fillStyle = colors[r % colors.length];
        ctx.fillRect(10 + c * 28, 10 + r * 12, 24, 8);
      }
    }
    const px = PW / 2 + Math.sin(t / 500) * 60;
    ctx.fillStyle = NEON.accent;
    ctx.shadowColor = NEON.accent;
    ctx.shadowBlur = 8;
    ctx.fillRect(px - 18, PH - 12, 36, 5);
    ctx.shadowBlur = 0;
    const by = PH - 20 - Math.abs(Math.sin(t / 350)) * 30;
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(px + Math.sin(t / 350) * 14, by, 3.5, 0, Math.PI * 2);
    ctx.fill();
  },

  snake(ctx, t) {
    ctx.fillStyle = "#0a0c10";
    ctx.fillRect(0, 0, PW, PH);
    // snake runs a rounded loop
    const N = 9;
    for (let i = N - 1; i >= 0; i--) {
      const tt = t / 900 - i * 0.09;
      const x = PW / 2 + Math.cos(tt) * 70;
      const y = PH / 2 + Math.sin(tt * 2) * 26;
      ctx.fillStyle = i === 0 ? NEON.accent : `hsl(140, 70%, ${42 - i * 3}%)`;
      if (i === 0) { ctx.shadowColor = NEON.accent; ctx.shadowBlur = 8; }
      ctx.beginPath();
      ctx.roundRect(x - 6, y - 6, 12, 12, 3);
      ctx.fill();
      ctx.shadowBlur = 0;
    }
    ctx.fillStyle = NEON.danger;
    ctx.shadowColor = NEON.danger;
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(PW - 34, 22, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  },

  slash(ctx, t) {
    ctx.fillStyle = "#05060c";
    ctx.fillRect(0, 0, PW, PH);
    // fruits pop up in arcs on staggered loops
    const fruits = [
      { x0: 50, color: NEON.accent, phase: 0, r: 8 },
      { x0: 120, color: "#fb923c", phase: 700, r: 7 },
      { x0: 185, color: NEON.magenta, phase: 1400, r: 6 },
    ];
    for (const f of fruits) {
      const k = ((t + f.phase) % 2100) / 2100; // 0→1 flight
      const y = PH + 10 - Math.sin(k * Math.PI) * (PH + 4);
      const x = f.x0 + k * 22;
      ctx.fillStyle = f.color;
      ctx.shadowColor = f.color;
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(x, y, f.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }
    // blade swipe sweeps across periodically
    const sw = (t % 1200) / 1200;
    if (sw < 0.35) {
      const p = sw / 0.35;
      ctx.strokeStyle = `rgba(255,255,255,${0.9 * (1 - p)})`;
      ctx.shadowColor = NEON.cyan;
      ctx.shadowBlur = 10;
      ctx.lineWidth = 3;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(30 + p * 120, 70 - p * 30);
      ctx.quadraticCurveTo(90 + p * 120, 40 - p * 30, 150 + p * 60, 55 - p * 40);
      ctx.stroke();
      ctx.shadowBlur = 0;
    }
  },

  beat(ctx, t) {
    ctx.fillStyle = "#04060d";
    ctx.fillRect(0, 0, PW, PH);
    // beat-pulsing grid
    const pulse = Math.pow(1 - ((t % 500) / 500), 2);
    ctx.strokeStyle = NEON.accent;
    ctx.globalAlpha = 0.05 + 0.08 * pulse;
    for (let x = 20; x < PW; x += 40) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, PH); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    // orbs with closing approach rings on staggered beats
    const orbs = [
      { x: 50, y: 48, color: NEON.accent, phase: 0 },
      { x: 122, y: 30, color: NEON.cyan, phase: 660 },
      { x: 192, y: 58, color: NEON.magenta, phase: 1320 },
    ];
    for (const o of orbs) {
      const k = 1 - ((t + o.phase) % 2000) / 2000; // 1 → 0 ring closes
      ctx.strokeStyle = o.color;
      ctx.shadowColor = o.color;
      ctx.shadowBlur = 8;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(o.x, o.y, 11, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 0.9;
      ctx.beginPath(); ctx.arc(o.x, o.y, 11 + 26 * k, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 1;
      if (k > 0.93) { // hit flash right as it closes
        ctx.fillStyle = o.color;
        ctx.beginPath(); ctx.arc(o.x, o.y, 8, 0, Math.PI * 2); ctx.fill();
      }
      ctx.shadowBlur = 0;
    }
    // cursor comet gliding between orbs
    const k = (t % 2000) / 2000;
    const cx = 40 + k * 160;
    const cy = 55 - Math.sin(k * Math.PI * 2) * 18;
    ctx.strokeStyle = NEON.cyan;
    ctx.shadowColor = NEON.cyan;
    ctx.shadowBlur = 8;
    ctx.beginPath(); ctx.arc(cx, cy, 5, 0, Math.PI * 2); ctx.stroke();
    ctx.shadowBlur = 0;
  },

  asteroids(ctx, t) {
    ctx.fillStyle = "#000008";
    ctx.fillRect(0, 0, PW, PH);
    ctx.fillStyle = "#ffffff2e";
    for (let i = 0; i < 22; i++) {
      ctx.fillRect((i * 41 + 7) % PW, (i * 29 + 11) % PH, 1.5, 1.5);
    }
    // two drifting asteroid outlines
    for (let n = 0; n < 2; n++) {
      const ax = ((t / (30 + n * 14)) + n * 130) % (PW + 60) - 30;
      const ay = 24 + n * 40;
      ctx.save();
      ctx.translate(ax, ay);
      ctx.rotate(t / 800 + n);
      ctx.strokeStyle = "#94a3b8";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      const R = 13 - n * 4;
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        const r = R * (0.75 + 0.25 * Math.sin(i * 5 + n));
        ctx[i === 0 ? "moveTo" : "lineTo"](Math.cos(a) * r, Math.sin(a) * r);
      }
      ctx.closePath();
      ctx.stroke();
      ctx.restore();
    }
    // ship + bullet stream
    const sx = PW / 2 + Math.sin(t / 700) * 40;
    const sy = PH - 26;
    ctx.strokeStyle = "#7dd3fc";
    ctx.shadowColor = "#38bdf8";
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(sx, sy, 6, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = NEON.cyan;
    const bt = (t % 600) / 600;
    ctx.beginPath();
    ctx.arc(sx + (PW / 2 - sx) * bt * 0.4, sy - bt * 46, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  },
};

let entries = [];
let raf = null;

function loop(t) {
  for (const { ctx, scene } of entries) SCENES[scene]?.(ctx, t);
  raf = entries.length ? requestAnimationFrame(loop) : null;
}

// Attach a preview to a canvas element. Returns nothing; call stopCardPreviews on unmount.
export function attachCardPreview(canvas, scene) {
  canvas.width = PW;
  canvas.height = PH;
  entries.push({ ctx: canvas.getContext("2d"), scene });
  if (!raf) raf = requestAnimationFrame(loop);
}

export function stopCardPreviews() {
  entries = [];
  if (raf) cancelAnimationFrame(raf);
  raf = null;
}
