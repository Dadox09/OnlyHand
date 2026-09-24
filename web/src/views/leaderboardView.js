// ALL-TIME leaderboard — one tab per game. Online it shows the global
// Supabase top 10 (+ your rank when you're outside it); offline it falls
// back to the local house board. Top 3 render as a podium.
import { scoreGames as games } from "../games/registry.js";
import { getProfile } from "../core/profile.js";
import { getLeaderboard, getBest, getPracticeBest, scoreGameId } from "../core/scores.js";
import { icon } from "../core/icon.js";
import { startHandCursor, stopHandCursor } from "../core/handCursor.js";
import { isOnline, fetchLeaderboard, fetchMyRank } from "../core/backend.js";

// Names come from other users — always escape before innerHTML.
const esc = (s) => String(s).replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const MEDALS = ["🥇", "🥈", "🥉"];

let activeTab = null;
let activeMode = "camera";
let loadToken = 0;

export function mount(app, { params } = {}) {
  const profile = getProfile();
  activeTab = games.some((g) => g.id === params?.id) ? params.id : games[0].id;
  activeMode = params?.mode === "pointer" ? "pointer" : "camera";

  app.innerHTML = `
    <nav>
      <a class="logo" href="#/hub">ONLY<span class="lit">HAND</span></a>
      <a href="#/hub" aria-label="Back to games">${icon("arrow-left", { size: 14 })}<span class="nav-label">Hub</span></a>
      <a href="#/profile" aria-label="Player profile">${profile.avatar} <span class="nav-label">${esc(profile.name)}</span></a>
    </nav>
    <div class="lb-wrap">
      <div class="page-header oh-fade-up">
        <h1>${icon("trophy", { size: 22 })} HALL OF FAME</h1>
        <p class="subtitle" id="board-source">Loading standings…</p>
      </div>
      <div class="lb-tabs lb-mode-tabs" aria-label="Control mode">
        <button class="lb-tab${activeMode === "camera" ? " active" : ""}" type="button" data-mode="camera" aria-pressed="${activeMode === "camera"}">${icon("hand", { size: 16 })} Hands</button>
        <button class="lb-tab${activeMode === "pointer" ? " active" : ""}" type="button" data-mode="pointer" aria-pressed="${activeMode === "pointer"}">${icon("pointer", { size: 16 })} Mouse / touch</button>
      </div>
      <div class="lb-tabs oh-fade-up" id="lb-tabs">
        ${games.map((g) => `
          <button class="lb-tab${g.id === activeTab ? " active" : ""}" data-game="${g.id}" type="button" aria-pressed="${g.id === activeTab}">
            <span class="ic">${g.icon}</span><span class="nm">${g.name}</span>
          </button>`).join("")}
      </div>
      <div class="lb-board oh-fade-up" id="lb-board"></div>
    </div>
  `;

  app.querySelector("#lb-tabs").addEventListener("click", (e) => {
    const tab = e.target.closest(".lb-tab");
    if (!tab || tab.dataset.game === activeTab) return;
    activeTab = tab.dataset.game;
    app.querySelectorAll("[data-game]").forEach((t) => {
      t.classList.toggle("active", t.dataset.game === activeTab);
      t.setAttribute("aria-pressed", String(t.dataset.game === activeTab));
    });
    renderBoard(app);
  });
  app.querySelector(".lb-mode-tabs").addEventListener("click", (e) => {
    const tab = e.target.closest("[data-mode]");
    if (!tab || tab.dataset.mode === activeMode) return;
    activeMode = tab.dataset.mode;
    app.querySelectorAll("[data-mode]").forEach((button) => {
      button.classList.toggle("active", button === tab);
      button.setAttribute("aria-pressed", String(button === tab));
    });
    renderBoard(app);
  });

  renderBoard(app);
  startHandCursor();
}

export function unmount() {
  stopHandCursor();
  loadToken++; // cancel in-flight renders
}

const podiumSlot = (r, rankIdx) => r ? `
  <div class="lb-podium-slot p${rankIdx + 1}${r.you ? " you" : ""}">
    <div class="medal">${MEDALS[rankIdx]}</div>
    <div class="av">${esc(r.avatar)}</div>
    <div class="nm">${esc(r.name)}${r.you ? " <span class='tag-you'>YOU</span>" : ""}</div>
    <div class="sc">${r.score}</div>
    <div class="base"></div>
  </div>` : `
  <div class="lb-podium-slot p${rankIdx + 1} empty">
    <div class="medal">${MEDALS[rankIdx]}</div>
    <div class="av">—</div>
    <div class="nm">Up for grabs</div>
    <div class="sc">···</div>
    <div class="base"></div>
  </div>`;

const listRow = (r, rank) => `
  <div class="board-row${r.you ? " lead" : ""}">
    <span class="rank">${rank}</span>
    <span class="av">${esc(r.avatar)}</span>
    <span class="nm">${esc(r.name)}${r.you ? " (you)" : ""}</span>
    <span class="sc">${r.score}</span>
  </div>`;

async function renderBoard(app) {
  const gameId = activeTab;
  const mode = activeMode;
  const cloudId = scoreGameId(gameId, mode);
  const modeLabel = mode === "pointer" ? "mouse / touch" : "hands";
  const board = app.querySelector("#lb-board");
  if (!board) return;
  const token = ++loadToken;

  board.innerHTML = `<div class="lb-loading">${icon("trophy", { size: 16 })} Loading standings…</div>`;

  let rows = null;
  let myRank = null;
  if (isOnline()) {
    try {
      [rows, myRank] = await Promise.all([
        fetchLeaderboard(cloudId, 10),
        fetchMyRank(cloudId),
      ]);
    } catch (error) {
      console.warn("[leaderboard] global standings unavailable:", error);
    }
  }
  if (token !== loadToken || !board.isConnected) return; // stale tab switch
  const fallback = rows === null;
  app.querySelector("#board-source").textContent = fallback
    ? `All-time ${modeLabel} · ${isOnline() ? "local demo (global unavailable)" : "local demo standings"}`
    : `All-time ${modeLabel} · global casual standings`;
  if (fallback) rows = getLeaderboard(gameId, 0, 10, mode);

  const podium = rows.slice(0, 3);
  const rest = rows.slice(3);
  const youOnBoard = rows.some((r) => r.you);
  const best = mode === "pointer" ? getPracticeBest(gameId) : getBest(gameId);

  board.innerHTML = `
    <div class="lb-podium">
      ${podiumSlot(podium[1], 1)}
      ${podiumSlot(podium[0], 0)}
      ${podiumSlot(podium[2], 2)}
    </div>
    ${rest.length ? `<div class="lb-list">${rest.map((r, i) => listRow(r, i + 4)).join("")}</div>` : ""}
    ${!youOnBoard && myRank ? `
      <div class="lb-list lb-you-row">
        <div class="board-row lead">
          <span class="rank">${myRank.rank}</span>
          <span class="av">${esc(getProfile().avatar)}</span>
          <span class="nm">${esc(getProfile().name)} (you)</span>
          <span class="sc">${myRank.best}</span>
        </div>
      </div>` : ""}
    ${!fallback && !rows.length ? `<p class="lb-cta">No global scores yet.</p>` : ""}
    ${!youOnBoard && !myRank && best === 0 && rows.length > 0 ? `
      <p class="lb-cta">No score yet — <a href="#/games/${gameId}">play a run</a> to claim your spot.</p>` : ""}
  `;
}
