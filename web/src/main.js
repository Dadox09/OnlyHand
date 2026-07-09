import "./styles/main.css";
import { route, startRouter } from "./router.js";
import { mount as mountOnboarding, unmount as unmountOnboarding } from "./views/onboarding.js";
import { mount as mountMenu, unmount as unmountMenu } from "./views/menu.js";
import { mount as mountProfile, unmount as unmountProfile } from "./views/profileView.js";
import { mount as mountGame, unmount as unmountGame } from "./views/gameHost.js";
import { mount as mountBoard, unmount as unmountBoard } from "./views/leaderboardView.js";
import { mount as mountPrivacy, unmount as unmountPrivacy } from "./views/privacyView.js";
import { initFullscreen } from "./core/fullscreen.js";

const app = document.getElementById("app");
initFullscreen();

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

startRouter();
