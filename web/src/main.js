import "./styles/main.css";
import { route, startRouter } from "./router.js";
import { mount as mountOnboarding, unmount as unmountOnboarding } from "./views/onboarding.js";
import { mount as mountMenu, unmount as unmountMenu } from "./views/menu.js";
import { mount as mountProfile, unmount as unmountProfile } from "./views/profileView.js";
import { mount as mountGame, unmount as unmountGame } from "./views/gameHost.js";
import { mount as mountBoard, unmount as unmountBoard } from "./views/leaderboardView.js";
import { mount as mountPrivacy, unmount as unmountPrivacy } from "./views/privacyView.js";
import { initFullscreen } from "./core/fullscreen.js";
import { track } from "./core/analytics.js";
import { initInstallPrompt } from "./core/install.js";

const app = document.getElementById("app");
initFullscreen();
initInstallPrompt();

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register(new URL(`${import.meta.env.BASE_URL}sw.js`, location.href)).catch((error) => {
      console.warn("[pwa] service worker registration failed:", error.message);
    });
  });
}

function unmountAll() {
  unmountOnboarding();
  unmountGame();
  unmountProfile();
  unmountMenu();
  unmountBoard();
  unmountPrivacy();
}

route("/", () => {
  unmountAll();
  mountOnboarding(app);
});

route("/hub", () => {
  unmountAll();
  mountMenu(app).catch(console.error);
});

route("/daily", () => {
  unmountAll();
  track("Daily Opened", { source: "hub" });
  mountGame(app, { params: { id: "asteroids", daily: "1" } }).catch(console.error);
});

route("/profile", () => {
  unmountAll();
  mountProfile(app);
});

route("/board", () => {
  unmountAll();
  mountBoard(app, {});
});

route("/board/:id", ({ params }) => {
  unmountAll();
  mountBoard(app, { params });
});

route("/privacy", () => {
  unmountAll();
  mountPrivacy(app);
});

route("/games/:id", ({ params }) => {
  unmountAll();
  mountGame(app, { params }).catch(console.error);
});

route("/games/pong/:code", ({ params }) => {
  unmountAll();
  mountGame(app, { params: { id: "pong", code: params.code } }).catch(console.error);
});

route("/games/orb-rush/:code", ({ params }) => {
  unmountAll();
  mountGame(app, { params: { id: "orb-rush", code: params.code } }).catch(console.error);
});

route("/challenge/:id/:score/:name", ({ params }) => {
  unmountAll();
  track("Challenge Opened", { game: params.id });
  mountGame(app, { params: { ...params, challenge: "1" } }).catch(console.error);
});

startRouter();
