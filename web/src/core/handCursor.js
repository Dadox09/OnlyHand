// Hand cursor: point with your hand, pinch to click.
// A DOM ring follows the palm; anything clickable (a, button, [data-hand])
// highlights on hover and fires .click() on a pinch. Views opt in via
// startHandCursor()/stopHandCursor() — never active during gameplay.
import { onHandUpdate, mapToActiveBox } from "../input/handInput.js";
import { sfx } from "./gameKit.js";

const CLICK_COOLDOWN_MS = 450;
const CLICKABLE = "a, button, [data-hand]";

let el = null;
let unsub = null;
let hoverTarget = null;
let wasPinching = false;
let lastClickAt = 0;

// Detection results arrive at camera/inference rate (~15–25 fps); rendering
// the raw positions makes the ring jump. A rAF loop eases the visible cursor
// toward the latest target so it glides at display refresh rate instead.
const SMOOTHING = 18; // higher = snappier, lower = floatier
let targetX = 0, targetY = 0;
let curX = 0, curY = 0;
let snapNext = true; // jump straight to target on (re)appear — no glide across screen
let rafId = null;
let lastFrameAt = 0;

function renderLoop(now) {
  if (!el) { rafId = null; return; }
  const dt = Math.min((now - lastFrameAt) / 1000, 0.1);
  lastFrameAt = now;
  if (snapNext) {
    curX = targetX;
    curY = targetY;
    snapNext = false;
  } else {
    const k = 1 - Math.exp(-SMOOTHING * dt);
    curX += (targetX - curX) * k;
    curY += (targetY - curY) * k;
  }
  el.style.transform = `translate3d(${curX}px, ${curY}px, 0)`;

  if (!el.classList.contains("hidden")) {
    const under = document.elementFromPoint(curX, curY);
    setHover(under?.closest(CLICKABLE) ?? null);
  }

  rafId = requestAnimationFrame(renderLoop);
}

export function startHandCursor() {
  if (el) return;
  wasPinching = true; // require a released pinch first — no accidental click on open
  el = document.createElement("div");
  el.className = "hand-cursor hidden";
  el.innerHTML = `<div class="hc-ring"></div><div class="hc-dot"></div>`;
  document.body.appendChild(el);

  snapNext = true;
  lastFrameAt = performance.now();
  rafId = requestAnimationFrame(renderLoop);

  unsub = onHandUpdate((s) => {
    if (!el) return;
    if (!s.isDetected) {
      el.classList.add("hidden");
      setHover(null);
      wasPinching = false;
      snapNext = true; // don't glide from stale position when the hand returns
      return;
    }
    el.classList.remove("hidden");

    targetX = (1 - mapToActiveBox(s.x)) * window.innerWidth;  // mirror x to match the preview
    targetY = mapToActiveBox(s.y) * window.innerHeight;

    el.classList.toggle("pinching", s.pinch);
    if (s.pinch && !wasPinching && hoverTarget && Date.now() - lastClickAt > CLICK_COOLDOWN_MS) {
      lastClickAt = Date.now();
      sfx.click();
      el.classList.remove("clicked");
      void el.offsetWidth; // restart pulse animation
      el.classList.add("clicked");
      hoverTarget.click();
    }
    wasPinching = s.pinch;
  });
}

export function stopHandCursor() {
  unsub?.();
  unsub = null;
  setHover(null);
  el?.remove();
  el = null;
  wasPinching = false;
  if (rafId !== null) cancelAnimationFrame(rafId);
  rafId = null;
}

function setHover(target) {
  if (target === hoverTarget) return;
  hoverTarget?.classList.remove("hand-hover");
  hoverTarget = target;
  if (hoverTarget) {
    hoverTarget.classList.add("hand-hover");
    sfx.hover();
  }
  el?.classList.toggle("hovering", !!hoverTarget);
}
