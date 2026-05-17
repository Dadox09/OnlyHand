export const games = [
  {
    id: "pong",
    name: "Hand Pong",
    icon: "🏓",
    description: "Move your hand up/down to control the paddle.",
    requires: ["hand"],
    load: () => import("./pong/index.js"),
  },
];
