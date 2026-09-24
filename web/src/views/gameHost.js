import { games } from "../games/registry.js";
import { navigate } from "../router.js";
import { getCameraVideo, initCamera, stopCamera } from "../core/camera.js";
import { startHandInput, stopHandInput, startPointerInput, stopPointerInput, onHandUpdate, handState, mapToActiveBox } from "../input/handInput.js";
import { recordPlay, getBest, getStats, getPracticeBest, getPracticeStats, getLeaderboard, updateDailyProgress, getDailyProgress } from "../core/scores.js";
import { icon } from "../core/icon.js";
import { setupCanvas, portraitGameSize, sfx } from "../core/gameKit.js";
import { startHandCursor, stopHandCursor } from "../core/handCursor.js";
import { isOnline, fetchLeaderboard, fetchMyRank, fetchDailyBoard, createPongLobby, joinPongLobby, leavePongLobby, createOrbRushLobby, joinOrbRushLobby, leaveOrbRushLobby } from "../core/backend.js";
import { syncProfile } from "../core/backend.js";
import { getProfile, updateProfile } from "../core/profile.js";
import { PLAYER_SHIPS, isShipUnlocked, DEFAULT_SHIP } from "../games/asteroids/fleet.js";
import { getLevel } from "../core/badges.js";
import { readChallenge, shareChallenge, downloadChallengeCard, createChallengeCard } from "../core/challengeShare.js";
import { track } from "../core/analytics.js";
import { createCreatorClip, supportsCreatorClips } from "../core/creatorClip.js";

let meta = null;
let activeGame = null;
let unsubIndicator = null;
let unsubLandmarks = null;
let unsubPause = null;
let ro = null;
let startTime = 0;
let appRef = null;
let paused = false;
let autoPaused = false;
let handLostAt = null;
let dailyMode = false; // asteroids: seeded daily run (picked in the hangar)
let challenge = null;
let mountGeneration = 0;
let clipSession = null;
let clipButton = null;
let inputMode = null;
let inputStarting = false;
let onlineRoom = null;
let inviteCode = null;
const leaveOnlineRoom = (room, gameId) => gameId === "orb-rush" ? leaveOrbRushLobby(room.code) : leavePongLobby(room.code);

const AUTO_PAUSE_MS = 2000; // hand gone this long → auto-pause

// In-game sensitivity: mapToActiveBox (see handInput.js) lets the hand reach
// the play-area edge while still well inside the camera frame.
const onGameHandUpdate = (cb) =>
  onHandUpdate((s) =>
    cb(s.isDetected && s.source !== "pointer"
      ? { ...s, x: mapToActiveBox(s.x), y: mapToActiveBox(s.y) }
      : s));

// Leaderboard names come from other users — always escape before innerHTML.
const esc = (s) => String(s).replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export async function mount(app, { params }) {
  const generation = ++mountGeneration;
  meta = games.find((g) => g.id === params.id);
  if (!meta) { navigate("/hub"); return; }
  challenge = meta.id === "orb-rush" ? null : readChallenge(params, meta);
  inviteCode = ["pong", "orb-rush"].includes(meta.id) ? params.code?.trim().toUpperCase() ?? null : null;
  appRef = app;

  const stats = getStats(meta.id);
  app.innerHTML = `
    <div class="game-host">
      <div class="game-host-header">
        <button class="btn btn-ghost" id="back-btn">${icon("arrow-left", { size: 15 })} Menu</button>
        <span class="title">${meta.icon} <span class="name">${meta.name}</span></span>
        ${challenge ? `<span class="challenge-pill">${icon("zap", { size: 12 })} Beat ${esc(challenge.challenger)} · ${challenge.score}</span>` : ""}
        <button class="creator-clip-btn" id="creator-clip" hidden>${icon("video", { size: 13 })} <span>REC CLIP</span></button>
        <button class="btn btn-ghost" id="camera-off" aria-label="Turn camera off and switch to mouse or touch controls" hidden>Camera off</button>
        <span class="hand-indicator" id="hand-ind"><span class="dot"></span> Choose controls</span>
      </div>
      <div class="game-host-body">
        <div class="game-stage oh-fade-up">
          <div class="stage-box">
            <div class="canvas-wrap" id="canvas-wrap">
              <canvas id="game-canvas" width="800" height="500"></canvas>
            </div>
          </div>
          <div class="hint-bar">
            <span class="esc">ESC — pause</span>
          </div>
        </div>
        <div class="host-sidebar oh-fade-up" style="animation-delay:0.05s">
          <div class="webcam-panel game-webcam" id="cam-panel">
            <video id="game-preview" autoplay playsinline muted></video>
            <canvas id="game-overlay"></canvas>
            <span class="game-camera-state" id="camera-state" role="status" aria-live="polite">CAMERA OFF</span>
          </div>
          <div class="gesture-guide" role="note" aria-label="Hand controls for ${meta.name}">
            <span class="guide-title">${icon("hand", { size: 13 })} CONTROLS</span>
            ${(meta.controls || []).map((c) => `
              <span class="guide-chip">
                <span class="guide-ic">${icon(c.icon, { size: 14 })}</span>
                <b>${c.gesture}</b><em>${c.action}</em>
              </span>`).join("") || `<span class="desc">${meta.description}</span>`}
          </div>
          <div class="stat-card" ${meta.id === "orb-rush" ? "hidden" : ""}>
            <div class="label" id="run-stat-label">${challenge ? `${icon("zap", { size: 11 })} Challenge target` : `${meta.icon} Your best`}</div>
            <div class="value" id="run-stat-value">${challenge ? challenge.score : getBest(meta.id)}</div>
            <div class="label" id="run-stat-detail">${challenge ? `set by ${esc(challenge.challenger)}` : stats ? `${stats.plays} plays` : "first run"}</div>
          </div>
        </div>
      </div>
    </div>
  `;

  const overlayCanvas = app.querySelector("#game-overlay");
  const panel = app.querySelector("#cam-panel");
  // Fit the pre-game controller choice before a game module owns the canvas.
  // The game calls setupCanvas again with its exact logical dimensions.
  setupCanvas(app.querySelector("#game-canvas"), 800, 500, { logicalSize: portraitGameSize });
  clipButton = app.querySelector("#creator-clip");
  clipButton.addEventListener("click", onCreatorClipClick);
  app.querySelector("#camera-off").addEventListener("click", () => {
    if (inputMode !== "camera") return;
    clipSession?.cancel();
    clipSession = null;
    clipButton.hidden = true;
    stopHandInput();
    stopCamera();
    app.querySelector("#game-preview").srcObject = null;
    app.querySelector("#camera-off").hidden = true;
    inputMode = "pointer";
    showPointerCard(app.querySelector("#cam-panel"));
    startPointerInput(app.querySelector("#game-canvas"));
    if (paused && autoPaused) setPaused(false);
    if (!onlineRoom) {
      app.querySelector("#run-stat-label").textContent = "Practice best";
      app.querySelector("#run-stat-value").textContent = getPracticeBest(meta.id);
      app.querySelector("#run-stat-detail").textContent = "Mouse / touch run";
    }
  });

  ro = new ResizeObserver(() => {
    const r = panel.getBoundingClientRect();
    overlayCanvas.width = r.width;
    overlayCanvas.height = r.height;
  });
  ro.observe(panel);

  dailyMode = params.daily === "1";
  app.querySelector("#back-btn").addEventListener("click", () => navigate("/hub"));
  window.addEventListener("keydown", onKey);

  if (meta.id === "orb-rush" && !isOnline()) showPongChoice(app, generation);
  else showInputChoice(app, generation);
}

