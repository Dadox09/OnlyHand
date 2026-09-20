const WIDTH = 720;
const HEIGHT = 1280;
const MAX_MS = 30000;
const END_SLATE_MS = 1600;

export function supportsCreatorClips() {
  return typeof MediaRecorder !== "undefined" &&
    typeof HTMLCanvasElement.prototype.captureStream === "function";
}

function pickMimeType() {
  return [
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8",
    "video/webm",
  ].find((type) => MediaRecorder.isTypeSupported?.(type)) || "";
}

function drawCover(ctx, source, x, y, width, height, mirrored = false) {
  const sw = source.videoWidth || source.width || 4;
  const sh = source.videoHeight || source.height || 3;
  const scale = Math.max(width / sw, height / sh);
  const cropW = width / scale;
  const cropH = height / scale;
  const sx = (sw - cropW) / 2;
  const sy = (sh - cropH) / 2;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, width, height);
  ctx.clip();
  if (mirrored) {
    ctx.translate(x + width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(source, sx, sy, cropW, cropH, 0, y, width, height);
  } else {
    ctx.drawImage(source, sx, sy, cropW, cropH, x, y, width, height);
  }
  ctx.restore();
}

function makeBackground() {
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext("2d");
  const gradient = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
  gradient.addColorStop(0, "#07120d");
  gradient.addColorStop(0.55, "#080a10");
  gradient.addColorStop(1, "#180822");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.globalAlpha = 0.2;
  for (let y = 0; y < HEIGHT; y += 4) {
    ctx.fillStyle = y % 8 ? "#ffffff" : "#000000";
    ctx.fillRect(0, y, WIDTH, 1);
  }
  ctx.globalAlpha = 1;
  return canvas;
}

