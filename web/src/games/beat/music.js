// Beat-locked dark-synthwave for Beat Pulse. Unlike gameKit's free-running
// createMusic, every step is scheduled against the game's own song clock,
// so the kick lands exactly when a ring closes. The game calls
// schedule(songTime) every update step; the engine books all steps inside a
// small lookahead window at anchor + stepTime on the AudioContext clock.
// start()/stop() re-anchor the mapping, which makes pause/resume seamless.
import { getAudioBus } from "../../core/gameKit.js";

export const BPM = 120;
export const BEAT = 60 / BPM;           // quarter note — the game's grid unit
const STEP = BEAT / 2;                   // pattern runs on 8th notes
const LOOKAHEAD = 0.3;                   // s of audio booked ahead of songTime
const LEVEL = 0.42;                      // music bed sits under the sfx
const ROOTS = [33, 33, 29, 31];          // A1 · A1 · F1 · G1 (Am/Am/F/G)
const ARP = [0, 7, 12, 15, 12, 7, 3, 7]; // wide minor arp — the "drive" layer

function mtof(m) { return 440 * Math.pow(2, (m - 69) / 12); }

export function createBeatMusic() {
  let ctx = null;
  let bus = null;       // private gain → gameKit master (sfx always cut through)
  let anchor = null;    // audioTime at songTime 0; null until audio unlocks
  let stepIdx = 0;
  let running = false;
  let intensity = 0.4;

  function ensure() {
    const a = getAudioBus();
    if (!a) return false;
    ctx = a.ctx;
    if (!bus) {
      bus = ctx.createGain();
      bus.gain.value = 0;
      bus.connect(a.master);
    }
    return ctx.state === "running";
  }

  function voice(t, { freq, freqEnd = null, type = "sawtooth", dur, vol, filter = null }) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (freqEnd) o.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    let head = o;
    if (filter) {
      const f = ctx.createBiquadFilter();
      f.type = filter.type;
      f.frequency.value = filter.freq;
      if (filter.q) f.Q.value = filter.q;
      o.connect(f);
      head = f;
    }
    head.connect(g).connect(bus);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  function hiss(t, { dur, vol, type = "highpass", freq = 6000 }) {
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f).connect(g).connect(bus);
    src.start(t);
  }

  // 32-step (4-bar) loop. Layers stack with intensity: kick+bass always,
  // hats ≥0.3, arp ≥0.45, snare ≥0.55; filters open as intensity rises.
  function playStep(s, t) {
    const root = ROOTS[s >> 3];
    // kick — four on the floor, dead on the game's beat grid
    if (s % 4 === 0) voice(t, { freq: 130, freqEnd: 40, type: "sine", dur: 0.13, vol: 0.95 });
    // driving 8th bass with octave hops
    const up = s % 8 === 3 || s % 8 === 6 ? 12 : 0;
    voice(t, {
      freq: mtof(root + up), type: "sawtooth", dur: STEP * 0.85, vol: 0.3,
      filter: { type: "lowpass", freq: 280 + intensity * 1200, q: 6 },
    });
    // offbeat hats
    if (intensity >= 0.3 && s % 2 === 1) hiss(t, { dur: 0.03, vol: 0.11 });
    // snare on the backbeat
    if (intensity >= 0.55 && s % 8 === 4) hiss(t, { dur: 0.12, vol: 0.25, type: "bandpass", freq: 2000 });
    // high arp — brightens with intensity (FEVER pushes it wide open)
    if (intensity >= 0.45) {
      voice(t, {
        freq: mtof(root + 24 + ARP[s % ARP.length]),
        type: "square", dur: 0.09, vol: 0.05 + intensity * 0.06,
        filter: { type: "lowpass", freq: 900 + intensity * 2600 },
      });
    }
  }

  function tryAnchor(songTime) {
    if (!ensure()) return false;
    anchor = ctx.currentTime - songTime + 0.08;
    stepIdx = Math.max(0, Math.ceil(songTime / STEP));
    bus.gain.cancelScheduledValues(ctx.currentTime);
    bus.gain.setValueAtTime(bus.gain.value, ctx.currentTime);
    bus.gain.linearRampToValueAtTime(LEVEL, ctx.currentTime + 0.4);
    return true;
  }

  return {
    // songTime = the game's song clock in seconds (frozen while paused)
    start(songTime = 0) {
      running = true;
      anchor = null;
      tryAnchor(songTime); // may fail while audio is locked — schedule() retries
    },
    schedule(songTime) {
      if (!running) return;
      if (anchor === null) { if (!tryAnchor(songTime)) return; }
      else if (!ensure()) return;
      // tab-hidden gap: the audio clock ran on while songTime froze — re-anchor
      if (anchor + songTime < ctx.currentTime - 0.05) {
        anchor = ctx.currentTime - songTime + 0.08;
        stepIdx = Math.max(stepIdx, Math.ceil(songTime / STEP));
      }
      while (stepIdx * STEP < songTime + LOOKAHEAD) {
        const at = anchor + stepIdx * STEP;
        if (at > ctx.currentTime + 0.005) playStep(stepIdx % 32, at);
        stepIdx++;
      }
    },
    setIntensity(v) { intensity = Math.max(0, Math.min(1, v)); },
    stop() {
      running = false;
      anchor = null;
      // fade the bus so already-booked notes don't ring past the stop
      if (bus && ctx) {
        bus.gain.cancelScheduledValues(ctx.currentTime);
        bus.gain.setValueAtTime(bus.gain.value, ctx.currentTime);
        bus.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.25);
      }
    },
  };
}
