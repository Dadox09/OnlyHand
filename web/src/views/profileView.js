import { getProfile, updateProfile, updateSettings, deleteLocalProfile } from "../core/profile.js";
import { navigate } from "../router.js";
import { getStats, getPracticeStats } from "../core/scores.js";
import { getBadges, getLevel } from "../core/badges.js";
import { scoreGames as games } from "../games/registry.js";
import { icon } from "../core/icon.js";
import { startHandCursor, stopHandCursor } from "../core/handCursor.js";
import { syncProfile, deleteMyAccount } from "../core/backend.js";
import { PLAYER_SHIPS, isShipUnlocked } from "../games/asteroids/fleet.js";

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
  const modes = [
    { id: "camera", name: "Hands", stats: profile.stats, getStats },
    { id: "pointer", name: "Mouse / touch", stats: profile.practiceStats, getStats: getPracticeStats },
  ].map((mode) => ({ ...mode, level: getLevel(profile, mode.id), badges: getBadges(profile, mode.id) }));
  const hangarLevel = Math.max(...modes.map((mode) => mode.level.level));

  app.innerHTML = `
    <nav>
      <a class="logo" href="#/hub">ONLY<span class="lit">HAND</span></a>
      <a href="#/board" aria-label="Hall of Fame">${icon("trophy", { size: 14 })}<span class="nav-label">Hall of Fame</span></a>
      <a href="#/hub" class="active" aria-label="Back to games">${icon("arrow-left", { size: 14 })}<span class="nav-label">Back</span></a>
    </nav>
    <main class="profile-wrap">
      <div class="profile-grid oh-stagger">

        <header class="profile-header oh-fade-up">
          <div class="profile-heading">
            <span class="profile-kicker">${icon("user", { size: 14 })} PLAYER PROFILE</span>
            <h1>Your arcade record</h1>
            <p>Two ways to play. Each has its own XP, badges and leaderboard.</p>
          </div>
          <div class="profile-identity">
            <div class="avatar-control">
              <button class="avatar lg selected" id="avatar-btn" type="button" aria-label="Change avatar" aria-expanded="false" aria-controls="avatar-picker"></button>
              <span>CHANGE AVATAR</span>
            </div>
            <div class="profile-personal">
              <form class="form-row" id="name-form">
                <label class="profile-field-label" for="name-input">PLAYER NAME</label>
                <input class="input" id="name-input" maxlength="24" autocomplete="nickname" />
                <button class="btn btn-accent" id="save-name" type="submit">${icon("check", { size: 15 })} Save</button>
              </form>
              <p class="profile-since">Playing since ${new Date(profile.createdAt).toLocaleDateString()}</p>
              <span class="profile-saved" id="name-status" role="status"></span>
            </div>
          </div>
          <div class="avatar-picker oh-pop" id="avatar-picker" aria-label="Choose avatar" hidden>
            ${AVATARS.map((e) => `<button class="avatar sm${e === profile.avatar ? " selected" : ""}" type="button" aria-label="Avatar ${e}" aria-pressed="${e === profile.avatar}" data-emoji="${e}">${e}</button>`).join("")}
          </div>
        </header>

        ${modes.map((mode, index) => `
        <section class="oh-fade-up profile-mode" aria-labelledby="mode-${mode.id}">
          <div class="profile-section-head"><div><span class="profile-kicker">0${index + 1} · YOUR ARCADE</span><h2 id="mode-${mode.id}">${icon(mode.id === "camera" ? "hand" : "pointer", { size: 20 })} ${mode.name}</h2></div><a class="btn" href="#/board/${games[0].id}/${mode.id}">${icon("trophy", { size: 14 })} Leaderboard</a></div>
          <div class="profile-overview" role="group" aria-label="${mode.name} progress">
            <div><span>RUNS</span><strong>${Object.values(mode.stats).reduce((total, stat) => total + (stat.plays ?? 0), 0)}</strong></div>
            <div><span>BADGES</span><strong>${mode.badges.filter((b) => b.unlocked).length}<small> / ${mode.badges.length}</small></strong></div>
            <div><span>XP · LV ${mode.level.level}</span><strong>${mode.level.xp}</strong></div>
          </div>
          <div class="level-bar" role="progressbar" aria-label="${mode.name} progress to next level" aria-valuenow="${mode.level.intoLevel}" aria-valuemin="0" aria-valuemax="${mode.level.span}"><div class="fill" style="width:${Math.round(mode.level.pct * 100)}%"></div></div>
          <h3 class="profile-subhead">Game stats</h3>
          <div class="stats-grid" id="stats-${mode.id}"></div>
          <h3 class="profile-subhead">Badges</h3>
          <div class="badge-grid" id="badges-${mode.id}"></div>
        </section>`).join("")}

        <section class="oh-fade-up">
          <div class="profile-section-head"><div><span class="profile-kicker">03 · YOUR LOADOUT</span><h2>${icon("rocket", { size: 20 })} Asteroids hangar</h2></div><p>Ships unlock with your higher mode level.</p></div>
          <div class="hangar-grid" id="hangar-grid">
            ${PLAYER_SHIPS.map((s) => {
              const locked = !isShipUnlocked(s, hangarLevel);
              return `
              <button class="ship-card${s.id === (profile.ship || "viper") ? " selected" : ""}${locked ? " locked" : ""}"
                      type="button" data-ship="${s.id}" aria-pressed="${s.id === (profile.ship || "viper")}" ${locked ? `data-locked="1" aria-disabled="true"` : ""}>
                <span class="ship-thumb" aria-hidden="true" style="background-image:url('${s.sprite}');--ship-pos:${4 + s.sheet * 24}%"></span>
                <span class="ship-name">${s.name}</span>
                <span class="ship-desc">${locked ? `${icon("lock", { size: 11 })} Unlocks at LV ${s.unlock}` : `${s.desc} · <b>${s.perk}</b>`}</span>
              </button>`;
            }).join("")}
          </div>
        </section>

        <section class="oh-fade-up">
          <div class="profile-section-head"><div><span class="profile-kicker">04 · PREFERENCES</span><h2>${icon("settings", { size: 20 })} Settings</h2></div><p>Adjust how hand tracking appears while you play.</p></div>
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
          <div class="profile-danger"><div><strong>Delete profile</strong><p>Remove your local profile and, if connected, your cloud account and scores.</p></div><button class="btn btn-ghost" id="delete-data" type="button">Delete my profile and scores</button></div>
          <p id="delete-status" role="status"></p>
        </section>

      </div>
    </main>
  `;

  app.querySelector("#name-input").value = profile.name;
  app.querySelector("#avatar-btn").textContent = profile.avatar;

  for (const mode of modes) {
    const grid = app.querySelector(`#stats-${mode.id}`);
    for (const g of games) {
      const stat = mode.getStats(g.id);
      const card = document.createElement("div");
      card.className = "stat-card";
      card.innerHTML = `
        <div class="stat-game"><span aria-hidden="true">${g.icon}</span><strong>${g.name}</strong></div>
        ${stat
          ? `<div class="stat-best"><span>BEST</span><strong>${stat.best}</strong></div>
             <div class="stat-detail"><span>${stat.plays} runs</span><span>${stat.totalScore} total points</span></div>`
          : `<div class="stat-empty">No runs yet</div>`}
      `;
      grid.appendChild(card);
    }
    const badgeGrid = app.querySelector(`#badges-${mode.id}`);
    for (const b of mode.badges) {
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
  }

  // Avatar picker
  const avatarBtn = app.querySelector("#avatar-btn");
  const picker = app.querySelector("#avatar-picker");
  avatarBtn.addEventListener("click", () => {
    picker.hidden = !picker.hidden;
    avatarBtn.setAttribute("aria-expanded", String(!picker.hidden));
  });
  picker.querySelectorAll("[data-emoji]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const emoji = btn.dataset.emoji;
      updateProfile({ avatar: emoji });
      syncProfile().catch(() => {});
      avatarBtn.textContent = emoji;
      picker.querySelectorAll("[data-emoji]").forEach((b) => {
        b.classList.toggle("selected", b === btn);
        b.setAttribute("aria-pressed", String(b === btn));
      });
      picker.hidden = true;
      avatarBtn.setAttribute("aria-expanded", "false");
    });
  });

  // Hangar — pick the Asteroids ship (locked ships don't select)
  app.querySelectorAll("[data-ship]").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (btn.dataset.locked) return;
      updateProfile({ ship: btn.dataset.ship });
      syncProfile().catch(() => {});
      app.querySelectorAll("[data-ship]").forEach((b) => {
        b.classList.toggle("selected", b === btn);
        b.setAttribute("aria-pressed", String(b === btn));
      });
    });
  });

  // Name save
  app.querySelector("#name-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const name = app.querySelector("#name-input").value.trim() || "Player";
    updateProfile({ name, named: true });
    syncProfile().catch(() => {});
    app.querySelector("#name-status").textContent = "Saved on this device";
  });
  app.querySelector("#name-input").addEventListener("input", () => {
    app.querySelector("#name-status").textContent = "";
  });

  // Settings toggles
  app.querySelector("#mirror").addEventListener("change", (e) => {
    updateSettings({ mirrorWebcam: e.target.checked });
  });
  app.querySelector("#landmarks").addEventListener("change", (e) => {
    updateSettings({ showLandmarks: e.target.checked });
  });
  app.querySelector("#delete-data").addEventListener("click", async (event) => {
    if (!window.confirm("Delete your local profile and, if connected, your anonymous account and all scores? This cannot be undone.")) return;
    const button = event.currentTarget;
    button.disabled = true;
    const status = app.querySelector("#delete-status");
    status.textContent = "Deleting…";
    try {
      await deleteMyAccount();
      deleteLocalProfile();
      navigate("/");
    } catch (error) {
      status.textContent = `Could not delete cloud data. Nothing was removed locally. Contact rizzodavidege@gmail.com. ${error.message}`;
      button.disabled = false;
    }
  });
}
