import "./styles/main.css";
import { route, startRouter } from "./router.js";
import { mount as mountMenu, unmount as unmountMenu } from "./views/menu.js";
import { mount as mountProfile, unmount as unmountProfile } from "./views/profileView.js";
import { mount as mountGame, unmount as unmountGame } from "./views/gameHost.js";

const app = document.getElementById("app");
let currentUnmount = null;

function swap(mountFn, opts = {}) {
  currentUnmount?.();
  currentUnmount = null;
  mountFn(app, opts).then?.(() => {});
  currentUnmount = opts._unmount;
}

route("/", () => {
  currentUnmount?.();
  unmountGame();
  unmountProfile();
  mountMenu(app).catch(console.error);
  currentUnmount = unmountMenu;
});

route("/profile", () => {
  currentUnmount?.();
  unmountGame();
  unmountMenu();
  mountProfile(app);
  currentUnmount = unmountProfile;
});

route("/games/:id", ({ params }) => {
  currentUnmount?.();
  unmountMenu();
  unmountProfile();
  mountGame(app, { params }).catch(console.error);
  currentUnmount = unmountGame;
});

startRouter();
