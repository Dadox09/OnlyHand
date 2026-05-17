import {
  HandLandmarker,
  FilesetResolver,
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs";

export class HandInput {
  constructor() {
    this.landmarker = null;
    this.callbacks = new Set();
    this.lastVideoTime = -1;
    this.running = false;
    this.video = null;
    this.state = {
      x: 0.5,
      y: 0.5,
      isDetected: false,
      landmarks: null,
    };
  }

  async init() {
    const fileset = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
    );
    this.landmarker = await HandLandmarker.createFromOptions(fileset, {
      baseOptions: {
        modelAssetPath: "../models/hand/hand_landmarker.task",
        delegate: "GPU",
      },
      runningMode: "VIDEO",
      numHands: 1,
    });
  }

  start(videoElement) {
    this.video = videoElement;
    this.running = true;
    this._loop();
  }

  stop() {
    this.running = false;
  }

  onUpdate(cb) {
    this.callbacks.add(cb);
    return () => this.callbacks.delete(cb);
  }

  _loop() {
    if (!this.running) return;
    const v = this.video;
    if (v && v.readyState >= 2 && v.currentTime !== this.lastVideoTime) {
      this.lastVideoTime = v.currentTime;
      const result = this.landmarker.detectForVideo(v, performance.now());
      this._handleResult(result);
    }
    requestAnimationFrame(() => this._loop());
  }

  _handleResult(result) {
    if (result.landmarks && result.landmarks.length > 0) {
      const landmarks = result.landmarks[0];
      // landmark 9 = middle finger MCP (palm center reference)
      const palm = landmarks[9];
      this.state = {
        x: palm.x,
        y: palm.y,
        isDetected: true,
        landmarks,
      };
    } else {
      this.state = { ...this.state, isDetected: false, landmarks: null };
    }
    for (const cb of this.callbacks) cb(this.state);
  }
}
