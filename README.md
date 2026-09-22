# OnlyHand

Hand tracking platform — Python CLI demos + browser game hub, all powered by MediaPipe. No GPU required.

![OnlyHand demo](images/demo.gif)

---

## What's inside

| Layer | What it does |
|-------|-------------|
| `basics/` | Python scripts: real-time hand/face/object detection via webcam |
| `web/` | Vite SPA with 7 built-in hand-controlled games; Pong, Beat Pulse, Jelly Yeet and Asteroids are in the public beta |
| `models/` | Pre-trained MediaPipe + TFLite models (hand, face, object) |

---

## Quick start

### Python demos

```bash
# Create and activate venv (first time)
python -m venv .venv
.venv/Scripts/Activate.ps1        # Windows
source .venv/bin/activate          # macOS/Linux

pip install opencv-python mediapipe

# Run any demo
python basics/handTracking.py
python basics/gestureCapture.py
python basics/facesLiveRecognition.py
python basics/completeCountFinger.py
python basics/simpleCountFinger.py
python basics/objectStaticRecognition.py   # uses images/dog.webp, no webcam
```

Press `ESC` to quit any live webcam script.

### Web game hub

```bash
cd web
npm install        # first time only
npm run dev        # http://localhost:5173
```

Node 22.11+ required (Vite 6). Build: `npm run build` → output in `web/dist/`.

---

## Python scripts

All live scripts use MediaPipe's `LIVE_STREAM` mode — each frame is sent asynchronously and results are read in the main loop.

| Script | Description |
|--------|-------------|
| `handTracking.py` | 21-landmark hand skeleton, drawn as green dots |
| `gestureCapture.py` | Pre-trained gesture classifier (thumbs up, peace, OK, etc.) up to 2 hands |
| `simpleCountFinger.py` | Index finger up/down → binary 0/1 toggle |
| `completeCountFinger.py` | 4 fingers → binary 0–15 counter |
| `facesLiveRecognition.py` | BlazeFace real-time detection with 6 keypoints |
| `objectStaticRecognition.py` | EfficientDet on `images/dog.webp` |
| `openWebCam.py` | Bare webcam preview (OpenCV only) |

Shared logic lives in `basics/myLibraries.py`:

- `showDotsOnLandmarks()` — draw landmarks
- `binaryCountWithFingers()` — 4-finger binary count
- `visualize()` / `visualizeFaces()` — bounding box renderers

---

## Web game hub

Vanilla JS SPA, hash routing, no framework.

```
src/
├── main.js              # Route registration + startRouter()
├── router.js            # Hash router (~30 lines, zero deps)
├── core/
│   ├── camera.js        # Singleton webcam stream
│   ├── profile.js       # User profile (localStorage, schema-versioned)
│   ├── scores.js        # Per-game score persistence + cloud submit
│   ├── gameKit.js       # Shared game feel: particles, shake, countdown, WebAudio sfx, HiDPI canvas
│   ├── handCursor.js    # Point with your hand, pinch to click (menus/overlays)
│   ├── cardPreviews.js  # Animated mini-scenes on the hub cards
│   ├── icon.js          # Lucide line-icon SVG builder
│   ├── badges.js        # Gamification: XP → level curve + 13 achievement badges
│   └── backend.js       # Optional Supabase: anon auth + global leaderboard
├── input/
│   └── handInput.js     # Singleton GestureRecognizer, One-Euro filter, pinch detection
├── views/
│   ├── onboarding.js    # Camera gate → pick your tag → how-to-play (first access)
│   ├── menu.js          # Hub: webcam preview + game grid
│   ├── profileView.js   # Profile editor, avatar picker, stats, level + badges, settings
│   ├── leaderboardView.js # Hall of Fame: all-time top 10 per game, podium + your rank
│   └── gameHost.js      # Game lifecycle, pause, Game Over + leaderboard overlay
└── games/
    ├── registry.js      # { id, name, icon, description, requires, load() }
    ├── pong/            # Vertical paddle — hand y-position
    ├── breakout/        # Horizontal paddle — power-ups, endless levels
    ├── snake/           # Steer with hand offset from center
    ├── slash/           # Swipe fast to slice fruit, avoid bombs, chain combos
    └── asteroids/       # Ship follows hand, auto-fire, pinch = rapid fire
```

First access can enable the camera, pick a player tag (name + avatar), learn point/pinch/pause
and enter the hub. Visitors can also browse immediately and every game offers a mouse/touch
trial mode: move to steer, hold to pinch, and press Space for fist actions. The webcam remains
the full experience, but a shared challenge no longer loses players at the permission prompt.
Pointer runs stay local and are labelled as practice so global and daily boards remain hand-only.

The public-growth loop is built into the result screen: every score can become a direct
challenge link, and the browser generates a 1080×1920 result card using the gameplay canvas
(never the webcam) for TikTok, Reels and Shorts. The hub also features a seeded daily Asteroids
run with a UTC countdown and local streak. A web manifest plus service worker make the arcade
installable and cache previously used assets for repeat visits.

