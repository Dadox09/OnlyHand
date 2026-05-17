export const games = [
  {
    id: "pong",
    name: "Hand Pong",
    icon: "🏓",
    description: "Move your hand up/down to control the paddle.",
    requires: ["hand"],
    load: () => import("./pong/index.js"),
  },
  {
    id: "breakout",
    name: "Breakout",
    icon: "🧱",
    description: "Move your hand left/right to smash all the bricks.",
    requires: ["hand"],
    load: () => import("./breakout/index.js"),
  },
  {
    id: "snake",
    name: "Snake",
    icon: "🐍",
    description: "Push your hand to the edge of the frame to steer.",
    requires: ["hand"],
    load: () => import("./snake/index.js"),
  },
  {
    id: "asteroids",
    name: "Asteroids",
    icon: "🚀",
    description: "Move your hand to fly the ship. Auto-fires in facing direction.",
    requires: ["hand"],
    load: () => import("./asteroids/index.js"),
  },
];
