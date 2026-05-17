# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running Scripts

Activate venv first, then run any script from the `basics/` directory:

```powershell
.venv\Scripts\Activate.ps1
python basics\handTracking.py
python basics\gestureCapture.py
python basics\facesLiveRecognition.py
python basics\objectStaticRecognition.py   # uses images/dog.webp, no webcam
python basics\simpleCountFinger.py
python basics\completeCountFinger.py
```

Press `ESC` to quit any live webcam script.

## Architecture

**Standalone scripts + shared utilities** — each script in `basics/` is a self-contained tool. Common drawing/processing logic lives in `basics/myLibraries.py`.

**MediaPipe async pattern** — live webcam scripts use `RunningMode.LIVE_STREAM` with a callback that receives results asynchronously. Each frame is sent via `detector.detect_async(mp_image, timestamp_ms)` and the callback writes results to a shared variable that the main loop reads.

**Model paths** — scripts reference models relative to the project root (`models/hand/`, `models/face/`, `models/object/`). When running from inside `basics/`, paths use `../models/`.

## Key Files

- [basics/myLibraries.py](basics/myLibraries.py) — shared utilities: `showDotsOnLandmarks()`, `binaryCountWithFingers()`, `visualize()`, `visualizeFaces()`
- [basics/handTracking.py](basics/handTracking.py) — 21-landmark hand detection, LIVE_STREAM mode
- [basics/gestureCapture.py](basics/gestureCapture.py) — pre-trained gesture recognition (thumbs up, peace, etc.), up to 2 hands
- [basics/facesLiveRecognition.py](basics/facesLiveRecognition.py) — BlazeFace real-time detection
- [basics/objectStaticRecognition.py](basics/objectStaticRecognition.py) — EfficientDet on static image
- [REFERENCES.md](REFERENCES.md) — stack docs, MediaPipe API links

## Stack

- **MediaPipe** — hand landmark, gesture recognition, face detection, object detection (CPU-only)
- **OpenCV** — webcam capture, drawing, frame loop
- No GPU required, no server, no build step

---

## Web Game Hub (`web/`)

Vite 5 SPA, Vanilla JS, hash routing.

### Dev

```powershell
cd web
npm install       # first time only
npm run dev       # http://localhost:5173, HMR
npm run build     # output in web/dist/
npm run preview   # serve dist/
```

Node 22.11 works (Vite 5). Node 22.12+ required only for Vite 8+.

### Architecture

```
src/
├── main.js              # Bootstrap: route registration + startRouter()
├── router.js            # Hash router (30 lines, no deps)
├── core/
│   ├── camera.js        # Singleton webcam stream
│   ├── profile.js       # User profile (localStorage, schema-versioned)
│   └── scores.js        # Per-game score persistence
├── input/
│   └── handInput.js     # Singleton HandLandmarker, subscriber Set, pauses when 0 subs
├── views/
│   ├── menu.js          # Hub: webcam preview + game grid
│   ├── profileView.js   # Profile editor + stats per game
│   └── gameHost.js      # Lazy-loads game module, manages lifecycle
└── games/
    ├── registry.js      # { id, name, icon, description, requires, load() }
    └── pong/index.js    # export default { meta, async mount({ canvas, onHandUpdate, handState, onScore }) }
```

**Game contract**: each game exports `default { async mount(...) → { unmount() } }`.  
**Input contract**: `onHandUpdate(cb)` → `() => unsub`. State: `{ x, y, isDetected, landmarks }`.  
**Wasm**: served from `public/wasm/` (local copy of `@mediapipe/tasks-vision/wasm`).  
**Models**: served from `public/models/` (copy of project-root `models/`).

### Adding a game

1. Create `src/games/<id>/index.js` with the game contract above.
2. Add entry to `src/games/registry.js`.
