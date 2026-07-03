// Hand cursor: point with your hand, pinch to click.
// A DOM ring follows the palm; anything clickable (a, button, [data-hand])
// highlights on hover and fires .click() on a pinch. Views opt in via
// startHandCursor()/stopHandCursor() — never active during gameplay.
import { onHandUpdate } from "../input/handInput.js";
import { sfx } from "./gameKit.js";

const CLICK_COOLDOWN_MS = 450;
const CLICKABLE = "a, button, [data-hand]";

let el = null;
let unsub = null;
let hoverTarget = null;
let wasPinching = false;
let lastClickAt = 0;

export function startHandCursor() {
  if (el) return;
  wasPinching = true; // require a released pinch first — no accidental click on open
  el = document.createElement("div");
  el.className = "hand-cursor hidden";
  el.innerHTML = `<div class="hc-ring"></div><div class="hc-dot"></div>`;
  document.body.appendChild(el);

  unsub = onHandUpdate((s) => {
    if (!el) return;
    if (!s.isDetected) {
      el.classList.add("hidden");
      setHover(null);
      wasPinching = false;
      return;
    }
    el.classList.remove("hidden");

    const x = (1 - s.x) * window.innerWidth;  // mirror x to match the preview
    const y = s.y * window.innerHeight;
    el.style.transform = `translate(${x}px, ${y}px)`;

    const under = document.elementFromPoint(x, y);
    setHover(under?.closest(CLICKABLE) ?? null);

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