export function createCreatorClip({ gameCanvas, cameraVideo, game, profile, onState, onProgress }) {
  const output = document.createElement("canvas");
  output.width = WIDTH;
  output.height = HEIGHT;
  const ctx = output.getContext("2d");
  const background = makeBackground();
  const stream = output.captureStream(30);
  const mimeType = pickMimeType();
  let recorder = null;
  let state = "idle";
  let chunks = [];
  let raf = 0;
  let progressTimer = 0;
  let maxTimer = 0;
  let endTimer = 0;
  let startedAt = 0;
  let finalScore = null;
  let cancelled = false;
  let blob = null;
  let resolveResult;
  const result = new Promise((resolve) => { resolveResult = resolve; });

  const setState = (next) => {
    state = next;
    onState?.(next);
  };

  const drawFrame = () => {
    ctx.drawImage(background, 0, 0);

    ctx.textAlign = "center";
    ctx.fillStyle = "#ffffff";
    ctx.font = "900 31px Orbitron, Arial, sans-serif";
    ctx.fillText("I'M PLAYING WITH MY HAND", WIDTH / 2, 55);
    ctx.fillStyle = "#4ade80";
    ctx.font = "800 20px Orbitron, Arial, sans-serif";
    ctx.fillText(`${game.icon} ${game.name.toUpperCase()} · NO CONTROLLER`, WIDTH / 2, 91);

    ctx.fillStyle = "#020407";
    ctx.fillRect(0, 116, WIDTH, 450);
    if (gameCanvas?.width) ctx.drawImage(gameCanvas, 0, 116, WIDTH, 450);
    ctx.strokeStyle = "rgba(74,222,128,.7)";
    ctx.lineWidth = 4;
    ctx.strokeRect(2, 118, WIDTH - 4, 446);

    ctx.fillStyle = "#020407";
    ctx.fillRect(0, 586, WIDTH, 540);
    if (cameraVideo?.readyState >= 2) drawCover(ctx, cameraVideo, 0, 586, WIDTH, 540, true);
    ctx.fillStyle = "rgba(0,0,0,.55)";
    ctx.fillRect(18, 604, 150, 42);
    ctx.fillStyle = "#4ade80";
    ctx.font = "800 19px Orbitron, Arial, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("● HAND CAM", 32, 632);

    ctx.textAlign = "center";
    ctx.fillStyle = "#ffffff";
    ctx.font = "900 32px Orbitron, Arial, sans-serif";
    ctx.fillText("ONLY", 314, 1186);
    ctx.fillStyle = "#4ade80";
    ctx.fillText("HAND", 418, 1186);
    ctx.fillStyle = "#94a3b8";
    ctx.font = "700 19px Arial, sans-serif";
    ctx.fillText(`${profile.avatar || "🎮"} ${profile.name || "Player"} · TRY TO BEAT THIS RUN`, WIDTH / 2, 1224);
    ctx.fillStyle = "#64748b";
    ctx.font = "600 17px Arial, sans-serif";
    ctx.fillText(location.host || "onlyhand.app", WIDTH / 2, 1256);

    if (finalScore !== null) {
      ctx.fillStyle = "rgba(4,7,10,.88)";
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
      ctx.fillStyle = "#ffffff";
      ctx.font = "900 35px Orbitron, Arial, sans-serif";
      ctx.fillText("I CONTROLLED THIS WITH MY HAND", WIDTH / 2, 410);
      ctx.fillStyle = "#94a3b8";
      ctx.font = "700 25px Arial, sans-serif";
      ctx.fillText(`${game.icon} ${game.name} · ${profile.avatar || "🎮"} ${profile.name || "Player"}`, WIDTH / 2, 470);
      ctx.fillStyle = "#4ade80";
      ctx.shadowColor = "rgba(74,222,128,.75)";
      ctx.shadowBlur = 28;
      ctx.font = "900 180px Orbitron, Arial, sans-serif";
      ctx.fillText(String(finalScore), WIDTH / 2, 715);
      ctx.shadowBlur = 0;
      ctx.fillStyle = "#ffffff";
      ctx.font = "900 52px Orbitron, Arial, sans-serif";
      ctx.fillText("CAN YOU BEAT ME?", WIDTH / 2, 815);
      ctx.fillStyle = "#4ade80";
      ctx.font = "900 34px Orbitron, Arial, sans-serif";
      ctx.fillText("PLAY ON ONLYHAND", WIDTH / 2, 925);
      ctx.fillStyle = "#94a3b8";
      ctx.font = "600 22px Arial, sans-serif";
      ctx.fillText(location.host || "onlyhand.app", WIDTH / 2, 970);
    }

    raf = requestAnimationFrame(drawFrame);
  };

  const stopNow = () => {
    clearTimeout(maxTimer);
    clearTimeout(endTimer);
    clearInterval(progressTimer);
    cancelAnimationFrame(raf);
    if (recorder?.state === "recording") recorder.stop();
  };

  const start = () => {
    if (state !== "idle") return false;
    chunks = [];
    cancelled = false;
    finalScore = null;
    const options = mimeType ? { mimeType, videoBitsPerSecond: 5_000_000 } : { videoBitsPerSecond: 5_000_000 };
    try {
      recorder = new MediaRecorder(stream, options);
    } catch {
      recorder = new MediaRecorder(stream);
    }
    recorder.ondataavailable = (event) => { if (event.data?.size) chunks.push(event.data); };
    recorder.onerror = () => {
      setState("error");
      resolveResult(null);
      stopNow();
    };
    recorder.onstop = () => {
      stream.getTracks().forEach((track) => track.stop());
      if (cancelled) {
        resolveResult(null);
        return;
      }
      blob = new Blob(chunks, { type: recorder.mimeType || mimeType || "video/webm" });
      setState(blob.size ? "ready" : "error");
      resolveResult(blob.size ? blob : null);
    };
    recorder.start(250);
    startedAt = Date.now();
    setState("recording");
    drawFrame();
    progressTimer = setInterval(() => {
      onProgress?.(Math.max(0, Math.ceil((MAX_MS - (Date.now() - startedAt)) / 1000)));
    }, 250);
    maxTimer = setTimeout(() => finish(), MAX_MS);
    return true;
  };

  const finish = (score = null) => {
    if (state === "ready") return result;
    if (state !== "recording") return Promise.resolve(null);
    clearTimeout(maxTimer);
    clearInterval(progressTimer);
    if (score !== null) {
      finalScore = Math.max(0, Math.floor(Number(score) || 0));
      setState("finishing");
      endTimer = setTimeout(stopNow, END_SLATE_MS);
    } else {
      setState("finishing");
      stopNow();
    }
    return result;
  };

  const cancel = () => {
    cancelled = true;
    stopNow();
    stream.getTracks().forEach((track) => track.stop());
    if (state === "idle") resolveResult(null);
    setState("cancelled");
  };

  const download = async () => {
    const videoBlob = blob || await result;
    if (!videoBlob) return false;
    const href = URL.createObjectURL(videoBlob);
    const link = document.createElement("a");
    link.href = href;
    const extension = videoBlob.type.includes("mp4") ? "mp4" : "webm";
    link.download = `onlyhand-${game.id}-${Date.now()}.${extension}`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(href), 2000);
    return true;
  };

  return {
    start,
    finish,
    cancel,
    download,
    result,
    get state() { return state; },
  };
}
