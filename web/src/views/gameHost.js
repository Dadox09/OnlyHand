import { games } from "../games/registry.js";
import { navigate } from "../router.js";
import { initCamera, getCameraVideo } from "../core/camera.js";
import { startHandInput, onHandUpdate, handState, mapToActiveBox } from "../input/handInput.js";
import { recordPlay, getBest, getStats, getLeaderboard } from "../core/scores.js";
import { icon } from "../core/icon.js";
import { sfx } from "../core/gameKit.js";
import { startHandCursor, stopHandCursor } from "../core/handCursor.js";
import { isOnline, fetchLeaderboard, fetchMyRank, fetchDailyBoard } from "../core/backend.js";
import { syncProfile } from "../core/backend.js";
import { getProfile, updateProfile } from "../core/profile.js";
import { PLAYER_SHIPS, isShipUnlocked, DEFAULT_SHIP } from "../games/asteroids/fleet.js";
import { getLevel } from "../core/badges.js";

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

const AUTO_PAUSE_MS = 2000; // hand gone this long → auto-pause

// In-game sensitivity: mapToActiveBox (see handInput.js) lets the hand reach
// the play-area edge while still well inside the camera frame.
const onGameHandUpdate = (cb) =>
  onHandUpdate((s) =>
    cb(s.isDetected ? { ...s, x: mapToActiveBox(s.x), y: mapToActiveBox(s.y) } : s));

