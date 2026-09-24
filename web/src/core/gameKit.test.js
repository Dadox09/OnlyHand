import assert from "node:assert/strict";

let gain;
globalThis.window = {
  addEventListener() {},
  AudioContext: class {
    constructor() { this.currentTime = 0; this.state = "running"; this.destination = {}; }
    createGain() {
      gain = { gain: { value: 0, setTargetAtTime(value) { this.value = value; } }, connect() {} };
      return gain;
    }
  },
};

const { isAudioMuted, setAudioMuted, getAudioBus } = await import("./gameKit.js");
setAudioMuted(true);
assert.equal(isAudioMuted(), true);
getAudioBus();
assert.equal(gain.gain.value, 0);
setAudioMuted(false);
assert.equal(gain.gain.value, 0.22);
setAudioMuted(true);
assert.equal(gain.gain.value, 0);
