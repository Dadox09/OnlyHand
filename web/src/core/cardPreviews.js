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
