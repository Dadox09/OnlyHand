# OnlyHand — launch posts (copy-paste ready)

Link: https://dadox09.itch.io/onlyhand

Rule: 1 post per community per week max. Always attach the GIF/video — it does 90% of the work.
Reply to every comment in the first 2 hours; algorithms reward early engagement.

---

## Reddit — r/WebGames

**Title:**
I made a browser arcade you play with your bare hand — webcam is the controller (no install, free)

**Body:**
Point to move, pinch to shoot. Hand tracking runs 100% locally in the browser (MediaPipe) — no video ever leaves your device.

6 games: Asteroids (fist = smart bomb), Pong vs a ranked AI, an osu!-style rhythm game, Breakout, Snake, Slash. Global leaderboard, badges, unlockable ships.

Play free: https://dadox09.itch.io/onlyhand

Works best on desktop with decent lighting. Would love feedback on the hand controls — tuning gesture detection has been 80% of the work.

---

## Reddit — r/SideProject

**Title:**
I spent months building a web arcade controlled entirely by hand gestures — just launched on itch.io

**Body:**
No controller, no keyboard: your webcam tracks your hand (MediaPipe, all local, privacy-safe) and you point/pinch to play.

Tech: Vanilla JS + Vite, MediaPipe GestureRecognizer with One-Euro filtering for stable cursor, WebAudio procedural music, Supabase leaderboard. No game engine — everything canvas 2D at fixed 60 Hz.

Hardest problems: pinch detection hysteresis (no accidental clicks), velocity coasting when tracking drops frames, camera-permission UX (biggest funnel drop).

Try it: https://dadox09.itch.io/onlyhand — feedback very welcome.

---

## Hacker News — Show HN

**Title:**
Show HN: A browser arcade you play with your bare hand (MediaPipe, no install)

**URL:** https://dadox09.itch.io/onlyhand

**First comment (post immediately after submitting):**
Author here. Six arcade games (Asteroids, Pong, a rhythm game, etc.) controlled entirely by hand gestures through the webcam. Everything runs client-side: MediaPipe GestureRecognizer on wasm, One-Euro filter for cursor stability, pinch with hysteresis so it doesn't double-fire, 200 ms velocity coasting on tracking dropouts. Fixed-timestep game loop so 144 Hz monitors don't speed the games up. No engine, vanilla JS + canvas.

The camera feed never leaves the device — only a player tag and score go to a Supabase leaderboard (optional).

Happy to answer anything about the gesture-tuning rabbit hole.

---

## itch.io devlog (post from your dashboard — helps itch discovery)

**Title:** OnlyHand is live — play arcade classics with your bare hand

**Body:**
First public release. 6 hand-controlled games, global leaderboard, badges, unlockable ships. All hand tracking is local — your camera never leaves your device. Feedback and scores welcome: leave a comment with your best Asteroids sector.

---

## TikTok / Shorts / Reels — 3 clip scripts

1. **Hook:** "POV: you control Asteroids with your bare hand" — split screen hand + game, fist-bomb moment as the payoff. Caption: "no controller. webcam only. link in bio (free, browser)"
2. **Hook:** "My webcam is my gamepad" — Pong smash rally, lose a point, come back. Caption: "pinch = smash 🤏"
3. **Hook:** "I built a rhythm game you play in the air" — Beat Pulse FEVER streak. Caption: "osu! but with your hand"

Post the same clip on all 3 platforms. Best times: 18–21 CET.

---

## CrazyGames pitch (developer.crazygames.com → Submit game)

**Elevator pitch:**
OnlyHand is a 6-game arcade hub controlled entirely by hand gestures via webcam — a genuinely novel input that players can't get anywhere else on the platform. All tracking is client-side (MediaPipe wasm), zero latency-sensitive server needs, works on any laptop with a camera. Live on itch.io with leaderboard, badges, and progression already built in.

**Note for the form:** mention camera permission is required and privacy-safe (no video leaves the device) — address it before they ask.