The first screen is a conversion-focused demo landing: it shows real gameplay before asking
for camera access, keeps the privacy promise next to the CTA, and offers a camera-free route to
explore the games. Its animated WebP is generated from `images/demo.gif` with
`python web/scripts/optimize-demo.py`.

On browsers with `MediaRecorder` support, **Creator Clip** records an opt-in 30-second vertical
video composed locally from the gameplay canvas and hand-cam. It adds a hook and final-score
slate for TikTok/Reels/Shorts, records no microphone audio and never uploads automatically.

### Games

| Game | Control | Mechanic |
|------|---------|---------|
| **Pong** | Hand Y → paddle height | Speed ramps with a cap, particle + shake juice |
| **Breakout** | Hand X → paddle position | Endless levels, power-ups (wide paddle, multiball) |
| **Snake** | Hand offset from center → steer | Progressive speed, live steering compass |
| **Fruit Slash** | Fast swipe = blade slice | Fruit arcs + gravity, combo multiplier, bombs cost a life, rare golden fruit |
| **Jelly Yeet** | Pinch + drag, release to launch | Toss cute jellies through a moving portal, avoid bomb blobs and trigger FEVER |
| **Asteroids** | Hand → ship · **pinch = rapid fire** | Auto-fires nearest rock, asteroids split, score = kills |

All games share `core/gameKit.js`: synthesized WebAudio sfx (zero audio files), particles,
screen shake, 3‑2‑1 countdown, HiDPI canvas, Orbitron HUD. ESC pauses; losing the hand for
2 s auto-pauses, showing it again resumes. In menus and overlays a **hand cursor** appears:
point at a button and pinch to click.

### Game contract

```js
export default {
  async mount({ canvas, onHandUpdate, handState, onScore }) {
    // game setup
    return { unmount() { /* cleanup */ }, pause() {}, resume() {} };
  }
}
```

Hand state: `{ x, y, isDetected, landmarks, gesture, pinch }` — x/y normalized 0–1,
One-Euro filtered; `pinch` = thumb-index pinch with hysteresis.

### Gamification

Every finished run earns XP (score + a per-run bonus) that levels you up — the
profile shows your level bar plus **13 achievement badges** (milestones, personal
records, per-game mastery) with live progress on the locked ones. New unlocks pop
on the Game Over screen. The **Hall of Fame** (`#/board`, trophy in the nav) is the
all-time leaderboard: one tab per game, top-3 podium, ranks 4–10, and your global
rank even when you're off the board.

### Global leaderboard (optional)

Plug in a free [Supabase](https://supabase.com) project and every run is submitted to a
global per-game leaderboard (anonymous auth, RLS-guarded, rate-limited). Setup in
[`supabase/README.md`](supabase/README.md) — without it the app stays 100% local.

### Adding a game

1. Create `src/games/<id>/index.js` with the contract above.
2. Add entry to `src/games/registry.js`.

---

## Models

Python models live in `models/`. The browser ships only
`web/public/models/hand/gesture_recognizer.task`, the model used by the game hub:

| Model | Purpose |
|-------|---------|
| `hand/hand_landmarker.task` | 21-point hand skeleton (Python) |
| `hand/gesture_recognizer.task` | Gesture classification (Python + web) |
| `face/blaze_face_short_range.tflite` | Face detection + 6 keypoints (Python) |
| `object/efficientdet.tflite` | Object detection, COCO 80 classes (Python) |

All pre-trained — no training pipeline in this repo.

---

## Tech stack

| Layer | Tech |
|-------|------|
| Hand/gesture/face/object detection | [MediaPipe](https://ai.google.dev/edge/mediapipe/solutions/guide) |
| Python video + drawing | OpenCV |
| Web ML inference | `@mediapipe/tasks-vision` 0.10.35 (WASM) |
| Web bundler | Vite 6 |
| Frontend | Vanilla JS (ES modules, no framework) |
| Backend (optional) | [Supabase](https://supabase.com) — anonymous auth, Postgres + RLS leaderboard |

---

## Project structure

```
OnlyHand/
├── basics/           # Python CLI demos
├── models/           # Shared ML models
├── images/           # Test images (dog.webp)
├── landmarks-guide/  # Hand landmark reference diagram
├── web/              # Vite SPA
│   ├── public/
│   │   ├── models/   # Browser gesture recognizer only
│   │   └── wasm/     # MediaPipe Vision SIMD + compatibility runtimes
│   └── src/          # App source
├── supabase/         # Backend schema (schema.sql) + setup guide
├── CLAUDE.md         # Dev guide
└── REFERENCES.md     # Stack documentation links
```

---

## Requirements

**Python:** `opencv-python`, `mediapipe` (CPU-only, no GPU)

**Node:** 22.11+ (Vite 6)