function showInputChoice(app, generation, error = "") {
  if (generation !== mountGeneration) return;
  inputStarting = false;
  const wrap = app.querySelector("#canvas-wrap");
  document.getElementById("input-choice")?.remove();
  const overlay = document.createElement("div");
  overlay.className = "go-overlay oh-pop";
  overlay.id = "input-choice";
  overlay.innerHTML = `
    <div class="go-panel input-choice-panel">
      <div class="go-title">CHOOSE YOUR CONTROLLER</div>
      <p class="input-choice-copy">Hand tracking is the full OnlyHand experience. Mouse or touch lets you try instantly without camera access.</p>
      ${error ? `<div class="input-choice-error">${esc(error)}</div>` : ""}
      <div class="input-choice-actions">
        <button class="btn btn-accent" id="use-camera">${icon("hand", { size: 16 })} Use my hand</button>
        <button class="btn" id="use-pointer">${icon("pointer", { size: 16 })} Try mouse / touch</button>
      </div>
      <div class="go-hint">Camera processing stays on this device · no video is uploaded</div>
    </div>
  `;
  wrap.appendChild(overlay);
  const buttons = [...overlay.querySelectorAll("button")];
  overlay.querySelector("#use-camera").addEventListener("click", async () => {
    if (inputStarting) return;
    inputStarting = true;
    buttons.forEach((button) => { button.disabled = true; });
    overlay.querySelector(".input-choice-copy").textContent = "Starting the camera and hand model…";
    track("Camera Prompt Requested", { source: "game", game: meta.id });
    try {
      await startCameraSession(app, generation);
      if (generation !== mountGeneration) return;
      inputStarting = false;
      track("Camera Enabled", { source: "game", game: meta.id });
    } catch (cameraError) {
      if (generation !== mountGeneration) return;
      stopHandInput();
      stopCamera();
      track("Camera Denied", { source: "game", game: meta.id, reason: cameraError?.name || "unknown" });
      showInputChoice(app, generation, `Camera unavailable: ${cameraError?.message || cameraError}`);
    }
  });
  overlay.querySelector("#use-pointer").addEventListener("click", async () => {
    if (inputStarting) return;
    inputStarting = true;
    track("Pointer Mode Selected", { game: meta.id, challenge: !!challenge });
    await startPointerSession(app, generation);
    inputStarting = false;
  });
}

async function startCameraSession(app, generation) {
  stopPointerInput();
  inputMode = "camera";
  const preview = app.querySelector("#game-preview");
  const stream = await initCamera();
  if (generation !== mountGeneration) return;
  preview.srcObject = stream;
  await startHandInput(getCameraVideo());
  if (generation !== mountGeneration) return;
  app.querySelector("#camera-state").textContent = "CAMERA LIVE";
  app.querySelector("#camera-off").hidden = false;
  document.getElementById("input-choice")?.remove();
  wireInputFeedback(app);
  await launchGameExperience(app, generation);
}

