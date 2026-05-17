import { getProfile, updateProfile, updateSettings } from "../core/profile.js";
import { getStats } from "../core/scores.js";
import { games } from "../games/registry.js";

const AVATARS = ["🎮", "🤖", "👾", "🕹️", "🦾", "🧠", "🐉", "🦅", "🔥", "⚡"];

export function mount(app) {
  render(app);
}

export function unmount() {}

function render(app) {
  const profile = getProfile();

  app.innerHTML = `
    <nav>
      <a class="logo" href="#/">OnlyHand</a>
      <a href="#/" class="btn">← Back</a>
    </nav>
    <div class="page" style="grid-template-columns:1fr">
      <div class="profile-grid">
        <div class="profile-header">
          <button class="avatar-btn" id="avatar-btn" title="Change avatar">${profile.avatar}</button>
          <div>
            <div class="form-row">
              <input class="input" id="name-input" value="${profile.name}" maxlength="24" />
              <button class="btn btn-accent" id="save-name">Save</button>
            </div>
            <p class="subtitle" style="margin-top:0.4rem">Playing since ${new Date(profile.createdAt).toLocaleDateString()}</p>
          </div>
        </div>

        <div id="avatar-picker" hidden style="display:flex;gap:0.5rem;flex-wrap:wrap;padding:0.5rem 0">
          ${AVATARS.map((e) => `<button class="avatar-btn" style="width:48px;height:48px;font-size:1.5rem" data-emoji="${e}">${e}</button>`).join("")}
        </div>

        <h2 style="margin:0">Game Stats</h2>
        <div class="stats-grid" id="stats-grid"></div>

        <h2 style="margin:0">Settings</h2>
        <div style="display:flex;flex-direction:column;gap:0.5rem">
          <label style="display:flex;align-items:center;gap:0.5rem;cursor:pointer">
            <input type="checkbox" id="mirror" ${profile.settings.mirrorWebcam ? "checked" : ""} />
            Mirror webcam
          </label>
          <label style="display:flex;align-items:center;gap:0.5rem;cursor:pointer">
            <input type="checkbox" id="landmarks" ${profile.settings.showLandmarks ? "checked" : ""} />
            Show hand landmarks
          </label>
        </div>
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
         <div style="color:var(--text-muted);font-size:0.85rem">Not played yet</div>`;
    grid.appendChild(card);
  }

  // Avatar picker
  const avatarBtn = app.querySelector("#avatar-btn");
  const picker = app.querySelector("#avatar-picker");
  avatarBtn.addEventListener("click", () => {
    picker.hidden = !picker.hidden;
    picker.style.display = picker.hidden ? "none" : "flex";
  });
  picker.querySelectorAll("[data-emoji]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const emoji = btn.dataset.emoji;
      updateProfile({ avatar: emoji });
      avatarBtn.textContent = emoji;
      picker.hidden = true;
      picker.style.display = "none";
    });
  });

  // Name save
  app.querySelector("#save-name").addEventListener("click", () => {
    const name = app.querySelector("#name-input").value.trim() || "Player";
    updateProfile({ name });
  });

  // Settings toggles
  app.querySelector("#mirror").addEventListener("change", (e) => {
    updateSettings({ mirrorWebcam: e.target.checked });
  });
  app.querySelector("#landmarks").addEventListener("change", (e) => {
    updateSettings({ showLandmarks: e.target.checked });
  });
}
