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
    description: "Steer by moving your hand away from the center.",
    requires: ["hand"],
    load: () => import("./snake/index.js"),
  },
  {
    id: "asteroids",
    name: "Asteroids",
    icon: "🚀",
    description: "Fly with your hand — auto-fires at the nearest rock. Pinch for rapid fire.",
    requires: ["hand"],
    load: () => import("./asteroids/index.js"),
  },
];