async function startPointerSession(app, generation) {
  if (generation !== mountGeneration) return;
  inputMode = "pointer";
  stopHandInput();
  stopCamera();
  app.querySelector("#camera-off").hidden = true;
  document.getElementById("input-choice")?.remove();
  const canvas = app.querySelector("#game-canvas");
  const panel = app.querySelector("#cam-panel");
  showPointerCard(panel);
  if (!challenge) {
    const practice = getPracticeStats(meta.id);
    app.querySelector("#run-stat-label").innerHTML = `${icon("pointer", { size: 11 })} Practice best`;
    app.querySelector("#run-stat-value").textContent = getPracticeBest(meta.id);
    app.querySelector("#run-stat-detail").textContent = practice ? `${practice.plays} practice plays` : "first practice run";
  }
  wireInputFeedback(app);
  startPointerInput(canvas);
  await launchGameExperience(app, generation);
}

function showPointerCard(panel) {
  panel.classList.add("pointer-mode");
  panel.querySelector("#camera-state").textContent = "CAMERA OFF";
  panel.insertAdjacentHTML("beforeend", `
    <div class="pointer-mode-card">
      ${icon("pointer", { size: 30 })}
      <b>MOUSE / TOUCH</b>
      <span>move · hold = pinch</span>
      ${meta.id === "orb-rush" ? "" : "<span>Space = fist</span>"}
    </div>
  `);
}