// Leaderboard names come from other users — always escape before innerHTML.
const esc = (s) => String(s).replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export async function mount(app, { params }) {
  meta = games.find((g) => g.id === params.id);
  if (!meta) { navigate("/hub"); return; }
  appRef = app;

  const stats = getStats(meta.id);
  app.innerHTML = `
    <div class="game-host">
      <div class="game-host-header">
        <button class="btn btn-ghost" id="back-btn">${icon("arrow-left", { size: 15 })} Menu</button>
        <span class="title">${meta.icon} <span class="name">${meta.name}</span></span>
        <span class="hand-indicator" id="hand-ind"><span class="dot"></span> Detecting…</span>
      </div>
      <div class="game-host-body">
        <div class="game-stage oh-fade-up">
          <div class="stage-box">
            <div class="canvas-wrap" id="canvas-wrap">
              <canvas id="game-canvas" width="800" height="500"></canvas>
            </div>
          </div>
          <div class="hint-bar">
            <span class="desc">${meta.description}</span>
            <span class="esc">ESC — pause</span>
          </div>
        </div>
        <div class="host-sidebar oh-fade-up" style="animation-delay:0.05s">
          <div class="webcam-panel game-webcam" id="cam-panel">
            <video id="game-preview" autoplay playsinline muted></video>
            <canvas id="game-overlay"></canvas>
          </div>
          <div class="stat-card">
            <div class="label">${meta.icon} Your best</div>
            <div class="value">${getBest(meta.id)}</div>
            ${stats ? `<div class="label">${stats.plays} plays</div>` : ""}
          </div>
        </div>
      </div>
    </div>
  `;

  const handInd = app.querySelector("#hand-ind");
  const preview = app.querySelector("#game-preview");
  const overlayCanvas = app.querySelector("#game-overlay");
  const panel = app.querySelector("#cam-panel");

  ro = new ResizeObserver(() => {
    const r = panel.getBoundingClientRect();
    overlayCanvas.width = r.width;
    overlayCanvas.height = r.height;
  });
  ro.observe(panel);

  const stream = await initCamera();
  preview.srcObject = stream;
  await startHandInput(getCameraVideo());

  // Hand indicator pill (live)
  unsubIndicator = onHandUpdate((s) => {
    if (s.isDetected) {
      handInd.className = "hand-indicator detected";
      handInd.innerHTML = `<span class="dot oh-live-dot"></span> Hand detected`;
    } else {
      handInd.className = "hand-indicator lost";
      handInd.innerHTML = `<span class="dot"></span> Hand lost`;
    }
  });

  // Glowing landmark dots on the webcam overlay
  unsubLandmarks = onHandUpdate((s) => {
    const ctx = overlayCanvas.getContext("2d");
    const W = overlayCanvas.width;
    const H = overlayCanvas.height;
    ctx.clearRect(0, 0, W, H);
    if (!s.isDetected || !s.landmarks) return;
    ctx.fillStyle = "#4ade80";
    ctx.shadowColor = "rgba(74,222,128,0.8)";
    ctx.shadowBlur = 6;
    for (const lm of s.landmarks) {
      ctx.beginPath();
      ctx.arc(lm.x * W, lm.y * H, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.shadowBlur = 0;
  });

  // Auto-pause when the hand disappears mid-game, auto-resume on return.
  unsubPause = onHandUpdate((s) => {
    if (!activeGame) return;
    if (!s.isDetected) {
      if (handLostAt === null) handLostAt = Date.now();
      else if (!paused && Date.now() - handLostAt > AUTO_PAUSE_MS) setPaused(true, true);
    } else {
      handLostAt = null;
      if (paused && autoPaused) setPaused(false);
    }
  });

  // Asteroids opens on the hangar (ship pick, one pinch = launch);
  // other games start straight away.
  dailyMode = false;
  if (meta.id === "asteroids") showHangar(app);
  else await startGame(app);

  app.querySelector("#back-btn").addEventListener("click", () => navigate("/hub"));
  window.addEventListener("keydown", onKey);
}

function setPaused(on, auto = false) {
  if (!activeGame || on === paused) return;
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
        <button class="mode-chip selected" data-mode="free">FREE FLIGHT</button>
        <button class="mode-chip" data-mode="daily">★ DAILY RUN</button>
      </div>
      <div class="hangar-mode-note" id="mode-note">endless run · your rules</div>
      <div class="hangar-grid">
        ${PLAYER_SHIPS.map((s) => {
          const locked = !isShipUnlocked(s, level);
          return `
          <button class="ship-card${s.id === current ? " selected" : ""}${locked ? " locked" : ""}"
                  data-ship="${s.id}" ${locked ? `data-locked="1"` : ""}>
            <img src="${s.sprite}" alt="${s.name}" draggable="false" />
            <span class="ship-name">${s.name}</span>
            <span class="ship-perk">${locked ? `${icon("lock", { size: 10 })} LV ${s.unlock}` : s.perk}</span>
          </button>`;
        }).join("")}
      </div>
      <div class="go-hint">${icon("hand", { size: 13 })} point with your hand · pinch to launch · ✊ fist = bomb</div>
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
async function startGame(app) {
  clearGameOver();
  paused = false;
  autoPaused = false;
  handLostAt = null;
  document.getElementById("pause-overlay")?.remove();
  document.getElementById("hangar-overlay")?.remove();
  const canvas = app.querySelector("#game-canvas");
  startTime = Date.now();
  const module = await meta.load();
  activeGame = await module.default.mount({
    canvas,
    onHandUpdate: onGameHandUpdate,
    handState,
    daily: dailyMode && meta.id === "asteroids",
    onScore(score, runStats = null) {
      const { submitted, newBadges } = recordPlay(
        meta.id, score, Math.round((Date.now() - startTime) / 1000), {
          // daily runs live on their own cloud board, never the all-time one
          submitAs: runStats?.daily ? `${meta.id}-daily` : undefined,
          apply: runStats ? (p) => applyRunCounters(p, runStats) : undefined,
        });
      activeGame?.unmount?.();
      activeGame = null;
      showGameOver(app, score, submitted, newBadges, runStats);
    },
  });
}

// Asteroids end-of-run report → profile counters feeding the dedicated
// badges (Warlord Slayer / Untouchable / Fleet Admiral).
function applyRunCounters(p, rs) {
  const c = (p.counters = p.counters ?? {});
  c.warlordKills = (c.warlordKills ?? 0) + (rs.kills?.carriers ?? 0);
  c.flawlessBosses = (c.flawlessBosses ?? 0) + (rs.flawlessBosses ?? 0);
  c.shipsFlown = c.shipsFlown ?? {};
  if (rs.ship) c.shipsFlown[rs.ship] = true;
}

const boardRows = (rows) => rows.map((r, i) => `
  <div class="board-row${r.you ? " lead" : ""}">
    <span class="rank">${i + 1}</span>
    <span class="av">${esc(r.avatar)}</span>
    <span class="nm">${esc(r.name)}${r.you ? " (you)" : ""}</span>
    <span class="sc">${r.score}</span>
  </div>
`).join("");

const houseBoard = (score) => `
  <div class="board-head">${icon("trophy", { size: 13 })} TOP HANDS</div>
  ${boardRows(getLeaderboard(meta.id, score))}
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

function showGameOver(app, score, submitted, newBadges = [], runStats = null) {
  const best = getBest(meta.id);
  const isRecord = score >= best && score > 0;
  const online = isOnline();
  const daily = !!runStats?.daily;
  const boardTitle = daily ? "TODAY'S RUN" : "TOP HANDS · GLOBAL";

  const wrap = app.querySelector("#canvas-wrap");
  const overlay = document.createElement("div");
  overlay.className = "go-overlay oh-pop";
  overlay.id = "go-overlay";
  overlay.innerHTML = `
    <div class="go-panel">
      <div class="go-title">GAME OVER${daily ? " · ★ DAILY" : ""}</div>
      <div class="go-score">${score}</div>
      <div class="go-best">
        ${isRecord ? `${icon("zap", { size: 14 })} New personal best!` : `Personal best · ${best}`}
      </div>
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
        ` : houseBoard(score)}
      </div>
      <a class="go-board-link" href="#/board/${meta.id}">${icon("trophy", { size: 12 })} Hall of Fame</a>
      <div class="go-actions">
        <button class="btn btn-accent" id="play-again">${icon("rotate-ccw", { size: 15 })} Play again</button>
        <button class="btn" id="go-menu">${icon("arrow-left", { size: 15 })} Menu</button>
      </div>
      <div class="go-hint">${icon("hand", { size: 13 })} point with your hand · pinch to select</div>
    </div>
  `;
  wrap.appendChild(overlay);

  overlay.querySelector("#play-again").addEventListener("click", () => startGame(app));
  overlay.querySelector("#go-menu").addEventListener("click", () => navigate("/hub"));

  startHandCursor();

  // Global board straight away: wait for this run's submit so the score is
  // included, then fetch. House board only as offline/error fallback.
  // Daily runs read the day-scoped board instead of the all-time one.
  if (online) {
    const gameId = meta.id;
    (async () => {
      await submitted;
      const [rows, rank] = daily
        ? [await fetchDailyBoard(`${gameId}-daily`, 5), null]
        : await Promise.all([
          fetchLeaderboard(gameId, 5),
          fetchMyRank(gameId),
        ]);
      const boardEl = overlay.querySelector(".board");
      if (!boardEl || !boardEl.isConnected) return;
      if (!rows?.length) {
        boardEl.innerHTML = houseBoard(score);
        return;
      }
      boardEl.innerHTML = `
        <div class="board-head">${icon("trophy", { size: 13 })} ${boardTitle}</div>
        ${boardRows(rows)}
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
  // During a game: ESC toggles pause. On game over (no active game): exit.
  if (activeGame) setPaused(!paused);
  else navigate("/hub");
}

export function unmount() {
  window.removeEventListener("keydown", onKey);
  clearGameOver();
  document.getElementById("pause-overlay")?.remove();
  document.getElementById("hangar-overlay")?.remove();
  paused = false;
  autoPaused = false;
  handLostAt = null;
  dailyMode = false;
  unsubIndicator?.();
  unsubLandmarks?.();
  unsubPause?.();
  unsubIndicator = null;
  unsubLandmarks = null;
  unsubPause = null;
  ro?.disconnect();
  ro = null;
  activeGame?.unmount?.();
  activeGame = null;
  appRef = null;
}
