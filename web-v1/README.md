# OnlyHand Web Hub

Browser-based game hub controlled by hand tracking. Uses MediaPipe Tasks Vision (JS).

## Run

Serve **from project root** (not from `web/`) so the model files in `../models/` are reachable:

```powershell
# from OnlyHand/ project root
python -m http.server 8000
```

Open <http://localhost:8000/web/> in Chrome/Edge. Allow webcam access.

## Structure

```
web/
├── index.html          # Hub UI (webcam preview + game menu)
├── style.css
└── js/
    ├── hub.js          # Bootstrap, menu, routing
    ├── input/
    │   └── handInput.js # HandLandmarker wrapper
    └── games/
        ├── registry.js  # Game catalog
        └── pong.js      # Hand Pong
```

## Add a new game

1. Create `js/games/mygame.js` exporting `createMyGame({ canvas, handInput })` returning `{ destroy }`.
2. Register it in `js/games/registry.js`.

The game receives a shared `handInput` instance — subscribe via `handInput.onUpdate(cb)` for `{ x, y, isDetected, landmarks }` per frame.