function wireInputFeedback(app) {
  const handInd = app.querySelector("#hand-ind");
  const overlayCanvas = app.querySelector("#game-overlay");

  // Controller indicator (live for camera, persistent for pointer mode).
  unsubIndicator = onHandUpdate((s) => {
    if (s.source === "pointer") {
      handInd.className = "hand-indicator detected";
      handInd.innerHTML = `<span class="dot oh-live-dot"></span> Mouse / touch`;
    } else if (s.isDetected) {
      handInd.className = "hand-indicator detected";
      handInd.innerHTML = `<span class="dot oh-live-dot"></span> Hand detected`;
    } else {
      handInd.className = "hand-indicator lost";
      handInd.innerHTML = `<span class="dot"></span> Hand lost`;
    }
  });

  // Glowing landmark dots on the webcam overlay.
  unsubLandmarks = onHandUpdate((s) => {
    const ctx = overlayCanvas.getContext("2d");
    const W = overlayCanvas.width;
    const H = overlayCanvas.height;
    ctx.clearRect(0, 0, W, H);
    if (!s.isDetected || !s.landmarks) return;
    ctx.fillStyle = "#4ade80";
    ctx.shadowColor = "rgba(74,222,128,0.8)";
    ctx.shadowBlur = 6;
    const preview = app.querySelector("#game-preview");
    const videoW = preview.videoWidth || W;
    const videoH = preview.videoHeight || H;
    const scale = Math.min(W / videoW, H / videoH);
    const imageW = videoW * scale, imageH = videoH * scale;
    const left = (W - imageW) / 2, top = (H - imageH) / 2;
    for (const lm of s.landmarks) {
      ctx.beginPath();
      ctx.arc(left + lm.x * imageW, top + lm.y * imageH, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.shadowBlur = 0;
  });

  // Auto-pause only matters for camera tracking loss.
  unsubPause = onHandUpdate((s) => {
    if (inputMode === "pointer" || onlineRoom || !activeGame || document.getElementById("creator-consent")) return;
    if (!s.isDetected) {
      if (handLostAt === null) handLostAt = Date.now();
      else if (!paused && Date.now() - handLostAt > AUTO_PAUSE_MS) setPaused(true, true);
    } else {
      handLostAt = null;
      if (paused && autoPaused) setPaused(false);
    }
  });
}

async function launchGameExperience(app, generation) {
  if (generation !== mountGeneration) return;
  // Asteroids opens on the hangar; other games start straight away.
  if (["pong", "orb-rush"].includes(meta.id) && !challenge) showPongChoice(app, generation);
  else if (meta.id === "asteroids") showHangar(app);
  else await startGame(app, generation);
}

function showPongChoice(app, generation) {
  const orb = meta.id === "orb-rush";
  const overlay = document.createElement("div");
  overlay.className = "go-overlay oh-pop";
  overlay.id = "pong-choice";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-label", orb ? "Join Orb Rush" : "Choose Pong mode");
  overlay.innerHTML = `
    <div class="go-panel pong-choice-panel">
      <div class="go-title">${orb ? "ORB RUSH" : "HAND PONG"}</div>
      <p class="input-choice-copy">${orb ? "Race a friend to capture orbs in a 60-second online duel. Stay inside an orb to claim it; pinch to boost." : "Play the classic solo run or challenge one friend to a live match. First to 7 wins."}</p>
      ${orb ? "" : `<button class="btn btn-accent" id="pong-solo">Solo vs AI</button>`}
      ${isOnline() ? `
        <div class="pong-choice-divider">ONLINE 1 VS 1</div>
        <button class="btn ${orb ? "btn-accent" : ""}" id="pong-create">Create invite lobby</button>
        <form id="pong-join" class="pong-join-form">
          <label for="pong-code">Join with a code</label>
          <div class="pong-join-row">
            <input id="pong-code" name="code" maxlength="10" pattern="[A-Fa-f0-9]{10}" autocomplete="off" spellcheck="false" required value="${inviteCode && /^[A-F0-9]{10}$/.test(inviteCode) ? inviteCode : ""}">
            <button class="btn" type="submit">Join</button>
          </div>
        </form>` : `<p class="go-hint">Online play needs a Supabase connection.</p>${orb ? `<button class="btn" id="orb-hub">Back to hub</button>` : ""}`}
      <div class="input-choice-error" id="pong-error" role="status" aria-live="polite"></div>
    </div>`;
  app.querySelector("#canvas-wrap").appendChild(overlay);
  startHandCursor();
  overlay.querySelector(inviteCode ? "#pong-code" : orb ? "#pong-create, #orb-hub" : "#pong-solo")?.focus();
  overlay.querySelector("#orb-hub")?.addEventListener("click", () => navigate("/hub"));
  overlay.querySelector("#pong-solo")?.addEventListener("click", () => {
    overlay.remove();
    stopHandCursor();
    startGame(app, generation);
  });
  if (!isOnline()) return;
  const errorEl = overlay.querySelector("#pong-error");
  const run = async (action) => {
    if (overlay.dataset.busy) return;
    overlay.dataset.busy = "1";
    overlay.querySelectorAll("button, input").forEach((el) => { el.disabled = true; });
    errorEl.textContent = "Connecting…";
    try {
      const room = await action();
      if (generation !== mountGeneration) { await leaveOnlineRoom(room, orb ? "orb-rush" : "pong"); return; }
      onlineRoom = room;
      overlay.remove();
      stopHandCursor();
      await startGame(app, generation);
      if (generation !== mountGeneration) return;
      if (!orb) {
        app.querySelector("#run-stat-label").textContent = "Online duel";
        app.querySelector("#run-stat-value").textContent = "1 vs 1";
        app.querySelector("#run-stat-detail").textContent = `Lobby ${room.code} · first to 7`;
      }
      app.querySelector(".hint-bar .esc").textContent = "ESC — leave lobby";
      if (!orb) {
        const guide = app.querySelectorAll(".gesture-guide .guide-chip");
        guide[2]?.querySelector("b")?.replaceChildren("DUEL");
        guide[2]?.querySelector("em")?.replaceChildren("first to 7");
      }
    } catch (error) {
      if (generation !== mountGeneration) return;
      if (onlineRoom) {
        await leaveOnlineRoom(onlineRoom, orb ? "orb-rush" : "pong");
        onlineRoom = null;
        app.querySelector("#canvas-wrap").appendChild(overlay);
        startHandCursor();
      }
      errorEl.textContent = error.message || "Could not connect to the lobby.";
      overlay.querySelectorAll("button, input").forEach((el) => { el.disabled = false; });
      delete overlay.dataset.busy;
    }
  };
  overlay.querySelector("#pong-create")?.addEventListener("click", () => run(orb ? createOrbRushLobby : createPongLobby));
  overlay.querySelector("#pong-join").addEventListener("submit", (event) => {
    event.preventDefault();
    const code = overlay.querySelector("#pong-code").value.trim().toUpperCase();
    run(() => orb ? joinOrbRushLobby(code) : joinPongLobby(code));
  });
}

function setPaused(on, auto = false) {
  if (!activeGame || onlineRoom || on === paused) return;
  paused = on;
  autoPaused = on && auto;
  if (on) {
    activeGame.pause?.();
    sfx.pause();
    showPauseOverlay(auto);
    startHandCursor();
  } else {
    activeGame.resume?.();
    sfx.resume();
    document.getElementById("pause-overlay")?.remove();
    stopHandCursor();
  }
}

function showPauseOverlay(auto) {
  const wrap = appRef?.querySelector("#canvas-wrap");
  if (!wrap) return;
  const overlay = document.createElement("div");
  overlay.className = "go-overlay oh-pop";
  overlay.id = "pause-overlay";
  overlay.innerHTML = `
    <div class="go-panel">
      <div class="go-title">PAUSED</div>
      <div class="go-best">${auto ? `${icon("hand", { size: 14 })} Hand lost — show it to resume` : "Take a breath"}</div>
      <div class="go-actions">
        <button class="btn btn-accent" id="resume-btn">${icon("play", { size: 15 })} Resume</button>
        <button class="btn" id="pause-menu">${icon("arrow-left", { size: 15 })} Menu</button>
      </div>
      <div class="go-hint">${auto ? "" : "…or press ESC again"}</div>
    </div>
  `;
  wrap.appendChild(overlay);
  overlay.querySelector("#resume-btn").addEventListener("click", () => setPaused(false));
  overlay.querySelector("#pause-menu").addEventListener("click", () => navigate("/hub"));
}

// Pre-game hangar for Asteroids: pick a ship, pinch = save + launch.
// "Play again" skips it — re-entering the route shows it again.
function showHangar(app) {
  const wrap = app.querySelector("#canvas-wrap");
  const profile = getProfile();
  const level = getLevel(profile).level;
  let current = profile.ship || DEFAULT_SHIP;
  // never launch a locked ship (e.g. synced profile from another device)
  const curDef = PLAYER_SHIPS.find((s) => s.id === current);
  if (!curDef || !isShipUnlocked(curDef, level)) current = DEFAULT_SHIP;
  const overlay = document.createElement("div");
  overlay.className = "go-overlay oh-pop";
  overlay.id = "hangar-overlay";
  overlay.innerHTML = `
    <div class="go-panel go-hangar">
      <div class="go-title">HANGAR</div>
      <div class="go-best">Choose your ship · LV ${level}</div>
      <div class="hangar-modes">
        <button class="mode-chip${dailyMode ? "" : " selected"}" data-mode="free">FREE FLIGHT</button>
        <button class="mode-chip${dailyMode ? " selected" : ""}" data-mode="daily">★ DAILY RUN</button>
      </div>
      <div class="hangar-mode-note" id="mode-note">${dailyMode ? "same sectors for everyone · TODAY board · resets 00:00 UTC" : "endless run · your rules"}</div>
      <div class="hangar-grid">
        ${PLAYER_SHIPS.map((s) => {
          const locked = !isShipUnlocked(s, level);
          return `
          <button class="ship-card${s.id === current ? " selected" : ""}${locked ? " locked" : ""}"
                  data-ship="${s.id}" ${locked ? `data-locked="1"` : ""}>
            <span class="ship-thumb" aria-hidden="true" style="background-image:url('${s.sprite}');--ship-pos:${4 + s.sheet * 24}%"></span>
            <span class="ship-name">${s.name}</span>
            <span class="ship-perk">${locked ? `${icon("lock", { size: 10 })} LV ${s.unlock}` : s.perk}</span>
          </button>`;
        }).join("")}
      </div>
      <div class="go-hint">${inputMode === "pointer"
        ? `${icon("pointer", { size: 13 })} click a ship to launch · Space = bomb`
        : `${icon("hand", { size: 13 })} point with your hand · pinch to launch · ✊ fist = bomb`}</div>
    </div>
  `;
  wrap.appendChild(overlay);
  overlay.querySelectorAll(".mode-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      dailyMode = chip.dataset.mode === "daily";
      overlay.querySelectorAll(".mode-chip").forEach((c) =>
        c.classList.toggle("selected", c === chip));
      overlay.querySelector("#mode-note").textContent = dailyMode
        ? "same sectors for everyone · TODAY board · resets 00:00 UTC"
        : "endless run · your rules";
    });
  });
  overlay.querySelectorAll("[data-ship]").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (btn.dataset.locked) return;
      updateProfile({ ship: btn.dataset.ship });
      syncProfile().catch(() => {});
      startGame(app); // removes the overlay + stops the hand cursor
    });
  });
  startHandCursor();
}

