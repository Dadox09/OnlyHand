# OnlyHand

Hand tracking platform — Python CLI demos + browser game hub, all powered by MediaPipe. No GPU required.

![OnlyHand demo](images/demo.gif)

---

## What's inside

| Layer | What it does |
|-------|-------------|
| `basics/` | Python scripts: real-time hand/face/object detection via webcam |
| `web/` | Vite SPA with 4 hand-controlled games (Pong, Breakout, Snake, Asteroids) |
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

Node 22.11+ required (Vite 5). Build: `npm run build` → output in `web/dist/`.

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
│   └── scores.js        # Per-game score persistence
├── input/
│   └── handInput.js     # Singleton GestureRecognizer + subscriber pattern
├── views/
│   ├── menu.js          # Hub: webcam preview + game grid
│   ├── profileView.js   # Profile editor, avatar picker, stats, settings
│   └── gameHost.js      # Lazy-loads game module, manages lifecycle
└── games/
    ├── registry.js      # { id, name, icon, description, requires, load() }
    ├── pong/            # Vertical paddle — hand y-position
    ├── breakout/        # Horizontal paddle — hand x-position, 3 lives
    ├── snake/           # Edge-zone steering → direction input
    └── asteroids/       # Ship follows hand; Thumb_Up gesture restarts
```

### Games

| Game | Control | Mechanic |
|------|---------|---------|
| **Pong** | Hand Y → paddle height | Classic Pong, 800×500 |
| **Breakout** | Hand X → paddle position | 5 brick rows, angle on paddle hit |
| **Snake** | Hand in edge zone → steer | Progressive speed, score = length |
| **Asteroids** | Hand position → ship | Asteroids split, score = seconds survived |

### Game contract

```js
export default {
  async mount({ canvas, onHandUpdate, handState, onScore }) {
    // game setup
    return { unmount() { /* cleanup */ } };
  }
}
```

Hand state: `{ x, y, isDetected, landmarks }` — normalized 0–1.

### Adding a game

1. Create `src/games/<id>/index.js` with the contract above.
2. Add entry to `src/games/registry.js`.

---

## Models

Stored in `models/` (Python) and `web/public/models/` (served as static assets):

| Model | Purpose |
|-------|---------|
| `hand/hand_landmarker.task` | 21-point hand skeleton |
| `hand/gesture_recognizer.task` | ASL-like gesture classification |
| `face/blaze_face_short_range.tflite` | Face detection + 6 keypoints |
| `object/efficientdet.tflite` | Object detection (COCO, 80 classes) |

All pre-trained — no training pipeline in this repo.

---

## Tech stack

| Layer | Tech |
|-------|------|
| Hand/gesture/face/object detection | [MediaPipe](https://ai.google.dev/edge/mediapipe/solutions/guide) |
| Python video + drawing | OpenCV |
| Web ML inference | `@mediapipe/tasks-vision` 0.10.35 (WASM) |
| Web bundler | Vite 5 |
| Frontend | Vanilla JS (ES modules, no framework) |

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
│   │   ├── models/   # Static copy of models/ for browser
│   │   └── wasm/     # MediaPipe Vision WASM binaries
│   └── src/          # App source
├── CLAUDE.md         # Dev guide
└── REFERENCES.md     # Stack documentation links
```

---

## Requirements

**Python:** `opencv-python`, `mediapipe` (CPU-only, no GPU)

**Node:** 22.11+ (Vite 5)
