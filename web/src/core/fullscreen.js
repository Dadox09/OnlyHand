// OnlyHand · Fullscreen (mobile)
// On phone browsers the URL bar + tab strip eat the short edge of a
// landscape screen. The Fullscreen API reclaims it, and while fullscreen
// we best-effort lock the orientation to landscape (Android).
// iPhone Safari has no element Fullscreen API — there the toggle never
// mounts and the PWA meta tags in index.html ("Add to Home Screen" →
// standalone, no browser chrome) are the fallback.
import { icon } from "./icon.js";

const root = () => document.documentElement;

export const fsAvailable = () =>
  !!(root().requestFullscreen || root().webkitRequestFullscreen);

export const isFullscreen = () =>
  !!(document.fullscreenElement || document.webkitFullscreenElement);

export async function enterFullscreen() {
  if (isFullscreen()) return;
  try {
    if (root().requestFullscreen) await root().requestFullscreen({ navigationUI: "hide" });
    else root().webkitRequestFullscreen();
  } catch {
    return; // not a trusted user gesture (e.g. hand-cursor pinch) — skip
  }
  try { await screen.orientation?.lock?.("landscape"); } catch {} // desktop rejects
}

export async function exitFullscreen() {
  try { screen.orientation?.unlock?.(); } catch {}
  try { await (document.exitFullscreen?.() ?? document.webkitExitFullscreen?.()); } catch {}
}

const isCoarse = () => matchMedia("(pointer: coarse)").matches;

// Mounts the floating toggle (touch devices only, see .fs-btn CSS) and, on
// phones, auto-enters fullscreen when a game is opened — the tap on the
// game card is a trusted gesture, so the request is allowed there.
export function initFullscreen() {
  if (!fsAvailable()) return;

  const btn = document.createElement("button");
  btn.className = "fs-btn";
  btn.setAttribute("aria-label", "Toggle fullscreen");
  const paint = () => {
    btn.innerHTML = icon(isFullscreen() ? "minimize" : "maximize", { size: 16 });
  };
  paint();
  btn.addEventListener("click", () => (isFullscreen() ? exitFullscreen() : enterFullscreen()));
  for (const ev of ["fullscreenchange", "webkitfullscreenchange"])
    document.addEventListener(ev, paint);
  document.body.appendChild(btn);

  document.addEventListener("click", (e) => {
    if (!isCoarse() || isFullscreen()) return;
    if (e.target.closest?.('a[href^="#/games/"]')) enterFullscreen();
  }, true);
}
