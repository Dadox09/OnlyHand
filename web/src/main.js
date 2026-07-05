import "./styles/main.css";
import { route, startRouter } from "./router.js";
import { mount as mountOnboarding, unmount as unmountOnboarding } from "./views/onboarding.js";
import { mount as mountMenu, unmount as unmountMenu } from "./views/menu.js";
import { mount as mountProfile, unmount as unmountProfile } from "./views/profileView.js";
import { mount as mountGame, unmount as unmountGame } from "./views/gameHost.js";
import { mount as mountBoard, unmount as unmountBoard } from "./views/leaderboardView.js";

const app = document.getElementById("app");

function unmountAll() {
  unmountOnboarding();
  unmountGame();
  unmountProfile();
  unmountMenu();
  unmountBoard();
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

route("/games/:id", ({ params }) => {
  unmountAll();
  mountGame(app, { params }).catch(console.error);
});

startRouter();
