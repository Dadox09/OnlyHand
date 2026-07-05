import { getProfile, updateProfile, updateSettings } from "../core/profile.js";
import { getStats } from "../core/scores.js";
import { getBadges, getLevel } from "../core/badges.js";
import { games } from "../games/registry.js";
import { icon } from "../core/icon.js";
import { startHandCursor, stopHandCursor } from "../core/handCursor.js";
import { syncProfile } from "../core/backend.js";

const AVATARS = ["🎮", "🤖", "👾", "🕹️", "🦾", "🧠", "🐉", "🦅", "🔥", "⚡"];

export function mount(app) {
  render(app);
  startHandCursor();
}

export function unmount() {
  stopHandCursor();
}

function render(app) {
  const profile = getProfile();
  const lvl = getLevel(profile);
  const badges = getBadges(profile);
  const unlockedCount = badges.filter((b) => b.unlocked).length;

  app.innerHTML = `
    <nav>
      <a class="logo" href="#/hub">ONLY<span class="lit">HAND</span></a>
      <a href="#/board">${icon("trophy", { size: 14 })} Hall of Fame</a>
      <a href="#/hub" class="active">${icon("arrow-left", { size: 14 })} Back</a>
    </nav>
    <div class="profile-wrap">
      <div class="profile-grid oh-stagger">

        <div class="profile-header oh-fade-up">
          <button class="avatar lg selected" id="avatar-btn" title="Change avatar">${profile.avatar}</button>
          <div>
            <div class="form-row">
              <input class="input" id="name-input" value="${profile.name}" maxlength="24" />
              <button class="btn btn-accent" id="save-name">${icon("check", { size: 15 })} Save</button>
            </div>
            <p class="subtitle" style="margin-top:0.45rem">Playing since ${new Date(profile.createdAt).toLocaleDateString()}</p>
          </div>
          <div class="level-card">
            <div class="level-line">
              <span class="lv">LV ${lvl.level}</span>
              <span class="xp">${lvl.intoLevel} / ${lvl.span} XP</span>
            </div>
            <div class="level-bar"><div class="fill" style="width:${Math.round(lvl.pct * 100)}%"></div></div>
          </div>
        </div>

        <div class="avatar-picker oh-pop" id="avatar-picker" hidden>
          ${AVATARS.map((e) => `<button class="avatar sm${e === profile.avatar ? " selected" : ""}" data-emoji="${e}">${e}</button>`).join("")}
        </div>

        <section class="oh-fade-up">
          <h2 class="section-head">${icon("trophy", { size: 13 })} GAME STATS</h2>
          <div class="stats-grid" id="stats-grid"></div>
        </section>

        <section class="oh-fade-up">
          <h2 class="section-head">${icon("shield-check", { size: 13 })} BADGES · ${unlockedCount}/${badges.length}</h2>
          <div class="badge-grid" id="badge-grid"></div>
        </section>

        <section class="oh-fade-up">
          <h2 class="section-head">${icon("settings", { size: 13 })} SETTINGS</h2>
          <div class="settings-list">
            <label class="switch">
              <input type="checkbox" id="mirror" ${profile.settings.mirrorWebcam ? "checked" : ""} />
              <span class="track"><span class="knob"></span></span>
              Mirror webcam
            </label>
            <label class="switch">
              <input type="checkbox" id="landmarks" ${profile.settings.showLandmarks ? "checked" : ""} />
              <span class="track"><span class="knob"></span></span>
              Show hand landmarks
            </label>
          </div>
        </section>

      </div>
    </div>
  `;

  // Stats per game
  const grid = app.querySelector("#stats-grid");
  for (const g of games) {
    const s = getStats(g.id);
    const card = document.createElement("div");
    card.className = "stat-card";
    card.innerHTML = s
      ? `<div class="label">${g.icon} ${g.name}</div>
         <div class="value">${s.best}</div>
         <div class="label">${s.plays} plays · total ${s.totalScore}</div>`
      : `<div class="label">${g.icon} ${g.name}</div>
         <div class="empty">Not played yet</div>`;
    grid.appendChild(card);
  }

  // Badges — unlocked glow with earned date, locked show live progress
  const badgeGrid = app.querySelector("#badge-grid");
  for (const b of badges) {
    const card = document.createElement("div");
    card.className = `badge-card ${b.unlocked ? "unlocked" : "locked"}`;
    card.innerHTML = `
      <span class="badge-icon">${b.icon}</span>
      <div class="badge-body">
        <span class="badge-name">${b.name}</span>
        <span class="badge-desc">${b.desc}</span>
        ${b.unlocked
          ? `<span class="badge-date">Earned${b.earnedAt ? " " + new Date(b.earnedAt).toLocaleDateString() : ""}</span>`
          : `<div class="badge-progress">
               <div class="bar"><div class="fill" style="width:${Math.round(b.pct * 100)}%"></div></div>
               <span class="num">${b.cur}/${b.goal}</span>
             </div>`}
      </div>
    `;
    badgeGrid.appendChild(card);
  }

  // Avatar picker
  const avatarBtn = app.querySelector("#avatar-btn");
  const picker = app.querySelector("#avatar-picker");
  avatarBtn.addEventListener("click", () => { picker.hidden = !picker.hidden; });
  picker.querySelectorAll("[data-emoji]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const emoji = btn.dataset.emoji;
      updateProfile({ avatar: emoji });
      syncProfile().catch(() => {});
      avatarBtn.textContent = emoji;
      picker.querySelectorAll("[data-emoji]").forEach((b) => b.classList.toggle("selected", b === btn));
      picker.hidden = true;
    });
  });

  // Name save
  app.querySelector("#save-name").addEventListener("click", () => {
    const name = app.querySelector("#name-input").value.trim() || "Player";
    updateProfile({ name, named: true });
    syncProfile().catch(() => {});
  });

  // Settings toggles
  app.querySelector("#mirror").addEventListener("change", (e) => {
    updateSettings({ mirrorWebcam: e.target.checked });
  });
  app.querySelector("#landmarks").addEventListener("change", (e) => {
    updateSettings({ showLandmarks: e.target.checked });
  });
}
