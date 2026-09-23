import { NEON, setupCanvas, createFixedStep, drawHudText, hudFont, sfx } from "../../core/gameKit.js";
import { openOrbRushChannel, leaveOrbRushLobby } from "../../core/backend.js";
import { navigate } from "../../router.js";
import { startHandCursor, stopHandCursor } from "../../core/handCursor.js";
import { W, H, R, createMatch, stepMatch } from "./physics.js";

const validCursor = (p) => p && Number.isFinite(p.x) && p.x >= 0 && p.x <= W
  && Number.isFinite(p.y) && p.y >= 0 && p.y <= H
  && typeof p.active === "boolean" && typeof p.pinch === "boolean"
  && Number.isFinite(p.pulse) && p.pulse >= 0 && p.pulse <= 0.8
  && Number.isFinite(p.cooldown) && p.cooldown >= 0 && p.cooldown <= 5;

function validMatch(m) {
  return m && Array.isArray(m.players) && m.players.length === 2 && m.players.every(validCursor)
    && m.orb && Number.isFinite(m.orb.x) && m.orb.x >= 0 && m.orb.x <= W
    && Number.isFinite(m.orb.y) && m.orb.y >= 0 && m.orb.y <= H
    && Array.isArray(m.scores) && m.scores.length === 2
    && m.scores.every((n) => Number.isSafeInteger(n) && n >= 0 && n <= 100)
    && Array.isArray(m.progress) && m.progress.length === 2
    && m.progress.every((n) => Number.isFinite(n) && n >= 0 && n <= 1)
    && Number.isFinite(m.remaining) && m.remaining >= 0 && m.remaining <= 60
    && Number.isFinite(m.respawn) && m.respawn >= 0 && m.respawn <= 0.35
    && [null, 0, 1, 2].includes(m.winner);
}