// (Re)mount the active game module on the canvas. The DOM Game Over overlay
// owns the game-over moment, so we stop the game on its onScore signal.
async function startGame(app, generation = mountGeneration) {
  clipSession?.cancel();
  clipSession = null;
  if (clipButton) {
    clipButton.hidden = true;
    clipButton.disabled = false;
    clipButton.className = "creator-clip-btn";
    clipButton.querySelector("span").textContent = "REC CLIP";
  }
  clearGameOver();
  paused = false;
  autoPaused = false;
  handLostAt = null;
  document.getElementById("pause-overlay")?.remove();
  document.getElementById("hangar-overlay")?.remove();
  const canvas = app.querySelector("#game-canvas");
  startTime = Date.now();
  track("Game Started", {
    game: meta.id,
    mode: onlineRoom ? "online" : dailyMode ? "daily" : challenge ? "challenge" : "free",
    input: inputMode || "camera",
  });
  const module = onlineRoom ? await (meta.id === "orb-rush" ? import("../games/orb-rush/online.js") : import("../games/pong/online.js")) : await meta.load();
  if (generation !== mountGeneration || !canvas.isConnected) return;
  const mounted = await module.default.mount({
    canvas,
    onHandUpdate: onGameHandUpdate,
    handState,
    room: onlineRoom,
    daily: dailyMode && meta.id === "asteroids",
    onScore(score, runStats = null) {
      if (generation !== mountGeneration) return;
      const clipResult = clipSession && !["idle", "cancelled", "error"].includes(clipSession.state)
        ? clipSession.finish(score)
        : null;
      const previousBest = inputMode === "pointer" ? getPracticeBest(meta.id) : getBest(meta.id);
      const { submitted, newBadges } = recordPlay(
        meta.id, score, Math.round((Date.now() - startTime) / 1000), {
          cloud: inputMode === "camera",
          practice: inputMode === "pointer",
          // daily runs live on their own cloud board, never the all-time one
          submitAs: runStats?.daily ? `${meta.id}-daily` : undefined,
          apply: runStats ? (p) => applyRunCounters(p, runStats) : undefined,
        });
      activeGame?.unmount?.();
      activeGame = null;
      track("Game Finished", {
        game: meta.id,
        score,
        mode: runStats?.daily ? "daily" : challenge ? "challenge" : "free",
        input: inputMode || "camera",
        seconds: Math.round((Date.now() - startTime) / 1000),
      });
      showGameOver(app, score, submitted, newBadges, runStats, clipResult, previousBest);
    },
  });
  if (generation !== mountGeneration) { mounted?.unmount?.(); return; }
  activeGame = mounted;
  if (!onlineRoom) prepareCreatorClip(canvas);
}

