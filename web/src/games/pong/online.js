import { NEON, setupCanvas, createFixedStep, drawHudText, hudFont, sfx } from "../../core/gameKit.js";
import { openPongChannel, leavePongLobby } from "../../core/backend.js";
import { W, H, PADDLE_H, PADDLE_W, LEFT_X, RIGHT_X, BALL_R, createMatch, stepMatch, sampleMatch } from "./onlinePhysics.js";
import { navigate } from "../../router.js";
import { startHandCursor, stopHandCursor } from "../../core/handCursor.js";

const clamp = (n) => Math.max(0, Math.min(H - PADDLE_H, n));

export default {
  async mount({ canvas, onHandUpdate, handState, room }) {
    const ctx = setupCanvas(canvas, W, H);
    const { channel, userId, close } = await openPongChannel(room);
    const isHost = userId === room.host_id;
    let running = true;
    let subscribed = false;
    let peerOnline = false;
    let peerId = null;
    let model = createMatch();
    const snapshots = [];
    let seq = 0;
    let lastSeq = -1;
    let frame = 0;
    let localY = (H - PADDLE_H) / 2;
    let localSmash = false;
    let remoteY = localY;
    let remoteSmash = false;
    let myReady = false;
    let peerReady = false;
    let raf = null;
    let overlayKind = "";
    const wrap = canvas.parentElement;
    const overlay = document.createElement("div");
    overlay.className = "go-overlay oh-pop";
    overlay.id = "pong-online-overlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-label", "Pong online match status");
    wrap.appendChild(overlay);
    const unsubscribe = onHandUpdate((s) => {
      if (!s.isDetected) return;
      localY = clamp(s.y * H - PADDLE_H / 2);
      localSmash = !!s.pinch;
    });
    if (handState.isDetected) localY = clamp(handState.y * H - PADDLE_H / 2);

    function send(event, payload) {
      if (subscribed) channel.send({ type: "broadcast", event, payload });
    }

    function showOverlay(kind) {
      if (kind === overlayKind) return;
      overlayKind = kind;
      overlay.hidden = !kind;
      if (!kind) { stopHandCursor(); return; }
      startHandCursor();
      if (kind === "waiting") {
        overlay.innerHTML = `
          <div class="go-panel pong-choice-panel">
            <div class="go-title">${isHost ? "INVITE A FRIEND" : "JOINING MATCH"}</div>
            ${isHost ? `<div class="pong-code">${room.code}</div>
              <p class="go-best">Share this code or invite link. The match starts when your friend joins.</p>
              <button class="btn btn-accent" id="pong-copy">Copy invite link</button>`
              : `<p class="go-best">Waiting for the lobby host…</p>`}
            <button class="btn" id="pong-leave">Leave lobby</button>
            <div class="input-choice-error" id="pong-feedback" role="status" aria-live="polite"></div>
          </div>`;
        overlay.querySelector("#pong-copy")?.addEventListener("click", async () => {
          try {
            await navigator.clipboard.writeText(`${location.origin}${location.pathname}#/games/pong/${room.code}`);
            overlay.querySelector("#pong-feedback").textContent = "Invite link copied.";
          } catch {
            overlay.querySelector("#pong-feedback").textContent = "Copy the code above to invite your friend.";
          }
        });
      } else if (kind === "lost") {
        overlay.innerHTML = `<div class="go-panel"><div class="go-title">CONNECTION LOST</div>
          <p class="go-best">Reconnecting to the match…</p><button class="btn" id="pong-leave">Leave lobby</button></div>`;
      } else {
        const won = model.winner === (isHost ? 0 : 1);
        overlay.innerHTML = `<div class="go-panel"><div class="go-title">${won ? "YOU WIN" : "YOU LOSE"}</div>
          <div class="go-score">${model.scores[0]} : ${model.scores[1]}</div>
          <p class="go-best">${myReady ? "Waiting for your friend…" : "First to 7 · ready for another?"}</p>
          <div class="go-actions"><button class="btn btn-accent" id="pong-rematch" ${myReady ? "disabled" : ""}>Rematch</button>
          <button class="btn" id="pong-leave">Leave lobby</button></div></div>`;
        overlay.querySelector("#pong-rematch").addEventListener("click", () => {
          myReady = true;
          send("rematch", { ready: true });
          if (isHost) maybeRematch();
          overlayKind = "";
          showOverlay("finished");
        });
      }
      overlay.querySelector("#pong-leave")?.addEventListener("click", () => navigate("/hub"));
      overlay.querySelector("#pong-copy, #pong-rematch, #pong-leave")?.focus();
    }

    function maybeRematch() {
      if (!isHost || !myReady || !peerReady || !peerOnline) return;
      model = createMatch();
      myReady = false;
      peerReady = false;
      sendState();
      showOverlay("");
    }

    function sendState() {
      send("state", { seq: ++seq, model });
    }

    function syncPresence() {
      const members = Object.values(channel.presenceState()).flat();
      const other = members.find((p) => p.user_id !== userId);
      const wasOnline = peerOnline;
      peerOnline = !!other;
      const newPeer = peerOnline && other.user_id !== peerId;
      if (newPeer) {
        peerId = other.user_id;
        if (isHost) model = createMatch();
        else snapshots.length = 0;
      }
      if (peerOnline && isHost && (newPeer || !wasOnline)) sendState();
      if (!peerOnline) { myReady = false; peerReady = false; snapshots.length = 0; }
      showOverlay(!subscribed ? "lost" : peerOnline ? model.winner !== null ? "finished" : "" : "waiting");
    }

    channel
      .on("presence", { event: "sync" }, syncPresence)
      .on("broadcast", { event: "input" }, ({ payload }) => {
        if (!isHost || !Number.isFinite(payload?.y)) return;
        remoteY = clamp(payload.y);
        remoteSmash = payload.smash === true;
      })
      .on("broadcast", { event: "state" }, ({ payload }) => {
        if (isHost || !Number.isSafeInteger(payload?.seq) || payload.seq <= lastSeq) return;
        const m = payload.model;
        if (!m || !Number.isFinite(m.left) || !Number.isFinite(m.right)
          || !Number.isFinite(m.ball?.x) || !Number.isFinite(m.ball?.y)
          || !Array.isArray(m.scores) || m.scores.length !== 2
          || !m.scores.every((n) => Number.isInteger(n) && n >= 0 && n <= 7)
          || ![null, 0, 1].includes(m.winner)) return;
        lastSeq = payload.seq;
        const restarted = model.winner !== null && m.winner === null;
        if (restarted || m.scores.some((score, i) => score !== model.scores[i])) snapshots.length = 0;
        snapshots.push({ at: performance.now(), model: m });
        if (snapshots.length > 4) snapshots.shift();
        model = m;
        if (restarted) { myReady = false; peerReady = false; }
        showOverlay(!peerOnline ? "waiting" : model.winner !== null ? "finished" : "");
      })
      .on("broadcast", { event: "rematch" }, () => {
        if (!isHost) return;
        peerReady = true;
        maybeRematch();
      })
      .subscribe(async (status) => {
        if (!running) return;
        subscribed = status === "SUBSCRIBED";
        if (subscribed) {
          await channel.track({ user_id: userId });
          if (isHost) sendState();
          syncPresence();
        } else {
          showOverlay("lost");
        }
      });

    const fixed = createFixedStep(() => {
      if (!subscribed || !peerOnline || model.winner !== null) return;
      if (isHost) {
        const event = stepMatch(model, localY, remoteY, localSmash, remoteSmash);
        if (event === "hit") sfx.hit();
        if (event === "point" || event === "win") sfx.score();
        if (++frame % 3 === 0 || event) sendState();
        if (event === "win") showOverlay("finished");
      } else if (++frame % 3 === 0) {
        send("input", { y: localY, smash: localSmash });
      }
    });

    function draw(ts) {
      const display = isHost ? model : sampleMatch(snapshots, ts - 75) || model;
      ctx.fillStyle = NEON.canvas;
      ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = "rgba(74,222,128,0.2)";
      ctx.setLineDash([8, 10]);
      ctx.beginPath(); ctx.moveTo(W / 2, 0); ctx.lineTo(W / 2, H); ctx.stroke();
      ctx.setLineDash([]);
      for (const [x, y, color] of [
        [LEFT_X, isHost ? localY : display.left, NEON.accent],
        [RIGHT_X, isHost ? display.right : localY, NEON.cyan],
      ]) {
        ctx.fillStyle = color;
        ctx.shadowColor = color;
        ctx.shadowBlur = 18;
        ctx.beginPath(); ctx.roundRect(x, y, PADDLE_W, PADDLE_H, 6); ctx.fill();
      }
      ctx.shadowBlur = 0;
      const b = display.ball;
      ctx.fillStyle = "#fff";
      ctx.shadowColor = NEON.cyan;
      ctx.shadowBlur = 20;
      ctx.beginPath(); ctx.arc(b.x, b.y, BALL_R, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
      drawHudText(ctx, String(model.scores[0]), W / 2 - 55, 55, { size: 32, align: "center", color: NEON.accent });
      drawHudText(ctx, String(model.scores[1]), W / 2 + 55, 55, { size: 32, align: "center", color: NEON.cyan });
      ctx.font = hudFont(12);
      ctx.fillStyle = NEON.muted;
      ctx.textAlign = "center";
      ctx.fillText(isHost ? "YOU" : "FRIEND", 90, 32);
      ctx.fillText(isHost ? "FRIEND" : "YOU", W - 90, 32);
      if (model.serve > 0 && peerOnline && model.winner === null) {
        drawHudText(ctx, "READY", W / 2, H / 2 - 35, { size: 20, align: "center" });
      }
    }

    function tick(ts) {
      fixed.tick(ts);
      draw(ts);
      if (running) raf = requestAnimationFrame(tick);
    }
    showOverlay("waiting");
    raf = requestAnimationFrame(tick);

    return {
      unmount() {
        running = false;
        cancelAnimationFrame(raf);
        unsubscribe();
        overlay.remove();
        stopHandCursor();
        close();
        leavePongLobby(room.code);
      },
    };
  },
};