export default {
  async mount({ canvas, onHandUpdate, handState, room }) {
    const ctx = setupCanvas(canvas, W, H);
    const { channel, userId, close } = await openOrbRushChannel(room);
    const isHost = userId === room.host_id;
    const me = isHost ? 0 : 1;
    let running = true, subscribed = false, peerOnline = false, peerId = null;
    let model = createMatch(), seq = 0, lastSeq = -1, frame = 0, lastInputAt = 0;
    let myReady = false, peerReady = false, overlayKind = "", raf = null;
    let local = { x: W / 2, y: H / 2, active: false, pinch: false };
    let remote = { x: W / 2, y: H / 2, active: false, pinch: false };
    const overlay = document.createElement("div");
    overlay.className = "go-overlay oh-pop";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-label", "Orb Rush match status");
    canvas.parentElement.appendChild(overlay);

    function updateLocal(s) {
      local = s.isDetected && Number.isFinite(s.x) && Number.isFinite(s.y)
        ? { x: Math.max(0, Math.min(W, (1 - s.x) * W)), y: Math.max(0, Math.min(H, s.y * H)), active: true, pinch: s.pinch === true }
        : { ...local, active: false, pinch: false };
    }
    updateLocal(handState);
    const unsubscribe = onHandUpdate(updateLocal);

    function send(event, payload) {
      if (subscribed) channel.send({ type: "broadcast", event, payload });
    }
    function sendState() { send("state", { seq: ++seq, model }); }

    function showOverlay(kind) {
      if (kind === overlayKind) return;
      overlayKind = kind;
      overlay.hidden = !kind;
      if (!kind) { stopHandCursor(); return; }
      startHandCursor();
      if (kind === "finished") {
        const title = model.winner === 2 ? "DRAW" : model.winner === me ? "YOU WIN" : "YOU LOSE";
        overlay.innerHTML = `<div class="go-panel"><div class="go-title">${title}</div>
          <div class="go-score">${model.scores[0]} : ${model.scores[1]}</div>
          <p class="go-best">${myReady ? "Waiting for your friend…" : "Both players must request a rematch."}</p>
          <div class="go-actions"><button class="btn btn-accent" id="orb-rematch" ${myReady ? "disabled" : ""}>Rematch</button>
          <button class="btn" id="orb-leave">Leave lobby</button></div></div>`;
        overlay.querySelector("#orb-rematch").addEventListener("click", () => {
          myReady = true;
          send("rematch", { ready: true });
          if (isHost) maybeRematch();
          overlayKind = "";
          showOverlay("finished");
        });
      } else if (kind === "lost") {
        overlay.innerHTML = `<div class="go-panel"><div class="go-title">CONNECTION LOST</div>
          <p class="go-best">Reconnecting… The clock and capture are paused.</p>
          <button class="btn" id="orb-leave">Leave lobby</button></div>`;
      } else {
        overlay.innerHTML = `<div class="go-panel pong-choice-panel"><div class="go-title">${isHost ? "INVITE A FRIEND" : "WAITING FOR HOST"}</div>
          ${isHost ? `<div class="pong-code">${room.code}</div><p class="go-best">Share this code or invite link. The clock pauses while waiting.</p>
          <button class="btn btn-accent" id="orb-copy">Copy invite link</button>` : `<p class="go-best">The match resumes when the host returns.</p>`}
          <button class="btn" id="orb-leave">Leave lobby</button>
          <div class="input-choice-error" id="orb-feedback" role="status" aria-live="polite"></div></div>`;
        overlay.querySelector("#orb-copy")?.addEventListener("click", async () => {
          try {
            await navigator.clipboard.writeText(`${location.origin}${location.pathname}#/games/orb-rush/${room.code}`);
            overlay.querySelector("#orb-feedback").textContent = "Invite link copied.";
          } catch { overlay.querySelector("#orb-feedback").textContent = "Copy the code above to invite your friend."; }
        });
      }
      overlay.querySelector("#orb-leave")?.addEventListener("click", () => navigate("/hub"));
      overlay.querySelector("#orb-copy, #orb-rematch, #orb-leave")?.focus();
    }

    function maybeRematch() {
      if (!isHost || !myReady || !peerReady || !peerOnline || model.winner === null) return;
      model = createMatch();
      myReady = false;
      peerReady = false;
      sendState();
      showOverlay("");
    }

    function syncPresence() {
      const keys = Object.keys(channel.presenceState());
      const other = keys.find((id) => id !== userId && (isHost || id === room.host_id));
      const wasOnline = peerOnline;
      peerOnline = !!other;
      const newPeer = peerOnline && other !== peerId;
      if (newPeer) {
        peerId = other;
        remote = { x: W / 2, y: H / 2, active: false, pinch: false };
        lastInputAt = 0;
        if (isHost) { model = createMatch(); myReady = false; peerReady = false; }
      }
      if (!peerOnline) {
        remote.active = false;
        remote.pinch = false;
        delete remote.seq;
        lastInputAt = 0;
        myReady = false;
        peerReady = false;
      }
      if (peerOnline && isHost && (newPeer || !wasOnline)) sendState();
      showOverlay(!subscribed ? "lost" : !peerOnline ? "waiting" : model.winner !== null ? "finished" : "");
    }

    channel
      .on("presence", { event: "sync" }, syncPresence)
      .on("broadcast", { event: "input" }, ({ payload }) => {
        if (!isHost || !peerOnline || !payload || !Number.isSafeInteger(payload.seq) || payload.seq < 0
          || !Number.isFinite(payload.x) || payload.x < 0 || payload.x > W
          || !Number.isFinite(payload.y) || payload.y < 0 || payload.y > H
          || typeof payload.active !== "boolean" || typeof payload.pinch !== "boolean") return;
        if (payload.seq <= (remote.seq ?? -1)) return;
        remote = { x: payload.x, y: payload.y, active: payload.active, pinch: payload.pinch, seq: payload.seq };
        lastInputAt = performance.now();
      })
      .on("broadcast", { event: "state" }, ({ payload }) => {
        if (isHost || !Number.isSafeInteger(payload?.seq) || payload.seq < 0 || payload.seq <= lastSeq || !validMatch(payload.model)) return;
        lastSeq = payload.seq;
        const restarted = model.winner !== null && payload.model.winner === null;
        const scored = payload.model.scores.some((n, i) => n > model.scores[i]);
        const ended = model.winner === null && payload.model.winner !== null;
        model = payload.model;
        if (scored) sfx.score();
        if (ended) sfx.go();
        if (restarted) { myReady = false; peerReady = false; }
        showOverlay(!peerOnline ? "waiting" : model.winner !== null ? "finished" : "");
      })
      .on("broadcast", { event: "rematch" }, ({ payload }) => {
        if (!isHost || !peerOnline || model.winner === null || payload?.ready !== true) return;
        peerReady = true;
        maybeRematch();
      })
      .subscribe(async (status) => {
        if (!running) return;
        subscribed = status === "SUBSCRIBED";
        if (subscribed) {
          try {
            await channel.track({ user_id: userId });
            if (!running) return;
            if (isHost) sendState();
            syncPresence();
          } catch { showOverlay("lost"); }
        } else {
          peerOnline = false;
          remote.active = false;
          remote.pinch = false;
          delete remote.seq;
          lastInputAt = 0;
          showOverlay("lost");
        }
      });

    const fixed = createFixedStep(() => {
      if (!subscribed || !peerOnline || model.winner !== null) return;
      if (isHost) {
        const guest = performance.now() - lastInputAt <= 1000 ? remote : { ...remote, active: false, pinch: false };
        const event = stepMatch(model, [local, guest], 1 / 60);
        if (event === "point") sfx.score();
        if (event === "end") sfx.go();
        if (++frame % 3 === 0 || event === "point" || event === "end") sendState();
        if (event === "end") showOverlay("finished");
      } else if (++frame % 3 === 0) {
        send("input", { ...local, seq: frame });
      }
    });

    function draw() {
      ctx.fillStyle = NEON.canvas;
      ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = "rgba(74,222,128,0.12)";
      for (let x = 50; x < W; x += 50) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
      for (let y = 50; y < H; y += 50) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
      const players = model.players.map((p, i) => i === me ? { ...p, ...local } : p);
      const inOrb = players.map((p) => p.active && Math.hypot(p.x - model.orb.x, p.y - model.orb.y) <= R);
      const contested = !model.respawn && inOrb[0] && inOrb[1];
      if (!model.respawn) {
        const color = contested ? NEON.warn : inOrb[0] ? NEON.accent : inOrb[1] ? NEON.cyan : NEON.text;
        ctx.strokeStyle = color; ctx.fillStyle = "rgba(255,255,255,0.08)";
        ctx.shadowColor = color; ctx.shadowBlur = 22;
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(model.orb.x, model.orb.y, R, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.shadowBlur = 0;
        if (!contested) for (let i = 0; i < 2; i++) {
          ctx.strokeStyle = i === 0 ? NEON.accent : NEON.cyan;
          ctx.lineWidth = 7;
          ctx.beginPath(); ctx.arc(model.orb.x, model.orb.y, R + 9 + i * 9, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * model.progress[i]); ctx.stroke();
        }
        if (contested) drawHudText(ctx, "CONTESTED", model.orb.x, model.orb.y - 55, { size: 13, align: "center", color: NEON.warn });
      }
      for (let i = 0; i < 2; i++) {
        const p = players[i], color = i === 0 ? NEON.accent : NEON.cyan;
        ctx.globalAlpha = p.active ? 1 : 0.35;
        ctx.strokeStyle = color; ctx.fillStyle = color;
        ctx.lineWidth = p.pulse > 0 ? 4 : 2;
        ctx.shadowColor = color; ctx.shadowBlur = p.pulse > 0 ? 24 : 12;
        ctx.beginPath(); ctx.arc(p.x, p.y, 13, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 0; ctx.globalAlpha = 1;
      }
      ctx.fillStyle = "rgba(0,0,0,0.78)"; ctx.fillRect(0, 0, W, 75);
      drawHudText(ctx, String(model.scores[0]), 205, 45, { size: 29, align: "center", color: NEON.accent });
      drawHudText(ctx, String(model.scores[1]), 595, 45, { size: 29, align: "center", color: NEON.cyan });
      drawHudText(ctx, String(Math.ceil(model.remaining)).padStart(2, "0"), W / 2, 43, { size: 25, align: "center" });
      ctx.font = hudFont(11); ctx.fillStyle = NEON.muted; ctx.textAlign = "center";
      ctx.fillText(me === 0 ? "YOU" : "FRIEND", 205, 65);
      ctx.fillText(me === 1 ? "YOU" : "FRIEND", 595, 65);
      ctx.fillText(subscribed ? peerOnline ? "CONNECTED" : "WAITING" : "RECONNECTING", W / 2, 65);
      const p = model.players[me];
      ctx.textAlign = "left";
      ctx.fillText(`PULSE ${p.pulse > 0 ? "ACTIVE" : p.cooldown > 0 ? p.cooldown.toFixed(1) + "s" : "READY"}`, 20, H - 20);
      ctx.textAlign = "right";
      ctx.fillText(contested ? "CONTESTED" : `CAPTURE ${Math.round(model.progress[me] * 100)}%`, W - 20, H - 20);
    }
    function tick(ts) {
      fixed.tick(ts);
      draw();
      if (running) raf = requestAnimationFrame(tick);
    }
    showOverlay("waiting");
    raf = requestAnimationFrame(tick);
    return { unmount() {
      running = false;
      cancelAnimationFrame(raf);
      unsubscribe();
      overlay.remove();
      stopHandCursor();
      close();
      leaveOrbRushLobby(room.code);
    } };
  },
};