function prepareCreatorClip(canvas) {
  if (inputMode !== "camera" || !supportsCreatorClips() || !clipButton) return;
  clipSession = createCreatorClip({
    gameCanvas: canvas,
    cameraVideo: getCameraVideo(),
    game: meta,
    profile: getProfile(),
    onState(state) {
      if (!clipButton) return;
      clipButton.classList.toggle("recording", state === "recording");
      clipButton.disabled = state === "finishing" || state === "error";
      const label = clipButton.querySelector("span");
      if (state === "recording") label.textContent = "STOP · 30s";
      else if (state === "finishing") label.textContent = "PROCESSING";
      else if (state === "ready") label.textContent = "SAVE CLIP";
      else if (state === "error") label.textContent = "CLIP ERROR";
    },
    onProgress(seconds) {
      if (clipSession?.state === "recording" && clipButton) {
        clipButton.querySelector("span").textContent = `STOP · ${seconds}s`;
      }
    },
  });
  clipButton.hidden = false;
}

async function onCreatorClipClick() {
  if (!clipSession || !activeGame || paused) return;
  if (clipSession.state === "recording") {
    clipSession.finish();
    track("Creator Clip Stopped", { game: meta.id, reason: "manual" });
    return;
  }
  if (clipSession.state === "ready") {
    if (await clipSession.download()) track("Creator Clip Saved", { game: meta.id, source: "header" });
    return;
  }
  if (clipSession.state !== "idle") return;
  showCreatorConsent();
}

function showCreatorConsent() {
  const wrap = appRef?.querySelector("#canvas-wrap");
  if (!wrap || document.getElementById("creator-consent")) return;
  activeGame?.pause?.();
  sfx.pause();
  const overlay = document.createElement("div");
  overlay.className = "go-overlay oh-pop";
  overlay.id = "creator-consent";
  overlay.innerHTML = `
    <div class="go-panel creator-panel">
      <div class="creator-rec-mark">● CREATOR CLIP</div>
      <div class="go-title">MAKE A 30s VERTICAL CLIP</div>
      <p class="creator-copy">
        OnlyHand will combine the game and your hand-cam into a 9:16 video.
        Recording stays in this browser and is never uploaded automatically.
      </p>
      <div class="creator-layout" aria-hidden="true">
        <span>GAMEPLAY</span><span>HAND CAM</span><b>9:16</b>
      </div>
      <div class="go-actions">
        <button class="btn btn-accent" id="creator-start">${icon("video", { size: 15 })} Start recording</button>
        <button class="btn" id="creator-cancel">Cancel</button>
      </div>
      <div class="go-hint">No microphone · maximum 30 seconds · add trending audio in TikTok</div>
    </div>
  `;
  wrap.appendChild(overlay);
  const close = (start) => {
    overlay.remove();
    stopHandCursor();
    activeGame?.resume?.();
    sfx.resume();
    if (start && clipSession?.start()) {
      track("Creator Clip Started", { game: meta.id });
    }
  };
  overlay.querySelector("#creator-start").addEventListener("click", () => close(true));
  overlay.querySelector("#creator-cancel").addEventListener("click", () => close(false));
  startHandCursor();
}

// Asteroids end-of-run report → profile counters feeding the dedicated
// badges (Warlord Slayer / Untouchable / Fleet Admiral).
function applyRunCounters(p, rs) {
  const c = (p.counters = p.counters ?? {});
  c.warlordKills = (c.warlordKills ?? 0) + (rs.kills?.carriers ?? 0);
  c.flawlessBosses = (c.flawlessBosses ?? 0) + (rs.flawlessBosses ?? 0);
  c.shipsFlown = c.shipsFlown ?? {};
  if (rs.ship) c.shipsFlown[rs.ship] = true;
  if (rs.daily) updateDailyProgress(p);
}

const boardRows = (rows) => rows.map((r, i) => `
  <div class="board-row${r.you ? " lead" : ""}">
    <span class="rank">${i + 1}</span>
    <span class="av">${esc(r.avatar)}</span>
    <span class="nm">${esc(r.name)}${r.you ? " (you)" : ""}</span>
    <span class="sc">${r.score}</span>
  </div>
`).join("");

const houseBoard = (score, title = "TOP HANDS", practice = false) => `
  <div class="board-head">${icon("trophy", { size: 13 })} ${title}</div>
  ${boardRows(getLeaderboard(meta.id, score, 3, practice ? getPracticeBest(meta.id) : null))}
`;

// Asteroids run report → ACCURACY / MAX COMBO / SECTOR tiles + kill line
function runStatsHtml(rs) {
  const k = rs.kills ?? {};
  const acc = rs.shots ? Math.round((rs.hits / rs.shots) * 100) : 0;
  const parts = [];
  if (k.rocks + k.comets) parts.push(`🪨 ${k.rocks + k.comets}`);
  if (k.fighters) parts.push(`🛩️ ${k.fighters}`);
  if (k.carriers) parts.push(`🛰️ ${k.carriers}`);
  if (k.ufos) parts.push(`🛸 ${k.ufos}`);
  if (k.bosses) parts.push(`👹 ${k.bosses}`);
  return `
    <div class="go-stats">
      <div class="gs"><span class="v">${acc}%</span><span class="l">ACCURACY</span></div>
      <div class="gs"><span class="v">x${rs.maxCombo}</span><span class="l">MAX COMBO</span></div>
      <div class="gs"><span class="v">${rs.level}</span><span class="l">SECTOR</span></div>
    </div>
    ${parts.length ? `<div class="go-kills">${parts.join(" · ")}</div>` : ""}
  `;
}

