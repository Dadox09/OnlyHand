import { createPongGame } from "./pong.js";

export const games = [
  {
    id: "pong",
    name: "Hand Pong",
    description: "Move your hand up/down to control the paddle. Don't miss the ball.",
    factory: createPongGame,
  },
];
