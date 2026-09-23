const domain = import.meta.env.VITE_PLAUSIBLE_DOMAIN;
let ready = false;

export function initAnalytics() {
  if (ready || !domain || navigator.doNotTrack === "1") return;
  ready = true;
  window.plausible = window.plausible || function plausible() {
    (window.plausible.q = window.plausible.q || []).push(arguments);
  };
  const script = document.createElement("script");
  script.defer = true;
  script.dataset.domain = domain;
  script.src = "https://plausible.io/js/script.js";
  document.head.appendChild(script);
}

export function track(name, props = {}) {
  // Always emit a local event so another first-party analytics adapter can be
  // attached later without changing game code. Plausible is optional/cookieless.
  window.dispatchEvent(new CustomEvent("onlyhand:analytics", { detail: { name, props } }));
  if (domain && navigator.doNotTrack !== "1") {
    window.plausible?.(name, { props, url: `${location.origin}${location.pathname}${location.search}` });
  }
}