function showGameOver(app, score, submitted, newBadges = [], runStats = null, clipResult = null, previousBest = 0) {
  const best = inputMode === "pointer" ? getPracticeBest(meta.id) : getBest(meta.id);
  const isRecord = score > previousBest && score > 0;
  const officialRun = inputMode === "camera";
  const online = isOnline() && officialRun;
  const daily = !!runStats?.daily;
  const boardTitle = daily ? "TODAY'S RUN · CASUAL" : "TOP HANDS · GLOBAL CASUAL";
  const challengeWon = challenge && score > challenge.score;
  const dailyProgress = daily ? getDailyProgress() : null;
  const profile = getProfile();
  if (clipButton) clipButton.hidden = true;

  const wrap = app.querySelector("#canvas-wrap");
  const overlay = document.createElement("div");
  overlay.className = "go-overlay oh-pop";
  overlay.id = "go-overlay";
  overlay.innerHTML = `
    <div class="go-panel">
      <div class="go-title">GAME OVER${daily ? " · ★ DAILY" : ""}</div>
      <div class="go-score">${score}</div>
      <div class="go-best">
        ${isRecord
          ? `${icon("zap", { size: 14 })} New ${officialRun ? "personal" : "practice"} best!`
          : `${officialRun ? "Personal" : "Practice"} best · ${best}`}
      </div>
      ${challenge ? `
        <div class="challenge-result ${challengeWon ? "won" : "lost"}">
          <span class="challenge-result-title">${challengeWon ? "CHALLENGE CRUSHED" : "SO CLOSE"}</span>
          <span>${challengeWon
            ? `${score - challenge.score} over ${esc(challenge.challenger)} — send it back.`
            : `${challenge.score - score + 1} more to beat ${esc(challenge.challenger)}.`}</span>
        </div>` : ""}
      ${dailyProgress ? `<div class="daily-result">${icon("flame", { size: 14 })} ${dailyProgress.streak} day streak · best ${dailyProgress.bestStreak}</div>` : ""}
      ${officialRun ? "" : `<div class="practice-result">${icon("pointer", { size: 13 })} POINTER PRACTICE · global boards require hand control</div>`}
      ${runStats ? runStatsHtml(runStats) : ""}
      ${newBadges.length ? `
        <div class="go-badges">
          ${newBadges.map((b) => `
            <span class="go-badge oh-pop">
              <span class="badge-icon">${b.icon}</span>
              <span class="lbl">BADGE UNLOCKED</span> ${b.name}
            </span>`).join("")}
        </div>` : ""}
      <div class="board">
        ${online ? `
          <div class="board-head">${icon("trophy", { size: 13 })} ${boardTitle}</div>
          <div class="board-row"><span class="rank">…</span><span class="nm">Loading…</span></div>
        ` : houseBoard(score, officialRun ? "LOCAL DEMO" : "POINTER PRACTICE · LOCAL DEMO", !officialRun)}
      </div>
      <a class="go-board-link" href="#/board/${meta.id}">${icon("trophy", { size: 12 })} Hall of Fame</a>
      ${score > 0 || clipResult ? `
        <div class="viral-actions">
          ${score > 0 ? `
            <button class="btn btn-share" id="share-challenge">${icon("share-2", { size: 15 })} Challenge a friend</button>
            <button class="btn btn-ghost" id="save-story" title="Download a vertical 9:16 result card">${icon("download", { size: 15 })} Save 9:16 card</button>
          ` : ""}
          ${clipResult ? `<button class="btn btn-ghost" id="save-clip" disabled>${icon("video", { size: 15 })} Preparing clip…</button>` : ""}
        </div>
        <div class="share-feedback" id="share-feedback" aria-live="polite"></div>` : ""}
      <div class="go-actions">
        <button class="btn btn-accent" id="play-again">${icon("rotate-ccw", { size: 15 })} Play again</button>
        <button class="btn" id="go-menu">${icon("arrow-left", { size: 15 })} Menu</button>
      </div>
      <div class="go-hint">${inputMode === "pointer"
        ? `${icon("pointer", { size: 13 })} use mouse or touch to choose`
        : `${icon("hand", { size: 13 })} point with your hand · pinch to select`}</div>
    </div>
  `;
  wrap.appendChild(overlay);

  overlay.querySelector("#play-again").addEventListener("click", () => startGame(app));
  overlay.querySelector("#go-menu").addEventListener("click", () => navigate("/hub"));
  const sourceCanvas = app.querySelector("#game-canvas");
  // Pre-render while the result screen is idle. The eventual share click can
  // invoke the native share sheet immediately, preserving transient activation.
  const shareCard = score > 0
    ? createChallengeCard({ game: meta, score, profile, sourceCanvas, input: inputMode }).catch(() => null)
    : Promise.resolve(null);
  overlay.querySelector("#share-challenge")?.addEventListener("click", async (event) => {
    const button = event.currentTarget;
    const feedback = overlay.querySelector("#share-feedback");
    button.disabled = true;
    try {
      const result = await shareChallenge({ game: meta, score, profile, sourceCanvas, cardBlob: await shareCard, input: inputMode });
      if (result.status !== "cancelled") {
        feedback.textContent = result.status === "copied" ? "Challenge link copied — send it anywhere." : "Challenge ready to send!";
        track("Challenge Shared", { game: meta.id, score, method: result.status });
      }
    } catch (error) {
      feedback.textContent = "Sharing failed — try saving the card instead.";
      console.warn("[share]", error);
    } finally {
      button.disabled = false;
    }
  });
  overlay.querySelector("#save-story")?.addEventListener("click", async (event) => {
    const button = event.currentTarget;
    const feedback = overlay.querySelector("#share-feedback");
    button.disabled = true;
    try {
      await downloadChallengeCard({ game: meta, score, profile, sourceCanvas, cardBlob: await shareCard, input: inputMode });
      feedback.textContent = "9:16 card saved — post it to TikTok, Reels or Shorts.";
      track("Story Card Saved", { game: meta.id, score });
    } catch (error) {
      feedback.textContent = "Could not create the card on this browser.";
      console.warn("[share-card]", error);
    } finally {
      button.disabled = false;
    }
  });
  const saveClipButton = overlay.querySelector("#save-clip");
  if (saveClipButton && clipResult) {
    clipResult.then((blob) => {
      if (!saveClipButton.isConnected) return;
      saveClipButton.disabled = !blob;
      saveClipButton.innerHTML = blob
        ? `${icon("download", { size: 15 })} Save creator clip`
        : `${icon("x", { size: 15 })} Clip unavailable`;
    });
    saveClipButton.addEventListener("click", async () => {
      if (await clipSession?.download()) {
        overlay.querySelector("#share-feedback").textContent = "Vertical video saved — add a trending sound and post it.";
        track("Creator Clip Saved", { game: meta.id, source: "game-over" });
      }
    });
  }

  startHandCursor();

  // Global board straight away: wait for this run's submit so the score is
  // included, then fetch. House board only as offline/error fallback.
  // Daily runs read the day-scoped board instead of the all-time one.
  if (online) {
    const gameId = meta.id;
    (async () => {
      await submitted;
      let rows = null;
      let rank = null;
      try {
        [rows, rank] = daily
          ? [await fetchDailyBoard(`${gameId}-daily`, 5), null]
          : await Promise.all([
            fetchLeaderboard(gameId, 5),
            fetchMyRank(gameId),
          ]);
      } catch (error) {
        console.warn("[leaderboard] global standings unavailable:", error);
      }
      const boardEl = overlay.querySelector(".board");
      if (!boardEl || !boardEl.isConnected) return;
      if (rows === null) {
        boardEl.innerHTML = houseBoard(score, "LOCAL DEMO · GLOBAL UNAVAILABLE");
        return;
      }
      boardEl.innerHTML = `
        <div class="board-head">${icon("trophy", { size: 13 })} ${boardTitle}</div>
        ${rows.length ? boardRows(rows) : `<div class="board-row"><span class="nm">No ${daily ? "daily" : "global"} scores yet.</span></div>`}
        ${rank && !rows.some((r) => r.you) ? `
          <div class="board-row lead">
            <span class="rank">${rank.rank}</span>
            <span class="av">…</span>
            <span class="nm">(you)</span>
            <span class="sc">${rank.best}</span>
          </div>` : ""}
      `;
    })();
  }
}

