// controls: shown as always-visible chips in the gameHost hint bar
// { icon: core/icon.js name, gesture: short caps label, action: what it does }
export const games = [
  {
    id: "pong",
    name: "Hand Pong",
    icon: "🏓",
    description: "Duel a ranked AI rival — pinch = smash, grab orbs, climb ROOKIE → NIGHTMARE.",
    controls: [
      { icon: "pointer", gesture: "MOVE", action: "paddle follows your hand" },
      { icon: "pinch", gesture: "PINCH", action: "smash shot" },
      { icon: "zap", gesture: "ORBS", action: "hit them with your shot" },
    ],
    requires: ["hand"],
    load: () => import("./pong/index.js"),
  },
  {
    id: "breakout",
    name: "Breakout",
    icon: "🧱",
    description: "Move your hand left/right to smash all the bricks.",
    controls: [
      { icon: "swipe", gesture: "MOVE", action: "hand left · right" },
    ],
    requires: ["hand"],
    hidden: true,
    load: () => import("./breakout/index.js"),
  },
  {
    id: "snake",
    name: "Snake",
    icon: "🐍",
    description: "Steer by moving your hand away from the center.",
    controls: [
      { icon: "pointer", gesture: "STEER", action: "move hand away from center" },
    ],
    requires: ["hand"],
    hidden: true,
    load: () => import("./snake/index.js"),
  },
  {
    id: "slash",
    name: "Fruit Slash",
    icon: "🍉",
    description: "Swipe fast to slice flying fruit — chain combos, don't hit the bombs.",
    controls: [
      { icon: "swipe", gesture: "SWIPE", action: "slice fast, chain combos" },
      { icon: "x", gesture: "AVOID", action: "bombs" },
    ],
    requires: ["hand"],
    hidden: true,
    load: () => import("./slash/index.js"),
  },
  {
    id: "beat",
    name: "Beat Pulse",
    icon: "🎧",
    description: "Ride the beat — touch orbs as the ring closes (pinch = snap early), grab ⭐, dodge ⚠, ignite FEVER.",
    controls: [
      { icon: "pointer", gesture: "TOUCH", action: "orb as the ring closes" },
      { icon: "pinch", gesture: "PINCH", action: "snap early · grab ⭐" },
      { icon: "x", gesture: "DODGE", action: "red ⚠" },
    ],
    requires: ["hand"],
    hidden: true,
    load: () => import("./beat/index.js"),
  },
  {
    id: "asteroids",
    name: "Asteroids",
    icon: "🚀",
    description: "Clear sector after sector — fighters, bosses, power-ups. Pinch = rapid fire · fist = bomb.",
    controls: [
      { icon: "pointer", gesture: "MOVE", action: "steer your ship" },
      { icon: "pinch", gesture: "PINCH", action: "rapid fire" },
      { icon: "fist", gesture: "FIST", action: "smart bomb" },
    ],
    requires: ["hand"],
    load: () => import("./asteroids/index.js"),
  },
];

// Games shown in the hub/leaderboard/profile UI; hidden ones stay routable by id.
export const visibleGames = games.filter((g) => !g.hidden);