function clearGameOver() {
  document.getElementById("go-overlay")?.remove();
  stopHandCursor();
}

function onKey(e) {
  if (e.key !== "Escape") return;
  if (document.getElementById("creator-consent")) return;
  // During a game: ESC toggles pause. On game over (no active game): exit.
  if (onlineRoom) navigate("/hub");
  else if (activeGame) setPaused(!paused);
  else navigate("/hub");
}

export function unmount() {
  if (inputStarting) { stopHandInput(); stopCamera(); }
  mountGeneration += 1;
  window.removeEventListener("keydown", onKey);
  const canvas = appRef?.querySelector("#game-canvas");
  canvas?._ohFit?.disconnect();
  if (canvas) canvas._ohFit = null;
  stopPointerInput();
  clearGameOver();
  document.getElementById("input-choice")?.remove();
  document.getElementById("pause-overlay")?.remove();
  document.getElementById("hangar-overlay")?.remove();
  document.getElementById("pong-choice")?.remove();
  document.getElementById("creator-consent")?.remove();
  paused = false;
  autoPaused = false;
  handLostAt = null;
  dailyMode = false;
  challenge = null;
  clipSession?.cancel();
  clipSession = null;
  clipButton = null;
  inputMode = null;
  inputStarting = false;
  unsubIndicator?.();
  unsubLandmarks?.();
  unsubPause?.();
  unsubIndicator = null;
  unsubLandmarks = null;
  unsubPause = null;
  ro?.disconnect();
  ro = null;
  if (onlineRoom && !activeGame) leaveOnlineRoom(onlineRoom, meta.id);
  activeGame?.unmount?.();
  activeGame = null;
  onlineRoom = null;
  inviteCode = null;
  appRef = null;
}
